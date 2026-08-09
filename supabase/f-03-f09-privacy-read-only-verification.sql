-- ============================================================================
-- FOCUS v2 — F-03 / F-09 PRIVACY READ-ONLY VERIFICATION (SELECT-only)
--
-- Purpose: close the two live-environment evidence gaps left after the FOCUS
-- v2 privacy cleanup (docs/audits/final-privacy-qr-remediation-report.md §9.5):
--
--   F-09  trade_requests — does the table exist in the LIVE DB?
--         (BI reads it at src/business-intelligence/api.ts:37,151,235,292 but
--          no CREATE TABLE migration exists in 00001-00018 and it is absent
--          from prior live inventory runs.)
--   F-03  RLS posture for placements / placement_history / ads — is RLS
--         enabled and are there policies on the LIVE DB? (No RLS evidence
--         exists in migrations 00016/00017/00015, and no owner artifact has
--         evidenced the live posture.)
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML. No DDL. No DO block that writes.
-- Safe to run on production in the Supabase SQL editor.
--
-- HOW TO RUN: paste the WHOLE script in the SQL editor and run once.
--             Query "F-09-Q3 (row count)" is marked: run it ONLY if F-09-Q1 = TRUE.
-- ============================================================================

-- ============================================================================
-- GATE F-09 — trade_requests
-- ============================================================================
-- F-09-Q1  existence (safe always; FALSE = table absent = BI reads empty)
SELECT to_regclass('public.trade_requests') AS trade_requests_exists,
       to_regclass('public.trade_requests') IS NOT NULL AS exists_bool;

-- F-09-Q2  columns (returns 0 rows when the table is absent — safe always)
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'trade_requests'
ORDER BY ordinal_position;

-- F-09-Q3  row count — RUN ONLY IF F-09-Q1 = TRUE
-- SELECT count(*) AS trade_requests_rows FROM public.trade_requests;

-- ============================================================================
-- GATE F-03 — RLS posture for QR/attribution/ads tables
-- ============================================================================
-- F-03-Q1  RLS enabled (relrowsecurity), forced (relforcerowsecurity),
--          and policy count per target table
SELECT c.relname AS table_name,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       count(p.policyname)   AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('placements', 'placement_history', 'ads',
                    'qr_codes', 'analytics_events', 'campaigns',
                    'sessions', 'devices', 'surveys', 'users',
                    'trade_requests')
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;

-- F-03-Q2  full policy detail for the F-03 targets (+ attribution set)
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('placements', 'placement_history', 'ads',
                    'qr_codes', 'analytics_events', 'campaigns',
                    'sessions', 'devices', 'surveys', 'users',
                    'trade_requests')
ORDER BY tablename, policyname;

-- ============================================================================
-- VERDICT (read-only summary)
-- ============================================================================
-- F-09 verdict: TRUE = trade_requests exists (keep BI reads, reconcile schema)
--               FALSE = table absent (BI reads resolve to empty; owner decides)
SELECT 'F-09: trade_requests exists' AS check_name,
       to_regclass('public.trade_requests') IS NOT NULL AS verdict;

-- F-03 verdict: TRUE = all three F-03 targets have RLS enabled with >=1 policy
--               FALSE = at least one of placements/placement_history/ads has
--                       no RLS or no policy on the live DB
SELECT CASE WHEN count(*) = 3 THEN 'ALL_RLS_PROTECTED'
            ELSE 'GAP — table(s) without live RLS' END AS gate_f03_verdict
FROM (
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('placements', 'placement_history', 'ads')
    AND c.relrowsecurity
    AND EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname)
) r;
