-- ============================================================================
-- FOCUS — CATALOG CENTRAL (post-11 — READ-ONLY SCHEMA VERIFICATION v2)
--
-- Type: READ-ONLY. Produces a single Result Set with all 24 checks.
-- Run as `postgres` in Supabase SQL Editor AFTER 11 only.
-- DO NOT run 12 until all checks show PASS.
-- ============================================================================

DROP TABLE IF EXISTS _verify_results;
CREATE TEMPORARY TABLE _verify_results (
  check_id   text,
  check_name text,
  actual     text,
  expected   text,
  status     text,
  details    text
);

-- ── S1: approval_status column ─────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'S1', 'catalog_models.approval_status exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Column must exist with NOT NULL + DEFAULT draft';

-- ── S2: approval_status NOT NULL ───────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'S2', 'approval_status is NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status' AND is_nullable='NO'
  ) THEN 'NO' ELSE COALESCE(
    (SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_models'
       AND column_name='approval_status'), 'MISSING'
  ) END,
  'NO',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Column must be NOT NULL';

-- ── S3: approval_status DEFAULT = draft ────────────────────────────────────
INSERT INTO _verify_results
SELECT 'S3', 'approval_status DEFAULT = draft',
  COALESCE(
    (SELECT column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_models'
       AND column_name='approval_status'),
    'MISSING'
  ),
  '''draft''',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='approval_status' AND column_default='''draft'''
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Default must be the string literal draft';

-- ── S4: approval_status CHECK constraint ───────────────────────────────────
INSERT INTO _verify_results
SELECT 'S4', 'approval_status CHECK constraint',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.catalog_models'::regclass
      AND conname='catalog_models_approval_status_check' AND contype='c'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.catalog_models'::regclass
      AND conname='catalog_models_approval_status_check' AND contype='c'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'CHECK (approval_status IN (draft,approved,rejected))';

-- ── S5: owner_notes column ─────────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'S5', 'catalog_models.owner_notes exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='owner_notes'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='owner_notes'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Column must exist, nullable text';

-- ── S6: owner_notes is nullable ────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'S6', 'owner_notes is nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='owner_notes' AND is_nullable='YES'
  ) THEN 'YES' ELSE COALESCE(
    (SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_models'
       AND column_name='owner_notes'), 'MISSING'
  ) END,
  'YES',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models'
      AND column_name='owner_notes' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Column must be nullable';

-- ── S7: catalog_model_history table exists ─────────────────────────────────
INSERT INTO _verify_results
SELECT 'S7', 'catalog_model_history table exists',
  CASE WHEN to_regclass('public.catalog_model_history') IS NOT NULL
    THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN to_regclass('public.catalog_model_history') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END,
  'Table must exist for audit trail';

-- ── S8: catalog_model_history column count = 7 ────────────────────────────
INSERT INTO _verify_results
SELECT 'S8', 'catalog_model_history column count',
  (SELECT count(*)::text FROM information_schema.columns
   WHERE table_schema='public' AND table_name='catalog_model_history'),
  '7',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
             WHERE table_schema='public' AND table_name='catalog_model_history') = 7
    THEN 'PASS' ELSE 'FAIL' END,
  'Expected: id,model_id,action,before,after,actor_user_id,created_at';

