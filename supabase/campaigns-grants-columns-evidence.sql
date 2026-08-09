-- ============================================================================
-- FOCUS v2 — CAMPAIGNS ADMIN — ROUND-2 LIVE EVIDENCE (READ-ONLY · NO APPLY)
--
-- Purpose: collect the EXACT live facts the owner requires before any decision
-- (HARD STOP retained). Produces ONLY the evidence needed to close:
--   (1) columns_verdict = COLUMNS_MISSING (owner's expanded run)
--   (2) grants_verdict  = DIRECT_GRANT_DETECTED (owner's expanded run)
--
-- MODEL CORRECTION (2026-08-09): DIRECT_GRANT_DETECTED is satisfied by
-- authenticated's by-design grants alone — it never proved anon had grants.
-- LIVE evidence (pre-apply gates run) confirms anon has NO table ACL on
-- campaigns. Treat this script's D/F output accordingly: anon = none is the
-- EXPECTED, already-satisfied end state (CR-00007 = ALREADY SATISFIED / NO-OP).
--
-- This script performs NO DDL, NO DML, NO REVOKE/GRANT, NO ROLE CHANGE.
-- It is safe to run as-is on production in the Supabase SQL editor.
--
-- How to run: paste the WHOLE script once; copy ALL result grids verbatim and
-- attach them to the diagnosis record (docs/audits/campaigns-hd-remediation-diagnosis.md).
--
-- Contract / reference:
--   code  : src/research-console/pages/campaigns/campaign-service.ts (L82-177)
--   RPC   : supabase/migrations/00007_lookup_campaign_by_short_code.sql
--   policy: "Admins manage campaigns" FOR ALL TO authenticated USING (is_admin())
-- ============================================================================

-- ============================================================================
-- SECTION A · campaigns COLUMNS (information_schema — exact live types)
-- ============================================================================

-- A1) FULL live inventory, ordered by ordinal_position.
--     The definitive answer to "which columns exist on LIVE and how are they typed".
SELECT c.ordinal_position,
       c.column_name,
       c.data_type,
       c.udt_name,
       c.is_nullable,
       c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'campaigns'
ORDER BY c.ordinal_position;

-- A2) Per-column existence verdict for the EXACT 25 columns the admin service
--     touches (literals copied from campaign-service.ts / verification A2).
--     EXPECTED on the live baseline: present = TRUE for all 25.
SELECT c.column_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'campaigns'
           AND column_name = c.column_name
       ) AS present
FROM (VALUES
  ('name'), ('goal'), ('campaign_type'), ('country'), ('state_name'), ('city'),
  ('district'), ('venue'), ('description'), ('notes'), ('budget'),
  ('budget_currency'), ('material'), ('start_date'), ('end_date'), ('status'),
  ('is_active'), ('logo_url'), ('short_code'), ('qr_config'), ('timeline'),
  ('created_by'), ('last_edited_by'), ('created_at'), ('updated_at')
) AS c(column_name)
ORDER BY c.column_name;

-- A3) The MISSING list (usually empty). Any row here is the literal name(s)
--     behind COLUMNS_MISSING — reconcile it against the code surface first.
SELECT c.column_name
FROM (VALUES
  ('name'), ('goal'), ('campaign_type'), ('country'), ('state_name'), ('city'),
  ('district'), ('venue'), ('description'), ('notes'), ('budget'),
  ('budget_currency'), ('material'), ('start_date'), ('end_date'), ('status'),
  ('is_active'), ('logo_url'), ('short_code'), ('qr_config'), ('timeline'),
  ('created_by'), ('last_edited_by'), ('created_at'), ('updated_at')
) AS c(column_name)
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'campaigns'
    AND column_name = c.column_name
)
ORDER BY c.column_name;

-- ============================================================================
-- SECTION D · campaigns GRANTS — LIVE evidence (corrected model 2026-08-09)
--   DIRECT_GRANT_DETECTED is satisfied by authenticated's by-design grants
--   alone; it does NOT imply anon has grants. LIVE: anon = none.
-- ============================================================================

-- D1) role_table_grants for anon + authenticated (owner-required evidence).
--     EXPECTED (corrected LIVE 2026-08-09): anon = NONE · authenticated = ALL
--     privilege types (by design — required for the Admins RLS policy).
SELECT grantor, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'campaigns'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- D2) RAW ACL from pg_class.relacl (definitive — survives info_schema filters)
--     for the three standard Supabase roles on public.campaigns.
SELECT grantee, privilege_type, is_grantable, grantor
FROM aclexplode(
  (SELECT c.relacl FROM pg_class c WHERE c.oid = 'public.campaigns'::regclass)
) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;

-- D3) has_table_privilege truth table — the same values that drive
--     grants_verdict, per role per statement type.
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
-- SECTION B · RLS posture reconfirmation (read-only)
-- ============================================================================

SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- ============================================================================
-- SECTION C · public lookup RPC reconfirmation (read-only)
-- ============================================================================

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

-- C2) EXACT live function body — must return ONLY id/short_code/name/is_active
--     with WHERE short_code = TRIM(p_code) AND is_active = true (contract M7).
SELECT pg_get_functiondef('public.lookup_campaign_by_short_code(text)'::regprocedure)
       AS function_definition;

-- ============================================================================
-- SECTION F · machine verdicts computed FROM LIVE DATA (read-only)
-- ============================================================================

-- F1) columns verdict over the 25 literals.
SELECT CASE WHEN count(*) = 25 AND bool_and(present) THEN 'ALL_COLUMNS_PRESENT'
            ELSE 'COLUMNS_MISSING'
       END AS columns_verdict
FROM (
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns'
      AND column_name = c.column_name
  ) AS present
  FROM (VALUES
    ('name'), ('goal'), ('campaign_type'), ('country'), ('state_name'), ('city'),
    ('district'), ('venue'), ('description'), ('notes'), ('budget'),
    ('budget_currency'), ('material'), ('start_date'), ('end_date'), ('status'),
    ('is_active'), ('logo_url'), ('short_code'), ('qr_config'), ('timeline'),
    ('created_by'), ('last_edited_by'), ('created_at'), ('updated_at')
  ) AS c(column_name)
) g;

-- F2) grants verdict — literal classification from live evidence.
--     anon_any      = anon has ANY table privilege on campaigns
--     auth_any      = authenticated has ANY table privilege on campaigns
SELECT EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'campaigns'
           AND grantee = 'anon'
       ) AS anon_any_grant,
       EXISTS (
         SELECT 1 FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'campaigns'
           AND grantee = 'authenticated'
       ) AS authenticated_any_grant;

-- ============================================================================
-- END — no changes performed. HARD STOP retained.
-- ============================================================================
