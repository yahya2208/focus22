-- ============================================================================
-- 00055 — category → product domain resolution (generic admin product creation)
--
-- Minimal additive change to support GENERIC, category-scoped "Add Product" for
-- DB-driven navigation categories.
--
-- Background: DOMAIN ≠ NAVIGATION CATEGORY. A domain (inventory_items.category
-- = 'phone'|'car'|'property'|'produce') is the physical product type written via
-- the create path(s). A navigation category (public.categories) is a display row
-- in the sidebar. MANY navigation categories may share ONE domain (e.g. الخضروات
-- and الفواكه both → derive 'produce' products) and must NOT be special-cased by
-- name/slug — resolution must be data-driven.
--
-- public.categories previously carried NO domain hint, so the client could not
-- know (a) whether a category can create products or (b) which form to open.
-- This migration adds a nullable `domain` hint (empty = display-only category,
-- no product creation) and threads it through the admin create/update RPCs so an
-- admin can point any category at a product domain from the category editor.
--
-- Rollback: ALTER TABLE public.categories DROP COLUMN IF EXISTS domain;
--           (RPCs are CREATE OR REPLACE, the new column is restored on re-apply).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Add the domain hint column.
--    ''      → display-only category (no "Add Product" in admin products panel)
--    'phone' → products created via the phone catalog flow
--    'car'   → listing_create (car_details)    [domain='car']
--    'property' → listing_create (property_details)
--    'produce'  → listing_create (produce_details)   (خضروات / فواكه / …)
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT '';

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS chk_categories_domain;

ALTER TABLE public.categories
  ADD CONSTRAINT chk_categories_domain
    CHECK (domain IN ('', 'phone', 'car', 'property', 'produce'));

