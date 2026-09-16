-- ============================================================================
-- 00085  Delivery Operating System — OPERATIONAL READINESS SERVICE
-- ----------------------------------------------------------------------------
-- GATE 8B Step 2C. Turns the live 00084 readiness schema into a secure,
-- auditable, Admin-controlled readiness SERVICE with lifecycle invalidation.
--
-- SCOPE (narrow, additive + minimal compatible RPC integration):
--   A) Admin-only readiness RPC  public.pilot_admin_set_operational_ready(...)
--        - sets OR clears operational_ready (one guarded code path; mirrors the
--          existing pilot_admin_set_courier(..., bool) single-RPC precedent).
--        - SECURITY DEFINER, search_path='', authenticated callers only,
--          fn_admin_uid() (admin/super_admin) re-checked per call.
--        - SELECT ... FOR UPDATE on the membership row (concurrency).
--        - verify membership exists; SET READY requires status='active'
--          (rejects pending / suspended / inactive / revoked); CLEAR never
--          changes membership status.
--        - writes EXACTLY ONE row to pilot_operational_readiness_history per
--          real transition (old->new), atomically; idempotent no-op with NO
--          history row when the requested state is already current.
--   B) Private owner-only helpers (mirror 00081's pilot_write_membership_event):
--        - pilot_write_readiness_event(...)      — append-only audit writer
--        - pilot_clear_readiness_if_set(...)     — atomic clear + audit only
--                                                when readiness actually flips true->false
--   C) LIFECYCLE INVALIDATION (mandatory, same-transaction, explicit RPC
--      integration — the established architecture):
--        - pilot_admin_set_operator_status : leaving 'active' (-> suspended,
--          or demotion -> pending) clears readiness + appends ONE audit event.
--        - pilot_admin_set_courier_status  : active -> inactive/suspended clears.
--        - pilot_admin_set_courier (bool)  : active -> inactive clears.
--        - Reactivation (suspended/inactive -> active) NEVER restores READY;
--          the cleared column stays false (no auto-carry, no event).
--        - pilot_provision_new_membership  : untouched (pending-only, ready=false).
--   D) Admin list RPCs extended (additive field only):
--        - pilot_admin_list_operators / list_couriers now expose
--          operational_ready so the Admin UI displays server truth.
--
-- EXPLICIT NON-GOALS (frozen boundaries — STEP 2D/START is a SEPARATE gate):
--   * NO pilot_start / start_pilot / pilot_start_history / START auth /
--     START button; NO GPS / maps / routing / ETA / geofence / realtime
--     presence / online verification. Final state is ACTIVE + READY, never
--     STARTED.
--   * NO change to public.users.role / user_metadata.pilot_role / RBAC /
--     telemetry / orders / assignments / realtime / is_online/last_online_at.
--   * NO weakening of any existing RLS / SECURITY DEFINER / ACL invariant.
--   * NO direct client write path anywhere; no service-role secret in browser.
--   * 00080 / 00081 / 00082 / 00083 / 00084 remain byte-for-byte unchanged.
--
-- PRODUCTION SAFETY (STEP 2C §GIT RULE §PHASE 7/8):
--   * This migration is created in the repo and applied to production as part
--     of the controlled STEP 2C track. Data effects are: readiness of the
--     isolated test membership only; no production participant is READY/
--     STARTED; no membership state changes beyond the authorized E2E on the
--     existing Step-1B test identity.
--   * The post-apply DO-block below fails loudly on structural drift.
-- Rollback (reverts to exact 00084 state without touching 00080-00083):
--   * DROP FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb);
--   * DROP FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb);
--   * DROP FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb);
--   * Re-apply the PREVIOUS bodies of the 5 CREATE OR REPLACE'd functions
--     (pilot_admin_set_operator_status, pilot_admin_set_courier_status,
--      pilot_admin_set_courier from 00081; pilot_admin_list_operators,
--      pilot_admin_list_couriers from 00070) — definitions preserved in the
--     immutable earlier migration files.
-- ============================================================================


