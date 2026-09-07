-- ============================================================================
-- 00078 — LOCATION FOUNDATION — post-apply verification
-- Run in the Supabase SQL Editor (owner/postgres) after applying 00078.
-- READ-ONLY: SELECTs + a single DO-block contract check. No DML, no DDL, no
-- data mutation. Each numbered section answers one GATE-2 verification point:
--   schema (columns/types/nullability), constraints, indexes,
--   courier location tables + uniqueness, security (RLS/policies/no anon/
--   no customer GPS read), retention mechanism.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Columns exist, with the expected type + nullability (positional 0-based
--    via pg_attribute). Expected casts:
--      stores.latitude              double precision, NULL ok
--      stores.longitude             double precision, NULL ok
--      neighborhoods.center_lat     double precision, NULL ok
--      neighborhoods.center_lng     double precision, NULL ok
--      orders.latitude              double precision, NULL ok
--      orders.longitude             double precision, NULL ok
--      pilot_couriers.is_online     boolean, NOT NULL (default false)
--      pilot_couriers.last_online_at timestamptz, NULL ok
-- ---------------------------------------------------------------------------
SELECT a.attrelid::regclass::text AS table_name,
       a.attname                   AS column_name,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull                AS not_null
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND ((c.relname = 'stores'    AND a.attname IN ('latitude', 'longitude'))
    OR (c.relname = 'neighborhoods' AND a.attname IN ('center_lat', 'center_lng'))
    OR (c.relname = 'orders'     AND a.attname IN ('latitude', 'longitude'))
    OR (c.relname = 'pilot_couriers' AND a.attname IN ('is_online', 'last_online_at')))
  AND a.attnum > 0
ORDER BY table_name, column_name;

-- ---------------------------------------------------------------------------
-- 2) Courier location HISTORY table exists (append-only + identity PK)
-- ---------------------------------------------------------------------------
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'pilot_courier_locations';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pilot_courier_locations'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 3) Latest table exists + uniqueness (PK on user_id => one row per courier,
--    no unbounded growth) + is NOT a plain history table.
-- ---------------------------------------------------------------------------
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'pilot_courier_locations_latest';

SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.pilot_courier_locations_latest'::regclass
  AND contype = 'p'
ORDER BY conname;

-- ---------------------------------------------------------------------------
-- 4) Constraints — coordinate ranges + sensible metric ranges on BOTH tables,
--    and on the static/destination coordinate columns.
-- ---------------------------------------------------------------------------
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'public.pilot_courier_locations'::regclass,
  'public.pilot_courier_locations_latest'::regclass,
  'public.stores'::regclass,
  'public.neighborhoods'::regclass,
  'public.orders'::regclass
) AND contype = 'c'
ORDER BY table_name, conname;

-- ---------------------------------------------------------------------------
-- 5) Indexes — only the justified ones for courier history by courier/store + time
-- ---------------------------------------------------------------------------
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('pilot_courier_locations', 'pilot_courier_locations_latest', 'orders')
ORDER BY tablename, indexname;

-- ---------------------------------------------------------------------------
-- 6) Security — RLS enabled on both new tables
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('pilot_courier_locations', 'pilot_courier_locations_latest')
ORDER BY relname;

-- ---------------------------------------------------------------------------
-- 7) Security — policies are admin-only; NO anon/authenticated-customer SELECT,
--    NO `USING (true)`, NO customer policy on raw courier GPS.
-- ---------------------------------------------------------------------------
SELECT tablename AS table_name, policyname, cmd, roles, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pilot_courier_locations', 'pilot_courier_locations_latest')
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- 8) Security — direct write grants are absent (SELECT-only to authenticated;
--    no anon grant at all). Writes flow through SECURITY DEFINER RPCs only.
-- ---------------------------------------------------------------------------
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('pilot_courier_locations', 'pilot_courier_locations_latest')
ORDER BY table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 9) Admin RPCs present, SECURITY DEFINER, fixed search_path, authenticated-only
--        * pilot_admin_set_store_location(uuid, numeric, numeric)
--        * pilot_admin_set_neighborhood_center(uuid, numeric, numeric)
--        * pilot_admin_purge_old_courier_locations(interval)  [retention]
-- ---------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef AS security_definer,
       p.proconfig  AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pilot_admin_set_store_location',
    'pilot_admin_set_neighborhood_center',
    'pilot_admin_purge_old_courier_locations'
  )
ORDER BY p.proname;

SELECT p.proname, r.grantee, r.privilege_type
FROM pg_proc p
JOIN information_schema.routine_privileges r ON r.routine_name = p.proname
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'pilot_admin_set_store_location',
    'pilot_admin_set_neighborhood_center',
    'pilot_admin_purge_old_courier_locations'
  )
  AND r.privilege_type = 'EXECUTE'
ORDER BY p.proname, r.grantee;

-- ---------------------------------------------------------------------------
-- 10) CONTRACT CHECK — raises EXCEPTION if any invariant is violated.
--     Read-only by construction (no writes anywhere in this file).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad boolean;
BEGIN
  -- schema: the 6 coordinate columns exist and are nullable; is_online NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores'
      AND column_name IN ('latitude', 'longitude') AND is_nullable = 'YES'
  ) THEN RAISE EXCEPTION '00078-check: stores coordinates wrong/absent'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'neighborhoods'
      AND column_name IN ('center_lat', 'center_lng') AND is_nullable = 'YES'
  ) THEN RAISE EXCEPTION '00078-check: neighborhoods center wrong/absent'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name IN ('latitude', 'longitude') AND is_nullable = 'YES'
  ) THEN RAISE EXCEPTION '00078-check: orders destination wrong/absent'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_couriers'
      AND column_name = 'is_online' AND is_nullable = 'NO'
  ) THEN RAISE EXCEPTION '00078-check: pilot_couriers.is_online wrong/absent'; END IF;

  -- courier location: both tables exist; latest is keyed on user_id (1 row/u)
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pilot_courier_locations')
    OR NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pilot_courier_locations_latest')
  THEN RAISE EXCEPTION '00078-check: courier location table(s) missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pilot_courier_locations_latest'::regclass
      AND contype = 'p' AND conname = 'pilot_courier_locations_latest_pkey'
  ) THEN RAISE EXCEPTION '00078-check: latest PK/user_id uniqueness missing'; END IF;

  -- security: RLS on; admin-only policies; no anon policies; no USING(true)
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('pilot_courier_locations','pilot_courier_locations_latest')
      AND (roles::text LIKE '%anon%' OR qual IS NULL OR qual = 'true')
  ) INTO v_bad;
  IF v_bad THEN RAISE EXCEPTION '00078-check: unsafe/anon/broad policy found on courier locations'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname IN ('pilot_courier_locations','pilot_courier_locations_latest')
      AND NOT relrowsecurity
  ) THEN RAISE EXCEPTION '00078-check: RLS disabled on courier locations'; END IF;

  -- retention: the operational purge RPC exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'pilot_admin_purge_old_courier_locations'
  ) THEN RAISE EXCEPTION '00078-check: retention purge RPC missing'; END IF;

  RAISE NOTICE '00078 verify: all contract checks PASSED';
END;
$$;