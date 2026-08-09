-- ============================================================================
-- FOCUS — ANONYMOUS CAMPAIGN QR MEASUREMENT — POST-APPLY VERIFICATION
-- (READ-ONLY) — draft for the owner to run AFTER 01-campaign-qr-metrics-apply.sql
--
-- Mirrors the owner-mandated read-only method of M2
-- (supabase/m2-campaign-intents/05-post-apply-verify-readonly.sql):
--   * NO DML (no INSERT/UPDATE/DELETE) — not even inside BEGIN;ROLLBACK;
--   * NO DDL, NO SET ROLE, NO writes of any kind;
--   * pure SELECT against catalogs (pg_class / pg_proc / pg_policies /
--     pg_constraint / information_schema) and has_*_privilege() helpers.
--
-- HOW TO RUN: paste the WHOLE script into the Supabase SQL editor and run it
-- ONCE, AFTER the owner applies 01-campaign-qr-metrics-apply.sql. Each section
-- ends with a single assertion row `result | evidence` (PASS or FAIL).
--
-- EXPECTED (all sections): PASS.
-- ============================================================================

-- ============================================================================
-- A · TABLE PRESENCE + COLUMNS
-- ============================================================================
-- A-evidence: raw column listing.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaign_qr_events'
ORDER BY ordinal_position;

-- A-assert: table exists and all 8 expected columns are present.
SELECT CASE WHEN to_regclass('public.campaign_qr_events') IS NULL THEN 'FAIL'
            ELSE 'PASS' END AS result,
       'A · public.campaign_qr_events exists' AS evidence
UNION ALL
SELECT CASE WHEN (
         SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'campaign_qr_events'
           AND column_name IN ('id','campaign_id','qr_code_id','placement_id',
                               'event_type','nonce','expires_at','created_at')
       ) = 8 THEN 'PASS' ELSE 'FAIL' END,
       'A · all 8 expected columns present';

-- ============================================================================
-- B · ROW LEVEL SECURITY + POLICIES
-- ============================================================================
-- B-evidence: raw policy listing.
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_qr_events'
ORDER BY cmd;

-- B-assert 1: RLS is enabled on the table.
SELECT CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result,
       'B · row level security ENABLED' AS evidence
FROM pg_class c
WHERE c.oid = 'public.campaign_qr_events'::regclass;

-- B-assert 2: exactly one SELECT-only policy TO authenticated.
SELECT CASE WHEN (count(*) = 1
                  AND bool_and(cmd = 'SELECT')
                  AND bool_and(roles = '{authenticated}'))
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'B · exactly one SELECT-only policy TO authenticated' AS evidence
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_qr_events';

-- B-assert 3: no write policies (INSERT/UPDATE/DELETE) exist anywhere.
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       'B · NO INSERT/UPDATE/DELETE policies — RPC-only writes' AS evidence
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_qr_events' AND cmd <> 'SELECT';

-- ============================================================================
-- C1 · TABLE GRANTS MATRIX
-- ============================================================================
-- C1-evidence: raw privilege matrix (no role switch).
SELECT r.role_name,
       has_table_privilege(r.role_name, 'public.campaign_qr_events', 'SELECT') AS can_select,
       has_table_privilege(r.role_name, 'public.campaign_qr_events', 'INSERT') AS can_insert,
       has_table_privilege(r.role_name, 'public.campaign_qr_events', 'UPDATE') AS can_update,
       has_table_privilege(r.role_name, 'public.campaign_qr_events', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name);

