-- ============================================================================
-- 00050 — CATEGORIES (DB-DRIVEN MULTI-SERVICE NAVIGATION) + DELIVERY FOUNDATION
-- Self-contained, additive layer. Builds ON existing tables (users, zones)
-- but modifies none of the frozen game/catalog/inventory/ads migrations.
--
-- CATEGORY MODEL:
--   public.categories — one row per category (top-level + subcategories via
--   parent_id). The Home sidebar + category landing pages render EXCLUSIVELY
--   from this table: nothing is hard-coded in the client. Categories carry
--   bilingual names/descriptions, an emoji icon, a cover image (storage path
--   or absolute http(s) URL), hierarchy, ordering (sort_order), active flag,
--   a rendering display_mode and a theme preset id.
--
--   display_mode ∈ {storefront, phones, games}:
--     - 'storefront'  generic landing (cover, description, subcategory grid,
--                     featured links, delivery pill when enabled)
--     - 'phones'      reuses the existing phone inventory/Showroom data the
--                     same way the app already exposes it (v_public_inventory)
--     - 'games'       launcher cards that deep-link into the existing games
--                     (e.g. the Tic-Tac-Toe intro flow)
--   theme ∈ {fresh, technology, premium, playful, elegant, warm, minimal}
--     (client-side preset registry maps these to design-system tokens)
--
-- RLS (mirrors the ads model — public content):
--   anon/authenticated  → SELECT is_active = TRUE
--   admin/super_admin   → SELECT all rows; INSERT/UPDATE/DELETE (users.role)
--   Storage bucket `category-covers` (public read; admin write).
--   Realtime on `categories` so admin edits propagate instantly.
--
-- ADMIN WRITES — all go through SECURITY DEFINER RPCs gated by
-- public.categories_is_admin() (same users.role check as catalog_is_admin):
--   categories_admin_create, categories_admin_update,
--   categories_admin_delete, categories_admin_set_status,
--   categories_admin_reorder.
--
-- DELIVERY FOUNDATION (Phase I scope — zones/fees/orders only):
--   public.delivery_zones — named serviceable zones (city areas).
--   public.delivery_fees  — fee tiers per zone (min/max subtotal, fee, ETA).
--   public.orders         — minimal order header (customer, zone, totals).
--   public.order_items    — order lines (category-scoped product references).
--   RPCs: delivery_create_order (SECURITY DEFINER, authenticated only) and
--   delivery_estimate (public, for the estimate pill on category pages).
--   Zones/fees are public read (RLS); orders are NEVER directly accessible to
--   anon/authenticated (write flows through the RPC only).
--
-- Apply in the Supabase SQL editor as `postgres`. Rollback: drop the four
-- tables (+ their RPCs drop automatically). Post-apply verification: see
-- supabase/verify/categories_delivery.sql.
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 1) public.categories
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE,
  name               text NOT NULL,
  name_ar            text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',
  description_ar     text NOT NULL DEFAULT '',
  icon               text NOT NULL DEFAULT '',
  cover_image        text NOT NULL DEFAULT '',
  parent_id          uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  sort_order         integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT TRUE,
  display_mode       text NOT NULL DEFAULT 'storefront'
                     CHECK (display_mode IN ('storefront', 'phones', 'games')),
  theme              text NOT NULL DEFAULT 'technology'
                     CHECK (theme IN ('fresh', 'technology', 'premium', 'playful', 'elegant', 'warm', 'minimal')),
  delivery_available boolean NOT NULL DEFAULT FALSE,
  is_featured        boolean NOT NULL DEFAULT FALSE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_ordering
  ON public.categories (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_active_ordering
  ON public.categories (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_featured
  ON public.categories (is_active, is_featured, sort_order);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — public reads active rows; staff (admin/super_admin) full access.
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
CREATE POLICY "Public read active categories"
  ON public.categories FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Staff read all categories" ON public.categories;
CREATE POLICY "Staff read all categories"
  ON public.categories FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Staff manage categories" ON public.categories;
CREATE POLICY "Staff manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket: category-covers (public read; admin write)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('category-covers', 'category-covers', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read category-covers" ON storage.objects;
CREATE POLICY "Public read category-covers"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'category-covers');

DROP POLICY IF EXISTS "Staff upload category-covers" ON storage.objects;
CREATE POLICY "Staff upload category-covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'category-covers'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff update category-covers" ON storage.objects;
CREATE POLICY "Staff update category-covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'category-covers'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff delete category-covers" ON storage.objects;
CREATE POLICY "Staff delete category-covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'category-covers'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- ---------------------------------------------------------------------------
-- Realtime: propagate admin category edits to visitors instantly.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
  END IF;
END $$;

-- ===========================================================================
-- 2) Delivery foundation
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  name_ar    text NOT NULL DEFAULT '',
  is_active  boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_fees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id               uuid NOT NULL REFERENCES public.delivery_zones(id) ON DELETE CASCADE,
  min_amount            numeric(10,2) NOT NULL DEFAULT 0,
  max_amount            numeric(10,2),   -- NULL = no upper bound
  fee                   numeric(10,2) NOT NULL DEFAULT 0,
  delivery_minutes_min  integer NOT NULL DEFAULT 30,
  delivery_minutes_max  integer NOT NULL DEFAULT 45,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (max_amount IS NULL OR max_amount > min_amount),
  CHECK (delivery_minutes_max >= delivery_minutes_min)
);

