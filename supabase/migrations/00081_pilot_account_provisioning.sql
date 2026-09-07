-- ============================================================================
-- 00081  Delivery Operating System — PILOT ACCOUNT PROVISIONING & ADMIN APPROVAL
-- ----------------------------------------------------------------------------
-- Gate 5 (GATE-1 architecture §0 pilot-domain authorization, §3/§301; user
-- brief GATE 5). Builds the PROVISIONING + APPROVAL layer on the two existing
-- membership ledgers — it does NOT re-invent accounts.
--
-- AUDIT HIGHLIGHTS (what already exists and is REUSED):
--   * pilot_store_operators  (00070) — pending/active/suspended membership +
--     approved_by/approved_at, RLS self+admin. Enforcement point for operators
--     is stores.operator_user_id = uid (single column = ONE operator).
--   * pilot_couriers         (00068/00070) — status pending/active/inactive/
--     suspended, UNIQUE(user_id,store_id). Enforcement point is
--     pilot_couriers.status = 'active' re-checked per call in EVERY courier
--     RPC (00070/00079/00080). Suspension already revokes courier authority.
--   * p_admin_set_operator_status / p_admin_set_courier_status / list_operators
--     / list_couriers (00070) — SECURITY DEFINER, fn_admin_uid, REVOKE ALL +
--     GRANT authenticated. Signatures preserved; bodies hardened here.
--   * public.users mirrors auth.users via trigger (00002) -> admin can look up
--     existing REAL auth identities safely (id/email/display_name only — no
--     passwords, no tokens, no auth secrets).
--
-- GAPS THIS GATE CLOSES:
--   1) Membership STATE MACHINE (brief §12): 00070 allowed arbitrary status
--      jumps (incl. active->pending, pending->suspended). Enforced here per
--        Operator: (none)->pending | pending->active | active->suspended |
--                  suspended->active   (+ idempotent no-ops; all else REJECTED)
--        Courier : (none)->pending | pending->active | active->inactive |
--                  active->suspended | inactive->active | suspended->active
--                  (+ idempotent no-ops; all else REJECTED)
--      Rejections raise TRANSITION_NOT_ALLOWED (22023).
--   2) Membership AUDIT ledger (brief §13): pilot_membership_history —
--      append-only, admin-read-only RLS, NO client write grants, written ONLY
--      inside the admin RPCs in the SAME transaction (atomic): actor, target,
--      old->new state, timestamp, minimal metadata. One domain ledger; no
--      duplicate audit system.
--   3) Operator EXCLUSIVITY (brief §14): at most ONE active operator per store.
--      Partial unique index (defense in depth) + RPC demotes the previous
--      active operator (ledger-recorded) when a new one is approved.
--   4) Bypass control (brief §8/§19/§20): legacy pilot_admin_set_courier(…,
--      bool) (00068) could create an INSTANT-ACTIVE courier with no approval.
--      Redefined: a NON-EXISTENT membership is created as 'pending' (approval
--      gateway); existing members flow through the courier state machine.
--   5) Admin user lookup (brief §22): pilot_admin_find_users(email [,limit])
--      — normalized EXACT email search, minimal safe fields + current
--      memberships; never exposes passwords/tokens/auth internals.
--   6) Provisioning is LINKING existing real auth identities: no auth user is
--      created anywhere (no service role; no edge function exists; the browser
--      NEVER holds a privileged key). This is the minimal safe mechanism.
--
-- CONCURRENCY: both status RPCs serialize on the STORE row (SELECT … FOR
-- UPDATE) — validates the store and orders concurrent admin actions — then
-- read the membership row FOR UPDATE, validate the transition against the
-- COMMITTED old status, write with a guarded identity match (ROW_COUNT=1),
-- and record the ledger event in the same transaction. Admin-vs-admin races
-- are deterministic (last-lock-wins with legal follow-on transition or no-op).
--
-- BOUNDARIES: orders/lifecycle/history/assignment RPCs are NOT touched;
-- couriers/operators keep the existing active-membership enforcement points
-- (pending/suspended are therefore ALREADY non-operational — proven by tests);
-- no RBAC/ROLE_* change; no telemetry; no GPS/maps/realtime; no auth tables;
-- no account creation; no production data mutation.
--
-- Dependencies: 00068 (pilot_couriers, pilot_admin_set_courier), 00070
-- (pilot_store_operators, admin status/list RPCs, extended courier status),
-- 00002 (public.users mirror). Git-only until deployment (like 00078-00080).
--
-- Rollback (reverts to the exact 00080 state; no data loss):
--   * DROP TABLE public.pilot_membership_history;          (indexes+deps)
--   * DROP FUNCTION public.pilot_write_membership_event(text, uuid, uuid,
--       text, text, uuid, text, jsonb);
--   * DROP FUNCTION public.pilot_admin_find_users(text, integer);
--   * Re-apply the PREVIOUS definitions of the three CREATE OR REPLACE RPCs
--     from the immutable earlier files:
--       - pilot_admin_set_operator_status  (00070 migration body)
--       - pilot_admin_set_courier_status   (00070 migration body)
--       - pilot_admin_set_courier          (00068 migration body)
--   All three were CREATE OR REPLACE; the earlier definitions are preserved in
--   those files, so revert is a deterministic re-apply.
-- ============================================================================

