-- ============================================================================
-- FOCUS — CATALOG CENTRAL (GATE 1 — POST-APPLY VERIFICATION, READ-ONLY)
--
-- Type: SELECT-only. Run as `postgres` AFTER 01-catalog-schema-apply.sql.
-- Fail-closed: any expected object missing -> RAISE EXCEPTION.
-- Verifies per owner mandate:
--   * 3 tables exist
--   * catalog_models.series (text) + release_year (integer) exist
--   * all intended constraints / indexes / RLS / RPCs exist
--   * inventory_items NOT modified (raw count = 7)
--   * NO seed (catalog tables empty) / NO GATE 3 / NO GATE 4
-- ============================================================================

-- 0) Context
SELECT current_database() AS db, current_user AS role, now() AS ts;

-- 1) Tables exist
DO $$
BEGIN
  IF to_regclass('public.catalog_models') IS NULL
     OR to_regclass('public.catalog_variants') IS NULL
     OR to_regclass('public.catalog_variant_history') IS NULL THEN
    RAISE EXCEPTION 'GATE1 VERIFY FAIL: one or more catalog tables missing';
  END IF;
END $$;
SELECT '01_tables' AS check_name, count(*) AS pass
FROM pg_catalog.pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('catalog_models','catalog_variants','catalog_variant_history')
  AND relkind = 'r';

-- 2) series + release_year present (owner amendment)
DO $$
DECLARE
  v_series     text;
  v_release    text;
  v_ram_mb     text;
  v_storage_gb text;
BEGIN
  SELECT data_type INTO v_series FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models' AND column_name='series';
  SELECT data_type INTO v_release FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_models' AND column_name='release_year';
  SELECT data_type INTO v_ram_mb FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_variants' AND column_name='ram_mb';
  SELECT data_type INTO v_storage_gb FROM information_schema.columns
    WHERE table_schema='public' AND table_name='catalog_variants' AND column_name='storage_gb';
  IF v_series IS NULL THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: catalog_models.series missing'; END IF;
  IF v_release IS NULL THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: catalog_models.release_year missing'; END IF;
  IF v_series <> 'text' THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: series type % <> text', v_series; END IF;
  IF v_release NOT IN ('integer','bigint','smallint') THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: release_year type % not integer', v_release; END IF;
  IF v_ram_mb IS NULL THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: catalog_variants.ram_mb missing'; END IF;
  IF v_storage_gb IS NULL THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: catalog_variants.storage_gb missing'; END IF;
  RAISE NOTICE '02_columns PASS: series=%, release_year=%, ram_mb=%, storage_gb=%',
    v_series, v_release, v_ram_mb, v_storage_gb;
END $$;

-- 3) Constraints
DO $$
DECLARE
  n integer;
BEGIN
  -- PKs
  SELECT count(*) INTO n FROM pg_catalog.pg_constraint
    WHERE contype='p' AND conrelid IN
      ('public.catalog_models'::regclass,'public.catalog_variants'::regclass,'public.catalog_variant_history'::regclass);
  IF n <> 3 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: expected 3 primary keys, found %', n; END IF;
  -- UNIQUE canonical ids
  SELECT count(*) INTO n FROM pg_catalog.pg_constraint
    WHERE contype='u'
      AND ((conrelid='public.catalog_models'::regclass AND conname='catalog_models_canonical_id_key')
        OR (conrelid='public.catalog_variants'::regclass AND conname='catalog_variants_canonical_variant_id_key'));
  IF n <> 2 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: canonical id unique constraints missing (%)', n; END IF;
  -- FK variants->models RESTRICT
  SELECT count(*) INTO n FROM pg_catalog.pg_constraint
    WHERE contype='f' AND conrelid='public.catalog_variants'::regclass
      AND confrelid='public.catalog_models'::regclass AND confdeltype='r';
  IF n <> 1 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: variants->models FK RESTRICT missing'; END IF;
  -- FK history->variants CASCADE
  SELECT count(*) INTO n FROM pg_catalog.pg_constraint
    WHERE contype='f' AND conrelid='public.catalog_variant_history'::regclass
      AND confrelid='public.catalog_variants'::regclass AND confdeltype='c';
  IF n <> 1 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: history->variants FK CASCADE missing'; END IF;
  -- CHECKs
  SELECT count(*) INTO n FROM pg_catalog.pg_constraint
    WHERE contype='c' AND conrelid IN
      ('public.catalog_models'::regclass,'public.catalog_variants'::regclass,'public.catalog_variant_history'::regclass);
  IF n < 6 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: expected >=6 check constraints, found %', n; END IF;
  RAISE NOTICE '03_constraints PASS (3 PK, 2 canonical UNIQUE, FKs RESTRICT/CASCADE, % checks)', n;
END $$;

-- 4) Indexes
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(i ORDER BY i) INTO v_missing FROM (
    SELECT unnest(ARRAY[
      'catalog_models_brand_name_uidx',
      'catalog_models_brand_id_idx',
      'catalog_models_model_numbers_gin',
      'catalog_variants_model_id_idx',
      'catalog_variants_status_idx',
      'catalog_variants_source_type_idx',
      'catalog_variants_spec_noregion_uidx',
      'catalog_variants_spec_region_uidx',
      'catalog_variant_history_variant_created_idx',
      'catalog_variant_history_action_idx']) AS i
    EXCEPT
    SELECT indexname::text FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename IN ('catalog_models','catalog_variants','catalog_variant_history')
  ) t;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'GATE1 VERIFY FAIL: missing indexes: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE '04_indexes PASS (10/10 present)';