-- ── S9: catalog_model_history required columns present ─────────────────────
INSERT INTO _verify_results
SELECT 'S9', 'catalog_model_history required columns',
  COALESCE(
    (SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='catalog_model_history'),
    'EMPTY'
  ),
  'id,model_id,action,before,after,actor_user_id,created_at',
  CASE WHEN (
    SELECT array_agg(column_name ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_model_history'
  ) @> ARRAY['id','model_id','action','before','after','actor_user_id','created_at']
    THEN 'PASS' ELSE 'FAIL' END,
  'All 7 required columns must be present';

-- ── S10: catalog_model_history.action CHECK ────────────────────────────────
INSERT INTO _verify_results
SELECT 'S10', 'catalog_model_history.action CHECK',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.catalog_model_history'::regclass
      AND conname='catalog_model_history_action_check' AND contype='c'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.catalog_model_history'::regclass
      AND conname='catalog_model_history_action_check' AND contype='c'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'CHECK (action IN (CREATE,UPDATE,APPROVE,REJECT))';

-- ══════════════════════════════════════════════════════════════════════════
-- DATA INTEGRITY
-- ══════════════════════════════════════════════════════════════════════════

-- ── D1: catalog_models count ───────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'D1', 'catalog_models count',
  (SELECT count(*)::text FROM public.catalog_models),
  '2178',
  CASE WHEN (SELECT count(*) FROM public.catalog_models) = 2178
    THEN 'PASS' ELSE 'FAIL' END,
  'Must be exactly 2178 (no models added or removed)';

-- ── D2: catalog_variants count ─────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'D2', 'catalog_variants count',
  (SELECT count(*)::text FROM public.catalog_variants),
  '1816',
  CASE WHEN (SELECT count(*) FROM public.catalog_variants) = 1816
    THEN 'PASS' ELSE 'FAIL' END,
  'Must be exactly 1816 (no variants added or removed)';

-- ── D3: inventory count ────────────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'D3', 'inventory_items count',
  (SELECT count(*)::text FROM public.inventory_items),
  '25',
  CASE WHEN (SELECT count(*) FROM public.inventory_items) = 25
    THEN 'PASS' ELSE 'FAIL' END,
  'Must be exactly 25 (inventory untouched)';

-- ── D4: inventory fingerprint ──────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'D4', 'inventory fingerprint',
  (SELECT md5(string_agg(
      id::text || '|' || coalesce(source_key,'') || '|' || coalesce(model_id,'')
        || '|' || coalesce(quantity,0)::text || '|' || coalesce(status,'')
        || '|' || coalesce(is_published,false)::text,
      ',' ORDER BY id))
   FROM public.inventory_items),
  'a515442884dd43d6fecd47ab73dec618',
  CASE WHEN (SELECT md5(string_agg(
      id::text || '|' || coalesce(source_key,'') || '|' || coalesce(model_id,'')
        || '|' || coalesce(quantity,0)::text || '|' || coalesce(status,'')
        || '|' || coalesce(is_published,false)::text,
      ',' ORDER BY id))
   FROM public.inventory_items) = 'a515442884dd43d6fecd47ab73dec618'
    THEN 'PASS' ELSE 'FAIL' END,
  'Content fingerprint must match baseline exactly';

-- ── D5: no duplicate model canonical IDs ───────────────────────────────────
INSERT INTO _verify_results
SELECT 'D5', 'no duplicate model canonical_ids',
  (SELECT count(DISTINCT canonical_id)::text FROM public.catalog_models),
  (SELECT count(*)::text FROM public.catalog_models),
  CASE WHEN (SELECT count(DISTINCT canonical_id) FROM public.catalog_models)
       = (SELECT count(*) FROM public.catalog_models)
    THEN 'PASS' ELSE 'FAIL' END,
  'Distinct canonical_id count must equal total model count';

-- ── D6: no duplicate variant canonical IDs ─────────────────────────────────
INSERT INTO _verify_results
SELECT 'D6', 'no duplicate variant canonical_ids',
  (SELECT count(DISTINCT canonical_variant_id)::text FROM public.catalog_variants),
  (SELECT count(*)::text FROM public.catalog_variants),
  CASE WHEN (SELECT count(DISTINCT canonical_variant_id) FROM public.catalog_variants)
       = (SELECT count(*) FROM public.catalog_variants)
    THEN 'PASS' ELSE 'FAIL' END,
  'Distinct canonical_variant_id count must equal total variant count';

-- ── D7: no orphan variants ─────────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'D7', 'no orphan variants',
  (SELECT count(*)::text FROM public.catalog_variants cv
   WHERE NOT EXISTS (
     SELECT 1 FROM public.catalog_models cm WHERE cm.id = cv.model_id
   )),
  '0',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.catalog_variants cv
    WHERE NOT EXISTS (
      SELECT 1 FROM public.catalog_models cm WHERE cm.id = cv.model_id
    )
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Every variant must reference an existing model';

-- ══════════════════════════════════════════════════════════════════════════
-- HISTORY
-- ══════════════════════════════════════════════════════════════════════════

-- ── H1: catalog_model_history empty ────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'H1', 'catalog_model_history row count',
  (SELECT count(*)::text FROM public.catalog_model_history),
  '0',
  CASE WHEN (SELECT count(*) FROM public.catalog_model_history) = 0
    THEN 'PASS' ELSE 'FAIL' END,
  'Must be empty (no unintended backfill from migration 11)';

-- ══════════════════════════════════════════════════════════════════════════
-- EXISTING RPCs
-- ══════════════════════════════════════════════════════════════════════════

-- ── R1: catalog_create_model ───────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R1', 'catalog_create_model exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_create_model'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_create_model'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ── R2: catalog_create_variant ─────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R2', 'catalog_create_variant exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_create_variant'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_create_variant'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ── R3: catalog_archive_variant ────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R3', 'catalog_archive_variant exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_archive_variant'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_archive_variant'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ── R4: catalog_verify_variant ─────────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R4', 'catalog_verify_variant exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_verify_variant'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_verify_variant'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ── R5: catalog_admin_list_variants ────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R5', 'catalog_admin_list_variants exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_list_variants'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_list_variants'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ── R6: catalog_get_variant_history ────────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R6', 'catalog_get_variant_history exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_get_variant_history'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_get_variant_history'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ── R7: catalog_reconciliation_report ──────────────────────────────────────
INSERT INTO _verify_results
SELECT 'R7', 'catalog_reconciliation_report exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_reconciliation_report'
  ) THEN 'EXISTS' ELSE 'MISSING' END,
  'EXISTS',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_reconciliation_report'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Pre-existing RPC must not be destroyed by migration 11';