-- ============================================================================
-- 1) pilot_membership_history — append-only audit ledger for membership state
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_membership_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_kind  text NOT NULL CHECK (member_kind IN ('operator', 'courier')),
  store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  old_status   text NOT NULL CHECK (old_status = '' OR old_status IN
                 ('pending', 'active', 'inactive', 'suspended')),
  new_status   text NOT NULL CHECK (new_status IN
                 ('pending', 'active', 'inactive', 'suspended')),
  event_type   text NOT NULL CHECK (event_type IN
                 ('provisioned', 'approved', 'suspended', 'deactivated')),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role    text NOT NULL CHECK (actor_role IN ('admin')),
  reason        text NOT NULL DEFAULT '',
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_membership_history_user_time
  ON public.pilot_membership_history (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_membership_history_store_time
  ON public.pilot_membership_history (store_id, created_at);

ALTER TABLE public.pilot_membership_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read membership history" ON public.pilot_membership_history;
CREATE POLICY "Admin read membership history"
  ON public.pilot_membership_history FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.pilot_membership_history TO authenticated;

-- Append-only from the client's perspective: no direct INSERT/UPDATE/DELETE.
-- Default CREATE TABLE privileges would otherwise grant ALL to anon/authenticated.
REVOKE INSERT, UPDATE, DELETE ON public.pilot_membership_history FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pilot_membership_history FROM authenticated;

-- ============================================================================
-- 2) Operator exclusivity — ONE active operator per store (DB-enforced)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS pilot_store_operators_one_active
  ON public.pilot_store_operators (store_id)
  WHERE status = 'active';

