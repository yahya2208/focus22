-- ============================================================================
-- 00083  Delivery Operating System — SECURE NEW-AUTH PILOT PROVISIONING
-- ----------------------------------------------------------------------------
-- GATE 8B Step 1. Server-side creation of NEW Supabase Auth identities and
-- their CONTROLLED pilot provisioning.
--
-- This migration adds ONE trusted server-side (service_role-only) provisioning
-- RPC used by the Edge Function `create-pilot-account`. It does NOT re-invent
-- accounts and does NOT reopen any GATE 7 migration (00080/00081/00082 remain
-- byte-for-byte unchanged, as enforced by tests).
--
-- PURPOSE (narrow, singular):
--   Let a TRUSTED server-side caller (Edge Function holding the service-role
--   credential) create a brand-NEW pilot membership in PENDING state after it
--   has created the corresponding NEW Supabase Auth identity.
--
-- WHAT THIS RPC CANNOT DO (hard boundary):
--   * cannot ACTIVATE / APPROVE a membership            (no 'active' transition)
--   * cannot SUSPEND / REVOKE / DEACTIVATE an existing membership
--   * cannot change an existing ACTIVE membership
--   * cannot mark readiness / start a pilot
--   * cannot touch orders / stores / unrelated users
--   Activation remains EXCLUSIVELY the human-Admin approval flow:
--     pilot_admin_set_operator_status / pilot_admin_set_courier_status.
--
-- AUTHORIZATION MODEL (service-role only — NOT fn_admin_uid):
--   The Edge Function calls the SUPABASE RPC endpoint with the service-role
--   client, whose JWT carries NO auth.uid(). It therefore cannot (and must
--   not) go through fn_admin_uid(). Privilege is enforced purely at the DB
--   grant boundary: EXECUTE on this RPC is granted to `service_role` ONLY and
--   explicitly revoked from PUBLIC / anon / authenticated. anon/authenticated
--   have NO way to invoke it, so there is no client-facing bypass.
--
--   Defense-in-depth: even though only service_role can call it, the RPC also
--   re-verifies that `p_actor_user_id` corresponds to a REAL admin
--   (role IN ('admin','super_admin')) in public.users, so the audit ledger's
--   actor cannot be forged by a misbehaving Edge Function.
--
-- ATOMICITY / LEDGER:
--   The membership row INSERT and the corresponding pilot_write_membership_event
--   ledger write happen in the SAME RPC transaction (single Postgres tx), so
--   membership + audit are atomic. The existing append-only
--   pilot_membership_history (owner-only write) is reused — NOT a second ledger.
--
-- CHANGES vs GATE 7:
--   * 00080/00081/00082   — untouched.
--   * pilot_membership_history, pilot_write_membership_event, the admin
--     approval RPCs, order/assignment RPCs, RLS, RBAC, telemetry — untouched.
--   * Only ADDITION: public.pilot_provision_new_membership(...).
--
-- PRODUCTION SAFETY (GATE 8B Step-1 §10/§15 — see report):
--   * This migration is created in the repo ONLY. It is NOT applied to
--     production here. No production membership / Auth user is created. The
--     accompanying Edge Function is NOT deployed to production yet.
-- ============================================================================


