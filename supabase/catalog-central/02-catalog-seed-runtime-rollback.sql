-- ============================================================================
-- GATE 2 - ROLLBACK (removes ONLY the seeded rows; tables were empty before seed)
-- Reversed order: variants (FK RESTRICT) -> models. Fail-closed assertions after.
-- ============================================================================
BEGIN;
DO $$
DECLARE n_v integer; n_m integer;
BEGIN
  SELECT count(*) INTO n_v FROM public.catalog_variants;
  SELECT count(*) INTO n_m FROM public.catalog_models;
  IF n_v <> 1816 THEN RAISE EXCEPTION 'GATE2 ROLLBACK FAIL: variants % <> 1816 (not the seeded state)', n_v; END IF;
  IF n_m <> 866 THEN RAISE EXCEPTION 'GATE2 ROLLBACK FAIL: models % <> 866 (not the seeded state)', n_m; END IF;
END $$;
DELETE FROM public.catalog_variants;
DELETE FROM public.catalog_models;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.catalog_variants) OR EXISTS (SELECT 1 FROM public.catalog_models) THEN
    RAISE EXCEPTION 'GATE2 ROLLBACK FAIL: seed rows not fully removed';
  END IF;
  RAISE NOTICE 'GATE2 ROLLBACK PASS: catalog_models=% catalog_variants=% (empty)',
    (SELECT count(*) FROM public.catalog_models), (SELECT count(*) FROM public.catalog_variants);
END $$;
COMMIT;