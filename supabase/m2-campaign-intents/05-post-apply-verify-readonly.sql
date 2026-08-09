-- ============================================================================
-- FOCUS — M2 · CAMPAIGN INTENT COUNTERS — POST-APPLY VERIFICATION (READ-ONLY)
--
-- Owner decision 2026-08-09: the M2 gate must be completed with a READ-ONLY
-- method only. This file replaces the E behavioral probes of
-- 04-post-apply-verify.sql with definition-level read-only proof.
--
-- HARD RULES (owner-mandated):
--   * NO DML (no INSERT/UPDATE/DELETE) — not even inside BEGIN;ROLLBACK.
--   * NO DDL (no CREATE/ALTER/DROP), no SET ROLE, no writes of any kind.
--   * Pure SELECT against catalogs (pg_class / pg_proc / pg_policies /
--     pg_constraint / information_schema) and has_*_privilege() helpers.
--
-- HOW TO RUN: paste the WHOLE script into the Supabase SQL editor and run it
-- ONCE, AFTER the owner applies 01-campaign-intents-apply.sql. Each section
-- ends with a single assertion row `result | evidence` (PASS or FAIL).
--
-- EXPECTED (all sections): PASS. E1/E2/E3 prove the RPC enforcement and the
-- table constraints exist and are correct WITHOUT executing any write.
-- ============================================================================

-- ============================================================================
-- A · TABLE PRESENCE + COLUMNS
-- ============================================================================
-- A-evidence: raw column listing.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaign_intents'
ORDER BY ordinal_position;

-- A-assert: table exists and all 8 expected columns are present.
SELECT CASE WHEN to_regclass('public.campaign_intents') IS NULL THEN 'FAIL'
            ELSE 'PASS' END AS result,
       'A · public.campaign_intents exists' AS evidence
UNION ALL
SELECT CASE WHEN (
         SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'campaign_intents'
           AND column_name IN ('id','kind','cta_type','campaign_id','ad_placement',
                               'device_id','visitor_hash','created_at')
       ) = 8 THEN 'PASS' ELSE 'FAIL' END,
       'A · all 8 expected columns present';

-- ============================================================================
-- B · ROW LEVEL SECURITY + POLICIES
-- ============================================================================
-- B-evidence: raw policy listing.
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_intents'
ORDER BY cmd;

-- B-assert 1: RLS is enabled on the table.
SELECT CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result,
       'B · row level security ENABLED' AS evidence
FROM pg_class c
WHERE c.oid = 'public.campaign_intents'::regclass;

-- B-assert 2: exactly one SELECT-only policy TO authenticated.
SELECT CASE WHEN (count(*) = 1
                  AND bool_and(cmd = 'SELECT')
                  AND bool_and(roles = '{authenticated}'))
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'B · exactly one SELECT-only policy TO authenticated' AS evidence
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_intents';

-- B-assert 3: no write policies (INSERT/UPDATE/DELETE) exist anywhere.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       'B · NO INSERT/UPDATE/DELETE policies — RPC-only writes' AS evidence
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_intents' AND cmd <> 'SELECT';

-- ============================================================================
-- C1 · TABLE GRANTS MATRIX
-- ============================================================================
-- C1-evidence: raw privilege matrix (privileges computed WITHOUT role switch).
SELECT r.role_name,
       has_table_privilege(r.role_name, 'public.campaign_intents', 'SELECT') AS can_select,
       has_table_privilege(r.role_name, 'public.campaign_intents', 'INSERT') AS can_insert,
       has_table_privilege(r.role_name, 'public.campaign_intents', 'UPDATE') AS can_update,
       has_table_privilege(r.role_name, 'public.campaign_intents', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name);

