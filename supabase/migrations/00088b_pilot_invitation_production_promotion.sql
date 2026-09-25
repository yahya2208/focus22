-- ============================================================================
-- 00088b  Delivery Operating System — PILOT INVITATION PRODUCTION PROMOTION
--          + RACE/IDENTITY REPAIR
-- ----------------------------------------------------------------------------
-- PROMOTION RECORD (not a redesign):
--   Base artifact  : supabase/migrations/00088_pilot_invitation_lifecycle.sql
--                    (FROZEN — this file never edits it; 00088b itself has
--                    never been applied anywhere, so revising it is safe).
--   Promotion date : 2026-09-25.
--   Approver       : owner (explicit HOLD-lift + auth-trigger blast-radius
--                    acceptance recorded in session; has_auth_users_trigger=true
--                    verified read-only pre-apply).
--   Preconditions verified read-only before authoring:
--     * public.users, public.stores, public.fn_admin_uid() present.
--     * applier context holds TRIGGER privilege on auth.users.
--   Ordering       : applies AFTER 00088, BEFORE any invite send. Lexicographic
--                    file order (00088 < 00088b < 00089 < 00110) enforces this.
--                    Independent of 00110 (different function, CHECK untouched).
--
-- REPAIR SCOPE (identity-selection ambiguity — 4 selection sites, no
-- arbitration-by-age anywhere after this file):
--   S1. pilot_invitation_reserve initial lookup (base :343-352):
--       OR + ORDER BY created_at LIMIT 1 could pick email-only R1 over
--       bound R2 for reserve(emailA, userX). Fixed: user-arm authoritative
--       first; unbound-email arm only as deliberate second step. Singleton
--       within each arm is index-guaranteed (ux_user / ux_email keys equal
--       the scoped predicates), so no counting is needed here.
--   S2. pilot_invitation_reserve race fallback (base :372-381): fixed in the
--       same structural form (kept, unified with S1).
--   S3. pilot_on_auth_confirmed row select (base :792-797): same OR pattern
--       over PENDING/SENT, AND auth.users carries no store/kind so one arm
--       can legally hold N rows (same user across stores/kinds; same email
--       across stores/kinds). Fixed: set-based — advance ALL bound rows,
--       then ALL unbound same-email rows. No pick, no stall, never raises
--       (a raise here would block Production auth writes).
--   S4. pilot_on_auth_password_set row select (base :848-853): identical fix
--       over PENDING/SENT/ACCEPTED.
--   Deliberately NOT touched (boolean gates, not selection):
--     * the two IF NOT EXISTS inert-gates (base :774-776, :841-843) stay OR:
--       they decide inert-vs-proceed only; advancement afterwards is set-based.
--   No new event types: each advanced row gets its own existing-shape event
--   (ACCEPTED / PASSWORD_SET) plus its own advance() call. The singleton path
--   executes byte-equivalent effects to base (same row, same UPDATE, same
--   event, same advance). reserve's impossible-leftover keeps the retryable
--   INVITATION_CONFLICT code.
--
-- EXPLICITLY OUT OF SCOPE (unchanged here):
--   * 00088 base file (frozen), 00110 (untouched), all indexes, all RPC
--     signatures, the lifecycle state machine, the event contract,
--     grants/RLS/policies (preserved by CREATE OR REPLACE), TRUNCATE-class
--     residuals (follow-up), Edge deploy, secrets, SMTP/Auth config, any real
--     invitation or order.
-- ============================================================================

