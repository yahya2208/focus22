-- ============================================================================
-- FOCUS — CATALOG CENTRAL (31 — DYNAMIC BRANDS SEED)
--
-- Type: Data seed (INSERT only)
-- Run as: postgres in Supabase SQL Editor AFTER 30-catalog-brands-schema.sql
--
-- Seeds the 18 existing brands into catalog_brands.
-- slug is computed via catalog_brand_slug() matching the normalization rules.
-- aliases = '{}' for all brands (aliases design deferred to future phase).
--
-- Safety:
--   ON CONFLICT (slug) DO NOTHING — idempotent, safe to re-run.
--   No catalog_models changes.
--   No catalog_variants changes.
--   No inventory_items changes.
--
-- Verification: see bottom of file.
-- ============================================================================

-- ============================================================================
-- 0) PREREQUISITE CHECK — catalog_brands must exist
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.catalog_brands') IS NULL THEN
    RAISE EXCEPTION '31 FAIL: catalog_brands table missing — run 30 first';
  END IF;
END $$;

-- ============================================================================
-- 1) SEED 18 BRANDS
--
-- All aliases are '{}' per design decision (product/series names deferred).
-- ON CONFLICT (slug) DO NOTHING for idempotency.
-- ============================================================================
INSERT INTO public.catalog_brands (slug, display_name, aliases) VALUES
  ('apple',     'Apple',     '{}'),
  ('asus',      'Asus',      '{}'),
  ('google',    'Google',    '{}'),
  ('honor',     'Honor',     '{}'),
  ('huawei',    'Huawei',    '{}'),
  ('infinix',   'Infinix',   '{}'),
  ('motorola',  'Motorola',  '{}'),
  ('nokia',     'Nokia',     '{}'),
  ('nothing',   'Nothing',   '{}'),
  ('oneplus',   'OnePlus',   '{}'),
  ('oppo',      'Oppo',      '{}'),
  ('realme',    'Realme',    '{}'),
  ('samsung',   'Samsung',   '{}'),
  ('sony',      'Sony',      '{}'),
  ('tecno',     'Tecno',     '{}'),
  ('vivo',      'Vivo',      '{}'),
  ('xiaomi',    'Xiaomi',    '{}'),
  ('zte',       'ZTE',       '{}')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2) POST-SEED VERIFICATION
--    Run these after seed to confirm correctness.
-- ============================================================================

-- V1: Exactly 18 rows
SELECT
  'V1' AS check_id,
  'catalog_brands has 18 rows' AS description,
  CASE WHEN (SELECT count(*) FROM public.catalog_brands) = 18
    THEN 'PASS' ELSE 'FAIL'
  END AS result;

-- V2: No duplicate slugs
SELECT
  'V2' AS check_id,
  'No duplicate slugs' AS description,
  CASE WHEN (SELECT count(DISTINCT slug) FROM public.catalog_brands)
           = (SELECT count(*) FROM public.catalog_brands)
    THEN 'PASS' ELSE 'FAIL'
  END AS result;

-- V3: Every catalog_models.brand_id has a matching brand
SELECT
  'V3' AS check_id,
  'Every catalog_models.brand_id has a matching catalog_brands slug' AS description,
  CASE WHEN (
    SELECT count(*) FROM public.catalog_models cm
    WHERE NOT EXISTS (
      SELECT 1 FROM public.catalog_brands cb WHERE cb.slug = cm.brand_id
    )
  ) = 0 THEN 'PASS' ELSE 'FAIL'
  END AS result;

-- V4: catalog_models count unchanged (should be current count)
SELECT
  'V4' AS check_id,
  'catalog_models count unchanged' AS description,
  (SELECT count(*)::text || ' models' FROM public.catalog_models) AS result;

-- V5: List all brands with model counts
SELECT
  cb.slug,
  cb.display_name,
  (SELECT count(*) FROM public.catalog_models cm WHERE cm.brand_id = cb.slug) AS model_count
FROM public.catalog_brands cb
ORDER BY cb.display_name;

-- ============================================================================
-- DONE — 31 DYNAMIC BRANDS SEED.
--
-- Rollback: DELETE FROM public.catalog_brands;
-- ============================================================================
