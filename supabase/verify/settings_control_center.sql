-- ============================================================================
-- SETTINGS CONTROL CENTER — post-apply verification (00059 + 00060)
-- Run in the Supabase SQL Editor (owner role) AFTER applying BOTH
--   00059_settings_control_center.sql  AND
--   00060_telemetry_settings.sql
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) public.app_settings exists with the exact expected minimal schema.
-- ---------------------------------------------------------------------------
SELECT
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_settings'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 2) RLS is enabled on app_settings (relrowsecurity = true).
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'app_settings';

-- ---------------------------------------------------------------------------
-- 3) NO client policy on app_settings. We want PROOF there are zero policies,
--    so anon/authenticated can never touch the table directly.
--    Expected: 0 rows returned.
-- ---------------------------------------------------------------------------
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_settings';

-- ---------------------------------------------------------------------------
-- 4) get_settings() exists, SECURITY DEFINER, search_path-hardened.
--    provolatile should be 's' (STABLE — it only SELECTs).
-- ---------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef,
       p.provolatile,
       p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'get_settings';

-- ---------------------------------------------------------------------------
-- 5) set_setting(text, jsonb) — checked by PARAMETER TYPES, not by name.
--    We verify the object signature via proargtypes/oidvectortypes, which carry
--    ONLY the parameter types (never the cosmetic argument names): exactly two
--    arguments of type "text" and "jsonb" -> oidvectortypes returns "text, jsonb".
--    Requires additionally: prosecdef = true (SECURITY DEFINER),
--                           provolatile = 'v' (VOLATILE — INSERT/UPDATE),
--                           proconfig contains search_path = ''.
-- ---------------------------------------------------------------------------
SELECT p.proname,
       oidvectortypes(p.proargtypes) AS arg_types,
       p.prosecdef,
       p.provolatile,
       p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'set_setting'
  AND p.pronargs = 2
  AND oidvectortypes(p.proargtypes) = 'text, jsonb';

-- ---------------------------------------------------------------------------
-- 6) EXECUTE grants: authenticated HAS EXECUTE on both RPCs, and PUBLIC does
--    NOT have EXECUTE on either. Two independent gates:
--      (a) who HAS execute (should include authenticated, exclude anon)
--      (b) PUBLIC granted count == 0 (proof PUBLIC is revoked)
-- ---------------------------------------------------------------------------
-- (a) Grantees for each function (expect: authenticated; anon absent).
SELECT r.routine_name,
       r.grantee,
       r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name IN ('get_settings', 'set_setting')
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.routine_name, r.grantee;

-- (b) PROOF PUBLIC has no EXECUTE on either (expect 0 rows each).
SELECT r.routine_name, count(*) AS public_execute_grants
FROM information_schema.routine_privileges r
WHERE r.routine_name IN ('get_settings', 'set_setting')
  AND r.privilege_type = 'EXECUTE'
  AND (r.grantee = 'PUBLIC' OR r.grantee = 'public')
GROUP BY r.routine_name;

-- ---------------------------------------------------------------------------
-- 7) Seeded defaults: exactly 20 registered settings (17 base + 3 telemetry).
--    Expected count = 20.
-- ---------------------------------------------------------------------------
SELECT count(*) AS registered_settings
FROM public.app_settings;

-- ---------------------------------------------------------------------------
-- 8) The three telemetry knobs exist with the expected default values.
-- ---------------------------------------------------------------------------
SELECT key, value->>'value' AS value
FROM public.app_settings
WHERE key IN ('telemetry.max_batch', 'telemetry.flush_ms', 'telemetry.max_buffer')
ORDER BY key;

-- ---------------------------------------------------------------------------
-- 9) The 17 base settings from 00059 are ALL still present (proves 00060 did
--    NOT replace or drop any of them). Expected: list all 17 rows.
-- ---------------------------------------------------------------------------
SELECT key, value->>'value' AS value
FROM public.app_settings
WHERE key IN (
  'game.rounds',
  'game.min_delay_ms',
  'game.max_delay_ms',
  'game.min_position_distance_pct',
  'offers.default_discount_percent',
  'offers.default_max_usage',
  'offers.return_discount_percent',
  'offers.whatsapp_discount_percent',
  'offers.whatsapp_max_usage',
  'inventory.overstock_multiplier',
  'rules.inventory_low_threshold',
  'rules.device_visitors_threshold',
  'rules.trade_conversion_threshold',
  'rules.visitor_count_threshold',
  'rules.default_threshold',
  'rules.needs_discount_visit_count',
  'cache.max_entries'
)
ORDER BY key;

-- ============================================================================
-- 10) RPC SPOT CHECKS — RESTORE-TO-ORIGINAL OBLIGATORY.
--
--     Run ONLY AFTER the DDL sections above report all-correct, and ONLY as
--     admin / super_admin / researcher identities (never anon). These are
--     MUTATING/RESULT tests that write values. Every set_setting must be
--     followed by an explicit reset to the value it overwrote.
--
--     READ (idempotent, safe) — reader role:
--       SELECT public.get_settings()->'settings'->'game.rounds';
--         -> {"value":"7","category":"game","type":"integer"}
--
--     WRITE + RESET (validate + restore the same key):
--       -- capture current value first (e.g. cache.max_entries = 500)
--       SELECT public.set_setting('cache.max_entries', '600'::jsonb);
--         -> saved {key:cache.max_entries, value:600, ...}
--       -- RESTORE the original value AFTER the test:
--       SELECT public.set_setting('cache.max_entries', '500'::jsonb);
--         -> saved {key:cache.max_entries, value:500, ...}
--
--     NEGATIVE RPC tests (MUST be rejected server-side — no restore needed,
--     they leave no state):
--       SELECT public.set_setting('security.system_secret', '1'::jsonb);
--         -> {"error":"INVALID_KEY", ...}        [unregistered key denied]
--       SELECT public.set_setting('game.rounds', '999'::jsonb);
--         -> {"error":"OUT_OF_RANGE", ...}       [out-of-range denied]
--       SELECT public.set_setting('telemetry.flush_ms', '0'::jsonb);
--         -> {"error":"OUT_OF_RANGE", ...}       [telemetry bound denied]
--
--     RLS denial (as anon/authenticated, direct SELECT is NOT allowed):
--       SELECT count(*) FROM public.app_settings;   -> 0 rows / permission denied
-- ============================================================================
