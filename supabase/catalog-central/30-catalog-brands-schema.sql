-- ============================================================================
-- FOCUS — CATALOG CENTRAL (30 — DYNAMIC BRANDS SCHEMA)
--
-- Type: Additive (CREATE TABLE / FUNCTION / POLICY only)
-- Run as: postgres in Supabase SQL Editor
--
-- Creates:
--   1. catalog_brands table
--   2. catalog_brand_slug() helper (IMMUTABLE, internal)
--   3. catalog_list_brands() RPC (public read)
--   4. catalog_add_brand() RPC (admin write)
--   5. RLS policies
--
-- Safety:
--   Additivity guard: fails if catalog_brands already exists.
--   No catalog_models changes.
--   No catalog_variants changes.
--   No inventory_items changes.
--
-- Rollback: DROP TABLE + DROP FUNCTION (see bottom of file).
-- ============================================================================

-- ============================================================================
-- 0) ADDITIVITY GUARD
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.catalog_brands') IS NOT NULL THEN
    RAISE EXCEPTION '30 FAIL: catalog_brands already exists (not additive)';
  END IF;
END $$;

-- ============================================================================
-- 1) TABLE: catalog_brands
-- ============================================================================
CREATE TABLE public.catalog_brands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  aliases       text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.catalog_brands IS 'Dynamic brand registry for catalog admin.';
COMMENT ON COLUMN public.catalog_brands.slug IS 'Lowercased, trimmed brand identifier. Generated from display_name, never entered by user.';
COMMENT ON COLUMN public.catalog_brands.display_name IS 'Human-readable brand name as entered by admin.';
COMMENT ON COLUMN public.catalog_brands.aliases IS 'Optional search aliases for future use. Empty by default.';

-- ============================================================================
-- 2) HELPER: catalog_brand_slug() — IMMUTABLE, internal
--
-- Normalization rules (deterministic):
--   1. btrim() — remove leading/trailing whitespace
--   2. lower() — case-insensitive
--   3. regexp_replace([^a-z0-9]+, '-', 'g') — non-alphanumeric → hyphen
--   4. btrim(result, '-') — remove leading/trailing hyphens
--   5. Reject empty result (raise validation error)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.catalog_brand_slug(p_display_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  v_slug := btrim(p_display_name);
  v_slug := lower(v_slug);
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF v_slug IS NULL OR v_slug = '' THEN
    RAISE EXCEPTION 'Brand slug is empty after normalization. display_name="%".',
      p_display_name
      USING ERRCODE = '22023';
  END IF;
  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_brand_slug(text) FROM PUBLIC;

-- ============================================================================
-- 3) RPC: catalog_list_brands() — public read, returns all brands
-- ============================================================================
CREATE OR REPLACE FUNCTION public.catalog_list_brands()
RETURNS SETOF public.catalog_brands
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.catalog_brands ORDER BY display_name;
$$;

REVOKE ALL ON FUNCTION public.catalog_list_brands() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_list_brands() FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_list_brands() TO authenticated;

-- ============================================================================
-- 4) RPC: catalog_add_brand() — admin write, creates new brand
--
-- Security pattern: identical to catalog_create_model, catalog_add_brand, etc.
--   - SECURITY DEFINER
--   - SET search_path = public
--   - catalog_is_admin() gate
--   - REVOKE ALL FROM PUBLIC
--   - REVOKE FROM anon
--   - GRANT TO authenticated
-- ============================================================================
CREATE OR REPLACE FUNCTION public.catalog_add_brand(
  p_display_name text,
  p_aliases      text[] DEFAULT '{}'
)
RETURNS public.catalog_brands
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_row  public.catalog_brands;
BEGIN
  -- Authorization: admin only (same gate as all catalog admin RPCs)
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  -- Validate input
  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name is required'
      USING ERRCODE = '22023';
  END IF;

  -- Normalize slug from display_name
  v_slug := public.catalog_brand_slug(p_display_name);

  -- Duplicate check (UNIQUE constraint also enforces this)
  IF EXISTS (SELECT 1 FROM public.catalog_brands WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Brand "%" already exists (slug: "%")', p_display_name, v_slug
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.catalog_brands (slug, display_name, aliases)
  VALUES (v_slug, btrim(p_display_name), COALESCE(p_aliases, '{}'))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_add_brand(text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_add_brand(text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_add_brand(text, text[]) TO authenticated;

-- ============================================================================
-- 5) ROW LEVEL SECURITY
--    Public read (all users can see brands for dropdowns).
--    Write via RPC only (SECURITY DEFINER, no write RLS policies needed).
--    Matches pattern of catalog_models and catalog_variants.
-- ============================================================================
ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog brands public read"
  ON public.catalog_brands
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- 6) INDEXES
-- ============================================================================
CREATE INDEX catalog_brands_slug_idx
  ON public.catalog_brands (slug);

-- ============================================================================
-- DONE — 30 DYNAMIC BRANDS SCHEMA.
--
-- Next: 31-catalog-brands-seed.sql (seed 18 brands)
-- Rollback:
--   DROP TABLE IF EXISTS public.catalog_brands;
--   DROP FUNCTION IF EXISTS public.catalog_brand_slug(text);
--   DROP FUNCTION IF EXISTS public.catalog_list_brands();
--   DROP FUNCTION IF EXISTS public.catalog_add_brand(text, text[]);
-- ============================================================================