-- ---- Preconditions: base 00088 must be applied; fail loudly otherwise -----
DO $$
BEGIN
  IF to_regclass('public.pilot_invitations') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: public.pilot_invitations missing (apply 00088 first)'
      USING ERRCODE = 'P0002';
  END IF;
  IF to_regclass('public.pilot_invitation_events') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: public.pilot_invitation_events missing (apply 00088 first)'
      USING ERRCODE = 'P0002';
  END IF;
  IF to_regprocedure('public.pilot_invitation_reserve(text, uuid, uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: pilot_invitation_reserve signature missing (apply 00088 first)'
      USING ERRCODE = 'P0002';
  END IF;
  IF to_regprocedure('public.pilot_on_auth_confirmed()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: pilot_on_auth_confirmed missing (apply 00088 first)'
      USING ERRCODE = 'P0002';
  END IF;
  IF to_regprocedure('public.pilot_on_auth_password_set()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: pilot_on_auth_password_set missing (apply 00088 first)'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ============================================================================
-- S1+S2) pilot_invitation_reserve — structural identity priority
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitation_reserve(
  p_email       text,
  p_user_id     uuid,
  p_store_id    uuid,
  p_member_kind text,
  p_channel     text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email       text := lower(btrim(COALESCE(p_email, '')));
  v_inv         uuid;
  v_status      text;
  v_last_sent   timestamptz;
  v_pending     timestamptz;
  v_count       int;
  v_outcome     text;
  v_created     bool := false;
  v_rows        int;
BEGIN
  -- ---- Input validation ----------------------------------------------------
  IF p_member_kind IS NULL OR COALESCE(p_member_kind, '') NOT IN ('operator', 'courier') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_channel IS NULL OR COALESCE(p_channel, '') NOT IN ('invite', 'magic_link') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_store_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  -- ---- Look up the existing lifecycle row (S1) ------------------------------
  -- Structural priority, never OR-age arbitration: with p_user_id, the
  -- (store, kind, user_id) row is authoritative and an email-only row is
  -- consulted only as a deliberate second step (the designed no-identity-yet
  -- flow that bind() later links). With NULL p_user_id, only unbound
  -- email-keyed rows are visible — a caller without an identity can never
  -- operate on a bound row.
  IF p_user_id IS NOT NULL THEN
    SELECT id, status, last_sent_at, pending_at, sent_count
      INTO v_inv, v_status, v_last_sent, v_pending, v_count
    FROM public.pilot_invitations
    WHERE store_id = p_store_id
      AND member_kind = p_member_kind
      AND user_id = p_user_id
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;
  IF v_inv IS NULL THEN
    SELECT id, status, last_sent_at, pending_at, sent_count
      INTO v_inv, v_status, v_last_sent, v_pending, v_count
    FROM public.pilot_invitations
    WHERE store_id = p_store_id
      AND member_kind = p_member_kind
      AND invite_email = v_email
      AND user_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_inv IS NULL THEN
    -- Insert (race-safe: the partial unique indexes reject duplicates).
    INSERT INTO public.pilot_invitations
      (invite_email, user_id, store_id, member_kind, channel, status, pending_at, sent_count)
    VALUES
      (v_email, p_user_id, p_store_id, p_member_kind, p_channel, 'PENDING', now(), 0)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_inv;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_inv IS NOT NULL THEN
      INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
      VALUES (v_inv, 'RESERVED', 'lifetime reserved before auth op',
              jsonb_build_object('channel', p_channel));
      RETURN jsonb_build_object(
        'ok', true, 'invitation_id', v_inv, 'created', true,
        'status', 'PENDING', 'sent_count', 0
      );
    END IF;
    -- Another transaction won the race (S2): re-select (locked) with the SAME
    -- structural priority. A non-null p_user_id insert can only conflict on
    -- ux_pilot_invitations_user, so the winner carries our user_id; a null
    -- one only on ux_pilot_invitations_email. Anything else is a
    -- deterministic conflict, never a random row.
    IF p_user_id IS NOT NULL THEN
      SELECT id, status, last_sent_at, pending_at, sent_count
        INTO v_inv, v_status, v_last_sent, v_pending, v_count
      FROM public.pilot_invitations
      WHERE store_id = p_store_id
        AND member_kind = p_member_kind
        AND user_id = p_user_id
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE;
    END IF;
    IF v_inv IS NULL THEN
      SELECT id, status, last_sent_at, pending_at, sent_count
        INTO v_inv, v_status, v_last_sent, v_pending, v_count
      FROM public.pilot_invitations
      WHERE store_id = p_store_id
        AND member_kind = p_member_kind
        AND invite_email = v_email
        AND user_id IS NULL
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE;
    END IF;
    IF v_inv IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVITATION_CONFLICT');
    END IF;
  END IF;

  v_status := COALESCE(v_status, '');
  v_count  := COALESCE(v_count, 0);

  -- ---- Hard limits ---------------------------------------------------------
  IF v_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAX_SENDS_REACHED', 'invitation_id', v_inv);
  END IF;
  IF v_status = 'COMPLETED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITATION_COMPLETED', 'invitation_id', v_inv);
  END IF;

  -- ---- Cooldown: the ONLY gate after a prior SUCCESSFUL dispatch, or after
  --      an indeterminate (may-have-sent) failure. Determinate failures never
  --      gate a retry; only an indeterminate failure applies a 60s cooldown
  --      from pending_at (the marker kept by pilot_invitation_abort). --------
  IF v_status = 'SENT' OR v_status = 'ACCEPTED' OR v_status = 'PENDING' THEN
    IF v_last_sent IS NOT NULL AND now() - v_last_sent < interval '60 seconds' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'COOLDOWN_ACTIVE', 'invitation_id', v_inv);
    END IF;
    IF v_last_sent IS NULL AND v_pending IS NOT NULL THEN
      -- No successful send yet: only indeterminate outcomes may gate a retry.
      SELECT COALESCE(meta ->> 'outcome', '') INTO v_outcome
        FROM public.pilot_invitation_events
       WHERE invitation_id = v_inv AND event_type = 'FAILED'
       ORDER BY created_at DESC LIMIT 1;
      IF v_outcome = 'indeterminate' AND now() - v_pending < interval '60 seconds' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'COOLDOWN_ACTIVE', 'invitation_id', v_inv);
      END IF;
    END IF;
  END IF;

  -- ---- Authorize this attempt on the SAME row (never a new one) ------------
  UPDATE public.pilot_invitations
     SET status = 'PENDING', pending_at = now(), channel = p_channel, updated_at = now()
   WHERE id = v_inv;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (v_inv, CASE
            WHEN v_created THEN 'RESERVED'
            WHEN v_status IN ('SENT', 'ACCEPTED') THEN 'RESEND_REQUESTED'
            ELSE 'RETRY'
          END,
          'attempt reserved before auth op',
          jsonb_build_object('channel', p_channel));

  RETURN jsonb_build_object(
    'ok', true, 'invitation_id', v_inv, 'created', v_created,
    'status', 'PENDING', 'sent_count', v_count
  );
