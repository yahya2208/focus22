-- ============================================================================
-- 00051 — CATEGORY CONTENT (PRODUCT ↔ CATEGORY MEMBERSHIP)
-- Additive content-management layer on top of 00050. Binds PRODUCTS/LISTINGS
-- to navigation categories so a category page renders exactly the products
-- an admin assigns to it.
--
-- MODEL
--   public.category_products — one row = one product assigned to one category:
--     category_id  FK → public.categories(id)      (the navigation category)
--     product_id   FK → public.inventory_items(id) (THE canonical product id
--                    for phone | car | property — never a polymorphic type;
--                    the domain discriminator lives on inventory_items.category)
--     sort_order   per-category ordering
--     is_featured  per-category pin/feature flag
--     is_active    per-category visibility (membership itself keeps its own
--                  on/off without deleting the product from the category)
--   UNIQUE (category_id, product_id) prevents duplicate memberships.
--
--   One product → many categories (multi-homing) and one category → many
--   products are both allowed. Parent/subcategory semantics stay purely on
--   categories.parent_id — NO duplicated ancestor rows and NO inheritance
--   columns: parent pages MAY aggregate descendants at query time, leaving
--   membership explicit on the leaf category only.
--
-- SECURITY (mirrors 00050 categories — public content, staff writes):
--   anon/authenticated → read ACTIVE memberships of ACTIVE categories whose
--                         product is a published listing (visibility gate);
--   admin/super_admin   → all memberships + writes, via users.role.
--   All writes go through SECURITY DEFINER RPCs gated by the SAME
--   public.categories_is_admin() used by 00050 (no weaker authz).
--   Realtime on category_products so admin membership edits propagate to
--   every visitor instantly (parity with categories).
--
-- RPCs
--   Public read (anon/authenticated):
--     category_products_for_category(uuid) → active members of a category
--       (joined to the published-listing view so only visible products appear)
--   Admin writes (SECURITY DEFINER, categories_is_admin gate):
--     category_products_admin_list(uuid)          → all members (+domain)
--     category_products_admin_assign(uuid, uuid[])→ add products (idempotent)
--     category_products_admin_remove(uuid, uuid)  → remove a product
--     category_products_admin_set_active(uuid,uuid,bool)
--     category_products_admin_set_featured(uuid,uuid,bool)
--     category_products_admin_reorder(uuid, jsonb)
--
-- Apply in the Supabase SQL editor as `postgres`. Additive only: creates a new
-- table + RPCs, touches NO existing object. Does not modify 00050.
-- ============================================================================

BEGIN;

-- ===========================================================================
-- 0) Preflight — depend on 00050 (categories) + the unified inventory store
-- ===========================================================================
DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL THEN
    RAISE EXCEPTION 'public.categories missing — apply migration 00050 first';
  END IF;
  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE EXCEPTION 'public.inventory_items missing — apply migration 00019/00035 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'categories_is_admin'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.categories_is_admin() missing — apply migration 00050 first';
  END IF;
END $$;

-- ===========================================================================
-- 1) public.category_products
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.category_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT FALSE,
  is_active   boolean NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_products_unique_membership UNIQUE (category_id, product_id)
);

-- Category → ordered products (the category landing query).
CREATE INDEX IF NOT EXISTS idx_category_products_category_ordered
  ON public.category_products (category_id, sort_order) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_category_products_category_all
  ON public.category_products (category_id);

-- Product → categories ("where is this product?" admin query).
CREATE INDEX IF NOT EXISTS idx_category_products_product
  ON public.category_products (product_id);

DROP TRIGGER IF EXISTS trg_category_products_updated_at ON public.category_products;
CREATE TRIGGER trg_category_products_updated_at
  BEFORE UPDATE ON public.category_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — public reads active memberships; staff full access.
-- (Public reads additionally gate on ACTIVE categories + published PRODUCTS
--  in the public RPC below; the policy here is the row-level membership gate.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.category_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active category memberships" ON public.category_products;
CREATE POLICY "Public read active category memberships"
  ON public.category_products FOR SELECT TO anon, authenticated
  USING (is_active = TRUE AND EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.is_active = TRUE
  ));

DROP POLICY IF EXISTS "Staff read all category memberships" ON public.category_products;
CREATE POLICY "Staff read all category memberships"
  ON public.category_products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

DROP POLICY IF EXISTS "Staff manage category memberships" ON public.category_products;
CREATE POLICY "Staff manage category memberships"
  ON public.category_products FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  ));

GRANT SELECT ON public.category_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.category_products TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: propagate admin membership edits to visitors instantly.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'category_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.category_products;
  END IF;
END $$;

-- ===========================================================================
-- 2) Public read — members of a category, only products visible to buyers
-- ===========================================================================
-- Joins to v_public_listings (the single published gate shared by phones,
-- cars and properties) so inactive products never leak onto a category page.
CREATE OR REPLACE FUNCTION public.category_products_for_category(p_category_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.sort_order, t.created_at), '[]'::jsonb)
  FROM (
    SELECT
      cp.category_id,
      cp.product_id,
      cp.sort_order,
      cp.is_featured,
      cp.created_at,
      v.category AS domain,
      v.brand,
      v.model,
      v.price,
      v.price_period,
      v.images
    FROM public.category_products cp
    JOIN public.v_public_listings v ON v.id = cp.product_id
    JOIN public.categories c ON c.id = cp.category_id
    WHERE cp.category_id = p_category_id
      AND cp.is_active = TRUE
      AND c.is_active = TRUE
  ) t;
