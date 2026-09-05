-- ============================================================================
-- 00068  NeighborhoodPilot — Courier · Order detail · Pilot health
-- ----------------------------------------------------------------------------
-- Type: Additive (new table, new columns, new RPCs). NO published function is
-- replaced — courier enforcement lives in NEW RPCs; store/admin flow keeps the
-- published 00065 behaviour (operator can move any canonical status).
--
-- Scope (Real Pilot: Families + Store + Courier):
--   1. `public.pilot_couriers`         — courier membership (user ↔ store).
--   2. `public.orders.courier_user_id` + courier_assigned_at — assignment state.
--   3. Courier RPCs (least privilege):
--        * pilot_orders_available()          — claimable orders for my store(s);
--                                              delivery-info only, NO customer phone.
--        * pilot_order_accept(order)         — claim (race-safe single UPDATE).
--        * pilot_courier_set_status(order, ) — strict transitions only:
--                                              confirmed/preparing →
--                                              out_for_delivery → delivered.
--        * pilot_orders_for_courier()        — my active deliveries.
--        * pilot_order_detail(order)         — order + items; couriers receive
--                                              NO customer_phone (operator/admin do).
--   4. Store-operator / admin helpers:
--        * pilot_my_stores()                 — stores I operate (or all for admin).
--        * pilot_order_status_for_user()     — owner self-service status (family).
--        * pilot_admin_pilot_health()        — Phase 8 admin health counts.
--        * pilot_admin_set_courier()         — provision couriers (admin only).
--
-- Hard boundaries honoured:
--   * Canonical order statuses UNCHANGED — the 6 named in 00050/00065
--     (pending, confirmed, preparing, out_for_delivery, delivered, cancelled).
--     NO new statuses are invented; NO transition is retrofitted into the
--     published 00065 functions.
--   * RLS is enabled on pilot_couriers; writes are admin-only; reads are
--     self + admin. All RPCs re-check auth server-side.
--   * ROLE_PERMISSIONS / ROLE_CAPABILITY_MAP / telemetry privacy / settings /
--     game model / marketplace security — NOT modified.
--   * Family accounts, store operators, couriers are ProvisionING (real user
--     identities), never invented in this migration.
-- ============================================================================


-- ============================================================================
-- 1) pilot_couriers — courier membership (user ↔ store)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_couriers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  store_id    uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_pilot_couriers_store ON public.pilot_couriers (store_id, status);
CREATE INDEX IF NOT EXISTS idx_pilot_couriers_user  ON public.pilot_couriers (user_id);

-- ============================================================================
-- 2) orders — courier assignment columns (additive)
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_courier_status
  ON public.orders (courier_user_id, status, created_at DESC);

-- ============================================================================
-- 3) RLS — pilot_couriers
--    SELECT: self or admin. Manage: admin only (provisioned via RPC).
-- ============================================================================
ALTER TABLE public.pilot_couriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Courier read own membership" ON public.pilot_couriers;
CREATE POLICY "Courier read own membership"
  ON public.pilot_couriers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin read all couriers" ON public.pilot_couriers;
CREATE POLICY "Admin read all couriers"
  ON public.pilot_couriers FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage couriers" ON public.pilot_couriers;
CREATE POLICY "Admin manage couriers"
  ON public.pilot_couriers FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.pilot_couriers TO authenticated;


-- ============================================================================
-- 4) pilot_my_stores — stores the caller operates (admin sees all active)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_my_stores()
RETURNS SETOF public.stores
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.status = 'active'
      AND (
        public.fn_admin_uid() IS NOT NULL
        OR s.operator_user_id = v_uid
      )
    ORDER BY s.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_my_stores() TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_my_stores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_my_stores() TO authenticated;