END;
$$;

-- ============================================================================
-- S3) pilot_on_auth_confirmed — bound identity first, unbound email second
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_on_auth_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_signal text;
  v_inv    uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_invitations pi
    WHERE pi.user_id = NEW.id OR pi.invite_email = NEW.email
  ) THEN
    RETURN NEW; -- inert for every normal / customer account
  END IF;

  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL
     AND NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL THEN
    v_signal := 'both';
  ELSIF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    v_signal := 'email_confirmed_at';
  ELSIF NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL THEN
    v_signal := 'confirmed_at';
  ELSE
    RETURN NEW;
  END IF;

  -- Structural priority, set-based (00088b S3): confirmation is a fact about
  -- the identity, not the store — and auth.users carries no store/kind, so one
  -- arm can legally match N rows (same user across stores/kinds; same email
  -- across stores/kinds). Advance EVERY live bound row, then EVERY live
  -- unbound same-email row (pre-bind confirmation), each with its own event
  -- and its own advance() call. No LIMIT-1 pick, no stall, and never a raise:
  -- a raise inside an auth.users trigger would block Production auth writes.
  FOR v_inv IN
    SELECT id FROM public.pilot_invitations
     WHERE user_id = NEW.id
       AND status IN ('PENDING', 'SENT')
     ORDER BY created_at ASC
  LOOP
    UPDATE public.pilot_invitations
       SET status = 'ACCEPTED',
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE id = v_inv;

    INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
    VALUES (v_inv, 'ACCEPTED', 'confirmation transition observed',
            jsonb_build_object('signal', v_signal));

    PERFORM public.pilot_invitation_advance(v_inv);
  END LOOP;
  FOR v_inv IN
    SELECT id FROM public.pilot_invitations
     WHERE user_id IS NULL
       AND invite_email = NEW.email
       AND status IN ('PENDING', 'SENT')
     ORDER BY created_at ASC
  LOOP
    UPDATE public.pilot_invitations
       SET status = 'ACCEPTED',
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE id = v_inv;

    INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
    VALUES (v_inv, 'ACCEPTED', 'confirmation transition observed',
            jsonb_build_object('signal', v_signal));

    PERFORM public.pilot_invitation_advance(v_inv);
  END LOOP;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- S4) pilot_on_auth_password_set — identical priority rule
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_on_auth_password_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pilot_invitations pi
    WHERE pi.user_id = NEW.id OR pi.invite_email = NEW.email
  ) THEN
    RETURN NEW; -- inert for every normal / customer account
  END IF;

  -- Structural priority, set-based (00088b S4): same rule as S3, over the
  -- wider live set (a bound row may already be ACCEPTED when the first
  -- credential lands). Same no-pick / no-stall / never-raise guarantees.
  FOR v_inv IN
    SELECT id FROM public.pilot_invitations
     WHERE user_id = NEW.id
       AND status IN ('PENDING', 'SENT', 'ACCEPTED')
     ORDER BY created_at ASC
  LOOP
    UPDATE public.pilot_invitations
       SET password_set_at = COALESCE(password_set_at, now()),
           updated_at = now()
     WHERE id = v_inv;

    INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
    VALUES (v_inv, 'PASSWORD_SET', 'first credential creation observed', '{}'::jsonb);

    PERFORM public.pilot_invitation_advance(v_inv);
  END LOOP;
  FOR v_inv IN
    SELECT id FROM public.pilot_invitations
     WHERE user_id IS NULL
       AND invite_email = NEW.email
       AND status IN ('PENDING', 'SENT', 'ACCEPTED')
     ORDER BY created_at ASC
  LOOP
    UPDATE public.pilot_invitations
       SET password_set_at = COALESCE(password_set_at, now()),
           updated_at = now()
     WHERE id = v_inv;

    INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
    VALUES (v_inv, 'PASSWORD_SET', 'first credential creation observed', '{}'::jsonb);

    PERFORM public.pilot_invitation_advance(v_inv);
  END LOOP;
  RETURN NEW;
