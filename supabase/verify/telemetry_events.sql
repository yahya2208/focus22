-- ============================================================================
-- TELEMETRY EVENTS — post-apply verification (00057)
-- Run in the Supabase SQL Editor (owner role) after applying 00057.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) Table exists with the expected columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telemetry_events'
ORDER BY ordinal_position;

-- 2) RPC exists
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'record_telemetry_event';

-- 3) RLS enabled (defense-in-depth): relrowsecurity = t
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'telemetry_events';

-- 4) Execution revoked from PUBLIC and granted to authenticated only
SELECT r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'record_telemetry_event'
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

-- 5) Indexes present
SELECT indexname
FROM pg_indexes
WHERE tablename = 'telemetry_events'
ORDER BY indexname;

-- 6) End-to-end invite for anony (guest) builds: not runnable until RPC exists.
--    The interactive smoke test lives in
--    src/__tests__/telemetry/telemetry-rpc-contract.test.ts
--    and the allowlist/forbidden-field matrix is validated in
--    src/__tests__/telemetry/event-validation.test.ts
