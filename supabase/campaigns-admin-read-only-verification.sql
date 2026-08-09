-- ============================================================================
-- FOCUS v2 — CAMPAIGNS ADMIN (Research Console) — READ-ONLY VERIFICATION
--
-- Purpose: live-environment evidence for the Campaigns admin phase (§24):
--   (1) the campaigns columns the new admin CRUD service writes actually exist;
--   (2) the security posture is UNCHANGED — RLS "Admins manage campaigns" is the
--       only campaigns policy, RLS is enabled, and the public lookup RPC
--       (lookup_campaign_by_short_code) is intact and unmodified;
--   (3) NO new grants were introduced — anon/authenticated still reach
--       campaigns ONLY through the RPC, never by direct table access;
--   (4) behavior: anon still resolves an ACTIVE campaign via the RPC and gets
--       zero rows for a non-existent code; anon CANNOT SELECT campaigns
--       directly (wrapped in BEGIN; ROLLBACK — nothing is written).
--
-- Reference implementation: src/research-console/pages/campaigns/campaign-service.ts
-- Contract:                supabase/migrations/00007_lookup_campaign_by_short_code.sql
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL. Behavior probes use
-- SET LOCAL ROLE inside BEGIN; ROLLBACK; — nothing is written. Safe to run on
-- production in the Supabase SQL editor.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · campaigns columns the admin service writes/reads (read-only)
-- ============================================================================

-- A1) full column inventory — EXPECTED to include (at minimum): name, goal,
--     campaign_type, country, state_name, city, district, venue, description,
--     notes, budget, budget_currency, material, start_date, end_date, status,
--     is_active, logo_url, short_code, qr_config, timeline, created_by,
--     last_edited_by, created_at, updated_at.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaigns'
ORDER BY ordinal_position;

-- A2) per-column existence verdict for every column the service touches
SELECT column_name,
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
ORDER BY column_name;

-- ============================================================================
-- SECTION B · RLS posture UNCHANGED (read-only)
-- ============================================================================

-- B1) campaigns policies — EXPECTED:
--     "Admins manage campaigns" (ALL) present;
--     "Authenticated read campaigns" (broad SELECT) ABSENT;
--     no other policy on campaigns.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- B2) RLS enabled on campaigns
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid = 'public.campaigns'::regclass;

-- ============================================================================
-- SECTION C · public lookup RPC intact + UNCHANGED (read-only)
-- ============================================================================

-- C1) presence + volatility + SECURITY DEFINER + search_path (compare with 00007)
SELECT p.proname,
       p.provolatile      AS volatility,
       p.prosecdef        AS security_definer,
       p.proconfig        AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('lookup_campaign_by_short_code',
                    'lookup_campaign_by_short_code_v2',
                    'lookup_scan_context')
ORDER BY p.proname;

-- C2) exact v1 body — EXPECTED identical to migration 00007 (id/short_code/
--     name/is_active + WHERE short_code = TRIM(p_code) AND is_active = true).
SELECT pg_get_functiondef('public.lookup_campaign_by_short_code(text)'::regprocedure)
       AS function_definition;

-- C3) RPC grants — EXPECTED: EXECUTE for anon AND authenticated only.
SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE');

-- ============================================================================
-- SECTION D · NO new table-level grants (read-only)
--   EXPECTED: anon/authenticated have NO direct SELECT/INSERT/UPDATE/DELETE on
--   campaigns — the admin UI works ONLY through RLS "Admins manage campaigns"
--   (which gates on the DB role from the users table). FALSE for both rows
--   means the direct-table surface is still closed.
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
       has_table_privilege('authenticated', 'campaigns', 'DELETE');

-- ============================================================================
-- SECTION E · live behavior probes (read-only, transaction + rollback)
-- ============================================================================

-- E1) anon resolves the first ACTIVE campaign via the RPC (EXPECTED: 1 row,
--     id/short_code/name/is_active=true). If no active campaign exists the
--     RPC returns 0 rows — record as "no active campaigns", not a regression.
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code(
  (SELECT short_code FROM public.campaigns WHERE is_active = true LIMIT 1)
);
ROLLBACK;
RESET ROLE;

-- E2) anon resolves a NON-EXISTENT 6-char code (EXPECTED: 0 rows). Change the
--     code if 'ZZZZZZ' ever exists.
BEGIN;
SET LOCAL ROLE anon;
SELECT id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code('ZZZZZZ');
ROLLBACK;
RESET ROLE;

-- E3) anon DIRECT table read is BLOCKED by RLS (EXPECTED: 0 rows, even though
--     rows exist — proves the direct-table surface stayed closed).
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS anon_direct_rows
FROM public.campaigns;
ROLLBACK;
RESET ROLE;

-- ============================================================================
-- SECTION F · verdict (read-only, machine-readable)
-- ============================================================================

-- F1) all admin-write columns present?
SELECT CASE WHEN count(*) = 25 AND bool_and(present) THEN 'ALL_COLUMNS_PRESENT'
            ELSE 'COLUMNS_MISSING — reconcile before release'
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

-- F2) security posture unchanged?
--     TRUE = RLS enabled AND "Admins manage campaigns" present AND no broad
--     authenticated SELECT policy AND anon/authenticated have no direct grants.
SELECT CASE WHEN
         (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.campaigns'::regclass)
     AND EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname='public' AND p.tablename='campaigns'
                   AND p.policyname = 'Admins manage campaigns')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname='public' AND p.tablename='campaigns'
                       AND p.cmd = 'SELECT' AND 'authenticated' = ANY(p.roles))
     AND NOT has_table_privilege('anon', 'campaigns', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'campaigns', 'SELECT')
       THEN 'POSTURE_UNCHANGED'
       ELSE 'POSTURE_CHANGED — stop and review'
  END AS security_verdict;

-- F3) public lookup RPC intact?
--     TRUE = present + SECURITY DEFINER + STABLE + search_path=public
--           + EXECUTE for anon and authenticated.
SELECT CASE WHEN
         EXISTS (SELECT 1 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname = 'lookup_campaign_by_short_code'
                   AND p.prosecdef AND p.provolatile = 's'
                   AND p.proconfig @> ARRAY['search_path=public']::text[])
     AND has_function_privilege('anon', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.lookup_campaign_by_short_code(text)', 'EXECUTE')
       THEN 'RPC_INTACT'
       ELSE 'RPC_CHANGED — stop and review'
  END AS rpc_verdict;
