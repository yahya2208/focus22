-- ============================================================================
-- FOCUS — CATALOG CENTRAL (32 — catalog_create_model BRAND GUARD)
--
-- Type: CREATE OR REPLACE FUNCTION (security-sensitive, same pattern as 21)
-- Run as: postgres in Supabase SQL Editor AFTER 30 + 31
--
-- Adds brand existence validation to catalog_create_model:
--   Before INSERT, checks that p_brand_id exists in catalog_brands.
--   Raises '23500' if brand not found.
--
-- This replaces the live catalog_create_model (from 05-audit-fix-deploy)
-- with the same function body + brand guard + audit INSERT.
--
-- Safety:
--   CREATE OR REPLACE on existing function — preserves ownership, grants, REVOKE.
--   No catalog_models rows modified.
--   No catalog_variants rows modified.
--   No inventory_items rows modified.
--   No other RPCs modified.
--
-- Prerequisites:
--   - catalog_brands table (30)
--   - 18 brands seeded (31)
--   - All existing catalog_models.brand_id values have matching catalog_brands.slug
--
-- Rollback: Re-deploy 05-catalog-create-model-audit-fix-deploy.sql (without brand check).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_create_model(
  p_brand_id      text,
  p_name          text,
  p_series        text DEFAULT NULL,
  p_release_year  integer DEFAULT NULL,
  p_model_numbers text[] DEFAULT '{}',
  p_aliases       text[] DEFAULT '{}'
)
RETURNS public.catalog_models
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical text;
  v_row       public.catalog_models;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  IF p_brand_id IS NULL OR btrim(p_brand_id) = '' THEN
    RAISE EXCEPTION 'brand_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_release_year IS NOT NULL AND p_release_year <= 0 THEN
    RAISE EXCEPTION 'release_year must be a positive integer'
      USING ERRCODE = '22023';
  END IF;

  p_brand_id := btrim(p_brand_id);
  p_name     := btrim(p_name);

  -- ── BRAND GUARD: verify brand exists in catalog_brands ─────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.catalog_brands WHERE slug = p_brand_id) THEN
    RAISE EXCEPTION 'Unknown brand: "%. Add it via catalog_add_brand first.', p_brand_id
      USING ERRCODE = '23500';
  END IF;
  -- ── END BRAND GUARD ────────────────────────────────────────────────────────

  v_canonical := public.catalog_model_id(p_brand_id, p_name);

  IF EXISTS (SELECT 1 FROM public.catalog_models
             WHERE brand_id = p_brand_id AND name = p_name) THEN
    RAISE EXCEPTION 'model already exists: brand=% name=% (unique brand_id+name)',
      p_brand_id, p_name
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_models WHERE canonical_id = v_canonical) THEN
    RAISE EXCEPTION 'canonical_id collision: % (deterministic identity already in use)',
      v_canonical
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.catalog_models
    (canonical_id, brand_id, name, series, release_year, model_numbers, aliases, status)
  VALUES
    (v_canonical, p_brand_id, p_name, p_series, p_release_year,
     COALESCE(p_model_numbers, '{}'), COALESCE(p_aliases, '{}'), 'active')
  RETURNING * INTO v_row;

  -- ── AUDIT: record CREATE in history ────────────────────────────────────────
  INSERT INTO public.catalog_model_history (model_id, action, after, actor_user_id)
  VALUES (v_row.id, 'CREATE', to_jsonb(v_row), auth.uid());
  -- ── END AUDIT ──────────────────────────────────────────────────────────────

  RETURN v_row;
END;
$$;

-- Preserve existing grants (CREATE OR REPLACE does NOT change grants)
REVOKE ALL ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[]) TO authenticated;

-- ============================================================================
-- POST-DEPLOYMENT VERIFICATION
-- ============================================================================

-- V1: Confirm brand guard is in the function body
SELECT
  'V1' AS check_id,
  'catalog_create_model has brand guard (catalog_brands check)' AS description,
  CASE WHEN p.prosrc LIKE '%catalog_brands%slug%'
    THEN 'PASS' ELSE 'FAIL — brand guard missing'
  END AS result
FROM pg_proc p
WHERE p.proname = 'catalog_create_model'
  AND p.pronamespace = 'public'::regnamespace
  AND p.pronargs = 6;

-- V2: Confirm audit INSERT is present
SELECT
  'V2' AS check_id,
  'catalog_create_model has audit INSERT' AS description,
  CASE WHEN p.prosrc LIKE '%catalog_model_history%'
    THEN 'PASS' ELSE 'FAIL — audit INSERT missing'
  END AS result
FROM pg_proc p
WHERE p.proname = 'catalog_create_model'
  AND p.pronamespace = 'public'::regnamespace
  AND p.pronargs = 6;

-- ============================================================================
-- DONE — 32 BRAND GUARD.
--
-- Rollback: Re-deploy 05-catalog-create-model-audit-fix-deploy.sql
-- ============================================================================
