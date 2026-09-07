-- ============================================================================
-- 00082 — OPERATIONAL ORDER VISIBILITY + REALTIME — post-apply verification
-- Run in the Supabase SQL Editor (owner/postgres) after applying 00082.
-- READ-ONLY: SELECTs + a single DO-block contract check. No DML, no DDL, no
-- data mutation. GATE-6 verification points:
--   my-orders RPC (owner/admin scope, grants, no phone in list),
--   owner-visible order detail (phone guard preserved),
--   realtime publication = ONLY orders + order_status_history,
--   scoped read policies on orders + history (owner/courier/operator/admin; no anon),
--   grant invariants preserved (orders SELECT-only, history SELECT-only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) pilot_my_orders + (extended) pilot_order_detail exist with exact grants.
--    Expected: EXECUTE granted to authenticated, revoked from anon/PUBLIC.
-- ---------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_functiondef(p.oid) LIKE '%SECURITY DEFINER%' AS security_definer,
       pg_get_functiondef(p.oid) LIKE '%SET search_path = '''' %' AS fixed_search_path,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('pilot_my_orders', 'pilot_order_detail');

-- ---------------------------------------------------------------------------
-- 2) pilot_my_orders body — owner-or-admin scope, bounded, no phone in list.
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef(oid)
FROM pg_proc
JOIN pg_namespace n ON n.oid = pronamespace
WHERE n.nspname = 'public' AND proname = 'pilot_my_orders';

-- ---------------------------------------------------------------------------
-- 3) pilot_order_detail body — authorization includes the owner (o.user_id)
--    while keeping the 00068 phone guard (admin / store operator only).
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef(oid)
FROM pg_proc
JOIN pg_namespace n ON n.oid = pronamespace
WHERE n.nspname = 'public' AND proname = 'pilot_order_detail';

-- ---------------------------------------------------------------------------
-- 4) Realtime publication — EXACTLY orders + order_status_history.
--    pilot_courier_locations(_latest) must NOT appear (no live GPS feed).
-- ---------------------------------------------------------------------------
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY schemaname, tablename;

-- ---------------------------------------------------------------------------
-- 5) orders RLS policies — scoped owner/courier/store-operator reads added;
--    existing admin "Staff read orders" retained; no anon policies.
-- ---------------------------------------------------------------------------
SELECT p.policyname, p.cmd, p.roles,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_policies p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'orders'
ORDER BY p.policyname;

-- ---------------------------------------------------------------------------
-- 6) order_status_history RLS policies — scoped owner/courier/store-operator
--    reads added; existing admin policy retained; no anon policies.
-- ---------------------------------------------------------------------------
SELECT p.policyname, p.cmd, p.roles,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_policies p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'order_status_history'
ORDER BY p.policyname;

-- ---------------------------------------------------------------------------
-- 7) Grant invariants — orders: SELECT-only for authenticated (00080 contract);
--    order_status_history: SELECT-only (00079 contract). Neither table may
--    carry a direct INSERT/UPDATE/DELETE grant to authenticated.
-- ---------------------------------------------------------------------------
SELECT table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'order_status_history')
  AND grantee IN ('authenticated', 'anon')
ORDER BY table_name, privilege_type;

-- ---------------------------------------------------------------------------
-- 8) Contract check (RAISE EXCEPTION on violation) — mirrors migration post-checks.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pol  text;
  v_pol2 text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('pilot_courier_locations', 'pilot_courier_locations_latest')
  ) THEN
    RAISE EXCEPTION '00082 verify: courier location tables may NOT be published';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename IN ('orders', 'order_status_history')
  ) THEN
    RAISE EXCEPTION '00082 verify: orders/history missing from supabase_realtime';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION '00082 verify: authenticated SELECT grant missing on orders';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name IN ('orders','order_status_history')
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION '00082 verify: authenticated has a WRITE grant on order tables';
  END IF;
  FOREACH v_pol IN ARRAY ARRAY[
    'Realtime read own orders','Realtime read courier assigned orders',
    'Realtime read store orders','Realtime read all orders (admin)'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = v_pol
    ) THEN
      RAISE EXCEPTION '00082 verify: orders policy % missing', v_pol;
    END IF;
  END LOOP;
  FOREACH v_pol2 IN ARRAY ARRAY[
    'Realtime history owner','Realtime history courier','Realtime history store'
  ]::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'order_status_history' AND policyname = v_pol2
    ) THEN
      RAISE EXCEPTION '00082 verify: history policy % missing', v_pol2;
    END IF;
  END LOOP;
END;
$$;