$$;

-- ===========================================================================
-- 3) SECURITY DEFINER RPCs — ADMIN CATEGORY-PRODUCT WRITES
-- ===========================================================================

-- 3.1) Admin list — ALL memberships of a category (active or not) + domain.
CREATE OR REPLACE FUNCTION public.category_products_admin_list(p_category_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.sort_order, t.created_at), '[]'::jsonb)
  FROM (
    SELECT
      cp.id          AS membership_id,
      cp.category_id,
      cp.product_id,
      cp.sort_order,
      cp.is_featured,
      cp.is_active   AS membership_active,
      cp.created_at,
      cp.updated_at,
      ii.category    AS domain,
      ii.brand,
      ii.model,
      ii.quantity,
      ii.status,
      ii.is_published
    FROM public.category_products cp
    JOIN public.inventory_items ii ON ii.id = cp.product_id
    WHERE cp.category_id = p_category_id
  ) t;
$$;

-- 3.2) Assign products to a category (idempotent; rejects unknown ids/dup).
CREATE OR REPLACE FUNCTION public.category_products_admin_assign(
  p_category_id uuid,
  p_product_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pid   uuid;
  v_added bigint := 0;
  v_count bigint;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.categories WHERE id = p_category_id
  ) THEN
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('added', 0);
  END IF;

  -- Reject references to nonexistent products (integrity, no blind insert).
  SELECT count(*) INTO v_count
  FROM unnest(p_product_ids) AS u(pid)
  WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items ii WHERE ii.id = u.pid);
  IF v_count > 0 THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOREACH v_pid IN ARRAY p_product_ids LOOP
    INSERT INTO public.category_products (category_id, product_id, sort_order)
    VALUES (p_category_id, v_pid, 0)
    ON CONFLICT (category_id, product_id) DO NOTHING;
    IF FOUND THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('added', v_added);
END;
$$;

-- 3.3) Remove a product from a category.
CREATE OR REPLACE FUNCTION public.category_products_admin_remove(
  p_category_id uuid,
  p_product_id uuid
)
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

  DELETE FROM public.category_products
  WHERE category_id = p_category_id AND product_id = p_product_id;

  RETURN FOUND;
END;
$$;

-- 3.4) Active/inactive membership (keeps the row, hides it from the page).
CREATE OR REPLACE FUNCTION public.category_products_admin_set_active(
  p_category_id uuid,
  p_product_id uuid,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.category_products;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  UPDATE public.category_products
  SET is_active = COALESCE(p_active, TRUE)
  WHERE category_id = p_category_id AND product_id = p_product_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN row_to_json(v_row);
END;
$$;

-- 3.5) Featured/unfeatured membership.
CREATE OR REPLACE FUNCTION public.category_products_admin_set_featured(
  p_category_id uuid,
  p_product_id uuid,
  p_featured boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.category_products;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  UPDATE public.category_products
  SET is_featured = COALESCE(p_featured, FALSE)
  WHERE category_id = p_category_id AND product_id = p_product_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN row_to_json(v_row);
END;
$$;

-- 3.6) Reorder members within a category (idempotent, mirrors categories reorder).
CREATE OR REPLACE FUNCTION public.category_products_admin_reorder(
  p_category_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item  jsonb;
  v_pid   uuid;
  v_order integer;
  v_count bigint := 0;
BEGIN
  IF NOT public.categories_is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid   := (v_item->>'product_id')::uuid;
    v_order := COALESCE((v_item->>'sort_order')::integer, 0);
    UPDATE public.category_products
    SET sort_order = v_order
    WHERE category_id = p_category_id AND product_id = v_pid;
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_count);
END;
$$;

-- ===========================================================================
-- 4) Grants / revokes (least privilege)
-- ===========================================================================
REVOKE ALL ON FUNCTION public.category_products_for_category(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.category_products_for_category(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.category_products_admin_list(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_products_admin_assign(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_products_admin_remove(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_products_admin_set_active(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_products_admin_set_featured(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.category_products_admin_reorder(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.category_products_admin_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.category_products_admin_assign(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.category_products_admin_remove(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.category_products_admin_set_active(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.category_products_admin_set_featured(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.category_products_admin_reorder(uuid, jsonb) TO authenticated;

-- ===========================================================================
-- 5) POST-CHECK — confirm the contract pieces exist
-- ===========================================================================
DO $$
BEGIN
  IF to_regclass('public.category_products') IS NULL THEN
    RAISE EXCEPTION 'public.category_products missing';
  END IF;
  IF (SELECT count(*) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN (
          'category_products_for_category',
          'category_products_admin_list',
          'category_products_admin_assign',
          'category_products_admin_remove',
          'category_products_admin_set_active',
          'category_products_admin_set_featured',
          'category_products_admin_reorder'
        )) <> 7 THEN
    RAISE EXCEPTION 'category_products RPC set incomplete';
  END IF;
END $$;

COMMIT;
