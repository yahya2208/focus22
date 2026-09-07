-- ============================================================================
-- 00082  Delivery Operating System — OPERATIONAL ORDER VISIBILITY + REALTIME
-- ----------------------------------------------------------------------------
-- Gate 6 (Operational Order Visibility, History, Realtime & Reliability).
--
-- Scope:
--   A) CUSTOMER "MY ORDERS": new read-only RPC public.pilot_my_orders() —
--      the caller's own orders (or every order for an admin), newest first,
--      bounded (LIMIT 100). No customer phone in the list (least privilege;
--      the owner already holds it, but the list keeps a uniform public shape).
--   B) OWNER DETAIL: pilot_order_detail is extended (SAME signature, SAME
--      grants, SAME error codes) so the order OWNER (o.user_id = auth.uid())
--      may read their own order + items. courier_user_id and the address/items
--      are theirs already; customer_phone stays restricted to admin / the
--      owning store's operator (the 00068 CASE guard is preserved verbatim).
--      Authorization remains server-side; no client-provided role.
--   C) REALTIME FEED: publish EXACTLY TWO tables to supabase_realtime:
--      public.orders and public.order_status_history. Realtime is
--      NOTIFICATION, never authority — the DB row (orders.status) is always
--      the truth and the timeline comes from order_status_history (00079),
--      never from a client-fabricated event. Read access for live payloads is
--      enforced by RLS on the subscriber's role (Supabase realtime delivers a
--      row only when the subscriber can SELECT it).
--      NO pilot_courier_locations/latest is published and NO customer policy
--      is added over courier location rows (GATE-6 boundary: GPS stays out).
--   D) RLS READ POLICIES (scoped, additive — existing admin staff policies
--      are untouched):
--        orders               -> owner (user_id) / assigned courier /
--                                owning store operator
--                             + admin (fn_admin_uid, all orders — the admin
--                                ops live view; additive & realtime-scoped)
--        order_status_history -> owner / assigned courier / owning store
--                                operator + admin (pre-existing, 00079)
--      Every policy: AS PERMISSIVE FOR SELECT TO authenticated, authored with
--      the (select auth.uid()) initplan form required by 00074 lint. No
--      SELECT-all surface, no anon read.
--   E) INDEXES: NONE added. Existing indexes already serve every new path:
--        idx_orders_user              (user_id, created_at DESC) 00065 -> My Orders
--        idx_orders_store             (store_id, status, created_at DESC) 00065
--        idx_orders_courier_status    (courier_user_id, status) 00068
--        idx_order_status_history_order_time (order_id, created_at) 00079 RL-timeline
--      (/intentionally no speculative index.)
--
-- Boundaries honoured:
--   * No GPS / geolocation / maps / routing / geofencing / ETA work.
--   * No fake realtime and no client-side status authority (matrix still lives
--     ONLY in pilot_assert_transition, 00079).
--   * No Telemetry Wave C, no RBAC/ROLE_PERMISSIONS/CAPABILITY_MAP change.
--   * NO service_role usage anywhere; anon gets NOTHING new.
--   * No column added/dropped/renamed on orders / order_status_history;
--     existing grants preserved (orders: SELECT only for authenticated since
--     00080; history: SELECT only since 00079).
--   * Unrelated work (settings/BI/ads/catalog/untracked 00064) untouched.
--
-- Rollback (git-only change; reversible without touching other migrations):
--   * DROP FUNCTION public.pilot_my_orders();
--   * Re-apply the 00068 body of pilot_order_detail (CREATE OR REPLACE,
--     definition preserved in the immutable earlier migration).
--   * DROP POLICY IF EXISTS the 4 orders + 3 order_status_history policies.
--   * ALTER PUBLICATION supabase_realtime DROP TABLE orders / order_status_history
--     (if ever needed; the guarded adds below are re-run-safe).
-- ============================================================================

-- ============================================================================
-- 1) CUSTOMER MY ORDERS — owner (or admin) read-only list. No enumeration:
--    non-owners simply get their OWN list; an unauthenticated caller fails.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_my_orders()
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

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.created_at DESC, sub.id DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT
      o.id,
      o.created_at,
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'status', o.status,
        'subtotal', o.subtotal,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'store_id', o.store_id,
        'store_name', s.name,
        'store_name_ar', s.name_ar,
        'zone_name', z.name,
        'zone_name_ar', z.name_ar,
        'neighborhood_id', o.neighborhood_id,
        'neighborhood_name', n.name,
        'item_count', COALESCE((
          SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id
        ), 0),
        'courier_user_id', o.courier_user_id,
        'created_at', o.created_at,
        'updated_at', o.updated_at
      ) AS row
    FROM public.orders o
    LEFT JOIN public.stores s         ON s.id = o.store_id
    LEFT JOIN public.delivery_zones z ON z.id = o.zone_id
    LEFT JOIN public.neighborhoods n  ON n.id = o.neighborhood_id
    WHERE o.user_id = v_uid
       OR public.fn_admin_uid() IS NOT NULL
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 100
  ) sub;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_my_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_orders() TO authenticated;

