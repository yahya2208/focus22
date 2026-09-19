-- ============================================================================
-- GATE C5 — PRODUCTION MIGRATION PACKAGING & PRE-RELEASE AUDIT.
-- Formal repo packaging of the C4 family experience backend, previously
-- applied to Staging ad-hoc (c4_backend.sql - 'Staging ONLY / NOT a'
-- repo migration'). THIS file is the authoritative repo copy: family_saved_
-- items table + 6 SECURITY DEFINER RPCs + family RLS. search_path='' +
-- SECURITY DEFINER + NO test data. DZD (produce/family path - NOT SAR).
-- Order: after 00100_family_ledger_foundation (family_members deps), after
-- 00101/00102/00103/00104 (produce decimal actuals / settlement / idempotency
-- / numeric quantity). ============================================================================

-- 1) family_saved_items — server-backed family favorites / repeat-purchase list.
-- Price/stock/name resolved live from v_public_listings; only (family_id, catalog_ref, quantity) stored.
-- @c4_saved_table
CREATE TABLE IF NOT EXISTS public.family_saved_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  catalog_ref text NOT NULL,
  quantity    numeric(12,3) NOT NULL CHECK (quantity > 0),
  added_by    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, catalog_ref)
);

-- @c4_saved_rls
ALTER TABLE public.family_saved_items ENABLE ROW LEVEL SECURITY;

-- Server-only reads: SECURITY DEFINER RPCs handle all access. No direct anon/authenticated grants.
DROP POLICY IF EXISTS "admin read saved items" ON public.family_saved_items;
CREATE POLICY "admin read saved items"
  ON public.family_saved_items FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

REVOKE ALL ON public.family_saved_items FROM anon, authenticated;

-- 2) pilot_family_saved_add(catalog_ref, quantity) → upsert one item into the family's saved list.
-- Server resolves family from auth.uid(); validates item via v_public_listings; quantity unit-aware rules enforced.
-- @c4_saved_add
CREATE OR REPLACE FUNCTION public.pilot_family_saved_add(
  p_catalog_ref text,
  p_quantity    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family    uuid;
  v_row_id    uuid;
  v_row_unit  text;
  v_row_price numeric;
  v_row_qty   numeric;
  v_row_brand text;
  v_row_model text;
  v_qty       numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' LIMIT 1;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED' USING ERRCODE = 'P0002';
  END IF;

  IF p_catalog_ref IS NULL OR btrim(p_catalog_ref) = '' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Resolve item via the same public visibility gate as the storefront.
  SELECT v.id, v.unit, v.price, v.quantity, v.brand, v.model
    INTO v_row_id, v_row_unit, v_row_price, v_row_qty, v_row_brand, v_row_model
    FROM public.v_public_listings v
   WHERE v.id = btrim(p_catalog_ref)::uuid;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Unit-aware quantity validation (mirrors delivery_create_order 00104 rules).
  IF v_row_unit = 'kg' THEN
    IF p_quantity <> round(p_quantity, 3) THEN
      RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_quantity <> trunc(p_quantity) THEN
      RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Clamp to current stock (server-authoritative).
  v_qty := LEAST(p_quantity, GREATEST(v_row_qty, 0));
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.family_saved_items (family_id, catalog_ref, quantity, added_by)
  VALUES (v_family, btrim(p_catalog_ref), v_qty, v_uid)
  ON CONFLICT (family_id, catalog_ref) DO UPDATE SET
    quantity    = EXCLUDED.quantity,
    updated_at  = now();

  RETURN jsonb_build_object(
    'ok',         true,
    'family_id',  v_family,
    'catalog_ref', btrim(p_catalog_ref),
    'name',       btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, '')),
    'quantity',   v_qty,
    'unit',       v_row_unit,
    'unit_price', v_row_price,
    'stock',      v_row_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_saved_add(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_saved_add(text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_saved_add(text, numeric) TO authenticated;

-- 3) pilot_family_saved_list() → the caller's family saved items + live product info.
-- @c4_saved_list
CREATE OR REPLACE FUNCTION public.pilot_family_saved_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_out    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' LIMIT 1;

  IF v_family IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.sort_created), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'id',          s.id,
      'catalog_ref', s.catalog_ref,
      'quantity',    s.quantity,
      'name',        btrim(COALESCE(v.brand, '') || ' ' || COALESCE(v.model, '')),
      'unit',        v.unit,
      'unit_price',  v.price,
      'stock',       v.quantity,
      'available',   v.id IS NOT NULL,
      'created_at',  s.created_at,
      'updated_at',  s.updated_at
) AS row,
      s.created_at AS sort_created
    FROM public.family_saved_items s
    LEFT JOIN public.v_public_listings v ON v.id = s.catalog_ref::uuid
    WHERE s.family_id = v_family
  ) sub
  ORDER BY sub.sort_created ASC;

  RETURN v_out;
