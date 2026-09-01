-- ============================================================================
-- SETTINGS CONTROL CENTER — post-apply verification (00059)
-- Run in the Supabase SQL Editor (owner role) after applying 00059.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) Table exists with the expected minimal schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_settings'
ORDER BY ordinal_position;

-- 2) RLS is enabled and NO client grant exists (direct access stays closed)
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'app_settings';

-- 3) get_settings() exists, SECURITY DEFINER, search_path-hardened
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_settings';

-- 4) set_setting(text, jsonb) exists, SECURITY DEFINER
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'set_setting';

-- 5) Execution grants: revoked from PUBLIC; get_settings granted to authenticated
SELECT r.routine_name, r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name IN ('get_settings','set_setting')
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.routine_name, r.grantee;

-- 6) Seeded defaults exist (17 settings)
SELECT count(*) AS registered_settings FROM public.app_settings;

-- 7) Spot checks (run as the proper identity):
--    7a) Reader (admin/super_admin/researcher) sees the closed set:
--        SELECT public.get_settings()->'settings'->'game.rounds';
--        -> {"value": "7", "category": "game", "type": "integer"}
--    7b) Writer (admin/super_admin) validated update:
--        SELECT public.set_setting('cache.max_entries','600'::jsonb);
--        -> saved {key:cache.max_entries, value:600, category:cache, type:integer}
--        (reset: SELECT public.set_setting('cache.max_entries','500'::jsonb);)
--    7c) Invalid key rejected (cannot name an unregistered / security key):
--        SELECT public.set_setting('security.system_secret','1'::jsonb);
--        -> {"error":"INVALID_KEY", ...}
--    7d) Out-of-range rejected server-side:
--        SELECT public.set_setting('game.rounds','999'::jsonb);
--        -> {"error":"OUT_OF_RANGE", ...}
--    7e) Direct table read denied for non-owner (RLS):
--        SELECT count(*) FROM public.app_settings;  -> 0 rows for anon/authenticated
-- ============================================================================
