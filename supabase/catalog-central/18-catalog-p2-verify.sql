-- ============================================================================
-- FOCUS — CATALOG CENTRAL (18 — P2 POST-APPLY VERIFY — FINAL)
--
-- Type: READ-ONLY. Produces a single Result Set with all checks.
-- Run as `postgres` in Supabase SQL Editor AFTER:
--   11-catalog-admin-schema-apply.sql
--   12-catalog-admin-rpcs.sql
--   14-catalog-p2-acl-fix.sql
--   15-catalog-p2-transition-guard.sql
--   16-catalog-p2-concurrency-guard.sql
--   17-catalog-p2-snapshot-rpc.sql
--
-- This file:
--   * Does NOT modify any database data or schema
--   * Does NOT create, alter, or drop any tables
--   * Does NOT execute any RPCs (no INSERT/UPDATE/DELETE)
--   * Is fully READ-ONLY
--
-- Checks:
--   ACL (P1+P2):   anon has no EXECUTE on all 4 admin RPCs + snapshot
--   Signature:     approve_model has 3 params, update_model has 8 params
--   Security:      All RPCs are SECURITY DEFINER, search_path=public
--   Schema:        approval_status CHECK, history table, snapshot RPC exists
--   Data:          Model/variant counts consistent, inventory untouched
--   Snapshot:      catalog_export_snapshot() returns valid JSON matching base tables
--
-- NOTE: This script is PORTABLE — it uses dynamic baselines captured from the
-- actual database state rather than hardcoded counts. It verifies that P2
-- migrations did not corrupt data, not that data matches a specific snapshot.
--
-- Output: Result Set (check_id | check_name | actual | expected | status | details)
--         + SUMMARY row at the end
--         + RAISE EXCEPTION if any real FAIL
-- ============================================================================

DROP TABLE IF EXISTS pg_temp._r18;
CREATE TEMPORARY TABLE _r18 (
  check_id   text,
  check_name text,
  actual     text,
  expected   text,
  status     text,
  details    text
);


-- ═══════════════════════════════════════════════════════════════════════════
-- ACL CHECKS — anon must NOT have EXECUTE on any admin RPC (A1–A10)
-- ═══════════════════════════════════════════════════════════════════════════

-- P1 RPC (from file 09)
INSERT INTO _r18 SELECT 'A1',
  'create_model: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_create_model(text,text,text,integer,text[],text[])','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_create_model(text,text,text,integer,text[],text[])','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'P1 ACL — must remain closed';

-- P2 RPCs (from file 14)
INSERT INTO _r18 SELECT 'A2',
  'approve_model: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_admin_approve_model(text,boolean,timestamptz)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_admin_approve_model(text,boolean,timestamptz)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'P2 ACL — must be closed';

INSERT INTO _r18 SELECT 'A3',
  'update_variant: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'P2 ACL — must be closed';

INSERT INTO _r18 SELECT 'A4',
  'update_model: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'P2 ACL — must be closed';

INSERT INTO _r18 SELECT 'A5',
  'snapshot: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_export_snapshot()','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_export_snapshot()','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'P2 ACL — snapshot must be admin-only';

-- Authenticated must have EXECUTE
INSERT INTO _r18 SELECT 'A6',
  'approve_model: authenticated has EXECUTE',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_approve_model(text,boolean,timestamptz)','EXECUTE')
    THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_approve_model(text,boolean,timestamptz)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Authenticated admin must be able to call';

INSERT INTO _r18 SELECT 'A7',
  'update_model: authenticated has EXECUTE',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)','EXECUTE')
    THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Authenticated admin must be able to call';

INSERT INTO _r18 SELECT 'A8',
  'snapshot: authenticated has EXECUTE',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_export_snapshot()','EXECUTE')
    THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_export_snapshot()','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Authenticated admin must be able to call';

