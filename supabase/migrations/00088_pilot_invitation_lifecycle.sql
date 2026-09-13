-- ============================================================================
-- 00088  Delivery Operating System — PILOT INVITATION LIFECYCLE (GATE 1B)
-- ----------------------------------------------------------------------------
-- GATE 1B. Staging-only server-authoritative invitation management primitive
-- that unblocks the P2-A live verification (InviteSetup -> password ->
-- Courier Workspace) without touching the frozen create-pilot-account Edge
-- Function or any GATE 7 / 8A migration (00080..00086 remain untouched).
--
-- SCOPE (narrow, singular):
--   1. `public.pilot_invitations`          — invitation lifecycle rows.
--   2. `public.pilot_invitation_events`    — append-only diagnostic ledger.
--   3. RLS: admin read-only; NO client DML on either table, ever.
--   4. service_role-only RPCs (SECURITY DEFINER, search_path=''):
--        pilot_invitee_classify
--        pilot_invitation_reserve / pilot_invitation_reserve_by_email
--        pilot_invitation_bind
--        pilot_invitation_mark_sent
--        pilot_invitation_abort
--        pilot_invitation_advance  (also called by the auth triggers)
--   5. authenticated admin-only read RPC: pilot_admin_list_invitations.
--   6. Two ADDITIVE, inert-by-default triggers on auth.users:
--        pilot_on_auth_confirmed   -> ACCEPTED
--        pilot_on_auth_password_set-> PASSWORD_SET / COMPLETED
--
-- ORDERING / STATE MACHINE (approved Final Plan, Gate 1B):
--   Lifecycle rows are RESERVED (status='PENDING') BEFORE any Auth/email op.
--   'SENT' is set ONLY after Auth confirms dispatch (mark_sent). Failed Auth
--   leaves the SAME row PENDING + a FAILED event; retries reuse that row.
--
--   * PENDING -> SENT          on Auth success   (mark_sent; sent_count++;
--                                                  event SENT, or RESENT when
--                                                  it follows a resend)
--   * PENDING -> PENDING+FAILED on Auth failure   (determinate/immediate retry
--                                                  OR indeterminate/60s from
--                                                  pending_at)
--   * SENT -> PENDING          on a RESEND request (RESEND_REQUESTED event;
--                                                  SAME row, pending_at=now()),
--                                                  then -> SENT again via
--                                                  mark_sent (cooldown 60s from
--                                                  last_sent_at)
--   * PENDING -> PENDING       on a RETRY of the same failed send attempt
--                                                  (RETRY event; a failed-send
--                                                  retry NEVER emits
--                                                  RESEND_REQUESTED)
--   * sent_count >= 5 blocks every send/resend (MAX_SENDS_REACHED).
--   * Auth-driven: ACCEPTED (confirmation transition), then when both
--     accepted_at AND password_set_at exist -> COMPLETED (order-independent).
--
-- NO-DELETE BOUNDARY (Gate 1B): this migration NEVER removes an Auth identity
-- and contains no identity deletion. Failed/partial flows leave `PENDING` rows
-- with `pending_at` + FAILED/IDENTITY_LINKED events -> manually diagnosable.
-- Existing identities are never recreated; nothing here mutates Auth itself
-- beyond the two additive triggers (which only flip lifecycle state).
--
-- HARD BOUNDARIES (unchanged): no membership machine changes (provisioning
-- stays exclusive to pilot_provision_new_membership), no RBAC / customer /
-- order / GPS changes, no token/URL/password/hash storage anywhere. The
-- encrypted_password column is only tested empty-vs-non-empty (the value is
-- never read out, logged, or returned).
--
-- PRODUCTION SAFETY: repo-only artifact. Applied only to Staging
-- (wpthryqflsfamjbtvjoa) by the operator; never applied to production.
-- ============================================================================