-- ============================================================================
-- 2) pilot_order_detail — EXTENDED to the order OWNER. Signature, grants,
--    error codes and every existing behaviour are preserved; the only change
--    is the added 'OR o.user_id = v_uid' authorization branch and the select
--    of o.user_id. customer_phone exposure guard (admin / store operator)
--    is kept exactly as 00068 defined it.
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
  v_customer uuid;
  v_result  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id, o.courier_user_id, o.user_id INTO v_store, v_courier, v_customer
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
    OR v_customer = v_uid
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

REVOKE ALL ON FUNCTION public.pilot_order_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_order_detail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_order_detail(uuid) TO authenticated;

-- ============================================================================
-- 3) REALTIME PUBLICATION — EXACTLY orders + order_status_history.
--    Guarded adds (re-run safe). No courier-location publication.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
  END IF;
END;
$$;

-- ============================================================================
-- 4) SCOPED READ POLICIES (additive; existing admin/staff policies intact).
--    00074 lint form: AS PERMISSIVE FOR SELECT TO authenticated + initplans.
-- ============================================================================
DROP POLICY IF EXISTS "Realtime read own orders" ON public.orders;
CREATE POLICY "Realtime read own orders"
  ON public.orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Realtime read courier assigned orders" ON public.orders;
CREATE POLICY "Realtime read courier assigned orders"
  ON public.orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = courier_user_id);

DROP POLICY IF EXISTS "Realtime read store orders" ON public.orders;
CREATE POLICY "Realtime read store orders"
  ON public.orders AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_id AND s.operator_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Realtime read all orders (admin)" ON public.orders;
CREATE POLICY "Realtime read all orders (admin)"
  ON public.orders AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Realtime history owner" ON public.order_status_history;
CREATE POLICY "Realtime history owner"
  ON public.order_status_history AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Realtime history courier" ON public.order_status_history;
CREATE POLICY "Realtime history courier"
  ON public.order_status_history AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.courier_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Realtime history store" ON public.order_status_history;
CREATE POLICY "Realtime history store"
  ON public.order_status_history AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.stores s ON s.id = o.store_id
    WHERE o.id = order_id AND s.operator_user_id = (SELECT auth.uid())
  ));

-- ============================================================================
-- 5) Post-checks — fail loudly if the structural contract is not met.
-- ============================================================================
DO $$
DECLARE
  v_pol  text;
  v_pol2 text;
BEGIN
  -- Realtime publication: exactly the two order tables; courier locations OUT.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename IN ('orders', 'order_status_history')
  ) THEN
    RAISE EXCEPTION '00082: orders/history not in supabase_realtime';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('pilot_courier_locations', 'pilot_courier_locations_latest')
  ) THEN
    RAISE EXCEPTION '00082: courier location tables must NOT be published';
  END IF;

  -- RPCs.
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN ('pilot_my_orders', 'pilot_order_detail')
  ) THEN
    RAISE EXCEPTION '00082: my-orders/detail RPC(s) missing';
  END IF;

  -- Scoped read policies on orders.
  FOR v_pol IN SELECT policyname FROM unnest(ARRAY[
    'Realtime read own orders','Realtime read courier assigned orders',
    'Realtime read store orders','Realtime read all orders (admin)'
  ]) AS policyname
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = v_pol
    ) THEN
      RAISE EXCEPTION '00082: orders policy % missing', v_pol;
    END IF;
  END LOOP;

  -- Scoped read policies on order_status_history.
  FOR v_pol2 IN SELECT policyname FROM unnest(ARRAY[
    'Realtime history owner','Realtime history courier','Realtime history store'
  ]) AS policyname
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'order_status_history' AND policyname = v_pol2
    ) THEN
      RAISE EXCEPTION '00082: history policy % missing', v_pol2;
    END IF;
  END LOOP;

  -- Grants invariants preserved: orders SELECT-only; history no WRTI privilege.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION '00082: authenticated gained a WRITE grant on orders';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION '00082: authenticated SELECT grant on orders missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'order_status_history'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION '00082: authenticated has a WRITE grant on order_status_history';
  END IF;
END;
$$;