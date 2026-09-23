-- ============================================================================
-- ADMIN CONTROL CENTER — PASS 2 GATE-0 STRUCTURAL VERIFICATION (00063 LIVE)
-- 100% READ-ONLY — NO writes, NO RPC spot-checks, NO restores.
-- Run in the Supabase SQL Editor with the OWNER role.
--
-- Purpose (Pass-2 contract): before authoring 00064_admin_control_center_pass2
-- we must positively confirm what 00063 ACTUALLY applied live. The anon probe
-- already proved set_setting EXECUTE was revoked (42501) and both RPCs exist.
-- These structural queries close the remaining unknowns flagged as
-- PARTIAL/UNKNOWN in docs/audits/migration-reconciliation-telemetry-desync.md,
-- chiefly: is app_settings_changes really created, and is the ACL exactly
-- (authenticated + service_role, NOT anon)?
--
-- Expected values are annotated on every query. Report them back verbatim.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) app_settings exists with the exact columns (00059). Expected: 8 rows
--    (key, value, category, type, updated_by, updated_at + 2 RLS control cols).
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_settings'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 2) app_settings RLS. Expected: relrowsecurity = t, then 0 policies.
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'app_settings';

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_settings';

-- ---------------------------------------------------------------------------
-- 3) app_settings grants — anon/authenticated must have ZERO table grants.
--    Expected: 0 rows (or only owner-ish roles, never anon/authenticated).
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'app_settings'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public');

-- ---------------------------------------------------------------------------
-- 4) REGISTERED SETTING COUNT — the Pass-1 target. Expected: 33.
--    If NOT 33, stop and report: Pass-2 key seeds must not build on drift.
-- ---------------------------------------------------------------------------
SELECT count(*) AS registered_settings
FROM public.app_settings;

-- ---------------------------------------------------------------------------
-- 5) FULL KEY PARITY — every 00059+00060+00063 key present. Expected: 33 rows.
-- ---------------------------------------------------------------------------
SELECT key, value->>'value' AS value, category, type
FROM public.app_settings
ORDER BY category, key;

-- ---------------------------------------------------------------------------
-- 6) CRITICAL: app_settings_changes — does the audit table REALLY exist?
--    This closes the "PARTIAL/UNKNOWN" 00063 flag. Expected: schema columns
--    (id, setting_key, old_value, new_value, updated_by, updated_at).
--    If this returns zero rows / an error -> 00063 did NOT fully apply and
--    Pass-2 (00064) must include an idempotent CREATE for it.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_settings_changes'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 7) app_settings_changes RLS + policies. Expected: relrowsecurity = t, 0 rows
--    from pg_policies (append-only via set_setting SECURITY DEFINER).
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'app_settings_changes';

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_settings_changes';

-- ---------------------------------------------------------------------------
-- 8) app_settings_changes grants — anon/authenticated must have ZERO.
--    Expected: 0 rows.
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'app_settings_changes'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public');

-- ---------------------------------------------------------------------------
-- 9) AUDIT ROW COUNT — proof that set_setting actually appended rows live.
--    Expected: >= 1 row per key that was ever saved (Pass-1 verification wrote
--    marketplace.listing_page_limit twice, so that key should show >= 2).
--    Zero rows here is NOT a failure — but it means the audit trail has never
--    been exercised live and 00064's audit-read RPC must tolerate an empty table.
-- ---------------------------------------------------------------------------
SELECT setting_key, count(*) AS changes
FROM public.app_settings_changes
GROUP BY setting_key
ORDER BY setting_key;

-- ---------------------------------------------------------------------------
-- 10) get_settings() — definer + hardened search_path + fixed signature.
--     Expected: prosecdef = t, arg_types = (empty), NOTNULL proconfig = ''.
-- ---------------------------------------------------------------------------
SELECT p.proname,
       oidvectortypes(p.proargtypes) AS arg_types,
       p.prosecdef,
       p.provolatile,
       p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'get_settings';

-- ---------------------------------------------------------------------------
-- 11) get_settings() EXECUTE ACL — record the CURRENT truth. Known live quirk:
--     anon still holds EXECUTE (the function runs and returns UNAUTHORIZED).
--     Expected: rows for postgres, authenticated, service_role, anon (may vary).
--     DO NOT change ACLs here; 00064 keeps get_settings anon-safe because its
--     authorizer rejects auth.uid() IS NULL before returning anything.
-- ---------------------------------------------------------------------------
SELECT r.routine_name, r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'get_settings'
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

SELECT
  has_function_privilege('anon',          'public.get_settings()', 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.get_settings()', 'EXECUTE') AS auth_execute,
  has_function_privilege('service_role',  'public.get_settings()', 'EXECUTE') AS svc_execute;

-- ---------------------------------------------------------------------------
-- 12) set_setting(text, jsonb) — definer + search_path + SINGLE signature.
--     Expected: prosecdef = t, arg_types = text, jsonb, proconfig NOTNULL = ''.
-- ---------------------------------------------------------------------------
SELECT p.proname,
       oidvectortypes(p.proargtypes) AS arg_types,
       p.prosecdef,
       p.provolatile,
       p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'set_setting';

-- Confirm no overloads (00063 guarantee — exactly one signature).
SELECT count(*) AS set_setting_signatures
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'set_setting';

-- ---------------------------------------------------------------------------
-- 13) set_setting EXECUTE ACL — the Pass-1 tightened result.
--     Expected: grants for postgres, authenticated, service_role ONLY;
--     anon_execute = f, svc_execute = t, no PUBLIC grants.
-- ---------------------------------------------------------------------------
SELECT r.routine_name, r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'set_setting'
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

SELECT
  has_function_privilege('anon',          'public.set_setting(text, jsonb)', 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.set_setting(text, jsonb)', 'EXECUTE') AS auth_execute,
  has_function_privilege('service_role',  'public.set_setting(text, jsonb)', 'EXECUTE') AS svc_execute;

SELECT r.routine_name, count(*) AS public_execute_grants
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'set_setting'
  AND r.privilege_type = 'EXECUTE'
  AND (r.grantee = 'PUBLIC' OR r.grantee = 'public')
GROUP BY r.routine_name;

-- ---------------------------------------------------------------------------
-- 14) INFORMATIONAL — legacy dormant tables (00009) still present. Expected:
--     0 rows for the gate decision (Pass-2 never touches them; a migration-gate
--     test already forbids production references). Listed here only for the
--     reconciliation record.
-- ---------------------------------------------------------------------------
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('system_settings', 'audit_log', 'job_assignments', 'contracts')
ORDER BY tablename;

-- ============================================================================
-- GATE CRITERIA (report back each verdict):
--   4 rows ==  EXACTLY 33  -> proceed to seed Pass-2 keys in 00064.
--   6 columns returned    -> app_settings_changes IS live   -> 00064 references
--                            it directly (no re-create needed; CREATE IF NOT
--                            EXISTS is harmless either way).
--   anon_execute = f on set_setting -> 00063 anon fix confirmed live.
-- Any other value -> STOP and hand this output back before writing 00064.
-- ============================================================================