-- ---------------------------------------------------------------------------
-- 2) categories_admin_create — read + persist `domain`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.categories_admin_create(p_category jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   public.categories;
  v_slug  text;
  v_name  text;
  v_name_ar text;
  v_mode  text;
  v_theme text;
  v_domain text;
  v_parent uuid;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  v_slug    := lower(btrim(COALESCE(p_category->>'slug', '')));
  v_name    := btrim(COALESCE(p_category->>'name', ''));
  v_name_ar := btrim(COALESCE(p_category->>'name_ar', ''));
  v_mode    := COALESCE(p_category->>'display_mode', 'storefront');
  v_theme   := COALESCE(p_category->>'theme', 'technology');
  v_domain  := COALESCE(p_category->>'domain', '');
  v_parent  := (p_category->>'parent_id')::uuid;

  IF v_name = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_slug = '' OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('storefront','phones','games') THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_MODE' USING ERRCODE = '22023';
  END IF;
  IF v_theme NOT IN ('fresh','technology','premium','playful','elegant','warm','minimal') THEN
    RAISE EXCEPTION 'INVALID_THEME' USING ERRCODE = '22023';
  END IF;
  IF v_domain NOT IN ('', 'phone', 'car', 'property', 'produce') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_DOMAIN' USING ERRCODE = '22023';
  END IF;
  IF v_parent IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = v_parent
  ) THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.categories (
    slug, name, name_ar, description, description_ar, icon, cover_image,
    parent_id, sort_order, is_active, display_mode, theme,
    delivery_available, is_featured, domain
  )
  VALUES (
    v_slug, v_name, v_name_ar,
    COALESCE(p_category->>'description', ''),
    COALESCE(p_category->>'description_ar', ''),
    COALESCE(p_category->>'icon', ''),
    COALESCE(p_category->>'cover_image', ''),
    v_parent,
    COALESCE((p_category->>'sort_order')::integer, 0),
    COALESCE((p_category->>'is_active')::boolean, TRUE),
    v_mode, v_theme,
    COALESCE((p_category->>'delivery_available')::boolean, FALSE),
    COALESCE((p_category->>'is_featured')::boolean, FALSE),
    v_domain
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) categories_admin_update — allow `domain` in the mutable whitelist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.categories_admin_update(p_id uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row  public.categories;
  v_slug text;
  v_name text;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  SELECT * INTO v_row FROM public.categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- mutable-whitelist validation (client mirrors these)
  IF p_changes ? 'slug' THEN
    v_slug := lower(btrim(COALESCE(p_changes->>'slug', '')));
    IF v_slug = '' OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = v_slug AND id <> p_id) THEN
      RAISE EXCEPTION 'SLUG_TAKEN' USING ERRCODE = '23505';
    END IF;
  END IF;
  IF p_changes ? 'name' THEN
    v_name := btrim(COALESCE(p_changes->>'name', ''));
    IF v_name = '' THEN
      RAISE EXCEPTION 'NAME_REQUIRED' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_changes ? 'display_mode'
     AND p_changes->>'display_mode' NOT IN ('storefront','phones','games') THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_MODE' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'theme'
     AND p_changes->>'theme' NOT IN ('fresh','technology','premium','playful','elegant','warm','minimal') THEN
    RAISE EXCEPTION 'INVALID_THEME' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'domain'
     AND p_changes->>'domain' NOT IN ('', 'phone', 'car', 'property', 'produce') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_DOMAIN' USING ERRCODE = '22023';
  END IF;
  IF p_changes ? 'parent_id' AND p_changes->>'parent_id' IS NOT NULL
     AND p_changes->>'parent_id' <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = (p_changes->>'parent_id')::uuid) THEN
      RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  UPDATE public.categories SET
    slug         = COALESCE(NULLIF(p_changes->>'slug', ''), slug),
    name         = COALESCE(NULLIF(p_changes->>'name', ''), name),
    name_ar      = COALESCE(p_changes->>'name_ar', name_ar),
    description  = COALESCE(p_changes->>'description', description),
    description_ar = COALESCE(p_changes->>'description_ar', description_ar),
    icon         = CASE WHEN p_changes ? 'icon' THEN COALESCE(p_changes->>'icon', '') ELSE icon END,
    cover_image  = CASE WHEN p_changes ? 'cover_image' THEN COALESCE(p_changes->>'cover_image', '') ELSE cover_image END,
    parent_id    = CASE
                     WHEN p_changes ? 'parent_id' THEN NULLIF(NULLIF(p_changes->>'parent_id', ''), 'null')::uuid
                     ELSE parent_id
                   END,
    sort_order   = CASE WHEN p_changes ? 'sort_order' THEN COALESCE((p_changes->>'sort_order')::integer, 0) ELSE sort_order END,
    is_active    = CASE WHEN p_changes ? 'is_active' THEN COALESCE((p_changes->>'is_active')::boolean, TRUE) ELSE is_active END,
    display_mode = COALESCE(NULLIF(p_changes->>'display_mode', ''), display_mode),
    theme        = COALESCE(NULLIF(p_changes->>'theme', ''), theme),
    delivery_available = CASE WHEN p_changes ? 'delivery_available'
                              THEN COALESCE((p_changes->>'delivery_available')::boolean, FALSE) ELSE delivery_available END,
    is_featured  = CASE WHEN p_changes ? 'is_featured' THEN COALESCE((p_changes->>'is_featured')::boolean, FALSE) ELSE is_featured END,
    domain       = CASE WHEN p_changes ? 'domain' THEN COALESCE(p_changes->>'domain', '') ELSE domain END
  WHERE id = p_id;

  SELECT * INTO v_row FROM public.categories WHERE id = p_id;
  RETURN to_jsonb(v_row);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Seed the produce-capable navigation categories (خضروات / فواكه → produce).
--    Keep it data-driven: only these two share the produce domain. Any future
--    produce-capable category is created via the category editor's domain field,
--    WITHOUT touching this migration or adding client branches.
-- ---------------------------------------------------------------------------
UPDATE public.categories
   SET domain = 'produce'
 WHERE slug IN ('vegetables', 'fruits')
   AND domain = '';

COMMIT;
