-- ============================================================================
-- FOCUS — CATALOG CENTRAL (10-preflight — P0 PRE-APPLY PREFLIGHT)
--
-- Type: READ-ONLY verification. Run as `postgres` in Supabase SQL Editor
--       BEFORE applying 11-catalog-admin-schema-apply.sql.
--
-- HARD STOP: if any check fails, do NOT proceed with P0 apply.
-- ============================================================================

DO $$
DECLARE
  v_pass  integer := 0;
  v_fail  integer := 0;
  v_total integer := 0;
  v_inv_count bigint;
  v_inv_fp    text;
  v_models    bigint;
  v_variants  bigint;
  v_m_with_var bigint;
  v_m_without_var bigint;
  v_orphans   bigint;
BEGIN
  -- CHECK 1: catalog_models count
  v_total := v_total + 1;
  SELECT count(*) INTO v_models FROM public.catalog_models;
  IF v_models = 2178 THEN
    RAISE NOTICE 'CHECK 1 PASS: catalog_models = 2178';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 1 FAIL: catalog_models = % (expected 2178)', v_models;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 2: catalog_variants count
  v_total := v_total + 1;
  SELECT count(*) INTO v_variants FROM public.catalog_variants;
  IF v_variants = 1816 THEN
    RAISE NOTICE 'CHECK 2 PASS: catalog_variants = 1816';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 2 FAIL: catalog_variants = % (expected 1816)', v_variants;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 3: models with variants = 866
  v_total := v_total + 1;
  SELECT count(DISTINCT cm.id) INTO v_m_with_var
  FROM public.catalog_models cm
  JOIN public.catalog_variants cv ON cv.model_id = cm.id;
  IF v_m_with_var = 866 THEN
    RAISE NOTICE 'CHECK 3 PASS: models with variants = 866';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 3 FAIL: models with variants = % (expected 866)', v_m_with_var;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 4: models without variants = 1312
  v_total := v_total + 1;
  v_m_without_var := v_models - v_m_with_var;
  IF v_m_without_var = 1312 THEN
    RAISE NOTICE 'CHECK 4 PASS: models without variants = 1312';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 4 FAIL: models without variants = % (expected 1312)', v_m_without_var;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 5: inventory count = 25
  v_total := v_total + 1;
  SELECT count(*) INTO v_inv_count FROM public.inventory_items;
  IF v_inv_count = 25 THEN
    RAISE NOTICE 'CHECK 5 PASS: inventory count = 25';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 5 FAIL: inventory count = % (expected 25)', v_inv_count;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 6: inventory fingerprint
  v_total := v_total + 1;
  SELECT md5(string_agg(
      id::text || '|' || coalesce(source_key,'') || '|' || coalesce(model_id,'')
        || '|' || coalesce(quantity,0)::text || '|' || coalesce(status,'')
        || '|' || coalesce(is_published,false)::text,
      ',' ORDER BY id))
  INTO v_inv_fp
  FROM public.inventory_items;
  IF v_inv_fp = 'a515442884dd43d6fecd47ab73dec618' THEN
    RAISE NOTICE 'CHECK 6 PASS: inventory fingerprint = a515442884dd43d6fecd47ab73dec618';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 6 FAIL: inventory fingerprint = % (expected a515442884dd43d6fecd47ab73dec618)', v_inv_fp;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 7: no duplicate model canonical IDs
  v_total := v_total + 1;
  IF (SELECT count(DISTINCT canonical_id) FROM public.catalog_models) = v_models THEN
    RAISE NOTICE 'CHECK 7 PASS: no duplicate model canonical IDs';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 7 FAIL: duplicate model canonical IDs detected';
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 8: no orphan variants
  v_total := v_total + 1;
  SELECT count(*) INTO v_orphans
  FROM public.catalog_variants cv
  WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_models cm WHERE cm.id = cv.model_id
  );
  IF v_orphans = 0 THEN
    RAISE NOTICE 'CHECK 8 PASS: no orphan variants';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 8 FAIL: % orphan variants detected', v_orphans;
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 9: no duplicate variant canonical IDs
  v_total := v_total + 1;
  IF (SELECT count(DISTINCT canonical_variant_id) FROM public.catalog_variants) = v_variants THEN
    RAISE NOTICE 'CHECK 9 PASS: no duplicate variant canonical IDs';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 9 FAIL: duplicate variant canonical IDs detected';
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 10: catalog_create_model RPC exists (prerequisite)
  v_total := v_total + 1;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'catalog_create_model'
  ) THEN
    RAISE NOTICE 'CHECK 10 PASS: catalog_create_model exists';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'CHECK 10 FAIL: catalog_create_model missing (run 05 first)';
    v_fail := v_fail + 1;
  END IF;

  -- SUMMARY
  RAISE NOTICE '=== P0 PREFLIGHT: %/% PASS, % FAIL ===', v_pass, v_total, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'P0 PREFLIGHT FAIL: % of % checks failed — DO NOT PROCEED', v_fail, v_total;
  ELSE
    RAISE NOTICE 'P0 PREFLIGHT PASS — safe to apply 11 + 12';
  END IF;
END $$;
