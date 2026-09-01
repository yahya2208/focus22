-- ============================================================================
-- TELEMETRY ANALYTICS — post-apply verification (00058)
-- Run in the Supabase SQL Editor (owner role) after applying 00058.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) Read RPC exists with the expected signature (6 typed params)
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'get_telemetry_analytics';

-- 2) RPC is SECURITY DEFINER and search_path-hardened
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'get_telemetry_analytics';

-- 3) Execution is revoked from PUBLIC and granted ONLY to authenticated
--    (admin/super_admin/researcher are enforced INSIDE the function via public.users.role)
SELECT r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'get_telemetry_analytics'
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

-- 4) Direct table access is still closed: RLS enabled + no SELECT grants for anon/authenticated
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'telemetry_events';

-- 5) Handful of spot checks that the RPC returns aggregates and stays closed:
--    5a) Totals shape (expect keys: total_events, unique_sessions, unique_visitors, unique_users) —
--        run as an admin/super_admin/researcher identity:
--        SELECT public.get_telemetry_analytics(NULL,NULL,NULL,NULL,NULL,NULL)->'totals';
--    5b) Banned event returns INVALID_FILTER (no data leak):
--        SELECT public.get_telemetry_analytics(NULL,NULL,'nope',NULL,NULL,NULL);
--    5c) Inverted date window returns INVALID_DATE_RANGE:
--        SELECT public.get_telemetry_analytics('2026-01-01','2025-01-01',NULL,NULL,NULL,NULL);
-- ============================================================================