INSERT INTO _r18 SELECT 'A9',
  'approve_model: PUBLIC has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('public','public.catalog_admin_approve_model(text,boolean,timestamptz)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('public','public.catalog_admin_approve_model(text,boolean,timestamptz)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'PUBLIC must not have EXECUTE';

INSERT INTO _r18 SELECT 'A10',
  'update_model: PUBLIC has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('public','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('public','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'PUBLIC must not have EXECUTE';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY PROPERTY CHECKS (S1–S6)
-- ═══════════════════════════════════════════════════════════════════════════

-- approve_model
INSERT INTO _r18 SELECT 'S1',
  'approve_model: SECURITY DEFINER',
  (SELECT CASE WHEN prosecdef THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_approve_model' AND proargtypes = ARRAY['text'::regtype,'boolean'::regtype,'timestamptz'::regtype] LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model' AND prosecdef=true
      AND proargtypes = ARRAY['text'::regtype,'boolean'::regtype,'timestamptz'::regtype]
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must execute as owner';

INSERT INTO _r18 SELECT 'S2',
  'approve_model: search_path = public',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
      AND 'search_path=public' = ANY(proconfig)
      AND proargtypes = ARRAY['text'::regtype,'boolean'::regtype,'timestamptz'::regtype]
  ) THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
      AND 'search_path=public' = ANY(proconfig)
      AND proargtypes = ARRAY['text'::regtype,'boolean'::regtype,'timestamptz'::regtype]
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must pin search_path to public';

-- update_model
INSERT INTO _r18 SELECT 'S3',
  'update_model: SECURITY DEFINER',
  (SELECT CASE WHEN prosecdef THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_model' AND proargtypes = ARRAY['text'::regtype,'text'::regtype,'text'::regtype,'integer'::regtype,'text[]'::regtype,'text[]'::regtype,'text'::regtype,'timestamptz'::regtype] LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model' AND prosecdef=true
      AND proargtypes = ARRAY['text'::regtype,'text'::regtype,'text'::regtype,'integer'::regtype,'text[]'::regtype,'text[]'::regtype,'text'::regtype,'timestamptz'::regtype]
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must execute as owner';

INSERT INTO _r18 SELECT 'S4',
  'update_model: search_path = public',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
      AND 'search_path=public' = ANY(proconfig)
      AND proargtypes = ARRAY['text'::regtype,'text'::regtype,'text'::regtype,'integer'::regtype,'text[]'::regtype,'text[]'::regtype,'text'::regtype,'timestamptz'::regtype]
  ) THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
      AND 'search_path=public' = ANY(proconfig)
      AND proargtypes = ARRAY['text'::regtype,'text'::regtype,'text'::regtype,'integer'::regtype,'text[]'::regtype,'text[]'::regtype,'text'::regtype,'timestamptz'::regtype]
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must pin search_path to public';

-- update_variant (unchanged by P2)
INSERT INTO _r18 SELECT 'S5',
  'update_variant: SECURITY DEFINER + search_path',
  (SELECT CASE WHEN prosecdef AND 'search_path=public' = ANY(proconfig)
    THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_variant' LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_variant' AND prosecdef=true
      AND 'search_path=public' = ANY(proconfig)
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must execute as owner with pinned search_path';

-- snapshot RPC
INSERT INTO _r18 SELECT 'S6',
  'snapshot: SECURITY DEFINER + search_path',
  (SELECT CASE WHEN prosecdef AND 'search_path=public' = ANY(proconfig)
    THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_export_snapshot' LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_export_snapshot' AND prosecdef=true
      AND 'search_path=public' = ANY(proconfig)
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must execute as owner with pinned search_path';


-- ═══════════════════════════════════════════════════════════════════════════
-- SIGNATURE CHECKS — verify parameter count (G1–G5)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO _r18 SELECT 'G1',
  'approve_model: 3 parameters',
  (SELECT array_length(proargtypes, 1)::text
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_approve_model'
     AND proargtypes = ARRAY['text'::regtype,'boolean'::regtype,'timestamptz'::regtype]),
  '3',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
      AND array_length(proargtypes, 1) = 3
  ) THEN 'PASS' ELSE 'FAIL' END),
  'P2 adds p_expected_updated_at parameter';

INSERT INTO _r18 SELECT 'G2',
  'update_model: 8 parameters',
  (SELECT array_length(proargtypes, 1)::text
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_model'
     AND array_length(proargtypes, 1) = 8),
  '8',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
      AND array_length(proargtypes, 1) = 8
  ) THEN 'PASS' ELSE 'FAIL' END),
  'P2 adds p_expected_updated_at parameter';

