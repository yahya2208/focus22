-- ============================================================================
-- FOCUS — CATALOG CENTRAL (07 — GUARDED CLEANUP of 2 stray test rows)
--
-- Run as `postgres` in the Supabase SQL Editor AFTER 06-...-fix-apply.sql and
-- BEFORE re-running 05-catalog-create-model-rpc-verify.sql.
--
-- PURPOSE: remove exactly the 2 rows created by the BUGGY 05 verify run
--   ('Galaxy Z Test' -> canonical 'samsung-alaxy-est')
--   ('Galaxy Z2 Test' -> canonical 'samsung-alaxy-2-est')
-- and nothing else. Fail-closed transaction: any deviation -> abort, no delete.
--
-- SCOPE: deletes ONLY these 2 canonical_ids. No other row, no other object.
-- ============================================================================

BEGIN;

-- Guard 1: exactly 2 target rows exist.
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.catalog_models
  WHERE canonical_id IN ('samsung-alaxy-est','samsung-alaxy-2-est');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CLEANUP ABORT: expected exactly 2 stray rows, found % — STOP, do not delete',
      v_n USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Guard 2: each stray row matches the exact expected identity (brand/name/status).
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.catalog_models
  WHERE canonical_id = 'samsung-alaxy-est'
    AND brand_id = 'samsung' AND name = 'Galaxy Z Test' AND status = 'active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CLEANUP ABORT: samsung-alaxy-est does not match expected row (found %) — STOP',
      v_n USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_n FROM public.catalog_models
  WHERE canonical_id = 'samsung-alaxy-2-est'
    AND brand_id = 'samsung' AND name = 'Galaxy Z2 Test' AND status = 'active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'CLEANUP ABORT: samsung-alaxy-2-est does not match expected row (found %) — STOP',
      v_n USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Guard 3: no other test artifact ids exist.
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.catalog_models
  WHERE canonical_id IN ('samsung-galaxy-z-test','samsung-galaxy-z2-test');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CLEANUP ABORT: expected 0 rows for clean test ids, found % — STOP',
      v_n USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Delete exactly the 2 stray rows.
DELETE FROM public.catalog_models
WHERE canonical_id IN ('samsung-alaxy-est','samsung-alaxy-2-est');

-- Prove: catalog_models = 866 and the 2 ids are gone.
DO $$
DECLARE
  v_total bigint;
  v_left  bigint;
BEGIN
  SELECT count(*) INTO v_total FROM public.catalog_models;
  IF v_total <> 866 THEN
    RAISE EXCEPTION 'CLEANUP FAIL: catalog_models=% after cleanup, expected 866 — STOP',
      v_total USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_left FROM public.catalog_models
  WHERE canonical_id IN ('samsung-alaxy-est','samsung-alaxy-2-est');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'CLEANUP FAIL: % stray rows still present — STOP', v_left
      USING ERRCODE = 'P0001';
  END IF;
  RAISE NOTICE 'CLEANUP PASS: exactly 2 stray rows removed, catalog_models=% (866 restored)', v_total;
END $$;

COMMIT;

-- ============================================================================
-- END OF 07 CLEANUP. Now re-run 05-catalog-create-model-rpc-verify.sql.
-- ============================================================================
