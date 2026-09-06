-- ============================================================================
-- TELEMETRY JOURNEY IDENTITY — post-apply verification (00077)
-- Run in the Supabase SQL Editor (owner role) after applying 00077.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) column exists, nullable, NOT PII (plain text, no FKs)
SELECT a.attname, a.attnotnull
FROM pg_attribute a
WHERE a.attrelid = 'public.telemetry_events'::regclass AND a.attname = 'journey_id';

-- 2) NO backfill: legacy rows keep journey_id NULL
SELECT 'NULL_ROWS', count(*) AS all_rows, count(*) FILTER (WHERE journey_id IS NULL) AS null_rows,
       count(*) FILTER (WHERE journey_id IS NOT NULL) AS with_journey
FROM public.telemetry_events;

-- 3) RPC now extracts + validates journey_id (INVALID_JOURNEY_ID present, NULL accepted)
SELECT
  (pg_get_functiondef(p.oid) LIKE '%INVALID_JOURNEY_ID%') AS journey_validator,
  (pg_get_functiondef(p.oid) LIKE '%journey_id, properties, context, dedupe_key%') AS inserts_journey
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'record_telemetry_event';

-- 4) execution grants UNCHANGED (least privilege): anon + authenticated only
SELECT r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'record_telemetry_event' AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

-- 5) NO new index on journey_id was added
SELECT i.indexname
FROM pg_indexes i
WHERE i.tablename = 'telemetry_events' AND i.indexname = 'idx_telemetry_journey_id';

-- 6) analytics RPC untouched, RLS unchanged
SELECT p.proname
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_telemetry_analytics';
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.telemetry_events'::regclass;