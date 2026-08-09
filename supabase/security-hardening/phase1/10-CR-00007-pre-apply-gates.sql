-- ============================================================================
-- CR-00007 · campaigns anon direct-grant — PRE-APPLY GATES (READ-ONLY · SMALL)
-- ----------------------------------------------------------------------------
-- Small diagnostic form of the pre-apply snapshot: every gate is emitted as one
-- row in a SINGLE final result set (`check_name | result`), so the full verdict
-- is visible in the SQL editor even if it surfaces only the last grid.
--
-- READ-ONLY ONLY. No REVOKE / GRANT / ALTER / CREATE / DROP / migration /
-- RLS change / policy change. Behavior probes use SET LOCAL ROLE inside
-- BEGIN; ROLLBACK; — nothing is written.
--
-- How to run: paste the WHOLE script once in the Supabase SQL editor.
--   · Statements A–H are the raw detail evidence (result-set tabs).
--   · The LAST statement is the consolidated gate table — one row per check.
-- ============================================================================

-- ============================================================================
-- A · RLS state on public.campaigns + anon bypass flag
-- ============================================================================
SELECT c.relname,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon') AS anon_bypassrls
FROM pg_class c
WHERE c.oid = 'public.campaigns'::regclass;

-- ============================================================================
-- B · ALL policies on public.campaigns (exact live definitions)
-- ============================================================================
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- ============================================================================
-- C · raw ACL on public.campaigns (incl. PUBLIC if present) + role grants
-- ============================================================================
SELECT COALESCE(r.rolname, 'PUBLIC') AS grantee, a.privilege_type, a.is_grantable
FROM aclexplode((SELECT c.relacl FROM pg_class c WHERE c.oid = 'public.campaigns'::regclass)) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
ORDER BY grantee, privilege_type;

SELECT grantor, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'campaigns'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- ============================================================================
-- D · has_table_privilege truth table (role × SELECT/INSERT/UPDATE/DELETE)
-- ============================================================================
SELECT 'anon'          AS role, has_table_privilege('anon','campaigns','SELECT')  AS sel,
       has_table_privilege('anon','campaigns','INSERT')  AS ins,
       has_table_privilege('anon','campaigns','UPDATE')  AS upd,
       has_table_privilege('anon','campaigns','DELETE')  AS del
UNION ALL SELECT 'authenticated', has_table_privilege('authenticated','campaigns','SELECT'),
       has_table_privilege('authenticated','campaigns','INSERT'),
       has_table_privilege('authenticated','campaigns','UPDATE'),
       has_table_privilege('authenticated','campaigns','DELETE')
UNION ALL SELECT 'service_role', has_table_privilege('service_role','campaigns','SELECT'),
       has_table_privilege('service_role','campaigns','INSERT'),
       has_table_privilege('service_role','campaigns','UPDATE'),
       has_table_privilege('service_role','campaigns','DELETE');

-- ============================================================================
-- E · RPC attributes + EXECUTE grants (lookup_campaign_by_short_code)
-- ============================================================================
SELECT p.proname,
       'exists'                      AS exists_flag,
       p.provolatile                 AS volatility,
       p.prosecdef                   AS security_definer,
       p.proconfig                   AS search_path_config,
       has_function_privilege('anon','public.lookup_campaign_by_short_code(text)','EXECUTE') AS anon_execute,
       has_function_privilege('authenticated','public.lookup_campaign_by_short_code(text)','EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'lookup_campaign_by_short_code';

-- ============================================================================
-- F · exact RPC body (must return ONLY id/short_code/name/is_active,
--     WHERE short_code = TRIM(p_code) AND is_active = true)
-- ============================================================================
SELECT pg_get_functiondef('public.lookup_campaign_by_short_code(text)'::regprocedure) AS function_definition;

-- ============================================================================
-- G · QR behavioral probes (role-independent: RPC is SECURITY DEFINER).
--     EXPECTED: kq7Iej → 1 row · ZZZZZZ → 0 rows
-- ============================================================================
SELECT 'kq7Iej' AS code, count(*) AS rows_returned FROM public.lookup_campaign_by_short_code('kq7Iej')
UNION ALL
SELECT 'ZZZZZZ', count(*) FROM public.lookup_campaign_by_short_code('ZZZZZZ');

-- G2 · same probes under anon (transaction + rollback)
BEGIN;
SET LOCAL ROLE anon;
SELECT 'kq7Iej (anon)' AS code, count(*) AS rows_returned FROM public.lookup_campaign_by_short_code('kq7Iej');
ROLLBACK;
RESET ROLE;

BEGIN;
SET LOCAL ROLE anon;
SELECT 'ZZZZZZ (anon)' AS code, count(*) AS rows_returned FROM public.lookup_campaign_by_short_code('ZZZZZZ');
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- H · anon direct-table read (behavioral; transaction + rollback)
--     EXPECTED: 0 rows (RLS blocks anon even though the ACL grant is present)
-- ============================================================================
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS anon_direct_rows FROM public.campaigns;
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- FINAL · CONSOLIDATED GATE TABLE — one row per check (SINGLE RESULT SET).
-- This is the authoritative pre-apply verdict.
-- ============================================================================
WITH rpc AS (
  SELECT p.prosecdef, p.provolatile, p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'lookup_campaign_by_short_code'
), pols AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE policyname = 'Admins manage campaigns') AS admins,
         count(*) FILTER (WHERE cmd = 'SELECT' AND 'authenticated' = ANY(roles)) AS broad_auth_select
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'campaigns'
)
SELECT 'RLS enabled' AS check_name,
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.campaigns'::regclass) THEN 'PASS' ELSE 'FAIL' END AS result
UNION ALL SELECT 'RLS forced',
       (SELECT relforcerowsecurity::text FROM pg_class WHERE oid='public.campaigns'::regclass)