-- C1-assert: anon = none; authenticated = SELECT only.
SELECT CASE WHEN (
         NOT has_table_privilege('anon', 'public.campaign_intents', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.campaign_intents', 'INSERT')
     AND NOT has_table_privilege('anon', 'public.campaign_intents', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.campaign_intents', 'DELETE')
     AND     has_table_privilege('authenticated', 'public.campaign_intents', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.campaign_intents', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.campaign_intents', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.campaign_intents', 'DELETE'))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'C1 · anon = none; authenticated = SELECT only' AS evidence;

-- ============================================================================
-- C2 · RPC EXECUTE GRANT
-- ============================================================================
-- C2-evidence: raw EXECUTE matrix.
SELECT r.role_name,
       has_function_privilege(r.role_name,
         'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') AS can_execute
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name);

-- C2-assert: EXECUTE granted to anon + authenticated (PUBLIC revoked).
SELECT CASE WHEN (
         has_function_privilege('anon',
           'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE')
     AND has_function_privilege('authenticated',
           'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE'))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'C2 · EXECUTE granted to anon + authenticated' AS evidence;

-- ============================================================================
-- D · RPC CONTRACT (SECURITY DEFINER / VOLATILE / search_path)
-- ============================================================================
-- D-evidence: raw function metadata.
SELECT p.provolatile AS volatility,
       p.prosecdef   AS security_definer,
       p.proconfig   AS config,
       pg_get_function_result(p.oid)  AS returns,
       pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_campaign_intent';

-- D-assert: SECURITY DEFINER + VOLATILE + SET search_path = public.
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'record_campaign_intent'
           AND p.prosecdef
           AND p.provolatile = 'v'
           AND 'search_path=public' = ANY(p.proconfig))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'D · SECURITY DEFINER + VOLATILE + SET search_path = public' AS evidence;

-- ============================================================================
-- E · ENFORCEMENT EXISTS & IS CORRECT — READ-ONLY PROOF (NO WRITE PROBES)
--
-- Owner decision: no behavioral write probe (not even inside a transaction).
-- E instead proves the enforcement by inspecting the APPLIED definition and
-- the catalog: the RPC body must contain the anti-spam/validation logic, and
-- the table must carry the CHECK + FK constraints. Nothing here writes.
-- ============================================================================

-- E-evidence: full applied RPC body (for manual read) — SELECT only.
SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure) AS rpc_definition;

-- E-assert 1: RPC body contains the required server-side enforcement.
WITH def AS (
  SELECT pg_get_functiondef(p.oid) AS d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'record_campaign_intent'
)
SELECT CASE WHEN (
        (SELECT d FROM def) LIKE '%rate limit exceeded (60/hour/visitor)%'
    AND (SELECT d FROM def) LIKE '%3600%'
    AND (SELECT d FROM def) LIKE '%300%'
    AND (SELECT d FROM def) LIKE '%^[a-f0-9]{16,64}$%'
    AND (SELECT d FROM def) LIKE '%is_active = TRUE%'
    AND (SELECT d FROM def) LIKE '%RAISE EXCEPTION%'
    AND (SELECT d FROM def) LIKE '%SECURITY DEFINER%')
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E1 · RPC body enforces: hash regex, dedup 3600/300 s, rate 60/h, campaign-active, raises' AS evidence;

-- E-evidence: raw constraint listing for the table.
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.campaign_intents'::regclass
ORDER BY contype, conname;

-- E-assert 2: PK + CHECK set + FK→campaigns(ON DELETE CASCADE) present.
SELECT CASE WHEN (
         (SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'public.campaign_intents'::regclass AND contype = 'c') >= 5
     AND EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.campaign_intents'::regclass AND contype = 'p')
     AND EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'public.campaign_intents'::regclass AND contype = 'f'
            AND pg_get_constraintdef(oid) LIKE '%REFERENCES public.campaigns(id) ON DELETE CASCADE%'))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E2 · PK + 5 CHECKs (kind/cta_type/ad_placement/device_id/visitor_hash) + FK→campaigns CASCADE present' AS evidence;

-- E-assert 3: no direct write path — no INSERT/UPDATE/DELETE grants AND no write policies.
SELECT CASE WHEN (
         NOT has_table_privilege('anon', 'public.campaign_intents', 'INSERT')
     AND NOT has_table_privilege('anon', 'public.campaign_intents', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.campaign_intents', 'DELETE')
     AND NOT has_table_privilege('authenticated', 'public.campaign_intents', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.campaign_intents', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.campaign_intents', 'DELETE')
     AND (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'campaign_intents'
            AND cmd <> 'SELECT') = 0)
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E3 · no direct write path (grants + policies) — writes only via guarded RPC' AS evidence;

-- ============================================================================
-- DONE. Expected: A/B/C1/C2/D/E1/E2/E3 all PASS. If any FAIL, do NOT proceed
-- to M3; stop and report the FAIL row + evidence to the owner.
-- ============================================================================