CREATE INDEX IF NOT EXISTS idx_delivery_fees_zone ON public.delivery_fees (zone_id, min_amount);

CREATE TABLE IF NOT EXISTS public.orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number   text NOT NULL UNIQUE,
  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  zone_id        uuid REFERENCES public.delivery_zones(id),
  address        text NOT NULL DEFAULT '',
  subtotal       numeric(10,2) NOT NULL DEFAULT 0,
  delivery_fee   numeric(10,2) NOT NULL DEFAULT 0,
  total          numeric(10,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  notes          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  category_id  uuid REFERENCES public.categories(id),
  catalog_ref  text NOT NULL DEFAULT '',   -- product reference from that category's source
  name         text NOT NULL,
  name_ar      text NOT NULL DEFAULT '',
  unit_price   numeric(10,2) NOT NULL DEFAULT 0,
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_zone ON public.orders (zone_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders (created_at DESC);

-- Human-facing FC-XXXXXX order numbers come from an explicit sequence: the
-- orders PK is a UUID (gen_random_uuid), so there is no implicit integer
-- sequence to NEXT VALUE from. Created if absent so delivery_create_order is
-- idempotent across re-applies.
CREATE SEQUENCE IF NOT EXISTS public.orders_id_seq;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Zones/fees are public read-only (estimate pill + checkout preview).
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_fees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active delivery zones" ON public.delivery_zones;
CREATE POLICY "Public read active delivery zones"
  ON public.delivery_zones FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Staff read all delivery zones" ON public.delivery_zones;
CREATE POLICY "Staff read all delivery zones"
  ON public.delivery_zones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Staff manage delivery zones" ON public.delivery_zones;
CREATE POLICY "Staff manage delivery zones"
  ON public.delivery_zones FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Public read delivery fees" ON public.delivery_fees;
CREATE POLICY "Public read delivery fees"
  ON public.delivery_fees FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.delivery_zones z
    WHERE z.id = zone_id AND z.is_active = TRUE
  ));

DROP POLICY IF EXISTS "Staff manage delivery fees" ON public.delivery_fees;
CREATE POLICY "Staff manage delivery fees"
  ON public.delivery_fees FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

-- Orders: NO direct anon/authenticated access (defense in depth — writes flow
-- through the SECURITY DEFINER RPC below). Staff read for the (future) admin
-- order management surface.
DROP POLICY IF EXISTS "Staff read orders" ON public.orders;
CREATE POLICY "Staff read orders"
  ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
CREATE POLICY "Staff manage orders"
  ON public.orders FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Staff read order items" ON public.order_items;