END $$;

-- 5) RLS enabled + policies
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_catalog.pg_class
    WHERE relname IN ('catalog_models','catalog_variants','catalog_variant_history')
      AND relnamespace='public'::regnamespace AND relrowsecurity;
  IF n <> 3 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: RLS not enabled on all 3 tables (%)', n; END IF;
  SELECT count(*) INTO n FROM pg_catalog.pg_policies
    WHERE schemaname='public'
      AND (tablename='catalog_models' AND policyname='Catalog models public read'
        OR tablename='catalog_variants' AND policyname='Catalog variants public read');
  IF n <> 2 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: expected 2 read policies, found %', n; END IF;
  RAISE NOTICE '05_rls PASS (RLS on 3 tables, 2 read policies)';
END $$;

-- 6) RPCs present
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(f ORDER BY f) INTO v_missing FROM (
    SELECT unnest(ARRAY[
      'catalog_fnv1a_hash','catalog_ram_label','catalog_storage_label','catalog_variant_id',
      'catalog_is_admin','catalog_get_model_variants','catalog_resolve_model',
      'catalog_create_variant','catalog_verify_variant','catalog_archive_variant',
      'catalog_admin_list_variants','catalog_get_variant_history','catalog_reconciliation_report']) AS f
    EXCEPT
    SELECT proname FROM pg_catalog.pg_proc
    WHERE pronamespace='public'::regnamespace AND proname LIKE 'catalog\_%'
  ) t;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'GATE1 VERIFY FAIL: missing RPCs: %', array_to_string(v_missing, ', ');
  END IF;
  RAISE NOTICE '06_rpcs PASS (13/13 present)';
END $$;

-- 7) Identity self-test (SQL hash must reproduce the verified seed ids)
DO $$
BEGIN
  IF public.catalog_variant_id('vivo','vivo-x50',8192,128,NULL) <> 'wgkc1q'
     OR public.catalog_variant_id('honor','honor-x50',8192,128,NULL) <> '193500m'
     OR public.catalog_variant_id('honor','honor-x50',12288,512,NULL) <> 'w3hcu6'
     OR public.catalog_variant_id('apple','apple-iphone-1st-gen',256,4,NULL) <> 'dg03pw' THEN
    RAISE EXCEPTION 'GATE1 VERIFY FAIL: catalog_variant_id does not match the verified seed ids';
  END IF;
  RAISE NOTICE '07_identity PASS (SQL hash == verified seed pipeline)';
END $$;

-- 8) NO seed (tables must be empty — GATE 2 NOT executed)
DO $$
DECLARE
  n integer;
BEGIN
  SELECT (SELECT count(*) FROM public.catalog_models)
       + (SELECT count(*) FROM public.catalog_variants)
       + (SELECT count(*) FROM public.catalog_variant_history) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'GATE1 VERIFY FAIL: catalog tables contain % rows (seed must NOT have run)', n; END IF;
  RAISE NOTICE '08_no_seed PASS (catalog tables empty)';
END $$;

-- 9) Inventory NOT modified (raw count must still be 7 per owner mandate)
DO $$
DECLARE
  n_inventory bigint;
BEGIN
  SELECT count(*) INTO n_inventory FROM public.inventory_items;
  RAISE NOTICE '09_inventory raw COUNT(*) = % (expected 7)', n_inventory;
  IF n_inventory <> 7 THEN
    RAISE EXCEPTION 'GATE1 VERIFY FAIL: inventory_items raw count = % <> 7 (inventory must NOT be modified; log drift, stop)', n_inventory;
  END IF;
END $$;

-- 10) No GATE 3 / GATE 4 artifacts
--     GATE 3 = normalization (would rewrite storage values) -> none expected here.
--     GATE 4 = variant_id linking on inventory_items -> column must NOT exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='inventory_items'
               AND column_name='variant_id') THEN
    RAISE EXCEPTION 'GATE1 VERIFY FAIL: inventory_items.variant_id exists (GATE 4 must not have run)';
  END IF;
  RAISE NOTICE '10_no_gate34 PASS (no normalization, no variant_id column)';
END $$;

-- ============================================================================
-- Final summary evidence (owner copy)
-- ============================================================================
SELECT 'catalog_models' AS tbl, (SELECT count(*) FROM public.catalog_models) AS rows
UNION ALL SELECT 'catalog_variants', (SELECT count(*) FROM public.catalog_variants)
UNION ALL SELECT 'catalog_variant_history', (SELECT count(*) FROM public.catalog_variant_history)
UNION ALL SELECT 'inventory_items', (SELECT count(*) FROM public.inventory_items);

DO $$
BEGIN
  RAISE NOTICE 'GATE1 VERIFY: ALL CHECKS PASS (10/10). GATE 1 = APPLIED + VERIFIED. GATE 2 = READY / NOT EXECUTED. GATE 3+ = BLOCKED.';
END $$;

-- ============================================================================
-- END OF GATE 1 VERIFICATION
-- ============================================================================
