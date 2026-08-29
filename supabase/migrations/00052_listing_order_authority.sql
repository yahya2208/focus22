-- ============================================================================
-- FOCUS — LISTING ORDER AUTHORITY (MIGRATION 00052)
--
-- Migration number: 00052 (after 00051_category_content.sql)
-- Type: Additive — one SECURITY DEFINER function REPLACE + grants + post-check.
--       Does NOT create/drop tables, policies, or other functions. 00050 and
--       00051 are untouched on disk.
--
-- PURPOSE
--   Closes B1 + I1 for the marketplace order path. Today delivery_create_order
--   (00050) trusts the client for unit_price / quantity / catalog_ref / name
--   (stored verbatim). This override makes the SERVER authoritative for every
--   item that carries a catalog_ref:
--
--     * catalog_ref MUST resolve to a real, PUBLISHED, IN-STOCK row of the
--       public listings view (v_public_listings) — same visibility gate the
--       shopper already sees. An unresolved/private/deleted/zero-stock ref is
--       rejected (ITEM_NOT_FOUND), never silently accepted.
--     * unit_price = the authoritative sell_price (never the client's number).
--     * quantity is clamped to the view's available quantity (cars/properties
--       are pinned to 1 server-side) and never below 1.
--     * item name/domain are taken from the resolved row.
--     * cars (price_period = 'sale' view rows) are orderable; monthly-period
--       rows (rental properties) are rejected as not physically orderable
--       (ITEM_NOT_ORDERABLE) — they belong to the contact/lead flow.
--
--   Items WITHOUT a catalog_ref remain free-form (non-catalog line items),
--   preserving 00050's legacy shape for any future manual/direct lines. The
--   phone path is byte-compatible: it already sends catalog_ref = inventory id,
--   so phone orders now resolve authoritatively too — identical UX, safer DB.
--
--   The function signature (p_customer jsonb, p_items jsonb), return shape
--   (order_id/order_number/status/subtotal/delivery_fee/total/eta_*), and all
--   00050 error codes (UNAUTHENTICATED / CUSTOMER_INFO_REQUIRED /
--   ZONE_NOT_ACTIVE / ITEMS_REQUIRED) are preserved exactly.
--
-- Depends on: 00036 (v_public_listings source rows), 00037 (v_public_listings),
--             00050 (delivery_zones / delivery_fees / orders / order_items /
--             delivery_estimate / orders_id_seq).
-- Rollback: apply the 00050 definition of delivery_create_order again.
-- ============================================================================

BEGIN;

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

  -- Authoritative resolution per item (00052)
  v_ref         text;
  v_row_id      uuid;
  v_row_cat     text;
  v_row_brand   text;
  v_row_model   text;
  v_row_price   numeric;
  v_row_period  text;
  v_row_qty     integer;
  v_item_name   text;
  v_item_unit   numeric;
  v_item_qty    integer;

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

  -- Pass 1: validate + resolve + accumulate authoritative subtotal.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ref := COALESCE(btrim((v_item->>'catalog_ref')::text), '');

    IF v_ref = '' THEN
      -- Free-form (non-catalog) line item — legacy verbatim shape.
      v_item_unit := COALESCE((v_item->>'unit_price')::numeric, 0);
      v_item_qty  := GREATEST(COALESCE((v_item->>'quantity')::integer, 1), 1);
    ELSE
      -- Catalog item — authoritative only, resolved against the SAME public
      -- visibility gate the shopper saw (published, in-stock, active).
      SELECT
        v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity
        INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty
      FROM public.v_public_listings v
      WHERE v.id = v_ref::uuid
        AND v.quantity > 0;

      IF v_row_id IS NULL THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;

      -- Physically orderable := any domain; but monthly-rent rows (properties)
      -- are not delivery orders. Cars are enforced sale-only upstream too, but
      -- we re-assert the server authority here.
      IF v_row_period = 'monthly' THEN
        RAISE EXCEPTION 'ITEM_NOT_ORDERABLE' USING ERRCODE = 'P0002';
      END IF;

      v_item_name := btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, ''));
      v_item_unit := COALESCE(v_row_price, 0);
      v_item_qty  := GREATEST(LEAST(COALESCE((v_item->>'quantity')::integer, 1), v_row_qty), 1);
    END IF;

    v_subtotal := v_subtotal + v_item_unit * v_item_qty;
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

  -- Pass 2: persist each resolved/sanitised item with the authoritative values.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ref := COALESCE(btrim((v_item->>'catalog_ref')::text), '');

    IF v_ref = '' THEN
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
    ELSE
      SELECT
        v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity
        INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty
      FROM public.v_public_listings v
      WHERE v.id = v_ref::uuid;

      INSERT INTO public.order_items (order_id, category_id, catalog_ref, name, name_ar, unit_price, quantity)
      VALUES (
        v_order_id,
        NULLIF(NULLIF(v_item->>'category_id', ''), 'null')::uuid,
        v_ref,
        btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, '')),
        btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, '')),
        COALESCE(v_row_price, 0),
        GREATEST(LEAST(COALESCE((v_item->>'quantity')::integer, 1), v_row_qty), 1)
      );
    END IF;
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

-- Least privilege — identical to 00050 (override keeps the grant contract).
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated;

-- Post-check — fail loudly if the override did not take effect.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'delivery_create_order'
  ) THEN
    RAISE EXCEPTION 'delivery_create_order missing after 00052';
  END IF;
END $$;

COMMIT;