-- ══════════════════════════════════════════════════════════════════════════
-- NEW RPC ABSENCE (12 not applied yet)
-- ══════════════════════════════════════════════════════════════════════════

-- ── R8: catalog_admin_update_model NOT yet created ─────────────────────────
INSERT INTO _verify_results
SELECT 'R8', 'catalog_admin_update_model NOT yet created',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
  ) THEN 'EXISTS — 12 applied early?' ELSE 'NOT YET (correct)' END,
  'NOT YET',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_model'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'New RPC must not exist before 12 is applied';

-- ── R9: catalog_admin_update_variant NOT yet created ───────────────────────
INSERT INTO _verify_results
SELECT 'R9', 'catalog_admin_update_variant NOT yet created',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_variant'
  ) THEN 'EXISTS — 12 applied early?' ELSE 'NOT YET (correct)' END,
  'NOT YET',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_update_variant'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'New RPC must not exist before 12 is applied';

-- ── R10: catalog_admin_approve_model NOT yet created ───────────────────────
INSERT INTO _verify_results
SELECT 'R10', 'catalog_admin_approve_model NOT yet created',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
  ) THEN 'EXISTS — 12 applied early?' ELSE 'NOT YET (correct)' END,
  'NOT YET',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname='catalog_admin_approve_model'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'New RPC must not exist before 12 is applied';

-- ══════════════════════════════════════════════════════════════════════════
-- RESULT SET — all 24 checks
-- ══════════════════════════════════════════════════════════════════════════

SELECT check_id, check_name, actual, expected, status, details
FROM _verify_results;

-- Summary row
SELECT
  'SUMMARY' AS check_id,
  (SELECT count(*)::text || ' total, '
   || sum(CASE WHEN status='PASS' THEN 1 ELSE 0 END)::text || ' PASS, '
   || sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END)::text || ' FAIL'
   FROM _verify_results) AS check_name,
  NULL AS actual,
  NULL AS expected,
  CASE WHEN (SELECT sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) FROM _verify_results) = 0
    THEN 'ALL PASS' ELSE 'FAILURES DETECTED' END AS status,
  CASE WHEN (SELECT sum(CASE WHEN status='FAIL' THEN 1 ELSE 0 END) FROM _verify_results) = 0
    THEN 'Safe to review 12. HARD STOP — do not apply 12 without owner review.'
    ELSE 'DO NOT apply 12. Investigate failed check(s) above.' END AS details;

DROP TABLE IF EXISTS _verify_results;