UNION ALL SELECT 'anon bypassrls',
       (SELECT rolbypassrls::text FROM pg_roles WHERE rolname='anon')
UNION ALL SELECT 'Admins policy present',
       CASE WHEN (SELECT admins FROM pols) = 1 THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'No broad SELECT policy',
       CASE WHEN (SELECT broad_auth_select FROM pols) = 0 THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'Only Admins policy',
       CASE WHEN (SELECT total FROM pols) = 1 AND (SELECT admins FROM pols) = 1
             AND (SELECT broad_auth_select FROM pols) = 0 THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'anon SELECT ACL',
       CASE WHEN has_table_privilege('anon','campaigns','SELECT') THEN 'PRESENT' ELSE 'ABSENT' END
UNION ALL SELECT 'anon INSERT ACL',
       CASE WHEN has_table_privilege('anon','campaigns','INSERT') THEN 'PRESENT' ELSE 'ABSENT' END
UNION ALL SELECT 'anon UPDATE ACL',
       CASE WHEN has_table_privilege('anon','campaigns','UPDATE') THEN 'PRESENT' ELSE 'ABSENT' END
UNION ALL SELECT 'anon DELETE ACL',
       CASE WHEN has_table_privilege('anon','campaigns','DELETE') THEN 'PRESENT' ELSE 'ABSENT' END
UNION ALL SELECT 'authenticated SELECT',
       CASE WHEN has_table_privilege('authenticated','campaigns','SELECT') THEN 'TRUE' ELSE 'FALSE' END
UNION ALL SELECT 'service_role SELECT',
       CASE WHEN has_table_privilege('service_role','campaigns','SELECT') THEN 'TRUE' ELSE 'FALSE' END
UNION ALL SELECT 'RPC exists',
       CASE WHEN EXISTS (SELECT 1 FROM rpc) THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'RPC SECURITY DEFINER',
       CASE WHEN (SELECT prosecdef FROM rpc) THEN 'true' ELSE 'false' END
UNION ALL SELECT 'RPC STABLE',
       CASE WHEN (SELECT provolatile FROM rpc) = 's' THEN 'true' ELSE 'false' END
UNION ALL SELECT 'RPC search_path=public',
       CASE WHEN (SELECT proconfig FROM rpc) @> ARRAY['search_path=public']::text[] THEN 'PASS' ELSE 'FAIL' END
UNION ALL SELECT 'anon RPC EXECUTE',
       CASE WHEN has_function_privilege('anon','public.lookup_campaign_by_short_code(text)','EXECUTE') THEN 'TRUE' ELSE 'FALSE' END
UNION ALL SELECT 'authenticated RPC EXECUTE',
       CASE WHEN has_function_privilege('authenticated','public.lookup_campaign_by_short_code(text)','EXECUTE') THEN 'TRUE' ELSE 'FALSE' END
UNION ALL SELECT 'kq7Iej resolution',
       (SELECT count(*)::text FROM public.lookup_campaign_by_short_code('kq7Iej'))
UNION ALL SELECT 'ZZZZZZ resolution',
       (SELECT count(*)::text FROM public.lookup_campaign_by_short_code('ZZZZZZ'))
UNION ALL SELECT 'anon direct SELECT (behavioral)',
       '0 rows under anon — RLS blocks (see block H)'
ORDER BY check_name;

-- ============================================================================
-- END — no changes performed. HARD STOP retained.
-- ============================================================================