-- ============================================================================
-- 3) Private ledger writer (owner-only; same-transaction inserts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_write_membership_event(
  p_member_kind text,
  p_store_id   uuid,
  p_user_id    uuid,
  p_old_status text,
  p_new_status text,
  p_actor_user_id uuid,
  p_reason     text DEFAULT '',
  p_metadata   jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event text;
BEGIN
  IF p_new_status = 'active' THEN
    v_event := 'approved';
  ELSIF p_new_status = 'suspended' THEN
    v_event := 'suspended';
  ELSIF p_new_status = 'inactive' THEN
    v_event := 'deactivated';
  ELSE
    v_event := 'provisioned';
  END IF;

  INSERT INTO public.pilot_membership_history (
    member_kind, store_id, user_id, old_status, new_status, event_type,
    actor_user_id, actor_role, reason, metadata, created_at
  ) VALUES (
    p_member_kind, p_store_id, p_user_id, p_old_status, p_new_status, v_event,
    p_actor_user_id, 'admin', COALESCE(p_reason, ''), COALESCE(p_metadata, '{}'),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM authenticated;

-- ============================================================================
-- 4) Admin user lookup (existing REAL auth identities only — minimal safe data)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_find_users(
  p_email text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
  v_max int;
  v_norm text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_max := p_limit;
  v_norm := NULLIF(btrim(lower(COALESCE(p_email, ''))), '');

  RETURN QUERY
    SELECT jsonb_build_object(
      'user_id',        u.id,
      'email',          u.email,
      'display_name',   u.display_name,
      'role',           u.role,
      'is_anonymous',   u.is_anonymous,
      'created_at',     u.created_at,
      'operator_memberships', COALESCE((
        SELECT jsonb_agg(om.row ORDER BY om.store_id)
        FROM (
          SELECT jsonb_build_object('store_id', pso.store_id, 'status', pso.status) AS row
          FROM public.pilot_store_operators pso
          WHERE pso.user_id = u.id
        ) om
      ), '[]'::jsonb),
      'courier_memberships', COALESCE((
        SELECT jsonb_agg(cm.row ORDER BY cm.store_id)
        FROM (
          SELECT jsonb_build_object('store_id', pc.store_id, 'status', pc.status) AS row
          FROM public.pilot_couriers pc
          WHERE pc.user_id = u.id
        ) cm
      ), '[]'::jsonb)
    )
    FROM public.users u
    WHERE (v_norm IS NULL OR lower(COALESCE(u.email, '')) = v_norm)
    ORDER BY u.created_at DESC
    LIMIT v_max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_find_users(text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_find_users(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_find_users(text, integer) FROM anon;

-- ============================================================================
-- 5) STORE OPERATOR approval — state machine + exclusivity + audit + concurrency
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_set_operator_status(
  p_store_id uuid, p_user_id uuid, p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := public.fn_admin_uid();
  v_old   text := '';
  v_prev  uuid;
  v_done  int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL
     OR COALESCE(p_status, '') NOT IN ('pending', 'active', 'suspended') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize all admin actions per store; also validates the store.
  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Read the committed membership ('' when it does not exist yet).
  SELECT status INTO v_old
    FROM public.pilot_store_operators
   WHERE store_id = p_store_id AND user_id = p_user_id
   FOR UPDATE;
  v_old := COALESCE(v_old, '');

  -- Membership state machine (operator): provision/approve/suspend/reactivate.
  IF NOT (
    (v_old = ''          AND p_status = 'pending')
    OR (v_old = 'pending'    AND p_status = 'active')
    OR (v_old = 'active'     AND p_status = 'suspended')
    OR (v_old = 'suspended'  AND p_status = 'active')
    OR v_old = p_status
  ) THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  IF v_old = p_status THEN
    -- Idempotent no-op: return current state, write NO ledger event.
    RETURN jsonb_build_object(
      'store_id', p_store_id, 'user_id', p_user_id, 'status', p_status, 'event_type', 'noop'
    );
  END IF;

  BEGIN
    -- Exclusivity: activating a new operator demotes the previous active one.
    IF p_status = 'active' THEN
      SELECT user_id INTO v_prev
        FROM public.pilot_store_operators
       WHERE store_id = p_store_id AND status = 'active' AND user_id <> p_user_id
       FOR UPDATE;
      IF v_prev IS NOT NULL THEN
        UPDATE public.pilot_store_operators
           SET status = 'pending', updated_at = now()
         WHERE store_id = p_store_id AND status = 'active' AND user_id = v_prev;
        PERFORM public.pilot_write_membership_event(
          'operator', p_store_id, v_prev, 'active', 'pending', v_uid,
          'replaced as active operator', '{}'::jsonb
        );
      END IF;
    END IF;

    INSERT INTO public.pilot_store_operators (
      store_id, user_id, status, approved_by, approved_at
    ) VALUES (
      p_store_id, p_user_id, p_status,
      CASE WHEN p_status = 'active' THEN v_uid ELSE NULL END,
      CASE WHEN p_status = 'active' THEN now() ELSE NULL END
    )
    ON CONFLICT (store_id, user_id) DO UPDATE SET
      status      = EXCLUDED.status,
      approved_by = CASE WHEN EXCLUDED.status = 'active' THEN EXCLUDED.approved_by
                         ELSE pilot_store_operators.approved_by END,
      approved_at = CASE WHEN EXCLUDED.status = 'active' THEN EXCLUDED.approved_at
                         ELSE pilot_store_operators.approved_at END,
      updated_at  = now();
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'OPERATOR_CONFLICT' USING ERRCODE = 'P0002';
  END;

  -- Keep stores.operator_user_id = the single active operator (or clear).
  IF p_status = 'active' THEN
    UPDATE public.stores
       SET operator_user_id = p_user_id, updated_at = now()
     WHERE id = p_store_id;
    GET DIAGNOSTICS v_done = ROW_COUNT;
    IF v_done <> 1 THEN
      RAISE EXCEPTION 'OPERATOR_CONFLICT' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    UPDATE public.stores
       SET operator_user_id = NULL, updated_at = now()
     WHERE id = p_store_id AND operator_user_id = p_user_id;
  END IF;

  PERFORM public.pilot_write_membership_event(
    'operator', p_store_id, p_user_id, v_old, p_status, v_uid, '', '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'store_id', p_store_id, 'user_id', p_user_id, 'status', p_status, 'event_type', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM anon;

-- ============================================================================
-- 6) COURIER approval — state machine + audit + concurrency (no store link)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_set_courier_status(
  p_store_id uuid, p_user_id uuid, p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
  v_old text := '';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL
     OR COALESCE(p_status, '') NOT IN ('pending', 'active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_old
    FROM public.pilot_couriers
   WHERE user_id = p_user_id AND store_id = p_store_id
   FOR UPDATE;
  v_old := COALESCE(v_old, '');

  -- Membership state machine (courier): provision/approve/deactivate/suspend.
  IF NOT (
    (v_old = ''         AND p_status = 'pending')
    OR (v_old = 'pending'   AND p_status = 'active')
    OR (v_old = 'active'    AND p_status IN ('inactive', 'suspended'))
    OR (v_old = 'inactive'  AND p_status = 'active')
    OR (v_old = 'suspended' AND p_status = 'active')
    OR v_old = p_status
  ) THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  IF v_old = p_status THEN
    RETURN jsonb_build_object(
      'store_id', p_store_id, 'user_id', p_user_id, 'status', p_status, 'event_type', 'noop'
    );
  END IF;

  INSERT INTO public.pilot_couriers (user_id, store_id, status)
  VALUES (p_user_id, p_store_id, p_status)
  ON CONFLICT (user_id, store_id) DO UPDATE SET
    status     = EXCLUDED.status,
    updated_at = now();

  PERFORM public.pilot_write_membership_event(
    'courier', p_store_id, p_user_id, v_old, p_status, v_uid, '', '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'store_id', p_store_id, 'user_id', p_user_id, 'status', p_status, 'event_type', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM anon;

-- ============================================================================
-- 7) Harden legacy pilot_admin_set_courier(store, user, bool):
--    NEW identities -> 'pending' (approval gateway). EXISTING identities flow
--    through the courier state machine (true = activate, false = deactivate).
--    No instant-active provisioning, no bypass of approval or audit.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_set_courier(
  p_store_id uuid, p_user_id uuid, p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := public.fn_admin_uid();
  v_old  text := '';
  v_target text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_old
    FROM public.pilot_couriers
   WHERE user_id = p_user_id AND store_id = p_store_id
   FOR UPDATE;
  v_old := COALESCE(v_old, '');

  IF v_old = '' THEN
    -- No membership: provision into the approval gateway, never instant-active.
    INSERT INTO public.pilot_couriers (user_id, store_id, status)
    VALUES (p_user_id, p_store_id, 'pending');
    PERFORM public.pilot_write_membership_event(
      'courier', p_store_id, p_user_id, '', 'pending', v_uid, 'provisioned (legacy RPC)', '{}'::jsonb
    );
    RETURN jsonb_build_object(
      'store_id', p_store_id, 'user_id', p_user_id, 'status', 'pending', 'event_type', 'pending'
    );
  END IF;

  v_target := CASE WHEN COALESCE(p_active, TRUE) THEN 'active' ELSE 'inactive' END;
  IF NOT (
    (v_old = 'pending'   AND v_target = 'active')
    OR (v_old = 'inactive'  AND v_target = 'active')
    OR (v_old = 'suspended' AND v_target = 'active')
    OR (v_old = 'active'    AND v_target = 'inactive')
    OR v_old = v_target
  ) THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  IF v_old = v_target THEN
    RETURN jsonb_build_object(
      'store_id', p_store_id, 'user_id', p_user_id, 'status', v_target, 'event_type', 'noop'
    );
  END IF;

  UPDATE public.pilot_couriers
     SET status = v_target, updated_at = now()
   WHERE user_id = p_user_id AND store_id = p_store_id AND status = v_old;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURIER_CONFLICT' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.pilot_write_membership_event(
    'courier', p_store_id, p_user_id, v_old, v_target, v_uid, '', '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'store_id', p_store_id, 'user_id', p_user_id, 'status', v_target, 'event_type', v_target
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM anon;

-- ============================================================================
-- 8) Post-apply integrity (structural drift fails loudly)
-- ============================================================================
DO $$
DECLARE
  v_def text;
  v_dml int;
  v_idx text;
  v_hist int;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_set_operator_status(uuid, uuid, text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN
    RAISE EXCEPTION 'INTEGRITY_OPERATOR_TRANSITIONS_MISSING';
  END IF;
  IF v_def NOT LIKE '%pilot_write_membership_event%' THEN
    RAISE EXCEPTION 'INTEGRITY_OPERATOR_AUDIT_MISSING';
  END IF;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'INTEGRITY_OPERATOR_LOCK_MISSING';
  END IF;

  SELECT pg_get_functiondef('public.pilot_admin_set_courier_status(uuid, uuid, text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN
    RAISE EXCEPTION 'INTEGRITY_COURIER_TRANSITIONS_MISSING';
  END IF;
  IF v_def NOT LIKE '%pilot_write_membership_event%' THEN
    RAISE EXCEPTION 'INTEGRITY_COURIER_AUDIT_MISSING';
  END IF;

  SELECT pg_get_functiondef('public.pilot_admin_set_courier(uuid, uuid, boolean)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pending%' THEN
    RAISE EXCEPTION 'INTEGRITY_LEGACY_BYPASS_OPEN';
  END IF;

  SELECT pg_get_functiondef('public.pilot_admin_find_users(text, integer)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR (v_def NOT LIKE '%permission_denied%' AND v_def NOT LIKE '%PERMISSION_DENIED%') THEN
    RAISE EXCEPTION 'INTEGRITY_FIND_USERS_GUARD_MISSING';
  END IF;

  -- No direct DML grants on the audit ledger.
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pilot_membership_history'
     AND grantee = 'authenticated'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION 'INTEGRITY_LEDGER_DIRECT_WRITE_OPEN';
  END IF;

  -- One-active-operator index exists.
  SELECT indexdef INTO v_idx
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'pilot_store_operators'
     AND indexname = 'pilot_store_operators_one_active';
  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'INTEGRITY_OPERATOR_EXCLUSIVITY_MISSING';
  END IF;

  SELECT count(*) INTO v_hist
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'pilot_membership_history';
  IF v_hist <> 1 THEN
    RAISE EXCEPTION 'INTEGRITY_HISTORY_TABLE_MISSING';
  END IF;
END;
$$;