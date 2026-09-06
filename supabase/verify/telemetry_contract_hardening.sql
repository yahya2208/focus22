-- ============================================================================
-- TELEMETRY CONTRACT HARDENING — post-apply verification (00076)
-- Run in the Supabase SQL Editor (owner role) after applying 00076.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) Function still exists (re-created, SECURITY DEFINER, hardened search_path)
 SELECT p.proname, p.prosecdef::text AS is_security_definer, p.provolatile::text AS volatility,
        p.proconfig::text AS config
 FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'record_telemetry_event';

-- 2) CLOSED entity-type validation is live (strings inside the function body)
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'record_telemetry_event'
  AND pg_get_functiondef(p.oid) LIKE '%INVALID_ENTITY_TYPE%'
  AND pg_get_functiondef(p.oid) LIKE '%' || chr(39) || 'catalog_product' || chr(39) || '%';

-- 3) family_id now allowed on family_view / checkout_submit / order_created
SELECT
  (pg_get_functiondef(p.oid) LIKE '%WHEN ' || chr(39) || 'family_view' || chr(39) || ' THEN v_allowed := ARRAY[''family_id'']%') AS family_view_ok,
  (pg_get_functiondef(p.oid) LIKE '%WHEN ' || chr(39) || 'checkout_submit' || chr(39) || ' THEN v_allowed := ARRAY[''items_count'',''family_id'']%') AS checkout_submit_ok,
  (pg_get_functiondef(p.oid) LIKE '%WHEN ' || chr(39) || 'order_created' || chr(39) || ' THEN v_allowed := ARRAY[''channel'',''family_id'']%') AS order_created_ok
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'record_telemetry_event';

-- 4) Execution grants UNCHANGED (least privilege): anon + authenticated only
SELECT r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'record_telemetry_event'
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

-- 5) No table/index/RLS regression
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'telemetry_events';
SELECT indexname
FROM pg_indexes
WHERE tablename = 'telemetry_events'
  AND indexname = 'uidx_telemetry_dedupe';