-- ============================================================================
-- 5) pilot_order_detail — full order + items for the authorised viewer.
--    Courier scope: delivery info WITHOUT customer_phone (least privilege).
--    Operator/admin scope: includes customer_phone.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_order_detail(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_admin   uuid := public.fn_admin_uid();
  v_store   uuid;
  v_courier uuid;
  v_result  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id, o.courier_user_id INTO v_store, v_courier
  FROM public.orders o
  WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_admin IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
    OR v_courier = v_uid
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'order',
      jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'customer_name', o.customer_name,
        'status', o.status,
        'subtotal', o.subtotal,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'notes', o.notes,
        'address', o.address,
        'zone_id', o.zone_id,
        'zone_name', z.name,
        'zone_name_ar', z.name_ar,
        'store_id', o.store_id,
        'store_name', s.name,
        'store_name_ar', s.name_ar,
        'neighborhood_id', o.neighborhood_id,
        'neighborhood_name', n.name,
        'user_id', o.user_id,
        'courier_user_id', o.courier_user_id,
        'courier_assigned_at', o.courier_assigned_at,
        'created_at', o.created_at,
        'updated_at', o.updated_at
      )
      || CASE WHEN v_admin IS NOT NULL OR EXISTS (
                 SELECT 1 FROM public.stores s2 WHERE s2.id = o.store_id AND s2.operator_user_id = v_uid
               )
              THEN jsonb_build_object('customer_phone', o.customer_phone)
              ELSE '{}'::jsonb END,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'category_id', oi.category_id,
        'catalog_ref', oi.catalog_ref,
        'name', oi.name,
        'unit_price', oi.unit_price,
        'quantity', oi.quantity,
        'line_total', (oi.unit_price * oi.quantity)::numeric
      ))
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.orders o
  LEFT JOIN public.delivery_zones z ON z.id = o.zone_id
  LEFT JOIN public.stores s     ON s.id = o.store_id
  LEFT JOIN public.neighborhoods n ON n.id = o.neighborhood_id
  WHERE o.id = p_order_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_order_detail(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_order_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_order_detail(uuid) TO authenticated;


-- ============================================================================
-- 6) Courier order streams (least privilege; no customer phone in lists)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_orders_available()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.created_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'store_id', o.store_id,
      'store_name', s.name,
      'store_name_ar', s.name_ar,
      'neighborhood_id', o.neighborhood_id,
      'neighborhood_name', n.name,
      'customer_name', o.customer_name,
      'zone_name', z.name,
      'zone_name_ar', z.name_ar,
      'address', o.address,
      'notes', o.notes,
      'item_count', COALESCE((SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id), 0),
      'total', o.total,
      'created_at', o.created_at
    ) AS row,
    o.created_at
    FROM public.orders o
    LEFT JOIN public.stores s          ON s.id = o.store_id
    LEFT JOIN public.neighborhoods n   ON n.id = o.neighborhood_id
    LEFT JOIN public.delivery_zones z  ON z.id = o.zone_id
    WHERE o.courier_user_id IS NULL
      AND o.status IN ('confirmed', 'preparing')
      AND (
        public.fn_admin_uid() IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.pilot_couriers pc
          WHERE pc.user_id = v_uid AND pc.store_id = o.store_id AND pc.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM public.stores s2 WHERE s2.id = o.store_id AND s2.operator_user_id = v_uid
        )
      )
  ) sub;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_orders_for_courier()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.created_at DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'store_id', o.store_id,
      'store_name', s.name,
      'store_name_ar', s.name_ar,
      'neighborhood_id', o.neighborhood_id,
      'neighborhood_name', n.name,
      'customer_name', o.customer_name,
      'zone_name', z.name,
      'zone_name_ar', z.name_ar,
      'address', o.address,
      'notes', o.notes,
      'item_count', COALESCE((SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id), 0),
      'total', o.total,
      'courier_assigned_at', o.courier_assigned_at,
      'created_at', o.created_at
    ) AS row,
    o.created_at
    FROM public.orders o
    LEFT JOIN public.stores s          ON s.id = o.store_id
    LEFT JOIN public.neighborhoods n   ON n.id = o.neighborhood_id
    LEFT JOIN public.delivery_zones z  ON z.id = o.zone_id
    WHERE o.courier_user_id = v_uid
      AND o.status NOT IN ('delivered', 'cancelled')
  ) sub;

  RETURN v_out;
END;
$$;