CREATE POLICY "Staff read order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.users u ON u.id = auth.uid()
    WHERE o.id = order_id AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Staff manage order items" ON public.order_items;
CREATE POLICY "Staff manage order items"
  ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT SELECT ON public.delivery_fees  TO anon, authenticated;
GRANT SELECT ON public.orders         TO authenticated;
GRANT SELECT ON public.order_items    TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.delivery_fees  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.orders         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.order_items    TO authenticated;

-- ===========================================================================
-- 3) SECURITY DEFINER RPCs — ADMIN CATEGORY WRITES
-- ===========================================================================

-- 3.0) Role check helper (mirrors catalog_is_admin / inventory_is_admin).
CREATE OR REPLACE FUNCTION public.categories_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin','super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.categories_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categories_is_admin() TO authenticated;

-- 3.1) categories_admin_create(p_category jsonb) → jsonb
--      Creates a top-level or subcategory. Required fields: slug, name, name_ar.
--      Validates display_mode/theme whitelists + slug slug-format/availability.
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
  IF v_parent IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = v_parent
  ) THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.categories (
    slug, name, name_ar, description, description_ar, icon, cover_image,
    parent_id, sort_order, is_active, display_mode, theme,
    delivery_available, is_featured
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
    COALESCE((p_category->>'is_featured')::boolean, FALSE)
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- 3.2) categories_admin_update(p_id uuid, p_changes jsonb) → jsonb
--      Partial update: only keys present in p_changes are applied.
--      slug uniqueness + whitelist validation; empty name rejected.
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
    is_featured  = CASE WHEN p_changes ? 'is_featured' THEN COALESCE((p_changes->>'is_featured')::boolean, FALSE) ELSE is_featured END
  WHERE id = p_id;

  SELECT * INTO v_row FROM public.categories WHERE id = p_id;
  RETURN to_jsonb(v_row);
END;
$$;

-- 3.3) categories_admin_delete(p_id uuid) → boolean
--      Blocks deletion when the category still has children (hierarchy guard).
CREATE OR REPLACE FUNCTION public.categories_admin_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_id) THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE parent_id = p_id) THEN
    RAISE EXCEPTION 'CATEGORY_HAS_CHILDREN' USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.categories WHERE id = p_id;
  RETURN TRUE;
END;
$$;

-- 3.4) categories_admin_set_status(p_id uuid, p_active boolean) → jsonb
CREATE OR REPLACE FUNCTION public.categories_admin_set_status(p_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.categories;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  UPDATE public.categories
  SET is_active = COALESCE(p_active, TRUE)
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- 3.5) categories_admin_reorder(p_items jsonb) → jsonb (applies sort orders)
--      p_items: [{ "id": uuid, "sort_order": int }, ...] — idempotent.
CREATE OR REPLACE FUNCTION public.categories_admin_reorder(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item   jsonb;
  v_id     uuid;
  v_order  integer;
  v_count  bigint := 0;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_id    := (v_item->>'id')::uuid;
    v_order := COALESCE((v_item->>'sort_order')::integer, 0);
    IF EXISTS (SELECT 1 FROM public.categories WHERE id = v_id) THEN
      UPDATE public.categories SET sort_order = v_order WHERE id = v_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_count);
END;
$$;

-- ===========================================================================
-- 4) SECURITY DEFINER RPCs — DELIVERY
-- ===========================================================================

