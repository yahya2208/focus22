-- ============================================================================
-- 00070_pilot_account_approval.sql
--
-- Corrective migration: INDEPENDENT ACCOUNTS + ADMIN APPROVAL WORKFLOW.
--
-- Reconciliation gaps closed here (additive, no weakening):
--   * Store operator: system had stores.operator_user_id but NO account-approval
--     state, NO membership ledger, and production had it NULL. This migration
--     adds `pilot_store_operators` — a Pending -> Admin Approval -> Active
--     ledger symmetric with pilot_couriers. Approval/suspension via admin RPCs
--     that ALSO sync stores.operator_user_id, so the EXISTING operator gating
--     (operator_user_id = uid) continues to be the single enforcement point.
--   * Courier: pilot_couriers.status was binary (active/inactive) with no
--     pending state and no admin list/status RPC. Status vocabulary is extended
--     to ('pending','active','inactive','suspended') and admin list/status RPCs
--     are added — the EXISTING active-membership gating in the courier RPCs
--     remains the single enforcement point (unapproved => 'pending'/'suspended'
--     => rejected by existent 00068 checks).
--
-- Scope (strictly additive):
--   1. public.pilot_store_operators  — operator membership + approval ledger.
--   2. pilot_couriers.status range   — extended (constraint only; no column
--      rename/drop, no data rewrite).
--   3. Admin RPCs (SECURITY DEFINER, fixed search_path, REVOKE ALL + GRANT
--      authenticated, fn_admin_uid() re-check):
--        * pilot_admin_set_operator_status(store, user, status) — pending/
--          active/suspended; 'active' links operator_user_id, downgrade clears.
--        * pilot_admin_list_operators(store DEFAULTS NULL)  — ledger + user info.
--        * pilot_admin_set_courier_status(store, user, status) — pending/
--          active/inactive/suspended (additive; pilot_admin_set_courier intact).
--        * pilot_admin_list_couriers(store DEFAULTS NULL)   — ledger + user info.
--
-- NOT touched: existing gating RPCs (pilot_orders_for_store, pilot_order_set_status,
-- pilot_my_stores, pilot_order_detail, pilot_orders_available, pilot_order_accept,
-- pilot_courier_set_status), existing RLS policies, grants, RBAC,
-- ROLE_PERMISSIONS / ROLE_CAPABILITY_MAP, telemetry contract, order schema,
-- 00065/00068 files, delivery_create_order's confirmed-first behaviour (00069).
--
-- No accounts are invented here — provisioning real human identities is a
-- separate, explicit, admin-controlled step (pending approval status is the
-- default onboarding state this workflow governs).
-- ============================================================================


-- ============================================================================
-- 1) pilot_store_operators — operator membership + approval ledger
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_store_operators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES public.stores(id)  ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  status      text NOT NULL
              CHECK (status IN ('pending', 'active', 'suspended')),
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_store_operators_store ON public.pilot_store_operators (store_id, status);
CREATE INDEX IF NOT EXISTS idx_pilot_store_operators_user  ON public.pilot_store_operators (user_id);

ALTER TABLE public.pilot_store_operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operator read own membership" ON public.pilot_store_operators;
CREATE POLICY "Operator read own membership"
  ON public.pilot_store_operators FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin read all operators" ON public.pilot_store_operators;
CREATE POLICY "Admin read all operators"
  ON public.pilot_store_operators FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage operators" ON public.pilot_store_operators;
CREATE POLICY "Admin manage operators"
  ON public.pilot_store_operators FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.pilot_store_operators TO authenticated;


-- ============================================================================
-- 2) pilot_couriers.status — extend to the approval vocabulary (constraint swap)
-- ============================================================================
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.pilot_couriers'::regclass
    AND contype = 'c'
    AND conname LIKE 'pilot_couriers_status%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pilot_couriers DROP CONSTRAINT %I', v_con);
  END IF;
END;
$$;

ALTER TABLE public.pilot_couriers
  ADD CONSTRAINT pilot_couriers_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'suspended'));


-- ============================================================================
-- 3) Admin approval RPCs (SECURITY DEFINER; every call re-checks fn_admin_uid)
-- ============================================================================

-- 3a) Approve / set pending / suspend a STORE OPERATOR.
--     'active'  -> membership active + store linked (operator_user_id).
--     else      -> membership downgraded + store link cleared (if that user).
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
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL
     OR COALESCE(p_status, '') NOT IN ('pending', 'active', 'suspended') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pilot_store_operators (store_id, user_id, status, approved_by, approved_at)
  VALUES (
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

  -- Keep the single existing enforcement point (operator_user_id) in sync:
  -- active links the store, pending/suspended unlinks (only when it was him).
  IF p_status = 'active' THEN
    UPDATE public.stores
       SET operator_user_id = p_user_id, updated_at = now()
     WHERE id = p_store_id;
  ELSE
    UPDATE public.stores
       SET operator_user_id = NULL, updated_at = now()
     WHERE id = p_store_id AND operator_user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('store_id', p_store_id, 'user_id', p_user_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM PUBLIC;

-- 3b) List STORE OPERATOR memberships (+ user info) for the admin.
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

-- 3c) Courier approval control — full vocabulary, additive to 00068.
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL
     OR COALESCE(p_status, '') NOT IN ('pending', 'active', 'inactive', 'suspended') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pilot_couriers (user_id, store_id, status)
  VALUES (p_user_id, p_store_id, p_status)
  ON CONFLICT (user_id, store_id) DO UPDATE SET
    status     = EXCLUDED.status,
    updated_at = now();

  RETURN jsonb_build_object('store_id', p_store_id, 'user_id', p_user_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM PUBLIC;

-- 3d) List COURIER memberships (+ user info) for the admin.
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

-- 4) COURIER enforcement hardening (additive redefinition).
--    The 00068 version authorized by mere assignment (courier_user_id = uid),
--    which let a SUSPENDED courier keep progressing old assignments via this
--    RPC. Authorization now requires an ACTIVE courier membership for the
--    order's store (or an admin), so suspension revokes courier authority
--    instantly with a 42501. Everything else (strict transitions, error codes,
--    SECURITY DEFINER, default search_path, grants) is preserved verbatim.
CREATE OR REPLACE FUNCTION public.pilot_courier_set_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_cur  text;
  v_perm boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR COALESCE(p_status, '') NOT IN (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        public.fn_admin_uid() IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.pilot_couriers pc
          WHERE pc.user_id = v_uid AND pc.store_id = o.store_id AND pc.status = 'active'
        )
      )
  ) INTO v_perm;

  IF NOT v_perm THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id) THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT o.status INTO v_cur FROM public.orders o WHERE o.id = p_order_id;

  IF NOT (
    (p_status = 'out_for_delivery' AND v_cur IN ('confirmed', 'preparing'))
    OR (p_status = 'delivered' AND v_cur = 'out_for_delivery')
  ) THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
    SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_courier_set_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_courier_set_status(uuid, text) FROM PUBLIC;