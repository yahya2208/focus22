-- ============================================================================
-- FOCUS — CATALOG CENTRAL (13 — P0 POST-APPLY VERIFY — FINAL v3)
--
-- Type: READ-ONLY. Produces a single Result Set with all checks.
-- Run as `postgres` in Supabase SQL Editor AFTER:
--   11-catalog-admin-schema-apply.sql
--   12-catalog-admin-rpcs.sql (FINAL P0 version)
--
-- This file:
--   * Does NOT modify any database data or schema
--   * Does NOT create, alter, or drop any tables
--   * Does NOT execute any RPCs (no INSERT/UPDATE/DELETE)
--   * Is fully READ-ONLY
--
-- Output: Result Set (check_id | check_name | actual | expected | status | details)
--         + SUMMARY row at the end
--         + RAISE EXCEPTION if any real FAIL
-- ============================================================================

DROP TABLE IF EXISTS _r13;
CREATE TEMPORARY TABLE _r13 (
  check_id   text,
  check_name text,
  actual     text,
  expected   text,
  status     text,
  details    text
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA CHECKS (S1–S7)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO _r13 SELECT 'S1',
  'catalog_models.approval_status column exists',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status'
  ) THEN 'EXISTS' ELSE 'MISSING' END),
  'EXISTS',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status'
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Added by migration 11';

INSERT INTO _r13 SELECT 'S2',
  'approval_status is NOT NULL',
  (SELECT COALESCE(
    (SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_models'
       AND column_name='approval_status'), 'MISSING')),
  'NO',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Column must be NOT NULL';