END;
$$;

-- ---- Post-assertions: priority pattern present, OR-age pattern gone --------
DO $$
DECLARE
  v_reserve text := pg_get_functiondef(
    to_regprocedure('public.pilot_invitation_reserve(text, uuid, uuid, text, text)'));
  v_conf text := pg_get_functiondef(
    to_regprocedure('public.pilot_on_auth_confirmed()'));
  v_pass text := pg_get_functiondef(
    to_regprocedure('public.pilot_on_auth_password_set()'));
BEGIN
  IF v_reserve NOT LIKE '%INVITATION_CONFLICT%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: reserve missing INVITATION_CONFLICT guard'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_reserve LIKE '%OR (p_user_id IS NOT NULL AND user_id = p_user_id)%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: reserve still contains OR-age selection'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_conf LIKE '%OR invite_email = NEW.email%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: confirmed trigger still contains OR selection'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_pass LIKE '%OR invite_email = NEW.email%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: password trigger still contains OR selection'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_conf LIKE '%LIMIT 1%' OR v_pass LIKE '%LIMIT 1%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: trigger still arbitrates by LIMIT 1'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_conf NOT LIKE '%FOR v_inv IN%'
     OR v_pass NOT LIKE '%FOR v_inv IN%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: trigger set-based loop missing'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_conf NOT LIKE '%user_id = NEW.id%'
     OR v_pass NOT LIKE '%user_id = NEW.id%' THEN
    RAISE EXCEPTION 'POSTCONDITION_FAILED: trigger bound-identity arm missing'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- NOTE: grants/RLS/policies/triggers themselves are preserved by CREATE OR
-- REPLACE (trigger bindings untouched — only function bodies change). This
-- file issues no GRANT/REVOKE and no CREATE TRIGGER. No TRUNCATE remediation
-- here (tracked follow-up).