-- ============================================================================
-- 1) public.pilot_invitations — lifecycle row
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_email    text NOT NULL CHECK (invite_email = lower(btrim(invite_email)))
                  CHECK (invite_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id         uuid REFERENCES public.users(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  member_kind     text NOT NULL CHECK (member_kind IN ('operator', 'courier')),
  channel         text NOT NULL CHECK (channel IN ('invite', 'magic_link')),
  status          text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'SENT', 'ACCEPTED', 'COMPLETED')),
  first_sent_at   timestamptz,
  last_sent_at    timestamptz,
  sent_count      integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0 AND sent_count <= 5),
  pending_at      timestamptz,
  accepted_at     timestamptz,
  password_set_at timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Partial unique indexes (approved Final Plan): one family before identity
-- exists (keyed by invite_email, user_id NULL), one after binding (keyed by
-- user_id). A row can never live in both partial indexes at the same time;
-- pilot_invitation_bind moves it between them inside a single atomic UPDATE.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pilot_invitations_user
  ON public.pilot_invitations (user_id, store_id, member_kind)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pilot_invitations_email
  ON public.pilot_invitations (invite_email, store_id, member_kind)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_pilot_invitations_email_lookup
  ON public.pilot_invitations (invite_email);

CREATE INDEX IF NOT EXISTS ix_pilot_invitations_store_created
  ON public.pilot_invitations (store_id, created_at);

CREATE INDEX IF NOT EXISTS ix_pilot_invitations_status_pending
  ON public.pilot_invitations (status, pending_at);


-- ============================================================================
-- 2) public.pilot_invitation_events — append-only diagnostic ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_invitation_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.pilot_invitations(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN (
                  'RESERVED', 'RESEND_REQUESTED', 'RETRY', 'SENT', 'RESENT',
                  'ACCEPTED', 'PASSWORD_SET', 'COMPLETED', 'FAILED',
                  'IDENTITY_LINKED'
                )),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason        text NOT NULL DEFAULT '',
  meta          jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pilot_invitation_events_inv_time
  ON public.pilot_invitation_events (invitation_id, created_at);


-- ============================================================================
-- 3) RLS — admin read-only for both tables; client DML impossible
-- ============================================================================
ALTER TABLE public.pilot_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_invitation_events  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read pilot invitations" ON public.pilot_invitations;
CREATE POLICY "Admin read pilot invitations"
  ON public.pilot_invitations FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin read pilot invitation events" ON public.pilot_invitation_events;
CREATE POLICY "Admin read pilot invitation events"
  ON public.pilot_invitation_events FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.pilot_invitations      TO authenticated;
GRANT SELECT ON public.pilot_invitation_events TO authenticated;

-- Append-only + admin-only from the client's perspective: no client DML.
-- (Supabase default privileges grant ALL to anon/authenticated on new tables.)
REVOKE INSERT, UPDATE, DELETE ON public.pilot_invitations       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pilot_invitations       FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pilot_invitation_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pilot_invitation_events FROM authenticated;