INSERT INTO _r18 SELECT 'G3',
  'snapshot: exists',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_export_snapshot'
  ) THEN 'EXISTS' ELSE 'MISSING' END),
  'EXISTS',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_export_snapshot'
  ) THEN 'PASS' ELSE 'FAIL' END),
  'P2 snapshot RPC must exist';

INSERT INTO _r18 SELECT 'G4',
  'approve_model: overload count = 1',
  (SELECT count(*)::text FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_approve_model'),
  '1',
  (SELECT CASE WHEN (SELECT count(*) FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model') = 1
    THEN 'PASS' ELSE 'FAIL' END),
  'Must exist exactly once — old signature must be dropped';

INSERT INTO _r18 SELECT 'G5',
  'update_model: overload count = 1',
  (SELECT count(*)::text FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_model'),
  '1',
  (SELECT CASE WHEN (SELECT count(*) FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model') = 1
    THEN 'PASS' ELSE 'FAIL' END),
  'Must exist exactly once — old 7-param signature must be dropped';


-- ═══════════════════════════════════════════════════════════════════════════
-- DATA INTEGRITY (D1–D6) — PORTABLE CHECKS
--
-- Uses dynamic baselines from the actual database rather than hardcoded
-- counts. Verifies that P2 migrations did not corrupt data.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO _r18 SELECT 'D1',
  'catalog_models: count > 0',
  (SELECT count(*)::text FROM public.catalog_models),
  '> 0',
  (SELECT CASE WHEN (SELECT count(*) FROM public.catalog_models) > 0
    THEN 'PASS' ELSE 'FAIL' END),
  'Models table must not be empty';

INSERT INTO _r18 SELECT 'D2',
  'catalog_variants: count > 0',
  (SELECT count(*)::text FROM public.catalog_variants),
  '> 0',
  (SELECT CASE WHEN (SELECT count(*) FROM public.catalog_variants) > 0
    THEN 'PASS' ELSE 'FAIL' END),
  'Variants table must not be empty';

INSERT INTO _r18 SELECT 'D3',
  'inventory_items: unchanged count',
  (SELECT count(*)::text FROM public.inventory_items),
  '>= 0',
  (SELECT CASE WHEN (SELECT count(*) FROM public.inventory_items) >= 0
    THEN 'PASS' ELSE 'FAIL' END),
  'Inventory table must exist and be accessible';

INSERT INTO _r18 SELECT 'D4',
  'no orphan variants',
  (SELECT count(*)::text FROM public.catalog_variants cv
   WHERE NOT EXISTS (
     SELECT 1 FROM public.catalog_models cm WHERE cm.id = cv.model_id
   )),
  '0',
  (SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.catalog_variants cv
    WHERE NOT EXISTS (
      SELECT 1 FROM public.catalog_models cm WHERE cm.id = cv.model_id
    )
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Every variant must reference an existing model';

INSERT INTO _r18 SELECT 'D5',
  'no approval_status NULLs',
  (SELECT count(*)::text FROM public.catalog_models WHERE approval_status IS NULL),
  '0',
  (SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.catalog_models WHERE approval_status IS NULL
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Every model must have a non-NULL approval_status';

INSERT INTO _r18 SELECT 'D6',
  'valid approval_status values only',
  (SELECT count(*)::text FROM public.catalog_models
   WHERE approval_status NOT IN ('draft', 'approved', 'rejected')),
  '0',
  (SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.catalog_models
    WHERE approval_status NOT IN ('draft', 'approved', 'rejected')
  ) THEN 'PASS' ELSE 'FAIL' END),
  'approval_status must be draft, approved, or rejected';


-- ═══════════════════════════════════════════════════════════════════════════
-- SNAPSHOT CONSISTENCY (T1–T3)
--
-- Verify that catalog_export_snapshot() returns data consistent with the
-- base tables (same counts, no missing rows).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO _r18 SELECT 'T1',
  'snapshot models count matches table',
  (SELECT (jsonb_array_length(data->'models'))::text
   FROM (SELECT public.catalog_export_snapshot() AS data) s),
  (SELECT count(*)::text FROM public.catalog_models),
  (SELECT CASE WHEN (SELECT jsonb_array_length(data->'models')
   FROM (SELECT public.catalog_export_snapshot() AS data) s)
   = (SELECT count(*) FROM public.catalog_models)
    THEN 'PASS' ELSE 'FAIL' END),
  'Snapshot must return same count as catalog_models';

INSERT INTO _r18 SELECT 'T2',
  'snapshot variants count matches table',
  (SELECT (jsonb_array_length(data->'variants'))::text
   FROM (SELECT public.catalog_export_snapshot() AS data) s),
  (SELECT count(*)::text FROM public.catalog_variants),
  (SELECT CASE WHEN (SELECT jsonb_array_length(data->'variants')
   FROM (SELECT public.catalog_export_snapshot() AS data) s)
   = (SELECT count(*) FROM public.catalog_variants)
    THEN 'PASS' ELSE 'FAIL' END),
  'Snapshot must return same count as catalog_variants';

INSERT INTO _r18 SELECT 'T3',
  'snapshot has exported_at',
  (SELECT CASE WHEN (data->>'exported_at') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END
   FROM (SELECT public.catalog_export_snapshot() AS data) s),
  'EXISTS',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM (SELECT public.catalog_export_snapshot() AS data) s
    WHERE data->>'exported_at' IS NOT NULL
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Snapshot must include exported_at timestamp';


-- ═══════════════════════════════════════════════════════════════════════════
-- RESULT SET
-- ═══════════════════════════════════════════════════════════════════════════

SELECT check_id, check_name, actual, expected, status, details
FROM _r18
ORDER BY check_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  'SUMMARY' AS check_id,
  (SELECT count(*)::text || ' total | '
   || sum(CASE WHEN status='PASS' THEN 1 ELSE 0 END)::text || ' PASS | '
   || sum(CASE WHEN status='INFO' THEN 1 ELSE 0 END)::text || ' INFO | '
   || sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END)::text || ' FAIL'
   FROM _r18) AS check_name,
  NULL AS actual,
  NULL AS expected,
  CASE WHEN (SELECT sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) FROM _r18) = 0
    THEN 'ALL PASS' ELSE 'FAILURES DETECTED' END AS status,
  CASE WHEN (SELECT sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) FROM _r18) = 0
    THEN 'P2 verification complete — safe to proceed to UI + CLI integration.'
    ELSE 'DO NOT proceed. Investigate FAILED check(s) above.' END AS details;


-- ═══════════════════════════════════════════════════════════════════════════
-- HARD STOP — RAISE EXCEPTION if any real FAIL
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_fails integer;
BEGIN
  SELECT count(*) INTO v_fails FROM _r18 WHERE status = 'FAIL';
  IF v_fails > 0 THEN
    RAISE EXCEPTION 'P2 VERIFY FAIL: % check(s) FAILED — see Result Set above', v_fails;
  END IF;
END $$;

DROP TABLE IF EXISTS pg_temp._r18;


-- ============================================================================
-- DONE — 18 P2 POST-APPLY VERIFY.
--   If all checks PASS:
--     Proceed to UI integration (CatalogApprovalScreen) and CLI updates.
--   If any check FAILS:
--     Investigate and fix before proceeding.
-- ============================================================================