-- ============================================================================
-- 1) pilot_provision_new_membership — owner-only, creates a NEW PENDING member
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_provision_new_membership(
  p_role        text,
  p_store_id    uuid,
  p_user_id     uuid,
  p_actor_user_id uuid,
  p_reason      text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member_kind text;
  v_old         text := '';
  v_existing    text;
  v_is_admin    boolean;
BEGIN
  -- ---- Input validation (tight, minimal contract) --------------------------
  IF p_role IS NULL OR COALESCE(p_role, '') NOT IN ('operator', 'courier') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  -- ---- Trusted caller bound: must reference a REAL admin (audit integrity) --
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_actor_user_id
      AND u.role IN ('admin', 'super_admin')
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- ---- Store must exist (canonical relationship holds no dangling store) ---
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_member_kind := p_role;

  -- ---- Deterministic duplicate / lifecycle handling -------------------------
  -- Read the existing membership for the SAME role+store, if any.
  IF v_member_kind = 'operator' THEN
    SELECT status INTO v_existing
      FROM public.pilot_store_operators
     WHERE store_id = p_store_id AND user_id = p_user_id;
  ELSE
    SELECT status INTO v_existing
      FROM public.pilot_couriers
     WHERE user_id = p_user_id AND store_id = p_store_id;
  END IF;
  v_existing := COALESCE(v_existing, '');

  -- (a) No membership -> create PENDING (the only path this RPC may take).
  -- (b) Already PENDING with same role+store -> idempotent no-op (reuse).
  -- (c) ACTIVE / SUSPENDED / INACTIVE for same role+store -> REJECT: this RPC
  --     must never mutate an existing membership (activation is Admin-only).
  -- (d) Role conflict: user already holds the OTHER pilot role as ACTIVE at
  --     this same store -> REJECT (prevents a single identity "being both" in
  --     a way that would let one approval path activate the other).
  IF v_existing = 'pending' THEN
    RETURN jsonb_build_object(
      'role', p_role, 'store_id', p_store_id, 'user_id', p_user_id,
      'status', 'pending', 'event_type', 'noop', 'created', false
    );
  END IF;
  IF v_existing <> '' THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  IF p_role = 'operator' THEN
    SELECT status INTO v_old
      FROM public.pilot_couriers
     WHERE user_id = p_user_id AND store_id = p_store_id;
    IF v_old = 'active' THEN
      RAISE EXCEPTION 'ROLE_CONFLICT' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT status INTO v_old
      FROM public.pilot_store_operators
     WHERE store_id = p_store_id AND user_id = p_user_id;
    IF v_old = 'active' THEN
      RAISE EXCEPTION 'ROLE_CONFLICT' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ---- Create the PENDING membership --------------------------------------
  -- Operator: canonical store association is the pilot_store_operators row
  --           (store_id,user_id). Activation later sets stores.operator_user_id
  --           via the existing approval RPC — NOT here.
  -- Courier : canonical membership is pilot_couriers(user_id,store_id).
  IF p_role = 'operator' THEN
    INSERT INTO public.pilot_store_operators (store_id, user_id, status)
    VALUES (p_store_id, p_user_id, 'pending');
  ELSE
    INSERT INTO public.pilot_couriers (user_id, store_id, status)
    VALUES (p_user_id, p_store_id, 'pending');
  END IF;

  -- ---- Audit via the EXISTING ledger helper (same transaction = atomic) ----
  PERFORM public.pilot_write_membership_event(
    p_role, p_store_id, p_user_id, '', 'pending', p_actor_user_id,
    COALESCE(p_reason, 'provisioned (new auth identity)'), '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'role', p_role, 'store_id', p_store_id, 'user_id', p_user_id,
    'status', 'pending', 'event_type', 'pending', 'created', true
  );
END;
$$;


-- ============================================================================
-- 2) EXECUTE boundary — service_role ONLY (never PUBLIC / anon / authenticated)
-- ============================================================================
REVOKE ALL ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM PUBLIC;

-- Remove any accidental execute, then grant to service_role alone.
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM service_role;

GRANT EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) TO service_role;


-- ============================================================================
-- 3) Post-apply integrity (structural drift fails loudly)
-- ============================================================================
DO $$
DECLARE
  v_def   text;
  v_grant boolean;
  v_dml   int;
BEGIN
  SELECT pg_get_functiondef('public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_write_membership_event%' THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_AUDIT_MISSING';
  END IF;
  -- The RPC must create ONLY 'pending' memberships — it must never write
  -- 'active' (activation is exclusively the human-Admin approval path).
  IF v_def NOT LIKE '%''pending''%' THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_NOT_PENDING';
  END IF;
  IF v_def NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_EXISTING_REJECT_MISSING';
  END IF;
  IF v_def NOT LIKE '%PERMISSION_DENIED%' THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_ADMIN_ACTOR_MISSING';
  END IF;

  -- service_role MUST have EXECUTE; PUBLIC/anon/authenticated MUST NOT.
  SELECT has_function_privilege('service_role',
         'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
    INTO v_grant;
  IF NOT v_grant THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_SERVICE_ROLE_EXECUTE_MISSING';
  END IF;

  SELECT has_function_privilege('authenticated',
         'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
    INTO v_grant;
  IF v_grant THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_AUTHENTICATED_EXECUTE_OPEN';
  END IF;

  SELECT has_function_privilege('anon',
         'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
    INTO v_grant;
  IF v_grant THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_ANON_EXECUTE_OPEN';
  END IF;

  -- No client DML on the audit ledger.
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pilot_membership_history'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION 'INTEGRITY_PROVISION_LEDGER_WRITE_OPEN';
  END IF;
END;
$$;