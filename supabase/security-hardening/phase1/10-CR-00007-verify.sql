-- ============================================================================
-- CR-00007 · campaigns anon direct-grant — POST-APPLY VERIFY (READ-ONLY)
-- ----------------------------------------------------------------------------
-- Run AFTER `10-CR-00007-campaigns-anon-grant.sql` completes. Read-only only.
--
-- COMPATIBILITY NOTE (post-REVOKE state):
--   After REVOKE ALL ON public.campaigns FROM anon, anon has NO table ACL, so a
--   raw `SELECT FROM public.campaigns` under anon now raises
--   `permission denied for table campaigns` (correct end state). This script is
--   therefore catalog-only for grant/RLS/RPC checks, and its only anon
--   behavioral probe is wrapped in EXCEPTION handling (DO block) so it PROVES
--   the denial instead of aborting. NO GRANT is issued anywhere in this file.
-- ============================================================================

-- ============================================================================
-- §5.A — Grants after APPLY
--   EXPECTED: anon = all FALSE · authenticated = full set (admin CRUD intact)
--             · service_role unchanged (full set).
-- ============================================================================
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
-- §5.B — RLS unchanged after APPLY
--   EXPECTED: relrowsecurity = true · relforcerowsecurity = false ·
--             exactly ONE policy ("Admins manage campaigns" ALL {authenticated}).
-- ============================================================================
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.oid = 'public.campaigns'::regclass;

SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- ============================================================================
-- §5.C — RPC intact after APPLY + anon QR regression
-- ============================================================================

-- C1) RPC posture unchanged
SELECT p.proname,
       p.provolatile AS volatility,
       p.prosecdef   AS security_definer,
       p.proconfig   AS config,
       has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'lookup_campaign_by_short_code';

-- C2) anon still resolves an ACTIVE campaign via the RPC (1 row) — the
--     public QR path must NOT depend on the (now revoked) anon table grant.
--     Works because the RPC is SECURITY DEFINER and anon still has EXECUTE.
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code('kq7Iej');
ROLLBACK;
RESET ROLE;

-- C3) anon invalid code → 0 rows
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code('ZZZZZZ');
ROLLBACK;
RESET ROLE;

-- C4) anon DIRECT table access — now DENIED at ACL level (expected after
--     REVOKE). No raw anon `SELECT FROM public.campaigns` here (that would
--     raise permission denied and abort the script). Instead:
--       · catalog proof (authoritative): every anon privilege = false
--       · behavioral proof: an anonymous DO block attempts the read under
--         `SET LOCAL ROLE anon` and EXPECTS insufficient_privilege (42501).
BEGIN;
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.campaigns;
    RAISE NOTICE 'C4 UNEXPECTED: anon CAN read public.campaigns — ACL not cleared?';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'C4 EXPECTED: anon denied at ACL (permission denied for table campaigns)';
  END;
END $$;
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- §5.D — machine verdicts (read-only)
-- ============================================================================

SELECT 'anon_grants_cleared' AS check_name,
       NOT has_table_privilege('anon', 'campaigns', 'SELECT')
       AND NOT has_table_privilege('anon', 'campaigns', 'INSERT')
       AND NOT has_table_privilege('anon', 'campaigns', 'UPDATE')
       AND NOT has_table_privilege('anon', 'campaigns', 'DELETE')
       AND NOT has_table_privilege('anon', 'campaigns', 'REFERENCES')
       AND NOT has_table_privilege('anon', 'campaigns', 'TRIGGER')
       AND NOT has_table_privilege('anon', 'campaigns', 'TRUNCATE') AS passed
UNION ALL
SELECT 'authenticated_crud_intact',
       has_table_privilege('authenticated', 'campaigns', 'SELECT')
       AND has_table_privilege('authenticated', 'campaigns', 'INSERT')
       AND has_table_privilege('authenticated', 'campaigns', 'UPDATE')
       AND has_table_privilege('authenticated', 'campaigns', 'DELETE')
UNION ALL
SELECT 'rls_enabled',
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.campaigns'::regclass)
UNION ALL
SELECT 'only_admin_policy',
       (SELECT count(*) FROM pg_policies
        WHERE schemaname='public' AND tablename='campaigns'
          AND policyname = 'Admins manage campaigns') = 1
       AND (SELECT count(*) FROM pg_policies
            WHERE schemaname='public' AND tablename='campaigns') = 1
UNION ALL
SELECT 'rpc_intact',
       has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE')
       AND has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE')
       AND EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'lookup_campaign_by_short_code'
           AND p.prosecdef
           AND p.provolatile = 's'
           AND p.proconfig @> ARRAY['search_path=public']::text[]
       );

-- ============================================================================
-- END — no changes performed.
-- ============================================================================