-- ============================================================================
-- 1) PRIVATE READINESS HELPERS — owner-only (never client-callable)
--    Mirror the 00081 pilot_write_membership_event convention: REVOKE ALL from
--    PUBLIC, then REVOKE from anon/authenticated. service_role inherits no
--    EXECUTE either (PUBLIC revoke); readiness authority is Admin-UI only.
-- ============================================================================

-- Append-only audit writer: ONE row per readiness transition (old->new).
CREATE OR REPLACE FUNCTION public.pilot_write_readiness_event(
  p_member_kind   text,
  p_store_id      uuid,
  p_user_id       uuid,
  p_old_ready     boolean,
  p_new_ready     boolean,
  p_actor_user_id uuid,
  p_actor_role    text,
  p_reason        text DEFAULT '',
  p_metadata      jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.pilot_operational_readiness_history (
    member_kind, store_id, user_id, old_ready, new_ready,
    actor_user_id, actor_role, reason, metadata, created_at
  ) VALUES (
    p_member_kind, p_store_id, p_user_id, p_old_ready, p_new_ready,
    p_actor_user_id, p_actor_role, COALESCE(p_reason, ''),
    COALESCE(p_metadata, '{}'), now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM authenticated;

-- Atomic clear used BY THE LIFECYCLE RPCs inside THEIR transaction. The caller
-- holds the membership row lock (row-level concurrency); this helper flips
-- operational_ready true->false and appends exactly ONE audit event, and only
-- when the state actually changes (idempotent: returns false, no event, when
-- already false). NEVER changes membership status / users.role / RBAC.
CREATE OR REPLACE FUNCTION public.pilot_clear_readiness_if_set(
  p_member_kind   text,
  p_store_id      uuid,
  p_user_id       uuid,
  p_actor_user_id uuid,
  p_actor_role    text,
  p_reason        text DEFAULT '',
  p_metadata      jsonb DEFAULT '{}'
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_member_kind = 'operator' THEN
    UPDATE public.pilot_store_operators
       SET operational_ready = false, updated_at = now()
     WHERE store_id = p_store_id AND user_id = p_user_id
       AND operational_ready = true;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSIF p_member_kind = 'courier' THEN
    UPDATE public.pilot_couriers
       SET operational_ready = false, updated_at = now()
     WHERE user_id = p_user_id AND store_id = p_store_id
       AND operational_ready = true;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_rows > 0 THEN
    PERFORM public.pilot_write_readiness_event(
      p_member_kind, p_store_id, p_user_id, true, false,
      p_actor_user_id, p_actor_role, p_reason, p_metadata
    );
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM authenticated;


-- ============================================================================
-- 2) ADMIN READINESS RPC — SET READY / CLEAR READY (one guarded code path)
--    SET:   active + ready=false -> active + ready=true  (one audit event)
--    CLEAR: active + ready=true  -> active + ready=false (one audit event)
--    Idempotent: requesting the current state returns 'noop', NO audit event.
--    Guards: Admin/Super Admin only (fn_admin_uid); membership must exist;
--    SET READY requires status='active' (pending/suspended/inactive/revoked
--    are REJECTED with TRANSITION_NOT_ALLOWED before any write);
--    CLEAR READY never touches membership status / users.role / RBAC.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_set_operational_ready(
  p_member_kind text,
  p_store_id    uuid,
  p_user_id     uuid,
  p_ready       boolean,
  p_reason      text DEFAULT '',
  p_metadata    jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := public.fn_admin_uid();
  v_role   text;
  v_status text;
  v_old    boolean;
  v_rows   int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_member_kind IS NULL OR COALESCE(p_member_kind, '') NOT IN ('operator', 'courier')
     OR p_store_id IS NULL OR p_user_id IS NULL OR p_ready IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Readiness audit records the ACTUAL caller role (admin / super_admin).
  SELECT role INTO v_role FROM public.users WHERE id = v_uid;

  -- Lock the membership row: concurrent readiness + lifecycle actions on the
  -- same member serialize on this lock (deadlock-free, see report §J).
  IF p_member_kind = 'operator' THEN
    SELECT status, operational_ready INTO v_status, v_old
      FROM public.pilot_store_operators
     WHERE store_id = p_store_id AND user_id = p_user_id
     FOR UPDATE;
  ELSE
    SELECT status, operational_ready INTO v_status, v_old
      FROM public.pilot_couriers
     WHERE user_id = p_user_id AND store_id = p_store_id
     FOR UPDATE;
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- READY requires ACTIVE (mirrors the 00084 CHECK declaratively; the CHECK
  -- also protects the table independently).
  IF p_ready AND v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  -- Idempotent no-op: no state change, no audit row, deterministic response.
  IF v_old IS NOT DISTINCT FROM p_ready THEN
    RETURN jsonb_build_object(
      'member_kind', p_member_kind,
      'store_id', p_store_id,
      'user_id', p_user_id,
      'status', v_status,
      'operational_ready', v_old,
      'actor_user_id', v_uid,
      'actor_role', v_role,
      'event_type', 'noop'
    );
  END IF;

  IF p_member_kind = 'operator' THEN
    UPDATE public.pilot_store_operators
       SET operational_ready = p_ready, updated_at = now()
     WHERE store_id = p_store_id AND user_id = p_user_id;
  ELSE
    UPDATE public.pilot_couriers
       SET operational_ready = p_ready, updated_at = now()
     WHERE user_id = p_user_id AND store_id = p_store_id;
  END IF;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'READINESS_CONFLICT' USING ERRCODE = 'P0002';
  END IF;

  -- Same-transaction audit: exactly one event per real transition.
  PERFORM public.pilot_write_readiness_event(
    p_member_kind, p_store_id, p_user_id, v_old, p_ready,
    v_uid, v_role, COALESCE(p_reason, ''), COALESCE(p_metadata, '{}')
  );

  RETURN jsonb_build_object(
    'member_kind', p_member_kind,
    'store_id', p_store_id,
    'user_id', p_user_id,
    'status', v_status,
    'operational_ready', p_ready,
    'actor_user_id', v_uid,
    'actor_role', v_role,
    'event_type', CASE WHEN p_ready THEN 'ready' ELSE 'not_ready' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) FROM anon;


-- ============================================================================
-- 3) LIFECYCLE INVALIDATION — readiness must never survive a non-operational
--    membership state. Integration is EXPLICIT inside the authoritative admin
--    RPCs (the established architecture; no triggers, no async cleanup).
--    Bodies below are the 00081 definitions with readiness clearing ADDED —
--    every other behaviour is preserved exactly.
-- ============================================================================

-- 3a) STORE OPERATOR status (00081 §5 + invalidation)
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
  v_role  text;
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

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;

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

  -- READINESS INVALIDATION (same transaction as the lifecycle transition):
  -- leaving 'active' (-> suspended) clears readiness with exactly one audit
  -- event. Reactivation (suspended -> active) never restores READY.
  IF v_old = 'active' AND p_status IS DISTINCT FROM 'active' THEN
    PERFORM public.pilot_clear_readiness_if_set(
      'operator', p_store_id, p_user_id, v_uid, v_role,
      'membership transition to ' || p_status, '{}'::jsonb
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
        -- Replaced operator leaves 'active': clear its readiness atomically.
        PERFORM public.pilot_clear_readiness_if_set(
          'operator', p_store_id, v_prev, v_uid, v_role,
          'replaced as active operator', '{}'::jsonb
        );
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

-- 3b) COURIER status (00081 §6 + invalidation)
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
  v_role text;
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

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;

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

  -- READINESS INVALIDATION (same transaction): active -> inactive/suspended
  -- clears readiness with exactly one audit event. Reactivation never
  -- restores READY (approval -> active keeps the cleared column false).
  IF v_old = 'active' AND p_status IS DISTINCT FROM 'active' THEN
    PERFORM public.pilot_clear_readiness_if_set(
      'courier', p_store_id, p_user_id, v_uid, v_role,
      'membership transition to ' || p_status, '{}'::jsonb
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

-- 3c) Legacy bool courier path (00081 §7 + invalidation)
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
  v_role text;
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

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;

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

  -- READINESS INVALIDATION (same transaction): active -> inactive clears.
  IF v_old = 'active' AND v_target IS DISTINCT FROM 'active' THEN
    PERFORM public.pilot_clear_readiness_if_set(
      'courier', p_store_id, p_user_id, v_uid, v_role,
      'membership transition to ' || v_target, '{}'::jsonb
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
-- 4) ADMIN LIST RPCs — expose server truth (additive field only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_list_operators(p_store_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT jsonb_build_object(
      'id',           pso.id,
      'store_id',     pso.store_id,
      'user_id',      pso.user_id,
      'status',       pso.status,
      'operational_ready', pso.operational_ready,
      'approved_by',  pso.approved_by,
      'approved_at',  pso.approved_at,
      'created_at',   pso.created_at,
      'updated_at',   pso.updated_at,
      'user_email',   u.email,
      'user_name',    COALESCE(u.display_name, u.email)
    )
    FROM public.pilot_store_operators pso
    JOIN public.users u ON u.id = pso.user_id
    WHERE (p_store_id IS NULL OR pso.store_id = p_store_id)
    ORDER BY pso.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_list_operators(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_list_operators(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pilot_admin_list_couriers(p_store_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT jsonb_build_object(
      'id',           pc.id,
      'store_id',     pc.store_id,
      'user_id',      pc.user_id,
      'status',       pc.status,
      'operational_ready', pc.operational_ready,
      'created_at',   pc.created_at,
      'updated_at',   pc.updated_at,
      'user_email',   u.email,
      'user_name',    COALESCE(u.display_name, u.email)
    )
    FROM public.pilot_couriers pc
    JOIN public.users u ON u.id = pc.user_id
    WHERE (p_store_id IS NULL OR pc.store_id = p_store_id)
    ORDER BY pc.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_list_couriers(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_list_couriers(uuid) FROM PUBLIC;


-- ============================================================================
-- 5) Post-apply integrity — structural drift fails loudly (00083/00084 convention)
-- ============================================================================
DO $$
DECLARE
  v_def text;
  v_dml int;
  v_ok  boolean;
  v_n   int;
BEGIN
  -- (A) Readiness RPC exists with the frozen security shape.
  SELECT pg_get_functiondef('public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION '00085: readiness RPC missing'; END IF;
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN RAISE EXCEPTION '00085: readiness RPC not SECURITY DEFINER'; END IF;
  IF v_def NOT LIKE '%search_path TO ''''%' THEN RAISE EXCEPTION '00085: readiness RPC search_path not empty'; END IF;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN RAISE EXCEPTION '00085: readiness row lock missing'; END IF;
  IF v_def NOT LIKE '%fn_admin_uid%' THEN RAISE EXCEPTION '00085: readiness admin guard missing'; END IF;
  IF v_def NOT LIKE '%pilot_write_readiness_event%' THEN RAISE EXCEPTION '00085: readiness audit write missing'; END IF;
  IF v_def NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN RAISE EXCEPTION '00085: readiness active-only guard missing'; END IF;

  -- (B) Readiness RPC ACL: authenticated YES, anon NO.
  SELECT has_function_privilege('authenticated',
    'public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)', 'EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION '00085: readiness authenticated EXECUTE missing'; END IF;
  SELECT has_function_privilege('anon',
    'public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)', 'EXECUTE') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION '00085: readiness anon EXECUTE open'; END IF;

  -- (C) Readiness helpers are owner-only (no anon/authenticated EXECUTE).
  SELECT count(*) INTO v_dml FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('pilot_write_readiness_event', 'pilot_clear_readiness_if_set')
     AND grantee IN ('anon', 'authenticated') AND privilege_type = 'EXECUTE';
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: readiness helper EXECUTE open beyond owner'; END IF;

  -- (D) Every lifecycle RPC body carries the invalidation integration.
  SELECT pg_get_functiondef('public.pilot_admin_set_operator_status(uuid, uuid, text)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_clear_readiness_if_set%' THEN
    RAISE EXCEPTION '00085: operator status invalidation missing';
  END IF;
  IF v_def NOT LIKE '%replaced as active operator%' THEN
    RAISE EXCEPTION '00085: operator replacement readiness clear missing';
  END IF;
  SELECT pg_get_functiondef('public.pilot_admin_set_courier_status(uuid, uuid, text)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_clear_readiness_if_set%' THEN
    RAISE EXCEPTION '00085: courier status invalidation missing';
  END IF;
  SELECT pg_get_functiondef('public.pilot_admin_set_courier(uuid, uuid, boolean)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_clear_readiness_if_set%' THEN
    RAISE EXCEPTION '00085: legacy courier invalidation missing';
  END IF;

  -- (E) Admin lists expose the server readiness truth.
  SELECT pg_get_functiondef('public.pilot_admin_list_operators(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%operational_ready%' THEN
    RAISE EXCEPTION '00085: list operators must expose operational_ready';
  END IF;
  SELECT pg_get_functiondef('public.pilot_admin_list_couriers(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%operational_ready%' THEN
    RAISE EXCEPTION '00085: list couriers must expose operational_ready';
  END IF;

  -- (F) Audit invariants: subject FKs never cascade; no client DML; not realtime.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f' AND c.confdeltype = 'c'
  ) THEN RAISE EXCEPTION '00085: readiness history FK cascades'; END IF;
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
     AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: readiness client DML open'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'pilot_operational_readiness_history'
  ) THEN RAISE EXCEPTION '00085: readiness history in realtime'; END IF;

  -- (G) No Pilot START surface may exist (STEP 2D is a separate gate).
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND (p.proname LIKE 'pilot_start%' OR p.proname LIKE 'start_pilot%');
  IF v_n <> 0 THEN RAISE EXCEPTION '00085: pilot-start surface must not exist'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('pilot_start_history', 'pilot_cycle')
  ) THEN RAISE EXCEPTION '00085: pilot-start table must not exist'; END IF;

  -- (H) 00080-00084 invariants remain intact.
  --   h1. membership ledger still write-closed (00081).
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pilot_membership_history'
     AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: membership ledger DML reopened'; END IF;
  --   h2. one-active-operator exclusivity index still present (00081).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_store_operators'
      AND indexname = 'pilot_store_operators_one_active'
  ) THEN RAISE EXCEPTION '00085: operator exclusivity index missing'; END IF;
  --   h3. provision RPC still service_role-only (00083).
  IF NOT has_function_privilege('service_role',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
  THEN RAISE EXCEPTION '00085: provision RPC ACL drifted'; END IF;
  --   h4. courier presence fields (00078) untouched.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_couriers'
      AND column_name IN ('is_online', 'last_online_at')
  ) THEN RAISE EXCEPTION '00085: courier presence fields drifted'; END IF;
  --   h5. orders direct-DML closed (00080) and realtime tables present (00082).
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND grantee = 'authenticated' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: orders direct DML reopened'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('orders', 'order_status_history')
  ) THEN RAISE EXCEPTION '00085: orders realtime tables missing'; END IF;
  --   h6. readiness only true on active members (00084 CHECK maintained; also no
  --       existing member may be ready at migration time).
  SELECT count(*) INTO v_dml FROM public.pilot_store_operators WHERE operational_ready;
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: existing operator already ready'; END IF;
  SELECT count(*) INTO v_dml FROM public.pilot_couriers WHERE operational_ready;
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: existing courier already ready'; END IF;
  --   h7. readiness audit ledger currently empty (no events before the service).
  SELECT count(*) INTO v_dml FROM public.pilot_operational_readiness_history;
  IF v_dml <> 0 THEN RAISE EXCEPTION '00085: readiness audit expected empty pre-E2E'; END IF;
END;
$$;