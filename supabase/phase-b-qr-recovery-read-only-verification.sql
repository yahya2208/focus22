-- ============================================================================
-- FOCUS v2 — PHASE B · SECURE QR RECOVERY — READ-ONLY VERIFICATION
--
-- Purpose: close the live-environment evidence gaps for the Phase B QR entry
-- point (docs/audits/phase-b-secure-qr-recovery-report.md §F):
--
--   RPC  lookup_campaign_by_short_code(TEXT) — is it PRESENT on the live DB,
--        UNCHANGED (SQL body, SECURITY DEFINER, STABLE, search_path=public),
--        and still granted to BOTH anon and authenticated?
--   RLS  LV-3 / CR-00006 — are the broad campaigns read policies still closed
--        on the live DB?
--   BEHAVIOR  anon call resolves the first ACTIVE campaign and returns an
--        EMPTY set for a non-existent code (matches the app's `null` handling).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML. No DDL. The behavior probes are
-- wrapped in BEGIN; ROLLBACK; and only SET ROLE / set_config(...) to the role
-- under test — no value is written anywhere. Safe to run on production in the
-- Supabase SQL editor.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
--
-- Reference implementation: src/services/campaign-lookup.ts
-- Contract:                supabase/migrations/00007_lookup_campaign_by_short_code.sql
-- ============================================================================

-- ============================================================================
-- SECTION A · RPC contract snapshot (read-only catalog)
-- ============================================================================

-- A1) presence + volatility (STABLE='s') + SECURITY DEFINER (prosecdef=true)
--     + explicit search_path (proconfig contains 'search_path=public')
SELECT p.proname,
       p.provolatile                             AS volatility,
       p.prosecdef                               AS security_definer,
       p.proconfig                               AS config,
       to_regclass('public.campaigns')           AS campaigns_table_exists
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('lookup_campaign_by_short_code',
                    'lookup_campaign_by_short_code_v2')
ORDER BY p.proname;

-- A2) exact function body — diff this against migration 00007 for the v1
--     contract (id/short_code/name/is_active + WHERE short_code = TRIM(p_code)
--     AND is_active = true). EXPECTED: identical. NO change was made by Phase B.
SELECT pg_get_functiondef('public.lookup_campaign_by_short_code(text)'::regprocedure)
       AS function_definition;

-- A3) grants — EXPECTED: EXECUTE = true for BOTH anon and authenticated,
--     and REVOKE ALL FROM PUBLIC held (only the two roles have EXECUTE).
SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE');

-- A4) ACL detail (who holds EXECUTE today)
SELECT proname, proacl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'lookup_campaign_by_short_code';

-- ============================================================================
-- SECTION B · LV-3 / CR-00006 closure snapshot (read-only)
-- ============================================================================

-- B1) campaigns policies — EXPECTED (post CR-00006):
--     "Admins manage campaigns" (ALL) present;
--     "Authenticated read campaigns" (SELECT, broad) ABSENT.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- B2) RLS enabled on campaigns
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid = 'public.campaigns'::regclass;

-- ============================================================================
-- SECTION C · RPC live behavior probes (read-only, transaction + rollback)
-- NOTE: probes resolve a real ACTIVE campaign's short_code automatically. If no
-- active campaign exists, p_code is NULL and the RPC returns 0 rows — record
-- that as "no active campaigns present", not a regression.
-- ============================================================================

-- C1) anon resolves the first ACTIVE campaign (EXPECTED: 1 row,
--     id/short_code/name/is_active=true) — matches app: REPLACE game-intro.
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code(
  (SELECT short_code FROM public.campaigns WHERE is_active = true LIMIT 1)
);
ROLLBACK;
RESET ROLE;

-- C2) anon resolves a NON-EXISTENT 6-char code (EXPECTED: 0 rows — app maps to
--     `null` → stays on normal route). Change the code if 'ZZZZZZ' ever exists.
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code('ZZZZZZ');
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- SECTION D · verdict (read-only)
-- ============================================================================

-- D1) RPC contract intact?
--     TRUE = present + SECURITY DEFINER + STABLE + search_path=public
SELECT 'RPC: lookup_campaign_by_short_code intact' AS check_name,
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'lookup_campaign_by_short_code'
           AND p.prosecdef
           AND p.provolatile = 's'
           AND p.proconfig @> ARRAY['search_path=public']::text[]
       ) AS verdict;

-- D2) grants intact?
--     TRUE = EXECUTE granted to anon AND authenticated
SELECT 'RPC: anon + authenticated grants intact' AS check_name,
       has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE')
   AND has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE')
       AS verdict;

-- D3) LV-3 closure intact?
--     TRUE = RLS enabled on campaigns AND no broad authenticated SELECT policy
SELECT 'RLS: LV-3 closure intact' AS check_name,
       (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.campaigns'::regclass)
   AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = 'campaigns'
           AND p.cmd = 'SELECT'
           AND 'authenticated' = ANY(p.roles)
           AND p.policyname = 'Authenticated read campaigns'
       )
       AS verdict;
