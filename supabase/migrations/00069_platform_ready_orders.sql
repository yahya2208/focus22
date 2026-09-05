-- ============================================================================
-- 00069_platform_ready_orders.sql
--
-- Corrective migration: PLATFORM-READY ORDER FLOW.
--
-- Architectural gap (approved): the platform pre-builds the order (server
-- authoritative pricing/stock + store/neighborhood resolution already done in
-- 00065). The store operator is a fulfillment point, not a marketplace seller
-- that must manually accept each order. Therefore new orders created by
-- delivery_create_order() must start PLATFORM-READY at 'confirmed', where the
-- store immediately sees the Prepare action (and the courier can accept it).
--
-- SCOPE (additive, single function redefinition):
--   * Re-creates public.delivery_create_order(p_customer jsonb, p_items jsonb)
--     with the IDENTICAL body from 00065_ex (00065_neighborhood_store_pilot)
--     except ONE deliberate change:
--        INSERT status:   'pending'  -> 'confirmed'
--        RETURN status:   'pending'  -> 'confirmed'
--   * No trigger, no parallel system.
--   * Untouched: pilot_order_set_status, pilot_order_accept, pilot_orders_for_store,
--     courier flow, RLS, grants, RBAC, telemetry contract, order schema.
--   * Grant contract preserved verbatim (REVOKE ALL + GRANT EXECUTE TO authenticated).
--
-- Additive-only by construction: CREATE OR REPLACE + comments do not touch
-- schema, policies, or any other stored procedure.
-- ============================================================================

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

  -- Pilot store / neighborhood (Phase 5)
  v_store_id    uuid;
  v_neigh_id    uuid;
  v_first_store uuid;
  v_any_store   boolean := FALSE;

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

      -- Pilot Phase 5: resolve owning store/neighborhood for catalog items.
      SELECT s.id, s.neighborhood_id
        INTO v_store_id, v_neigh_id
      FROM public.store_inventory si
      JOIN public.stores s ON s.id = si.store_id AND s.status = 'active'
      WHERE si.inventory_id = v_row_id
      LIMIT 1;

      IF v_store_id IS NOT NULL THEN
        IF v_first_store IS NULL THEN
          v_first_store := v_store_id;
        ELSIF v_store_id IS DISTINCT FROM v_first_store THEN
          RAISE EXCEPTION 'MULTI_STORE_ORDER' USING ERRCODE = 'P0002';
        END IF;
        v_any_store := TRUE;
      END IF;
    END IF;

    v_subtotal := v_subtotal + v_item_unit * v_item_qty;
  END LOOP;

  -- A consistent basket (one store, or all free-form) resolved above: use the
  -- committed store id for the order header. Free-form-only orders stay NULL.
  IF NOT v_any_store THEN
    v_store_id := NULL;
    v_neigh_id := NULL;
  END IF;

  SELECT * INTO v_estimate FROM public.delivery_estimate(v_zone_id, v_subtotal);
  IF COALESCE((v_estimate->>'available')::boolean, FALSE) THEN
    v_fee     := COALESCE((v_estimate->>'fee')::numeric, 0);
    v_min_min := COALESCE((v_estimate->>'minutes_min')::integer, 30);
    v_min_max := COALESCE((v_estimate->>'minutes_max')::integer, 45);
  END IF;

  v_order_no := 'FC-' || lpad((nextval('public.orders_id_seq')::bigint % 1000000)::text, 6, '0');

  INSERT INTO public.orders (
    order_number, customer_name, customer_phone, zone_id, address,
    subtotal, delivery_fee, total, status, notes,
    store_id, neighborhood_id, user_id
  )
  VALUES (
    v_order_no, v_cust_name, v_cust_phone, v_zone_id, v_address,
    v_subtotal, v_fee, v_subtotal + v_fee, 'confirmed', v_notes,
    v_store_id, v_neigh_id, v_uid
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
    'status', 'confirmed',
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee,
    'eta_minutes_min', v_min_min,
    'eta_minutes_max', v_min_max,
    'store_id', v_store_id,
    'neighborhood_id', v_neigh_id
  );
END;
$$;

-- Least privilege — identical grant contract to 00065/00050/00052.
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated;