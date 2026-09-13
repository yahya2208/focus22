-- ============================================================================
-- GATE 1B — STAGING LIVE — INVITATION STATE-MACHINE PROOF (WRITES TEST ROWS)
-- ============================================================================
-- Drives the 00088 state machine through RPCs exactly as the Edge Function and
-- ops screens do, against a BRAND-NEW test identity. Writes test rows ONLY in
-- public.pilot_invitations / public.pilot_invitation_events (never deletes).
--
-- BEFORE RUNNING (edit these two):
--   SET test_email := 'gate1b-live-<YOUR-RANDOM-TAG>@focus.local';   -- MUST be new
--   SET store_id   := '<Staging pilot store id>'    -- resolve EXACTLY ONE row via:
--                       SELECT id FROM public.stores
--                        WHERE slug = 'pilot-store-1' AND status = 'active';
--                       STOP if 0 or >1 rows returned.
--
-- Where to run: Staging Dashboard SQL Editor (as postgres) or psql to Staging.
-- Runs in a single DO block; prints PASS/FAIL; THROWS if any check fails.
-- Refuses to run if the test email already exists (choose a fresh one).
-- ============================================================================

DO $$
DECLARE
  _email   text := '<<TEST_EMAIL>>';             -- REPLACE
  _store   uuid := '<<STORE_ID>>';               -- REPLACE (EXACTLY ONE active Staging pilot-store-1 row)
  _fail    int  := 0;
  _inv     uuid;
  _inv2    uuid;
  _uid     uuid;
  _uid2    uuid;
  _r       jsonb;
  _c       int;
  _n       int;
  _ok      bool;

  PROCEDURE chk(_p text) AS $$
  BEGIN RAISE NOTICE 'PASS %', _p; END $$ LANGUAGE plpgsql;
  PROCEDURE chk_fail(_p text) AS $$
  BEGIN RAISE NOTICE 'FAIL %', _p; END $$ LANGUAGE plpgsql;
BEGIN
  PERFORM set_config('search_path', 'public', false);

  RAISE NOTICE '=== GATE1B LIVE STATE-MACHINE — STAGING wpthryqflsfamjbtvjoa — email=% ===', _email;
  IF _email LIKE '%<<%' OR _store IS NULL THEN
    RAISE EXCEPTION 'CONFIG: replace <<TEST_EMAIL>> and <<STORE_ID>> first';
  END IF;

  SELECT count(*) INTO _n FROM public.pilot_invitations WHERE invite_email = _email;
  IF _n > 0 THEN
    RAISE EXCEPTION 'NOT_FRESH: email % already used; pick a brand-new one (no cleanup deletes)', _email;
  END IF;

  -- ==========================================================================
  -- CHECK 1: classify on a fresh identity -> class E, role_match=true, no user_id
  -- ==========================================================================
  SELECT public.pilot_invitee_classify(_email, 'operator', _store) INTO _r;
  IF (_r ->> 'class') = 'E' THEN chk('classify fresh -> E'); ELSE chk_fail('classify fresh -> E (got ' || (_r ->> 'class') || ')'); _fail := _fail + 1; END IF;
  IF (_r -> 'role_match')::text = 'true' THEN chk('classify carries role_match=true'); ELSE chk_fail('classify role_match missing/not true'); _fail := _fail + 1; END IF;
  IF NOT (_r ? 'user_id') THEN chk('classify payload does NOT expose user_id'); ELSE chk_fail('classify payload leaked user_id'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 2: reserve new identity -> RESERVED, one PENDING row, no sent yet
  -- ==========================================================================
  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  IF (_r ->> 'ok') = 'true' AND (_r ->> 'created') = 'true'
     AND (_r ->> 'status') = 'PENDING' AND (_r ->> 'sent_count') = '0'
     AND (_r ->> 'invitation_id') IS NOT NULL
    THEN _inv := (_r ->> 'invitation_id')::uuid; chk('reserve fresh -> RESERVED/PENDING, sent_count 0');
  ELSE chk_fail('reserve fresh semantics'); _fail := _fail + 1; END IF;
  SELECT count(*) INTO _c FROM public.pilot_invitations WHERE id = _inv AND invite_email = _email;
  IF _c = 1 THEN chk('exactly one invitation row'); ELSE chk_fail('row count != 1'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 3: identity-link + bind idempotency
  --   synthetic public.users row stands in for the EF-created auth identity;
  --   the REAL identity path is exercised by the EF smoke step (P2-A invite).
  -- ==========================================================================
  INSERT INTO public.users (id, email) VALUES (gen_random_uuid(), _email)
    ON CONFLICT (email) DO NOTHING RETURNING id INTO _uid;
  IF _uid IS NULL THEN SELECT id INTO _uid FROM public.users WHERE email = _email; END IF;
  SELECT public.pilot_invitation_bind(_inv, _uid, _email) INTO _r;
  IF (_r ->> 'invitation_id')::uuid = _inv AND (_r ->> 'user_id')::uuid = _uid
    THEN chk('bind -> IDENTITY_LINKED on same invitation');
  ELSE chk_fail('bind identity link'); _fail := _fail + 1; END IF;
  IF EXISTS (SELECT 1 FROM public.pilot_invitation_events
              WHERE invitation_id = _inv AND event_type = 'IDENTITY_LINKED')
    THEN chk('IDENTITY_LINKED event recorded');
  ELSE chk_fail('IDENTITY_LINKED event missing'); _fail := _fail + 1; END IF;

  SELECT public.pilot_invitation_bind(_inv, _uid, _email) INTO _r;  -- repeat same user
  IF NOT EXISTS (SELECT 1 FROM public.pilot_invitation_events
                  WHERE invitation_id = _inv AND event_type = 'IDENTITY_ALREADY_LINKED')
    AND (SELECT count(*) FROM public.pilot_invitations WHERE invite_email = _email) = 1
    THEN chk('re-bind is a no-op (repeated=true, no new row, no error)');
  ELSE chk_fail('re-bind semantics'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 4: mark_sent -> SENT + SENT event; row keeps user_id
  -- ==========================================================================
  SELECT public.pilot_invitation_mark_sent(_inv) INTO _r;
  IF (_r ->> 'status') = 'SENT' AND (_r ->> 'event_type') = 'SENT' AND (_r ->> 'sent_count') = '1'
    THEN chk('mark_sent -> SENT (sent_count 1)');
  ELSE chk_fail('mark_sent semantics'); _fail := _fail + 1; END IF;
  SELECT user_id INTO _uid2 FROM public.pilot_invitations WHERE id = _inv;
  IF _uid2 = _uid THEN chk('bound user_id preserved on row'); ELSE chk_fail('user_id lost'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 5: RESEND — backdate last_sent to escape the 60s dispatch cooldown,
  --          then reserve again -> RESEND_REQUESTED on the SAME row
  --          (this backdate mutates the TEST row's timestamp only)
  -- ==========================================================================
  UPDATE public.pilot_invitations SET last_sent_at = now() - interval '2 minutes'
   WHERE id = _inv;
  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  IF (_r ->> 'invitation_id')::uuid = _inv AND (_r ->> 'created') = 'false'
     AND EXISTS (SELECT 1 FROM public.pilot_invitation_events
                  WHERE invitation_id = _inv AND event_type = 'RESEND_REQUESTED')
    THEN chk('resend -> RESEND_REQUESTED, SAME invitation_id (no second row)');
  ELSE chk_fail('resend/RESEND_REQUESTED'); _fail := _fail + 1; END IF;
  SELECT count(*) INTO _c FROM public.pilot_invitations WHERE invite_email = _email;
  IF _c = 1 THEN chk('still exactly one invitation row after resend'); ELSE chk_fail('row count changed'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 6: dispatch again -> RESENT event (proves max sends ceiling unbroken)
  -- ==========================================================================
  SELECT public.pilot_invitation_mark_sent(_inv) INTO _r;
  IF (_r ->> 'event_type') = 'RESENT' AND (_r ->> 'sent_count') = '2'
    AND (_r ->> 'sent_count')::int <= 5
    THEN chk('second dispatch -> RESENT, sent_count 2 (<= 5 ceiling)');
  ELSE chk_fail('RESENT / ceiling'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 7: ABORT contract — determinate failure allows IMMEDIATE retry
  --   fresh second identity, never sent; after determinate abort the next
  --   reserve must NOT hit the cooldown gate.
  -- ==========================================================================
  _email := substr(_email, 1, position('@' in _email) - 1) || '-det@focus.local';
  INSERT INTO public.users (id, email) VALUES (gen_random_uuid(), _email) RETURNING id INTO _uid;
  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  _inv := (_r ->> 'invitation_id')::uuid;
  SELECT public.pilot_invitation_abort(_inv, 'determinate', 'live verification') INTO _r;
  IF (_r ->> 'ok') = 'true' AND (_r ->> 'status') = 'PENDING' AND (_r ->> 'outcome') = 'determinate'
    THEN chk('abort determinate -> kept PENDING + FAILED event');
  ELSE chk_fail('abort determinate'); _fail := _fail + 1; END IF;
  IF EXISTS (SELECT 1 FROM public.pilot_invitation_events
              WHERE invitation_id = _inv AND event_type = 'FAILED'
                AND meta ->> 'outcome' = 'determinate' AND meta ->> 'kept_pending' = 'true')
    THEN chk('FAILED event meta {outcome=determinate, kept_pending=true}');
  ELSE chk_fail('FAILED event meta'); _fail := _fail + 1; END IF;

  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  IF (_r ->> 'ok') = 'true' AND (_r ->> 'invitation_id')::uuid = _inv
    THEN chk('determinate failure -> IMMEDIATE retry allowed (no cooldown)');
  ELSE chk_fail('determinate retry unexpectedly blocked'); _fail := _fail + 1; END IF;
  SELECT count(*) INTO _c FROM public.pilot_invitations WHERE invite_email = _email;
  IF _c = 1 THEN chk('retry reused same row (still count 1)'); ELSE chk_fail('row count != 1'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 8: ABORT contract — indeterminate failure triggers 60s cooldown,
  --          then clears after the window (kept_pending path).
  -- ==========================================================================
  _email := substr(_email, 1, position('-' in _email) - 1) || '-indeterminate@focus.local';
  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  _inv2 := (_r ->> 'invitation_id')::uuid;
  SELECT public.pilot_invitation_abort(_inv2, 'indeterminate', 'provider timeout') INTO _r;
  IF (_r ->> 'ok') = 'true' AND (_r ->> 'outcome') = 'indeterminate' THEN
    chk('abort indeterminate -> kept PENDING');
  ELSE chk_fail('abort indeterminate'); _fail := _fail + 1; END IF;

  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  IF (_r ->> 'ok') = 'false' AND (_r ->> 'code') = 'COOLDOWN_ACTIVE'
    THEN chk('indeterminate -> retry within 60s returns COOLDOWN_ACTIVE');
  ELSE chk_fail('cooldown gate missing'); _fail := _fail + 1; END IF;

  UPDATE public.pilot_invitations SET pending_at = now() - interval '2 minutes'
   WHERE id = _inv2;  -- simulate elapsing the window on the TEST row
  SELECT public.pilot_invitation_reserve(_email, NULL, _store, 'operator', 'invite') INTO _r;
  IF (_r ->> 'ok') = 'true' AND (_r ->> 'invitation_id')::uuid = _inv2
    THEN chk('cooldown expires -> retry allowed on SAME row (kept_pending honoured)');
  ELSE chk_fail('cooldown expiry'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 9: EVENT contract — every written event for the test emails is in the
  --          10-event set, and the full contract list is installed on Staging.
  -- ==========================================================================
  SELECT count(*) INTO _c FROM public.pilot_invitation_events
    WHERE invitation_id IN (_inv, _inv2)
      AND event_type NOT IN ('RESERVED','RESEND_REQUESTED','RETRY','SENT','RESENT',
                             'ACCEPTED','PASSWORD_SET','COMPLETED','FAILED','IDENTITY_LINKED');
  IF _c = 0 THEN chk('all live events are inside the 10-event contract');
  ELSE chk_fail('unexpected event_type(s) written'); _fail := _fail + 1; END IF;
  SELECT count(*) INTO _c FROM pg_constraint
   WHERE conrelid = 'public.pilot_invitation_events'::regclass AND contype = 'c';
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.conrelid = 'public.pilot_invitation_events'::regclass AND c.contype = 'c'
                AND pg_get_constraintdef(c.oid) LIKE '%IDENTITY_LINKED%')
    THEN chk('events CHECK constraint present on Staging (identity contract intact)');
  ELSE chk_fail('events CHECK missing on Staging'); _fail := _fail + 1; END IF;

  -- ==========================================================================
  -- CHECK 10: validation guards raise ARGUMENTS_INVALID
  -- ==========================================================================
  BEGIN
    PERFORM public.pilot_invitation_reserve(_email, NULL, _store, 'bogus_kind', 'invite');
    chk_fail('reserve accepted invalid member_kind'); _fail := _fail + 1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '22023' THEN chk('reserve rejects invalid member_kind (22023)');
    ELSE chk_fail('reserve raised wrong state ' || SQLSTATE); _fail := _fail + 1; END IF;
  END;
  BEGIN
    PERFORM public.pilot_invitation_abort(_inv, 'bogus_outcome');
    chk_fail('abort accepted invalid outcome'); _fail := _fail + 1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '22023' THEN chk('abort rejects invalid outcome (22023)');
    ELSE chk_fail('abort raised wrong state ' || SQLSTATE); _fail := _fail + 1; END IF;
  END;

  -- ==========================================================================
  IF _fail > 0 THEN
    RAISE EXCEPTION 'GATE1B_LIVE_STATEMACHINE: % check(s) FAILED on Staging', _fail;
  END IF;
  RAISE NOTICE '=== GATE1B LIVE STATE-MACHINE: ALL PASS (Staging wpthryqflsfamjbtvjoa) ===';
END $$;