-- 4.1) delivery_estimate(p_zone_id uuid, p_subtotal numeric) → jsonb
--      Public-safe estimate for the "Delivery available" pill.
CREATE OR REPLACE FUNCTION public.delivery_estimate(p_zone_id uuid, p_subtotal numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee     numeric;
  v_min     integer;
  v_max     integer;
  v_ok      boolean := FALSE;
BEGIN
  IF p_zone_id IS NULL OR p_subtotal IS NULL OR p_subtotal < 0 THEN
    RETURN jsonb_build_object('available', FALSE);
  END IF;

  SELECT fee, delivery_minutes_min, delivery_minutes_max INTO v_fee, v_min, v_max
  FROM public.delivery_fees f
  WHERE f.zone_id = p_zone_id
    AND p_subtotal >= f.min_amount
    AND (f.max_amount IS NULL OR p_subtotal <= f.max_amount)
  ORDER BY f.min_amount DESC
  LIMIT 1;

  IF FOUND THEN
    v_ok := TRUE;
  ELSE
    -- fall back to the cheapest tier when no tier matches the subtotal
    SELECT fee, delivery_minutes_min, delivery_minutes_max INTO v_fee, v_min, v_max
    FROM public.delivery_fees f
    WHERE f.zone_id = p_zone_id
    ORDER BY f.min_amount ASC, f.fee ASC
    LIMIT 1;
    IF FOUND THEN
      v_ok := TRUE;
    END IF;
  END IF;

  IF NOT v_ok OR v_fee IS NULL THEN
    RETURN jsonb_build_object('available', FALSE);
  END IF;

  RETURN jsonb_build_object(
    'available', TRUE,
    'fee', v_fee,
    'minutes_min', v_min,
    'minutes_max', v_max
  );
END;
$$;

-- 4.2) delivery_create_order(p_customer jsonb, p_items jsonb) → jsonb
--      Creates an order + items atomically. Validates the zone is active,
--      computes the delivery fee via delivery_estimate, generates FC-XXXXXX.
--      ORDER ITEMS SCOPE: the order is created in 'pending' status. Full
--      lifecycle (confirm/prepare/out/deliver/cancel) is Phase I+; this RPC is
--      the foundation the Future order-management surface builds on.
CREATE OR REPLACE FUNCTION public.delivery_create_order(p_customer jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_zone_id     uuid;
  v_cust_name   text;
  v_cust_phone  text;
  v_address     text;
  v_notes       text;
  v_item        jsonb;
  v_subtotal    numeric := 0;
  v_fee         numeric := 0;
  v_min_min     integer := 30;
  v_min_max     integer := 45;
  v_order_id    uuid;
  v_order_no    text;
  v_estimate    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  v_cust_name  := btrim(COALESCE(p_customer->>'name', ''));
  v_cust_phone := btrim(COALESCE(p_customer->>'phone', ''));
  v_zone_id    := (p_customer->>'zone_id')::uuid;
  v_address    := btrim(COALESCE(p_customer->>'address', ''));
  v_notes      := btrim(COALESCE(p_customer->>'notes', ''));

  IF v_cust_name = '' OR v_cust_phone = '' THEN
    RAISE EXCEPTION 'CUSTOMER_INFO_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_zone_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.delivery_zones z WHERE z.id = v_zone_id AND z.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'ZONE_NOT_ACTIVE' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- totals + fee
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_subtotal := v_subtotal
      + COALESCE((v_item->>'unit_price')::numeric, 0)
      * GREATEST(COALESCE((v_item->>'quantity')::integer, 1), 1);
  END LOOP;

  SELECT * INTO v_estimate FROM public.delivery_estimate(v_zone_id, v_subtotal);
  IF COALESCE((v_estimate->>'available')::boolean, FALSE) THEN
    v_fee     := COALESCE((v_estimate->>'fee')::numeric, 0);
    v_min_min := COALESCE((v_estimate->>'minutes_min')::integer, 30);
    v_min_max := COALESCE((v_estimate->>'minutes_max')::integer, 45);
  END IF;

  v_order_no := 'FC-' || lpad((nextval('public.orders_id_seq')::bigint % 1000000)::text, 6, '0');

  INSERT INTO public.orders (
    order_number, customer_name, customer_phone, zone_id, address,
    subtotal, delivery_fee, total, status, notes
  )
  VALUES (
    v_order_no, v_cust_name, v_cust_phone, v_zone_id, v_address,
    v_subtotal, v_fee, v_subtotal + v_fee, 'pending', v_notes
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (order_id, category_id, catalog_ref, name, name_ar, unit_price, quantity)
    VALUES (
      v_order_id,
      NULLIF(NULLIF(v_item->>'category_id', ''), 'null')::uuid,
      COALESCE(v_item->>'catalog_ref', ''),
      COALESCE(v_item->>'name', ''),
      COALESCE(v_item->>'name_ar', ''),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      GREATEST(COALESCE((v_item->>'quantity')::integer, 1), 1)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_no,
    'status', 'pending',
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee,
    'eta_minutes_min', v_min_min,
    'eta_minutes_max', v_min_max
  );
END;
$$;

-- ===========================================================================
-- 5) Grant / revoke execution (least privilege)
-- ===========================================================================
REVOKE ALL ON FUNCTION public.categories_admin_create(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.categories_admin_update(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.categories_admin_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.categories_admin_set_status(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.categories_admin_reorder(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_estimate(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.categories_admin_create(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.categories_admin_update(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.categories_admin_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.categories_admin_set_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.categories_admin_reorder(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_estimate(uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated;

-- ===========================================================================
-- 6) SEED — idempotent baseline categories + zones + fees
--    Categories are DB-driven: Home/landing navigation renders this data.
-- ===========================================================================
INSERT INTO public.categories (slug, name, name_ar, description, description_ar, icon, parent_id, sort_order, is_active, display_mode, theme, delivery_available, is_featured) VALUES
  ('phones',       'Phones',       'الهواتف',   'Exchangeable phones available today — new, used and refurbished.',       'أجهزة قابلة للمبادلة متوفرة اليوم — جديدة ومستعملة ومجددة.',       '📱', NULL, 10, TRUE, 'phones',    'technology', FALSE, TRUE),
  ('fresh-market', 'Fresh Market', 'السوق الطازج', 'Fresh produce and market goods delivered to your door.',              'منتجات طازجة وأغراض سوق تُوصَّل حتى باب منزلك.',                  '🥬', NULL, 20, TRUE, 'storefront','fresh',      TRUE,  TRUE),
  ('groceries',    'Groceries',    'البقالة',      'Daily groceries and pantry staples, conveniently delivered.',          'أغراض البقالة اليومية والمواد الأساسية مع توصيل مريح.',            '🛒', NULL, 30, TRUE, 'storefront','minimal',    TRUE,  FALSE),
  ('desserts',     'Desserts',     'الحلويات',     'Sweet treats and desserts, made fresh.',                               'حلويات ومُعدّات طازجة.',                                        '🍰', NULL, 40, TRUE, 'storefront','warm',       TRUE,  FALSE),
  ('games',        'Games',        'الألعاب',      'FOCUS games and challenges that train your mind.',                     'ألعاب وتحديات FOCUS لتدريب ذهنك.',                               '🎮', NULL, 50, TRUE, 'games',     'playful',    FALSE, FALSE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name, name_ar, description, description_ar, icon, parent_id, sort_order, is_active, display_mode, theme, delivery_available, is_featured) VALUES
  ('smartphones',      'Smartphones',      'الهواتف الذكية',      'Latest smartphones at FOCUS prices.',       'أحدث الهواتف الذكية بأسعار FOCUS.',        '📱', (SELECT id FROM public.categories WHERE slug = 'phones'),       10, TRUE, 'phones', 'technology', FALSE, FALSE),
  ('accessories',      'Accessories',      'الإكسسوارات',         'Cases, chargers and more.',                  'أغطية وشواحن وغيرها.',                       '🎧', (SELECT id FROM public.categories WHERE slug = 'phones'),       20, TRUE, 'storefront', 'technology', FALSE, FALSE),
  ('vegetables',       'Vegetables',       'الخضروات',            'Farm-fresh seasonal vegetables.',            'خضروات موسمية طازجة من المزرعة.',           '🥦', (SELECT id FROM public.categories WHERE slug = 'fresh-market'), 10, TRUE, 'storefront', 'fresh', TRUE, FALSE),
  ('fruits',           'Fruits',           'الفواكه',             'Sweet, ripe fruit selection.',               'اختيار فواكه ناضجة وحلوة.',                  '🍎', (SELECT id FROM public.categories WHERE slug = 'fresh-market'), 20, TRUE, 'storefront', 'fresh', TRUE, FALSE),
  ('meat-poultry',     'Meat & Poultry',   'اللحوم والدواجن',      'Quality cuts and whole poultry.',            'قطع لحم ودواجن بجودة عالية.',                '🍗', (SELECT id FROM public.categories WHERE slug = 'fresh-market'), 30, TRUE, 'storefront', 'premium', TRUE, FALSE),
  ('bakery',           'Bakery',           'المخبوزات',           'Fresh bread and pastries.',                  'خبز طازج ومخبوزات.',                         '🥖', (SELECT id FROM public.categories WHERE slug = 'groceries'),    10, TRUE, 'storefront', 'warm', TRUE, FALSE),
  ('dairy-eggs',       'Dairy & Eggs',     'الألبان والبيض',       'Dairy and eggs for breakfast essentials.',   'ألبان وبيض لوجبة الفطور.',                   '🥛', (SELECT id FROM public.categories WHERE slug = 'groceries'),    20, TRUE, 'storefront', 'minimal', TRUE, FALSE),
  ('pantry-staples',   'Pantry Staples',   'المواد الأساسية',      'Rice, oil, flour and everyday staples.',     'أرز وزيت ودقيق ومواد أساسية يومية.',        '🍚', (SELECT id FROM public.categories WHERE slug = 'groceries'),    30, TRUE, 'storefront', 'minimal', TRUE, FALSE),
  ('cakes',            'Cakes',            'الكيك',               'Cakes for every occasion.',                  'كيك لكل المناسبات.',                         '🎂', (SELECT id FROM public.categories WHERE slug = 'desserts'),     10, TRUE, 'storefront', 'warm', TRUE, FALSE),
  ('ice-cream',        'Ice Cream',        'الآيس كريم',          'Cold, creamy desserts.',                     'حلويات باردة كريمية.',                       '🍨', (SELECT id FROM public.categories WHERE slug = 'desserts'),     20, TRUE, 'storefront', 'playful', TRUE, FALSE),
  ('brain-games',      'Brain Games',      'ألعاب الذكاء',         'Reaction and focus challenges.',             'تحديات سرعة رد الفعل والتركيز.',            '🧠', (SELECT id FROM public.categories WHERE slug = 'games'),        10, TRUE, 'games', 'technology', FALSE, FALSE),
  ('tic-tac-toe',      'Tic-Tac-Toe',      'إكس-أو',               'Play your favorite board game solo or live.', 'العب لعبتك المفضلة منفرداً أو مباشرة.',      '⭕', (SELECT id FROM public.categories WHERE slug = 'games'),        20, TRUE, 'games', 'playful', FALSE, FALSE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.delivery_zones (name, name_ar, is_active) VALUES
  ('City Center',   'وسط المدينة', TRUE),
  ('Suburbs',       'الضواحي',     TRUE),
  ('Outskirts',     'الأطراف',     TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.delivery_fees (zone_id, min_amount, max_amount, fee, delivery_minutes_min, delivery_minutes_max)
SELECT z.id, 0, NULL, 350.00, 30, 45 FROM public.delivery_zones z
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_fees f WHERE f.zone_id = z.id);

-- ===========================================================================
-- 7) POST-CHECK — confirm the contract pieces exist
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'categories_admin_create') THEN
    RAISE EXCEPTION 'categories_admin_create missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'categories_admin_update') THEN
    RAISE EXCEPTION 'categories_admin_update missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'categories_admin_delete') THEN
    RAISE EXCEPTION 'categories_admin_delete missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'categories_admin_set_status') THEN
    RAISE EXCEPTION 'categories_admin_set_status missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'categories_admin_reorder') THEN
    RAISE EXCEPTION 'categories_admin_reorder missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delivery_estimate') THEN
    RAISE EXCEPTION 'delivery_estimate missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delivery_create_order') THEN
    RAISE EXCEPTION 'delivery_create_order missing';
  END IF;
END $$;

COMMIT;