INSERT INTO _r13 SELECT 'S3',
  'approval_status DEFAULT = draft',
  (SELECT COALESCE(
    (SELECT column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_models'
       AND column_name='approval_status'), 'MISSING')),
  '''draft''',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status' AND column_default='''draft'''
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Default must be the string literal draft';

INSERT INTO _r13 SELECT 'S4',
  'approval_status CHECK constraint',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.catalog_models'::regclass
      AND conname='catalog_models_approval_status_check' AND contype='c'
  ) THEN 'EXISTS' ELSE 'MISSING' END),
  'EXISTS',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.catalog_models'::regclass
      AND conname='catalog_models_approval_status_check' AND contype='c'
  ) THEN 'PASS' ELSE 'FAIL' END),
  'CHECK (approval_status IN (draft,approved,rejected))';

INSERT INTO _r13 SELECT 'S5',
  'catalog_models.owner_notes column exists',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='owner_notes'
  ) THEN 'EXISTS' ELSE 'MISSING' END),
  'EXISTS',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='owner_notes'
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Nullable text column for model-level notes';

INSERT INTO _r13 SELECT 'S6',
  'catalog_model_history table exists',
  (SELECT CASE WHEN to_regclass('public.catalog_model_history') IS NOT NULL
    THEN 'EXISTS' ELSE 'MISSING' END),
  'EXISTS',
  (SELECT CASE WHEN to_regclass('public.catalog_model_history') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END),
  'Append-only audit trail for model edits';

INSERT INTO _r13 SELECT 'S7',
  'catalog_model_history column count',
  (SELECT count(*)::text FROM information_schema.columns
   WHERE table_schema='public' AND table_name='catalog_model_history'),
  '7',
  (SELECT CASE WHEN (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_model_history') = 7
    THEN 'PASS' ELSE 'FAIL' END),
  'Expected: id,model_id,action,before,after,actor_user_id,created_at';


-- ═══════════════════════════════════════════════════════════════════════════
-- SIGNATURE CHECKS — exact match + no overloads (G1–G6)
-- ═══════════════════════════════════════════════════════════════════════════

-- G1: update_model signature exact match
INSERT INTO _r13 SELECT 'G1',
  'update_model signature',
  (SELECT '(' || string_agg(t.typname, ', ') || ')'
   FROM (SELECT p.proargtypes[x.n]::regtype::text AS typname
         FROM pg_proc p, generate_subscripts(p.proargtypes,1) x(n)
         WHERE p.pronamespace='public'::regnamespace
           AND p.proname='catalog_admin_update_model'
         ORDER BY x.n) t),
  '(text, text, text, integer, text[], text[], text)',
  (SELECT CASE WHEN (
    SELECT count(*) FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
      AND proargtypes = ARRAY['text'::regtype,'text'::regtype,'text'::regtype,
                              'integer'::regtype,'text[]'::regtype,'text[]'::regtype,
                              'text'::regtype]
  ) = 1 THEN 'PASS' ELSE 'FAIL' END),
  'Must match exactly — 7 parameters';

-- G2: update_model no overloads
INSERT INTO _r13 SELECT 'G2',
  'update_model overload count',
  (SELECT count(*)::text FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_model'),
  '1',
  (SELECT CASE WHEN (SELECT count(*) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname='catalog_admin_update_model') = 1
    THEN 'PASS' ELSE 'FAIL' END),
  'Must exist exactly once — no unintended overloads';

-- G3: update_variant signature exact match
INSERT INTO _r13 SELECT 'G3',
  'update_variant signature',
  (SELECT '(' || string_agg(t.typname, ', ') || ')'
   FROM (SELECT p.proargtypes[x.n]::regtype::text AS typname
         FROM pg_proc p, generate_subscripts(p.proargtypes,1) x(n)
         WHERE p.pronamespace='public'::regnamespace
           AND p.proname='catalog_admin_update_variant'
         ORDER BY x.n) t),
  '(text, text)',
  (SELECT CASE WHEN (
    SELECT count(*) FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_variant'
      AND proargtypes = ARRAY['text'::regtype,'text'::regtype]
  ) = 1 THEN 'PASS' ELSE 'FAIL' END),
  'Must match exactly — 2 parameters (canonical_variant_id, notes)';

-- G4: update_variant no overloads
INSERT INTO _r13 SELECT 'G4',
  'update_variant overload count',
  (SELECT count(*)::text FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_variant'),
  '1',
  (SELECT CASE WHEN (SELECT count(*) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname='catalog_admin_update_variant') = 1
    THEN 'PASS' ELSE 'FAIL' END),
  'Must exist exactly once — no unintended overloads';

-- G5: approve_model signature exact match
INSERT INTO _r13 SELECT 'G5',
  'approve_model signature',
  (SELECT '(' || string_agg(t.typname, ', ') || ')'
   FROM (SELECT p.proargtypes[x.n]::regtype::text AS typname
         FROM pg_proc p, generate_subscripts(p.proargtypes,1) x(n)
         WHERE p.pronamespace='public'::regnamespace
           AND p.proname='catalog_admin_approve_model'
         ORDER BY x.n) t),
  '(text, boolean)',
  (SELECT CASE WHEN (
    SELECT count(*) FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
      AND proargtypes = ARRAY['text'::regtype,'boolean'::regtype]
  ) = 1 THEN 'PASS' ELSE 'FAIL' END),
  'Must match exactly — 2 parameters (canonical_id, approve)';

-- G6: approve_model no overloads
INSERT INTO _r13 SELECT 'G6',
  'approve_model overload count',
  (SELECT count(*)::text FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_approve_model'),
  '1',
  (SELECT CASE WHEN (SELECT count(*) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname='catalog_admin_approve_model') = 1
    THEN 'PASS' ELSE 'FAIL' END),
  'Must exist exactly once — no unintended overloads';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY CHECKS per RPC (A1–A15)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── update_model security ──────────────────────────────────────────────────

INSERT INTO _r13 SELECT 'A1',
  'update_model: SECURITY DEFINER',
  (SELECT CASE WHEN prosecdef THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_model' LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model' AND prosecdef=true
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Function must execute as owner';

INSERT INTO _r13 SELECT 'A2',
  'update_model: search_path = public',
  (SELECT COALESCE(
    (SELECT unnest(proconfig) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname='catalog_admin_update_model' LIMIT 1
     AND unnest(proconfig) LIKE 'search_path=%'),
    'NOT SET')),
  'search_path=public',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
      AND 'search_path=public' = ANY(proconfig)
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must pin search_path to public';

INSERT INTO _r13 SELECT 'A3',
  'update_model: PUBLIC has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('public','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('public','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'PUBLIC must not be able to call this function';

INSERT INTO _r13 SELECT 'A4',
  'update_model: authenticated has EXECUTE',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text)','EXECUTE')
    THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Authenticated users must be able to call this function';

INSERT INTO _r13 SELECT 'A5',
  'update_model: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_admin_update_model(text,text,text,integer,text[],text[],text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Anonymous users must not be able to call this function';

-- ── update_variant security ────────────────────────────────────────────────

INSERT INTO _r13 SELECT 'A6',
  'update_variant: SECURITY DEFINER',
  (SELECT CASE WHEN prosecdef THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_update_variant' LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_variant' AND prosecdef=true
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Function must execute as owner';

INSERT INTO _r13 SELECT 'A7',
  'update_variant: search_path = public',
  (SELECT COALESCE(
    (SELECT unnest(proconfig) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname='catalog_admin_update_variant' LIMIT 1
     AND unnest(proconfig) LIKE 'search_path=%'),
    'NOT SET')),
  'search_path=public',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_variant'
      AND 'search_path=public' = ANY(proconfig)
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must pin search_path to public';

INSERT INTO _r13 SELECT 'A8',
  'update_variant: PUBLIC has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('public','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('public','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'PUBLIC must not be able to call this function';

INSERT INTO _r13 SELECT 'A9',
  'update_variant: authenticated has EXECUTE',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Authenticated users must be able to call this function';

INSERT INTO _r13 SELECT 'A10',
  'update_variant: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_admin_update_variant(text,text)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Anonymous users must not be able to call this function';

-- ── approve_model security ─────────────────────────────────────────────────

INSERT INTO _r13 SELECT 'A11',
  'approve_model: SECURITY DEFINER',
  (SELECT CASE WHEN prosecdef THEN 'YES' ELSE 'NO' END
   FROM pg_proc WHERE pronamespace='public'::regnamespace
     AND proname='catalog_admin_approve_model' LIMIT 1),
  'YES',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model' AND prosecdef=true
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Function must execute as owner';

INSERT INTO _r13 SELECT 'A12',
  'approve_model: search_path = public',
  (SELECT COALESCE(
    (SELECT unnest(proconfig) FROM pg_proc
     WHERE pronamespace='public'::regnamespace
       AND proname='catalog_admin_approve_model' LIMIT 1
     AND unnest(proconfig) LIKE 'search_path=%'),
    'NOT SET')),
  'search_path=public',
  (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
      AND 'search_path=public' = ANY(proconfig)
  ) THEN 'PASS' ELSE 'FAIL' END),
  'Must pin search_path to public';

INSERT INTO _r13 SELECT 'A13',
  'approve_model: PUBLIC has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('public','public.catalog_admin_approve_model(text,boolean)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('public','public.catalog_admin_approve_model(text,boolean)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'PUBLIC must not be able to call this function';

INSERT INTO _r13 SELECT 'A14',
  'approve_model: authenticated has EXECUTE',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_approve_model(text,boolean)','EXECUTE')
    THEN 'YES' ELSE 'NO' END),
  'YES',
  (SELECT CASE WHEN has_function_privilege('authenticated','public.catalog_admin_approve_model(text,boolean)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Authenticated users must be able to call this function';

INSERT INTO _r13 SELECT 'A15',
  'approve_model: anon has no EXECUTE',
  (SELECT CASE WHEN has_function_privilege('anon','public.catalog_admin_approve_model(text,boolean)','EXECUTE')
    THEN 'HAS' ELSE 'NO' END),
  'NO',
  (SELECT CASE WHEN NOT has_function_privilege('anon','public.catalog_admin_approve_model(text,boolean)','EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END),
  'Anonymous users must not be able to call this function';


-- ═══════════════════════════════════════════════════════════════════════════
-- DATA INTEGRITY (D1–D7)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO _r13 SELECT 'D1',
  'catalog_models count',
  (SELECT count(*)::text FROM public.catalog_models),
  '2178',
  (SELECT CASE WHEN (SELECT count(*) FROM public.catalog_models) = 2178
    THEN 'PASS' ELSE 'FAIL' END),
  'Must be exactly 2178 — no models added or removed';

INSERT INTO _r13 SELECT 'D2',
  'catalog_variants count',
  (SELECT count(*)::text FROM public.catalog_variants),
  '1816',
  (SELECT CASE WHEN (SELECT count(*) FROM public.catalog_variants) = 1816
    THEN 'PASS' ELSE 'FAIL' END),
  'Must be exactly 1816 — no variants added or removed';

INSERT INTO _r13 SELECT 'D3',
  'inventory_items count',
  (SELECT count(*)::text FROM public.inventory_items),
  '25',
  (SELECT CASE WHEN (SELECT count(*) FROM public.inventory_items) = 25
    THEN 'PASS' ELSE 'FAIL' END),
  'Must be exactly 25 — inventory untouched';

INSERT INTO _r13 SELECT 'D4',
  'inventory fingerprint',
  (SELECT md5(string_agg(
      id::text || '|' || coalesce(source_key,'') || '|' || coalesce(model_id,'')
        || '|' || coalesce(quantity,0)::text || '|' || coalesce(status,'')
        || '|' || coalesce(is_published,false)::text,
      ',' ORDER BY id)) FROM public.inventory_items),
  'a515442884dd43d6fecd47ab73dec618',
  (SELECT CASE WHEN (SELECT md5(string_agg(
      id::text || '|' || coalesce(source_key,'') || '|' || coalesce(model_id,'')
        || '|' || coalesce(quantity,0)::text || '|' || coalesce(status,'')
        || '|' || coalesce(is_published,false)::text,
      ',' ORDER BY id)) FROM public.inventory_items)
      = 'a515442884dd43d6fecd47ab73dec618'
    THEN 'PASS' ELSE 'FAIL' END),
  'Content fingerprint must match baseline exactly';

INSERT INTO _r13 SELECT 'D5',
  'no duplicate model canonical_ids',
  (SELECT count(DISTINCT canonical_id)::text FROM public.catalog_models),
  (SELECT count(*)::text FROM public.catalog_models),
  (SELECT CASE WHEN (SELECT count(DISTINCT canonical_id) FROM public.catalog_models)
       = (SELECT count(*) FROM public.catalog_models)
    THEN 'PASS' ELSE 'FAIL' END),
  'Distinct count must equal total — no duplicates';

INSERT INTO _r13 SELECT 'D6',
  'no duplicate variant canonical_ids',
  (SELECT count(DISTINCT canonical_variant_id)::text FROM public.catalog_variants),
  (SELECT count(*)::text FROM public.catalog_variants),
  (SELECT CASE WHEN (SELECT count(DISTINCT canonical_variant_id) FROM public.catalog_variants)
       = (SELECT count(*) FROM public.catalog_variants)
    THEN 'PASS' ELSE 'FAIL' END),
  'Distinct count must equal total — no duplicates';

INSERT INTO _r13 SELECT 'D7',
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


-- ═══════════════════════════════════════════════════════════════════════════
-- HISTORY CHECK (H1)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO _r13 SELECT 'H1',
  'catalog_model_history row count',
  (SELECT count(*)::text FROM public.catalog_model_history),
  '0 (expected after CREATE OR REPLACE FUNCTION only)',
  (SELECT CASE
    WHEN (SELECT count(*) FROM public.catalog_model_history) = 0
      THEN 'PASS'
    ELSE 'INFO'
   END),
  'CREATE OR REPLACE FUNCTION does not write history. '
  'Rows > 0 means an RPC was called outside this migration — '
  'this is informational, not a failure. Not counted as FAIL.';


-- ═══════════════════════════════════════════════════════════════════════════
-- RESULT SET
-- ═══════════════════════════════════════════════════════════════════════════

SELECT check_id, check_name, actual, expected, status, details
FROM _r13;


-- ═══════════════════════════════════════════════════════════════════════════
-- SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  'SUMMARY' AS check_id,
  (SELECT count(*)::text || ' total | '
   || sum(CASE WHEN status='PASS' THEN 1 ELSE 0 END)::text || ' PASS | '
   || sum(CASE WHEN status='INFO' THEN 1 ELSE 0 END)::text || ' INFO | '
   || sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END)::text || ' FAIL'
   FROM _r13) AS check_name,
  NULL AS actual,
  NULL AS expected,
  CASE WHEN (SELECT sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) FROM _r13) = 0
    THEN 'ALL PASS' ELSE 'FAILURES DETECTED' END AS status,
  CASE WHEN (SELECT sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) FROM _r13) = 0
    THEN 'P0 verification complete — safe to proceed to P1. '
         || 'HARD STOP: do not apply P1 without owner approval.'
    ELSE 'DO NOT proceed. Investigate FAILED check(s) above.' END AS details;


-- ═══════════════════════════════════════════════════════════════════════════
-- HARD STOP — RAISE EXCEPTION if any real FAIL
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_fails integer;
BEGIN
  SELECT count(*) INTO v_fails FROM _r13 WHERE status = 'FAIL';
  IF v_fails > 0 THEN
    RAISE EXCEPTION 'P0 VERIFY FAIL: % check(s) FAILED — see Result Set above', v_fails;
  END IF;
END $$;

DROP TABLE IF EXISTS _r13;
