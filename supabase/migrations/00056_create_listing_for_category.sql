-- ============================================================================
-- FOCUS — CREATE-LISTING-FOR-CATEGORY ORCHESTRATION RPC (MIGRATION 00056)
--
-- Migration number: 00056 (after 00055_category_product_domain.sql)
-- Type: ADDITIVE — a NEW orchestration RPC that composes the existing generic
--       listing_create flow with the category-products membership insert,
--       executing BOTH inside ONE SECURITY DEFINER transaction.
--
-- WHY THIS IS NECESSARY (root cause, per archived investigation):
--   `listing_create` / the legacy generic write path create `inventory_items`
--   + child details ONLY — they never insert into `category_products`.
--   Membership is created ONLY by `category_products_admin_assign` (00051),
--   invoked from the client as a SEPARATE round-trip after product creation.
--   That two-step client sequence is racy: a create whose auto-bind step fails
--   leaves an orphan product that never appears on the navigation category page.
--
--   This migration makes "create from a category" ATOMIC server-side: create
--   the listing and record its category membership in one transaction. If the
--   membership insert (or anything else) fails, the entire operation, including
--   the created product row, rolls back — no orphans, no partial state.
--
-- NON-NEGOTIABLE CONSTRAINTS RESPECTED:
--   * 00051 (category_products + category_products_admin_assign) is NOT
--     modified, redefined, dropped, or altered in any way.
--   * 00054 (listing_create) is NOT modified; it is REUSED as-is (only called).
--   * inventory_add_item (phone path) is NOT modified.
--   * The phone flow and CatalogInventoryScreen semantics are untouched.
--   * No data repair is performed by this migration.
--
-- SECURITY:
--   * The function is SECURITY DEFINER + SET search_path = public + VOLATILE.
--   * Only the intended authenticated admin role can execute (gate + grants).
--   * Both `categories_is_admin()` (00050) and `inventory_is_admin()` (00019)
--     are enforced server-side. The inner `listing_create` ALSO re-enforces
--     `inventory_is_admin()` (auth.uid() reflects the ORIGINAL session user
--     even through SECURITY DEFINER, so the check is genuine, not bypassable).
--   * `category_products` membership is inserted directly by this DEFINER
--     function, not through client-visible RLS — the SECURITY DEFINER owner
--     bypasses RLS, but this function is only reachable by admins.
--   * The existing UNIQUE (category_id, product_id) constraint is used safely
--     via ON CONFLICT DO NOTHING (idempotent re-create never duplicates).
--
-- Depends on: 00051 (category_products + its UNIQUE constraint + categories
--             FK), 00055 (categories.domain), 00054 (listing_create produce
--             widening), 00050 (categories_is_admin), 00019 (inventory_is_admin).
-- Rollback: DROP FUNCTION IF EXISTS public.create_listing_for_category(uuid,
--           text, text, text, numeric, text, text, text, text, text, text,
--           integer, boolean, jsonb, text);
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.category_products') IS NULL THEN
    RAISE EXCEPTION 'public.category_products missing — apply migration 00051 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories'
      AND column_name = 'domain'
  ) THEN
    RAISE EXCEPTION 'categories.domain missing — apply migration 00055 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'listing_create'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.listing_create missing — apply migration 00038/00054 first';
  END IF;
END $$;

-- ============================================================================
-- 1) create_listing_for_category — atomic create + membership
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_listing_for_category(
  p_category_id  uuid,
  p_category     text,
  p_brand        text,
  p_model        text,
  p_price        numeric DEFAULT NULL,
  p_price_period text DEFAULT 'sale',
  p_color        text DEFAULT '',
  p_city         text DEFAULT '',
  p_description  text DEFAULT NULL,
  p_code         text DEFAULT NULL,
  p_warranty     text DEFAULT NULL,
  p_quantity     integer DEFAULT 1,
  p_is_published boolean DEFAULT FALSE,
  p_details      jsonb DEFAULT NULL,
  p_unit         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
  v_id     uuid;
BEGIN
  -- -- Server-side admin authorization (both category + inventory sides).
  IF NOT (public.categories_is_admin() AND public.inventory_is_admin()) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- -- Category boundary: phones stay on the legacy inventory_add_item flow.
  IF p_category = 'phone' THEN
    RAISE EXCEPTION 'phones must use the legacy inventory_add_item flow' USING ERRCODE = '22023';
  END IF;

  -- -- Validate the target navigation category exists and is active.
  SELECT c.domain INTO v_domain
  FROM public.categories c
  WHERE c.id = p_category_id AND c.is_active = TRUE;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
      RAISE EXCEPTION 'CATEGORY_INACTIVE' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- -- The category's configured domain must match the product domain.
  IF v_domain IS DISTINCT FROM p_category THEN
    RAISE EXCEPTION 'CATEGORY_DOMAIN_MISMATCH' USING ERRCODE = 'P0002';
  END IF;

  -- -- Reuse the generic listing_create (00054) INSIDE this same transaction.
  -- -- It applies all its own validation/normalization + re-enforces the admin
  -- -- gate. Any exception here rolls back everything (product + membership).
  SELECT public.listing_create(
    p_category,
    p_brand,
    p_model,
    p_price,
    p_price_period,
    p_color,
    p_city,
    p_description,
    p_code,
    p_warranty,
    p_quantity,
    p_is_published,
    p_details,
    p_unit
  ) INTO v_id;

  -- -- Record the membership in THIS transaction, reusing the existing
  -- -- UNIQUE (category_id, product_id) constraint idempotently.
  INSERT INTO public.category_products (category_id, product_id, sort_order)
  VALUES (p_category_id, v_id, 0)
  ON CONFLICT (category_id, product_id) DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_listing_for_category(
  uuid, text, text, text, numeric, text, text, text, text, text, text,
  integer, boolean, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_listing_for_category(
  uuid, text, text, text, numeric, text, text, text, text, text, text,
  integer, boolean, jsonb, text
) TO authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- 1. Admin create+membership (produce) — atomic:
--      SELECT public.create_listing_for_category(
--        '<category-uuid-domain=produce>', 'produce','Farm','Tomato',250,'sale',
--        '', 'Oran', NULL, NULL, NULL, 100, FALSE,
--        '{"origin":"M''Sila","grade":"A"}', 'kg');
--    → returns the new product uuid; a category_products row now references it.
-- 2. Phone rejected (legacy flow preserved):
--      SELECT public.create_listing_for_category('<cat>','phone','x','y');
--    → ERROR: phones must use the legacy inventory_add_item flow
-- 3. Unknown category → no product row created (transaction rolls back):
--      SELECT public.create_listing_for_category('00000000-0000-0000-0000-000000000000',
--        'produce', ...);
--    → ERROR: CATEGORY_NOT_FOUND; no inventory_items row, no membership row.
-- 4. Domain mismatch (category domain='car', p_category='produce'):
--    → ERROR: CATEGORY_DOMAIN_MISMATCH; NOTHING is inserted.
-- 5. Non-admin/anon write must ERROR 42501 (ADMIN_REQUIRED).
-- 6. Grants: only authenticated (NOT anon, NOT PUBLIC) can execute.
-- ============================================================================