-- C1-assert: anon = none; authenticated = SELECT only.
SELECT CASE WHEN (
         NOT has_table_privilege('anon', 'public.campaign_qr_events', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.campaign_qr_events', 'INSERT')
     AND NOT has_table_privilege('anon', 'public.campaign_qr_events', 'UPDATE')
     AND NOT has_table_privilege('anon', 'public.campaign_qr_events', 'DELETE')
     AND     has_table_privilege('authenticated', 'public.campaign_qr_events', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.campaign_qr_events', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.campaign_qr_events', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.campaign_qr_events', 'DELETE'))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'C1 · anon = none; authenticated = SELECT only' AS evidence;

-- ============================================================================
-- C2 · RPC EXECUTE GRANTS
-- ============================================================================
-- C2-evidence: raw EXECUTE matrix.
SELECT 'anon' AS role_name,
       has_function_privilege('anon', 'public.record_campaign_qr_scan(text,text)', 'EXECUTE') AS scan_exec,
       has_function_privilege('anon', 'public.record_campaign_funnel(uuid,text,text)', 'EXECUTE') AS funnel_exec,
       has_function_privilege('anon', 'public.get_campaign_qr_metrics(uuid)', 'EXECUTE') AS metrics_exec
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.record_campaign_qr_scan(text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.record_campaign_funnel(uuid,text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.get_campaign_qr_metrics(uuid)', 'EXECUTE');

-- C2-assert: scan + funnel EXECUTE for anon AND authenticated; metrics EXECUTE
-- only for authenticated (the function body additionally requires
-- is_research_role()).
SELECT CASE WHEN (
         has_function_privilege('anon', 'public.record_campaign_qr_scan(text,text)', 'EXECUTE')
     AND has_function_privilege('anon', 'public.record_campaign_funnel(uuid,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_campaign_qr_metrics(uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.record_campaign_qr_scan(text,text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.record_campaign_funnel(uuid,text,text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.get_campaign_qr_metrics(uuid)', 'EXECUTE'))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'C2 · scan/funnel EXECUTE anon+authenticated; metrics EXECUTE authenticated-only' AS evidence;

-- ============================================================================
-- D · RPC CONTRACT (SECURITY DEFINER / VOLATILE|STABLE / search_path)
-- ============================================================================
-- D-evidence: raw function metadata.
SELECT p.proname,
       p.provolatile AS volatility,
       p.prosecdef   AS security_definer,
       p.proconfig   AS config,
       pg_get_function_result(p.oid)   AS returns,
       pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('record_campaign_qr_scan', 'record_campaign_funnel', 'get_campaign_qr_metrics')
ORDER BY p.proname;

-- D-assert: all three are SECURITY DEFINER with SET search_path = public.
SELECT CASE WHEN (
         (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('record_campaign_qr_scan', 'record_campaign_funnel', 'get_campaign_qr_metrics')
            AND p.prosecdef
            AND 'search_path=public' = ANY(p.proconfig)) = 3)
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'D · all 3 RPCs SECURITY DEFINER + SET search_path = public' AS evidence;

-- ============================================================================
-- E · ENFORCEMENT EXISTS & IS CORRECT — READ-ONLY PROOF (NO WRITE PROBES)
-- ============================================================================
-- E-evidence: full applied RPC bodies (for manual read) — SELECT only.
SELECT pg_get_functiondef('public.record_campaign_qr_scan(text,text)'::regprocedure) AS scan_rpc_definition;
SELECT pg_get_functiondef('public.record_campaign_funnel(uuid,text,text)'::regprocedure) AS funnel_rpc_definition;
SELECT pg_get_functiondef('public.get_campaign_qr_metrics(uuid)'::regprocedure) AS metrics_rpc_definition;

-- E-assert 1: scan RPC body enforces nonce regex, campaign-active, rate limits
--             and idempotent dedup.
WITH def AS (
  SELECT pg_get_functiondef(p.oid) AS d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'record_campaign_qr_scan'
)
SELECT CASE WHEN (
        (SELECT d FROM def) LIKE '%^[A-Za-z0-9_-]{20,64}$%'
    AND (SELECT d FROM def) LIKE '%is_active = TRUE%'
    AND (SELECT d FROM def) LIKE '%1000 scans/hour%'
    AND (SELECT d FROM def) LIKE '%10000 scans/day%'
    AND (SELECT d FROM def) LIKE '%ON CONFLICT (nonce, event_type) DO NOTHING%'
    AND (SELECT d FROM def) LIKE '%pg_advisory_xact_lock%'
    AND (SELECT d FROM def) LIKE '%SECURITY DEFINER%')
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E1 · scan RPC enforces: nonce regex, campaign-active, rate limits, advisory lock, idempotent insert' AS evidence;

-- E-assert 2: funnel RPC body DERIVES the campaign from the scan row and
--             rejects mismatches/expired nonces.
WITH def AS (
  SELECT pg_get_functiondef(p.oid) AS d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'record_campaign_funnel'
)
SELECT CASE WHEN (
        (SELECT d FROM def) LIKE '%unknown or expired nonce%'
    AND (SELECT d FROM def) LIKE '%campaign mismatch%'
    AND (SELECT d FROM def) LIKE '%s.event_type = ''scan''%'
    AND (SELECT d FROM def) LIKE '%1000 events/hour%'
    AND (SELECT d FROM def) LIKE '%ON CONFLICT (nonce, event_type) DO NOTHING%')
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E2 · funnel RPC derives campaign from scan row, rejects mismatch/expired nonce, rate-limited, idempotent' AS evidence;

-- E-assert 3: metrics RPC body enforces is_research_role().
WITH def AS (
  SELECT pg_get_functiondef(p.oid) AS d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_campaign_qr_metrics'
)
SELECT CASE WHEN (
        (SELECT d FROM def) LIKE '%is_research_role()%'
    AND (SELECT d FROM def) LIKE '%insufficient_privilege%'
    AND (SELECT d FROM def) LIKE '%GROUP BY%')
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E3 · metrics RPC requires is_research_role() and returns aggregates only' AS evidence;

-- E-evidence: raw constraint listing for the table.
SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.campaign_qr_events'::regclass
ORDER BY contype, conname;

-- E-assert 4: PK + event_type CHECK + UNIQUE(nonce,event_type) +
--             FK→campaigns(CASCADE) + FK→qr_codes(SET NULL) +
--             FK→placements(SET NULL) present.
SELECT CASE WHEN (
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.campaign_qr_events'::regclass AND contype = 'p')
     AND EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.campaign_qr_events'::regclass AND contype = 'c'
                   AND pg_get_constraintdef(oid) LIKE '%CHECK%')
     AND EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.campaign_qr_events'::regclass AND contype = 'u'
                   AND pg_get_constraintdef(oid) LIKE '%(nonce, event_type)%')
     AND EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.campaign_qr_events'::regclass AND contype = 'f'
                   AND pg_get_constraintdef(oid) LIKE '%REFERENCES public.campaigns(id) ON DELETE CASCADE%')
     AND EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.campaign_qr_events'::regclass AND contype = 'f'
                   AND pg_get_constraintdef(oid) LIKE '%REFERENCES public.qr_codes(id) ON DELETE SET NULL%')
     AND EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.campaign_qr_events'::regclass AND contype = 'f'
                   AND pg_get_constraintdef(oid) LIKE '%REFERENCES public.placements(id) ON DELETE SET NULL%'))
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E4 · PK + CHECK + UNIQUE(nonce,event_type) + 3 FKs (campaigns CASCADE, qr_codes/placements SET NULL)' AS evidence;

-- E-assert 5: the scan-nonce partial unique index exists (one scan per nonce).
SELECT CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'campaign_qr_events'
           AND indexname = 'campaign_qr_events_scan_nonce_unique')
       THEN 'PASS' ELSE 'FAIL' END AS result,
       'E5 · partial unique index campaign_qr_events_scan_nonce_unique (one scan per nonce) present' AS evidence;

-- ============================================================================
-- DONE. Expected: A/B/C1/C2/D/E1/E2/E3/E4/E5 all PASS. If any FAIL, do NOT
-- proceed; stop and report the FAIL row + evidence to the owner.
-- ============================================================================