-- ============================================================================
-- 7) Courier actions (race-safe, strict transitions)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_order_accept(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_store uuid;
  v_done  integer;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id INTO v_store FROM public.orders o WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.pilot_couriers pc
      WHERE pc.user_id = v_uid AND pc.store_id = v_store AND pc.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
    SET courier_user_id     = v_uid,
        courier_assigned_at = now(),
        updated_at          = now()
  WHERE id = p_order_id
    AND courier_user_id IS NULL
    AND status IN ('confirmed', 'preparing');
  GET DIAGNOSTICS v_done = ROW_COUNT;

  IF v_done = 0 THEN
    RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('order_id', p_order_id, 'status', v_status, 'courier_user_id', v_uid);
END;
$$;

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR COALESCE(p_status, '') NOT IN (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.status INTO v_cur
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (o.courier_user_id = v_uid OR public.fn_admin_uid() IS NOT NULL);
  IF v_cur IS NULL THEN
    SELECT 1 FROM public.orders o WHERE o.id = p_order_id INTO v_cur;
    IF v_cur IS NULL THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.pilot_orders_available() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_orders_for_courier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_order_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_courier_set_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_orders_available() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_orders_for_courier() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_order_accept(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_courier_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_orders_available() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_orders_for_courier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_order_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_courier_set_status(uuid, text) TO authenticated;


-- ============================================================================
-- 8) Family self-service: order status (owner or admin; no enumeration leak)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_order_status_for_user(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'order_id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  ) INTO v_row
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (o.user_id = v_uid OR public.fn_admin_uid() IS NOT NULL);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_order_status_for_user(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_order_status_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_order_status_for_user(uuid) TO authenticated;


-- ============================================================================
-- 9) Admin: provision couriers + Phase 8 pilot health snapshot
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
  v_slug text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT s.slug INTO v_slug FROM public.stores s WHERE s.id = p_store_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pilot_couriers (user_id, store_id, status)
  VALUES (p_user_id, p_store_id, CASE WHEN COALESCE(p_active, TRUE) THEN 'active' ELSE 'inactive' END)
  ON CONFLICT (user_id, store_id) DO UPDATE SET
    status    = CASE WHEN COALESCE(p_active, TRUE) THEN 'active' ELSE 'inactive' END,
    updated_at = now();

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'user_id', p_user_id,
    'status', CASE WHEN COALESCE(p_active, TRUE) THEN 'active' ELSE 'inactive' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_pilot_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'neighborhoods', (SELECT count(*)::int FROM public.neighborhoods),
    'stores',        (SELECT count(*)::int FROM public.stores),
    'families',      (SELECT count(*)::int FROM public.family_groups),
    'couriers',      (SELECT count(*)::int FROM public.pilot_couriers pc WHERE pc.status = 'active'),
    'orders', jsonb_build_object(
      'total',          (SELECT count(*)::int FROM public.orders),
      'pending',        (SELECT count(*)::int FROM public.orders WHERE status = 'pending'),
      'confirmed',      (SELECT count(*)::int FROM public.orders WHERE status = 'confirmed'),
      'preparing',      (SELECT count(*)::int FROM public.orders WHERE status = 'preparing'),
      'out_for_delivery', (SELECT count(*)::int FROM public.orders WHERE status = 'out_for_delivery'),
      'delivered',      (SELECT count(*)::int FROM public.orders WHERE status = 'delivered'),
      'cancelled',      (SELECT count(*)::int FROM public.orders WHERE status = 'cancelled')
    ),
    'telemetry', jsonb_build_object(
      'order_created',  (SELECT count(*)::int FROM public.telemetry_events WHERE event_name = 'order_created'),
      'order_completed',(SELECT count(*)::int FROM public.telemetry_events WHERE event_name = 'order_completed'),
      'order_failed',   (SELECT count(*)::int FROM public.telemetry_events WHERE event_name = 'order_failed')
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_pilot_health() TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_pilot_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_pilot_health() TO authenticated;


-- ============================================================================
-- 10) Post-checks — fail loudly if structural expectations are not met.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pilot_couriers'
  ) THEN
    RAISE EXCEPTION '00068: pilot_couriers missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'courier_user_id'
  ) THEN
    RAISE EXCEPTION '00068: orders.courier_user_id missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname IN (
      'pilot_orders_available', 'pilot_order_accept', 'pilot_courier_set_status',
      'pilot_orders_for_courier', 'pilot_order_detail', 'pilot_order_status_for_user',
      'pilot_admin_pilot_health', 'pilot_my_stores', 'pilot_admin_set_courier'
    ) AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION '00068: courier/order RPC(s) missing after migration';
  END IF;
END;
$$;