END;

REVOKE ALL ON FUNCTION public.pilot_family_saved_list() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_saved_list() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_saved_list() TO authenticated;

-- 4) pilot_family_saved_update(p_catalog_ref, p_quantity) → change quantity.
-- @c4_saved_update
CREATE OR REPLACE FUNCTION public.pilot_family_saved_update(
  p_catalog_ref text,
  p_quantity    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family    uuid;
  v_row_id    uuid;
  v_row_unit  text;
  v_row_qty   numeric;
  v_qty       numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' LIMIT 1;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED' USING ERRCODE = 'P0002';
  END IF;

  IF p_catalog_ref IS NULL OR btrim(p_catalog_ref) = '' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT v.id, v.unit, v.quantity INTO v_row_id, v_row_unit, v_row_qty
    FROM public.v_public_listings v WHERE v.id = btrim(p_catalog_ref)::uuid;

  IF v_row_id IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_row_unit = 'kg' THEN
    IF p_quantity <> round(p_quantity, 3) THEN RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023'; END IF;
  ELSE
    IF p_quantity <> trunc(p_quantity) THEN RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023'; END IF;
  END IF;

  v_qty := LEAST(p_quantity, GREATEST(v_row_qty, 0));
  IF v_qty <= 0 THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.family_saved_items
     SET quantity = v_qty, updated_at = now()
   WHERE family_id = v_family AND catalog_ref = btrim(p_catalog_ref);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'catalog_ref', btrim(p_catalog_ref), 'quantity', v_qty);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_saved_update(text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_saved_update(text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_saved_update(text, numeric) TO authenticated;

-- 5) pilot_family_saved_remove(p_catalog_ref) → delete one saved item.
-- @c4_saved_remove
CREATE OR REPLACE FUNCTION public.pilot_family_saved_remove(
  p_catalog_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' LIMIT 1;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.family_saved_items
   WHERE family_id = v_family AND catalog_ref = btrim(p_catalog_ref);

  RETURN jsonb_build_object('ok', true, 'deleted', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_saved_remove(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_saved_remove(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_saved_remove(text) TO authenticated;

-- 6) pilot_family_saved_clear() → remove all saved items for the caller's family.
-- @c4_saved_clear
CREATE OR REPLACE FUNCTION public.pilot_family_saved_clear()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_count  integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' LIMIT 1;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.family_saved_items WHERE family_id = v_family;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_saved_clear() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_saved_clear() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_saved_clear() TO authenticated;

-- 7) pilot_family_orders() — family-scoped purchase history with items (C4-C).
-- Returns orders for the caller's family (not user-scoped), newest first, with item details.
-- @c4_family_orders
CREATE OR REPLACE FUNCTION public.pilot_family_orders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_out    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active' LIMIT 1;

  IF v_family IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(sub.row ORDER BY sub.sort_created DESC, sub.sort_id DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'order_id',        o.id,
      'order_number',    o.order_number,
      'status',          o.status,
      'subtotal',        o.subtotal,
      'delivery_fee',    o.delivery_fee,
      'total',           o.total,
      'store_name',      s.name,
      'store_name_ar',   s.name_ar,
      'neighborhood_name', n.name,
      'neighborhood_name_ar', n.name_ar,
      'created_at',      o.created_at,
      'updated_at',      o.updated_at,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'name',      btrim(COALESCE(oi.name, '')),
          'quantity',  oi.quantity,
          'unit',      COALESCE(inv.unit, 'unit'),
          'unit_price', oi.unit_price,
          'line_total', (oi.unit_price * oi.quantity)::numeric
        ) ORDER BY oi.created_at), '[]'::jsonb)
        FROM public.order_items oi
        LEFT JOIN public.inventory_items inv ON inv.id = NULLIF(oi.catalog_ref, '')::uuid
        WHERE oi.order_id = o.id
      )
    ) AS row,
      o.created_at AS sort_created,
      o.id AS sort_id
    FROM public.orders o
    LEFT JOIN public.stores s         ON s.id = o.store_id
    LEFT JOIN public.neighborhoods n  ON n.id = o.neighborhood_id
    WHERE o.family_id = v_family
  ) sub
  ORDER BY sub.sort_created DESC, sub.sort_id DESC
  LIMIT 100;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_orders() TO authenticated;

-- Verify: all 6 new RPCs exist
-- @c4_verify_rpcs
SELECT p.proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pilot_family_saved_add',
    'pilot_family_saved_list',
    'pilot_family_saved_update',
    'pilot_family_saved_remove',
    'pilot_family_saved_clear',
    'pilot_family_orders'
  )
ORDER BY p.proname;

-- Verify: family_saved_items table exists
-- @c4_verify_table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'family_saved_items'
ORDER BY ordinal_position;
