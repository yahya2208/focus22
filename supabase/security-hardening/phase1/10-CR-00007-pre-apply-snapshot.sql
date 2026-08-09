-- ============================================================================
-- CR-00007 · campaigns anon direct-grant — PRE-APPLY SNAPSHOT (READ-ONLY)
-- ----------------------------------------------------------------------------
-- Evidence-first directive (§3): capture the exact LIVE baseline BEFORE any
-- APPLY. This script performs NO DDL, NO DML, NO GRANT, NO REVOKE. Safe to run
-- on production in the Supabase SQL editor. Behavior probes use SET LOCAL ROLE
-- inside BEGIN; ROLLBACK; — nothing is written.
--
-- EVIDENCE MODEL (corrected 2026-08-09, per owner LIVE run):
--   LIVE shows anon has NO table ACL on public.campaigns
--   (anon SELECT/INSERT/UPDATE/DELETE = false; raw ACL has no anon entries).
--   Therefore anon's direct-table read (§3.F) is DENIED at ACL level (42501),
--   NOT "0 rows via RLS". authenticated/service_role grants remain PRESENT
--   (by design — required for the "Admins manage campaigns" RLS policy).
--   CR-00007 is ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED.
--
-- Reference: docs/security/operations/CR-00007-campaigns-anon-grant.md
-- ============================================================================

-- ============================================================================
-- §3.A — RLS state on public.campaigns
--   EXPECTED: relrowsecurity = true · relforcerowsecurity = false
-- ============================================================================
SELECT c.relname,
       c.relrowsecurity     AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.oid = 'public.campaigns'::regclass;

-- ============================================================================
-- §3.B — campaigns policies (exact live definitions)
--   EXPECTED: exactly ONE policy:
--     "Admins manage campaigns" | ALL | {authenticated} | is_admin() | <null>
--   NO broad authenticated SELECT policy may exist.
-- ============================================================================
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- ============================================================================
-- §3.C — grants on public.campaigns for anon / authenticated / service_role
-- ============================================================================

-- C1) raw ACL (definitive) — EXPECTED per corrected LIVE evidence (2026-08-09):
--     anon: NONE · authenticated: full set (by-design, required for the
--     "Admins manage campaigns" RLS policy) · service_role: full set.
SELECT r.rolname AS grantee, a.privilege_type, a.is_grantable
FROM aclexplode((SELECT c.relacl FROM pg_class c WHERE c.oid = 'public.campaigns'::regclass)) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- C2) role_table_grants (grantor visibility) for the three roles
SELECT grantor, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'campaigns'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- C3) has_table_privilege truth table (per role per statement type)
SELECT 'anon'          AS role_name,
       has_table_privilege('anon', 'campaigns', 'SELECT')  AS can_select,
       has_table_privilege('anon', 'campaigns', 'INSERT')  AS can_insert,
       has_table_privilege('anon', 'campaigns', 'UPDATE')  AS can_update,
       has_table_privilege('anon', 'campaigns', 'DELETE')  AS can_delete
UNION ALL
SELECT 'authenticated',
       has_table_privilege('authenticated', 'campaigns', 'SELECT'),
       has_table_privilege('authenticated', 'campaigns', 'INSERT'),
       has_table_privilege('authenticated', 'campaigns', 'UPDATE'),
       has_table_privilege('authenticated', 'campaigns', 'DELETE')
UNION ALL
SELECT 'service_role',
       has_table_privilege('service_role', 'campaigns', 'SELECT'),
       has_table_privilege('service_role', 'campaigns', 'INSERT'),
       has_table_privilege('service_role', 'campaigns', 'UPDATE'),
       has_table_privilege('service_role', 'campaigns', 'DELETE');

-- ============================================================================
-- §3.D — RPC posture: lookup_campaign_by_short_code
--   EXPECTED: SECURITY DEFINER = true · STABLE · search_path=public ·
--   EXECUTE granted to anon AND authenticated. DO NOT modify.
-- ============================================================================

-- D1) attributes + grants
SELECT p.proname,
       p.provolatile      AS volatility,
       p.prosecdef        AS security_definer,
       p.proconfig        AS config,
       has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'lookup_campaign_by_short_code';

-- D2) exact live body (must return ONLY id/short_code/name/is_active,
--     WHERE short_code = TRIM(p_code) AND is_active = true)
SELECT pg_get_functiondef('public.lookup_campaign_by_short_code(text)'::regprocedure)
       AS function_definition;

-- ============================================================================
-- §3.E — QR functional baseline (read-only, transaction + rollback)
--   E1: the directive's known-active code resolves to exactly one row
--       (id/short_code/name/is_active). If kq7Iej is ever inactive, substitute
--       the first active code:
--       (SELECT short_code FROM public.campaigns WHERE is_active = true LIMIT 1)
--   E2: an invalid code returns zero rows
-- ============================================================================
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code('kq7Iej');
ROLLBACK;
RESET ROLE;

BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code('ZZZZZZ');
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- §3.F — anon direct-table read (behavioral; transaction + rollback)
--   EXPECTED (corrected 2026-08-09): anon has NO table ACL → the read raises
--   "permission denied for table campaigns" (42501). RLS is never evaluated.
--   This ACL denial is the strongest proof of the direct-access objective.
-- ============================================================================
BEGIN;
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.campaigns;
    RAISE NOTICE '§3.F UNEXPECTED: anon CAN read public.campaigns — anon ACL present?';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '§3.F EXPECTED: anon denied at ACL (permission denied for table campaigns)';
  END;
END $$;
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- END — no changes performed. HARD STOP retained.
-- ============================================================================