-- ============================================================================
-- 4) pilot_invitee_classify — server-side classification (service_role-only)
--    Returns booleans + one server-side uuid consumed ONLY by the Edge
--    Function pipeline. `user_id` is never exposed to any client payload.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitee_classify(
  p_email        text,
  p_member_kind  text,
  p_store_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email        text;
  v_exists       bool := false;
  v_uid          uuid;
  v_class        text;
  v_ec_confirmed bool := false;
  v_cf_confirmed bool := false;
  v_has_password bool := false;
  v_conf_via     text := 'none';
  v_membership   text := 'none';
  v_operational  bool := false;
  v_role_match bool := true;
BEGIN
  -- ---- Input validation (tight contract) ----------------------------------
  IF p_member_kind IS NULL OR COALESCE(p_member_kind, '') NOT IN ('operator', 'courier') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  v_email := lower(btrim(COALESCE(p_email, '')));
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  -- ---- Existence via the canonical mirror (auth.users mirrored by 00002) ---
  SELECT id INTO v_uid FROM public.users WHERE email = v_email LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'exists', false, 'user_id', NULL::uuid, 'classification', 'E',
      'confirmed_via', 'none', 'has_password', false,
      'membership', jsonb_build_object(
        'status', 'none', 'operational', false, 'role_match', true
      )
    );
  END IF;

  v_exists := true;

  -- ---- Auth-level signals (read-only; the encrypted_password VALUE is never
  --      returned — only the empty-vs-non-empty boolean). -------------------
  SELECT
      (email_confirmed_at IS NOT NULL),
      (confirmed_at IS NOT NULL),
      (COALESCE(encrypted_password, '') <> '')
    INTO v_ec_confirmed, v_cf_confirmed, v_has_password
  FROM auth.users
  WHERE id = v_uid;

  IF v_ec_confirmed AND v_cf_confirmed THEN
    v_conf_via := 'both';
  ELSIF v_ec_confirmed THEN
    v_conf_via := 'email_confirmed_at';
  ELSIF v_cf_confirmed THEN
    v_conf_via := 'confirmed_at';
  END IF;

  -- ---- Membership signals for the requested role + store ------------------
  -- Same-role membership       -> status + operational_ready.
  -- role_match=false (mirrors 00083) -> the target already holds the OTHER
  -- role ACTIVE at this same store (a single identity "being both"); the
  -- requested role is therefore NOT matchable without a cross-role conflict.
  IF p_member_kind = 'operator' THEN
    SELECT status, operational_ready INTO v_membership, v_operational
      FROM public.pilot_store_operators
     WHERE store_id = p_store_id AND user_id = v_uid;
    SELECT NOT EXISTS (
      SELECT 1 FROM public.pilot_couriers
      WHERE user_id = v_uid AND store_id = p_store_id AND status = 'active'
    ) INTO v_role_match;
  ELSE
    SELECT status, operational_ready INTO v_membership, v_operational
      FROM public.pilot_couriers
     WHERE user_id = v_uid AND store_id = p_store_id;
    SELECT NOT EXISTS (
      SELECT 1 FROM public.pilot_store_operators
      WHERE store_id = p_store_id AND user_id = v_uid AND status = 'active'
    ) INTO v_role_match;
  END IF;
  v_membership := COALESCE(v_membership, 'none');

  -- ---- Classification A..E (approved Final Plan) ---------------------------
  IF v_membership = 'active' AND v_operational THEN
    v_class := 'A';
  ELSIF v_ec_confirmed OR v_cf_confirmed THEN
    IF v_has_password THEN
      v_class := 'B';
    ELSE
      v_class := 'C';
    END IF;
  ELSE
    v_class := 'D';
  END IF;

  RETURN jsonb_build_object(
    'exists', v_exists,
    'user_id', v_uid,
    'classification', v_class,
    'confirmed_via', v_conf_via,
    'has_password', v_has_password,
    'membership', jsonb_build_object(
      'status', v_membership, 'operational', v_operational, 'role_match', v_role_match
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_invitee_classify(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitee_classify(text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitee_classify(text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitee_classify(text, text, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitee_classify(text, text, uuid) TO service_role;


-- ============================================================================
-- 5) pilot_invitation_reserve — authoritative reservation + retry state machine
--    (service_role-only). p_user_id NULL => reserved by email (class E, no
--    identity yet); non-NULL => existing identity (classes C/D). Returns
--    `{ok:true, invitation_id, created, status:'PENDING', sent_count}` or
--    `{ok:false, code: 'COOLDOWN_ACTIVE'|'MAX_SENDS_REACHED'|'INVITATION_COMPLETED'}`.
--    NEVER blocks on a determinate failure; indeterminate failure enforces a
--    60s cooldown from pending_at; resend-after-SENT enforces 60s from
--    last_sent_at. Race-safe: row locked FOR UPDATE / unique partial indexes.
--
--    Event on the admitted attempt (approved resend contract):
--      * new row            -> RESERVED
--      * prior SENT/ACCEPTED-> RESEND_REQUESTED  (a RESEND of a successful
--                                                  dispatch; same row only)
--      * prior PENDING      -> RETRY             (re-attempt of the SAME
--                                                  failed send; NEVER
--                                                  RESEND_REQUESTED)
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

  -- ---- Look up the existing lifecycle row (bound OR email-only) ------------
  SELECT id, status, last_sent_at, pending_at, sent_count
    INTO v_inv, v_status, v_last_sent, v_pending, v_count
  FROM public.pilot_invitations
  WHERE store_id = p_store_id
    AND member_kind = p_member_kind
    AND (invite_email = v_email OR (p_user_id IS NOT NULL AND user_id = p_user_id))
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

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
    -- Another transaction won the race: re-select (locked) and enforce below.
    SELECT id, status, last_sent_at, pending_at, sent_count
      INTO v_inv, v_status, v_last_sent, v_pending, v_count
    FROM public.pilot_invitations
    WHERE store_id = p_store_id
      AND member_kind = p_member_kind
      AND invite_email = v_email
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
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

-- Convenience wrapper for the no-identity-yet path (class E).
CREATE OR REPLACE FUNCTION public.pilot_invitation_reserve_by_email(
  p_email       text,
  p_store_id    uuid,
  p_member_kind text,
  p_channel     text
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.pilot_invitation_reserve(
    p_email, NULL::uuid, p_store_id, p_member_kind, p_channel
  );
$$;

REVOKE ALL ON FUNCTION public.pilot_invitation_reserve(text, uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve(text, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve(text, uuid, uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve(text, uuid, uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_reserve(text, uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.pilot_invitation_reserve_by_email(text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve_by_email(text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve_by_email(text, uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_reserve_by_email(text, uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_reserve_by_email(text, uuid, text, text) TO service_role;


-- ============================================================================
-- 6) pilot_invitation_bind — links a reserved (E) row to the real identity.
--    Single atomic UPDATE: the row leaves the email partial index and enters
--    the user partial index in the same statement (never in both).
--    IDENTITY_LINK_FAILED recovery: a retry that runs after a prior partial
--    bind failure finds the SAME email-keyed row (user_id NULL) and re-links
--    it — no second identity, no second invitation. Already linked to the SAME
--    user => idempotent success (race-safe). Linked to a DIFFERENT user =>
--    hard fail (INCONSISTENT), because one email must map to one identity.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitation_bind(
  p_invitation_id uuid,
  p_user_id       uuid,
  p_email         text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_invitation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.pilot_invitations
     SET user_id = p_user_id, updated_at = now()
   WHERE id = p_invitation_id
     AND user_id IS NULL
     AND invite_email = lower(btrim(COALESCE(p_email, invite_email)));
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Already bound to this SAME identity: idempotent success (recovery/race).
    IF EXISTS (
      SELECT 1 FROM public.pilot_invitations
      WHERE id = p_invitation_id AND user_id IS NOT NULL AND user_id = p_user_id
    ) THEN
      INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
      VALUES (p_invitation_id, 'IDENTITY_LINKED',
              'identity-link already set (idempotent recovery)',
              jsonb_build_object('user_linked', true, 'repeated', true));
      RETURN jsonb_build_object('invitation_id', p_invitation_id, 'user_id', p_user_id);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.pilot_invitations
      WHERE id = p_invitation_id AND user_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'IDENTITY_ALREADY_LINKED' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (p_invitation_id, 'IDENTITY_LINKED', 'reserved invitation bound to real identity',
          jsonb_build_object('user_linked', true));

  RETURN jsonb_build_object('invitation_id', p_invitation_id, 'user_id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_invitation_bind(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_bind(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_bind(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_bind(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_bind(uuid, uuid, text) TO service_role;


-- ============================================================================
-- 7) pilot_invitation_mark_sent — PENDING -> SENT. Conditioned on Auth success
--    by the Edge Function; this RPC only finalizes it. sent_count increments
--    ONLY here (successful dispatches only).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitation_mark_sent(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows    int;
  v_prev_count int;
  v_event   text;
BEGIN
  IF p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT sent_count INTO v_prev_count
    FROM public.pilot_invitations WHERE id = p_invitation_id FOR UPDATE;

  UPDATE public.pilot_invitations
     SET status = 'SENT',
         sent_count = sent_count + 1,
         first_sent_at = COALESCE(first_sent_at, now()),
         last_sent_at = now(),
         pending_at = NULL,
         updated_at = now()
   WHERE id = p_invitation_id
     AND status = 'PENDING'
     AND user_id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    IF v_prev_count IS NULL THEN
      RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'INVITATION_STATE_CONFLICT' USING ERRCODE = 'P0002';
  END IF;

  v_event := CASE WHEN COALESCE(v_prev_count, 0) >= 1 THEN 'RESENT' ELSE 'SENT' END;
  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (p_invitation_id, v_event, 'auth dispatch confirmed',
          jsonb_build_object('sent', COALESCE(v_prev_count, 0) + 1));

  RETURN jsonb_build_object(
    'invitation_id', p_invitation_id, 'ok', true,
    'status', 'SENT', 'sent_count', COALESCE(v_prev_count, 0) + 1,
    'event_type', v_event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_invitation_mark_sent(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_mark_sent(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_mark_sent(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_mark_sent(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_mark_sent(uuid) TO service_role;


-- ============================================================================
-- 8) pilot_invitation_abort — Auth attempt failed. Keeps the SAME row PENDING
--    with pending_at retained as the attempt marker; records FAILED with the
--    outcome so the next reservation applies the correct retry rule:
--      - determinate  -> immediate retry allowed (NO cooldown gate)
--      - indeterminate-> 60s cooldown from pending_at (pilot_invitation_reserve
--                        checks now() - pending_at before re-authorizing)
--    pending_at retention is thus REQUIRED for the indeterminate cooldown.
--    Nothing is deleted — the row + events stay fully diagnosable.
--    RESEND_REQUESTED / RETRY semantics inside pilot_invitation_reserve are
--    unaffected (abort is only ever reached after an Auth dispatch attempt).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitation_abort(
  p_invitation_id uuid,
  p_outcome       text,
  p_reason        text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exists bool;
BEGIN
  IF p_invitation_id IS NULL OR COALESCE(p_outcome, '') NOT IN ('determinate', 'indeterminate') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.pilot_invitations WHERE id = p_invitation_id)
    INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (p_invitation_id, 'FAILED',
          COALESCE(p_reason, ''),
          jsonb_build_object('outcome', p_outcome, 'kept_pending', true));

  RETURN jsonb_build_object('ok', true, 'invitation_id', p_invitation_id, 'status', 'PENDING', 'outcome', p_outcome);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_invitation_abort(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_abort(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_abort(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_abort(uuid, text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_abort(uuid, text, text) TO service_role;


-- ============================================================================
-- 9) pilot_invitation_advance — order-independent COMPLETED transition.
--    Called by the two auth triggers (both column orders end at COMPLETED).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_invitation_advance(
  p_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_invitation_id IS NULL THEN
    RETURN;
  END IF;

  -- Only when BOTH acceptance and password-creation have been observed.
  UPDATE public.pilot_invitations
     SET status = 'COMPLETED', completed_at = now(), updated_at = now()
   WHERE id = p_invitation_id
     AND status <> 'COMPLETED'
     AND accepted_at IS NOT NULL
     AND password_set_at IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
    VALUES (p_invitation_id, 'COMPLETED', 'accepted + password set', '{}'::jsonb);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_invitation_advance(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_advance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_advance(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_invitation_advance(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_invitation_advance(uuid) TO service_role;


-- ============================================================================
-- 10) pilot_admin_list_invitations — authenticated admin read (client-safe:
--     email-keyed, lifecycle fields ONLY; no user_id in the payload).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_list_invitations(
  p_store_id uuid
)
RETURNS TABLE (
  invite_email    text,
  member_kind     text,
  channel         text,
  status          text,
  sent_count      integer,
  first_sent_at   timestamptz,
  last_sent_at    timestamptz,
  pending_at      timestamptz,
  accepted_at     timestamptz,
  password_set_at timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.fn_admin_uid() IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT i.invite_email, i.member_kind, i.channel, i.status, i.sent_count,
           i.first_sent_at, i.last_sent_at, i.pending_at, i.accepted_at,
           i.password_set_at, i.completed_at, i.created_at, i.updated_at
    FROM public.pilot_invitations i
    WHERE i.store_id = p_store_id
    ORDER BY i.created_at ASC, i.invite_email ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_admin_list_invitations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_invitations(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_invitations(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_invitations(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_invitations(uuid) TO authenticated;


-- ============================================================================
-- 11) Auth triggers (ADDITIVE; inert for all accounts without a lifecycle row;
--     never touches membership / RBAC / customer flows; never reads the
--     encrypted_password VALUE — only empty-vs-non-empty. Coexist byte-safely
--     with on_auth_user_created / on_auth_user_login / handle_new_user.)
-- ============================================================================

-- ---- 11a) ACCEPTED: confirmation transition (email_confirmed_at,
--          confirmed_at, or both simultaneously). The evidence rule (approved
--          Final Plan §C): one flips -> that signal; both flip together in the
--          same UPDATE -> 'both' (a documented observation, not a blocker).
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

  SELECT id INTO v_inv
    FROM public.pilot_invitations
   WHERE (user_id = NEW.id OR invite_email = NEW.email)
     AND status IN ('PENDING', 'SENT')
   ORDER BY created_at ASC
   LIMIT 1;
  IF v_inv IS NULL THEN
    RETURN NEW; -- no live invitation to advance
  END IF;

  UPDATE public.pilot_invitations
     SET status = 'ACCEPTED',
         accepted_at = COALESCE(accepted_at, now()),
         updated_at = now()
   WHERE id = v_inv;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (v_inv, 'ACCEPTED', 'confirmation transition observed',
          jsonb_build_object('signal', v_signal));

  PERFORM public.pilot_invitation_advance(v_inv);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pilot_on_auth_confirmed ON auth.users;
CREATE TRIGGER pilot_on_auth_confirmed
  AFTER UPDATE OF email_confirmed_at, confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (
    (NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL)
    OR
    (NEW.confirmed_at IS NOT NULL AND OLD.confirmed_at IS NULL)
  )
  EXECUTE FUNCTION public.pilot_on_auth_confirmed();

-- ---- 11b) PASSWORD_SET: FIRST credential creation ('' -> non-empty). This is
--          precisely the InviteSetup setAccountPassword path; password CHANGES
--          are non-empty -> non-empty and are excluded by the WHEN predicate;
--          recovery writes recovery_token/recovery_sent_at, not the password.
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

  SELECT id INTO v_inv
    FROM public.pilot_invitations
   WHERE (user_id = NEW.id OR invite_email = NEW.email)
     AND status IN ('PENDING', 'SENT', 'ACCEPTED')
   ORDER BY created_at ASC
   LIMIT 1;
  IF v_inv IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.pilot_invitations
     SET password_set_at = COALESCE(password_set_at, now()),
         updated_at = now()
   WHERE id = v_inv;

  INSERT INTO public.pilot_invitation_events (invitation_id, event_type, reason, meta)
  VALUES (v_inv, 'PASSWORD_SET', 'first credential creation observed', '{}'::jsonb);

  PERFORM public.pilot_invitation_advance(v_inv);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pilot_on_auth_password_set ON auth.users;
CREATE TRIGGER pilot_on_auth_password_set
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.encrypted_password IS NULL OR OLD.encrypted_password = '')
    AND NEW.encrypted_password IS NOT NULL
    AND NEW.encrypted_password <> ''
  )
  EXECUTE FUNCTION public.pilot_on_auth_password_set();


-- ============================================================================
-- 12) Post-apply integrity — structural drift fails loudly (repo pattern).
-- ============================================================================
DO $$
DECLARE
  v_bool boolean;
  v_cnt  int;
  v_fn   regprocedure;
  v_def  text;
BEGIN
  -- ---- Tables exist --------------------------------------------------------
  IF to_regclass('public.pilot_invitations') IS NULL THEN
    RAISE EXCEPTION '00088: pilot_invitations missing';
  END IF;
  IF to_regclass('public.pilot_invitation_events') IS NULL THEN
    RAISE EXCEPTION '00088: pilot_invitation_events missing';
  END IF;

  -- ---- Partial unique indexes exist and are partial ------------------------
  SELECT count(*) INTO v_cnt
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'pilot_invitations'
     AND indexname IN ('ux_pilot_invitations_user', 'ux_pilot_invitations_email');
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION '00088: partial unique indexes missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_invitations'
      AND indexname = 'ux_pilot_invitations_user'
      AND indexdef LIKE '%WHERE%user_id IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION '00088: user partial index not partial';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_invitations'
      AND indexname = 'ux_pilot_invitations_email'
      AND indexdef LIKE '%WHERE%user_id IS NULL%'
  ) THEN
    RAISE EXCEPTION '00088: email partial index not partial';
  END IF;

  -- ---- RESEND_REQUESTED is part of the closed event contract ----------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pilot_invitation_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%RESEND_REQUESTED%'
  ) THEN
    RAISE EXCEPTION '00088: RESEND_REQUESTED event contract missing';
  END IF;

  -- ---- every new SECURITY DEFINER function pins search_path -- -------------
  FOR v_fn IN SELECT 'public.pilot_invitee_classify(text,text,uuid)'::regprocedure
    UNION SELECT 'public.pilot_invitation_reserve(text,uuid,uuid,text,text)'::regprocedure
    UNION SELECT 'public.pilot_invitation_reserve_by_email(text,uuid,text,text)'::regprocedure
    UNION SELECT 'public.pilot_invitation_bind(uuid,uuid,text)'::regprocedure
    UNION SELECT 'public.pilot_invitation_mark_sent(uuid)'::regprocedure
    UNION SELECT 'public.pilot_invitation_abort(uuid,text,text)'::regprocedure
    UNION SELECT 'public.pilot_invitation_advance(uuid)'::regprocedure
    UNION SELECT 'public.pilot_admin_list_invitations(uuid)'::regprocedure
    UNION SELECT 'public.pilot_on_auth_confirmed()'::regprocedure
    UNION SELECT 'public.pilot_on_auth_password_set()'::regprocedure
  LOOP
    IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN
      RAISE EXCEPTION '00088: search_path drift on %', v_fn::text;
    END IF;
  END LOOP;

  -- ---- EXECUTE boundaries ----------------------------------------------------
  -- service_role-only RPCs: service_role YES, anon/authenticated NO.
  SELECT has_function_privilege('service_role',
           'public.pilot_invitee_classify(text,text,uuid)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: classify service_role missing'; END IF;
  SELECT has_function_privilege('service_role',
           'public.pilot_invitation_reserve(text,uuid,uuid,text,text)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: reserve service_role missing'; END IF;
  SELECT has_function_privilege('service_role',
           'public.pilot_invitation_reserve_by_email(text,uuid,text,text)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: reserve_by_email service_role missing'; END IF;
  SELECT has_function_privilege('service_role',
           'public.pilot_invitation_bind(uuid,uuid,text)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: bind service_role missing'; END IF;
  SELECT has_function_privilege('service_role',
           'public.pilot_invitation_mark_sent(uuid)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: mark_sent service_role missing'; END IF;
  SELECT has_function_privilege('service_role',
           'public.pilot_invitation_abort(uuid,text,text)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: abort service_role missing'; END IF;

  SELECT has_function_privilege('authenticated',
           'public.pilot_invitee_classify(text,text,uuid)', 'EXECUTE') INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION '00088: classify authenticated open'; END IF;
  SELECT has_function_privilege('authenticated',
           'public.pilot_invitation_mark_sent(uuid)', 'EXECUTE') INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION '00088: mark_sent authenticated open'; END IF;
  SELECT has_function_privilege('anon',
           'public.pilot_invitation_reserve(text,uuid,uuid,text,text)', 'EXECUTE') INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION '00088: reserve anon open'; END IF;

  -- authenticated-admin read: authenticated YES, anon/service_role NO.
  SELECT has_function_privilege('authenticated',
           'public.pilot_admin_list_invitations(uuid)', 'EXECUTE') INTO v_bool;
  IF NOT v_bool THEN RAISE EXCEPTION '00088: list authenticated missing'; END IF;
  SELECT has_function_privilege('anon',
           'public.pilot_admin_list_invitations(uuid)', 'EXECUTE') INTO v_bool;
  IF v_bool THEN RAISE EXCEPTION '00088: list anon open'; END IF;

  -- ---- No client DML on either table ----------------------------------------
  SELECT count(*) INTO v_cnt FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('pilot_invitations', 'pilot_invitation_events')
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION '00088: invitation tables client DML open';
  END IF;

  -- ---- Gate 1B triggers present ---------------------------------------------
  SELECT count(*) INTO v_cnt FROM pg_trigger
    WHERE tgname IN ('pilot_on_auth_confirmed', 'pilot_on_auth_password_set')
      AND NOT tgisinternal;
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION '00088: auth triggers missing';
  END IF;

  -- ---- Pre-existing AUTH FOUNDATION integrity (VERIFY-ONLY; these definitions
  --      are NEVER modified, recreated, or replaced by Gate 1B) -------------
  -- Deterministic method, same convention as 00081/00085/00086:
  --   * catalog linkage  -> pg_trigger × pg_proc (name, table, enabled, timing,
  --                         event, row-level, target function) — text-free.
  --   * body/security    -> pg_get_functiondef() with STABLE marker assertions.
  -- Full-text equality of pg_get_functiondef() is intentionally NOT used:
  -- its output is instance/PG-version dependent (whitespace, quoting,
  -- rendering), i.e. the "unstable text" case — marker + catalog assertions
  -- are the deterministic contract. The guard FAILS if the definition loses
  -- its security posture or its critical behavior.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgname = 'on_auth_user_created'
       AND t.tgrelid = 'auth.users'::regclass
       AND NOT t.tgisinternal
       AND (t.tgtype & 1) <> 0      -- row-level
       AND (t.tgtype & 2) = 0       -- AFTER (not BEFORE)
       AND (t.tgtype & 4) <> 0      -- INSERT event
       AND (t.tgtype & 8) = 0       -- not DELETE
       AND (t.tgtype & 16) = 0      -- not UPDATE
       AND p.proname = 'handle_new_user'
       AND t.tgenabled IN ('O', 'A') -- enabled (origin/always; not disabled)
  ) THEN
    RAISE EXCEPTION '00088: on_auth_user_created definition drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgname = 'on_auth_user_login'
       AND t.tgrelid = 'auth.users'::regclass
       AND NOT t.tgisinternal
       AND (t.tgtype & 1) <> 0      -- row-level
       AND (t.tgtype & 2) = 0       -- AFTER (not BEFORE)
       AND (t.tgtype & 16) <> 0     -- UPDATE event
       AND (t.tgtype & 4) = 0       -- not INSERT
       AND (t.tgtype & 8) = 0       -- not DELETE
       AND p.proname = 'handle_new_user'
       AND t.tgenabled IN ('O', 'A')
  ) THEN
    RAISE EXCEPTION '00088: on_auth_user_login definition drifted';
  END IF;

  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure)
    INTO v_def;
  IF v_def IS NULL
     OR v_def NOT LIKE '%SECURITY DEFINER%'
     OR v_def NOT LIKE '%RETURNS trigger%'
     OR v_def NOT LIKE '%insert into public.users %'
     OR v_def NOT LIKE '%on conflict (id) do update set%'
  THEN
    RAISE EXCEPTION '00088: handle_new_user definition drifted';
  END IF;
END;
$$;