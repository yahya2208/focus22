-- ============================================================================
-- 00121  B4 order price authority — remove the payable free-form path
-- ----------------------------------------------------------------------------
-- Rule (product decision): every payable order item in FOCUS must be
-- catalog-backed; the effective price comes from the server only.
--
-- Change vs 00104 (minimal, surgical — no rewrite):
--   Pass 1: the free-form branch (client unit_price) is replaced by a hard
--           ARGUMENTS_INVALID raise BEFORE any subtotal accumulation, so a
--           mixed basket aborts atomically and no partial order can persist.
--   Pass 2: the free-form persistence branch is deleted; a defensive
--           ARGUMENTS_INVALID raise is kept as a hard invariant.
--   Everything else (signature, SECURITY DEFINER, search_path, grants,
--   catalog/stock/qty/monthly/store/family/duplicate/zone/auth checks,
--   order + history inserts, return shape) is carried over UNCHANGED from
--   00104_numeric_quantity_architecture.sql.
--
-- Preserved for 00103 drift guard: 'FAMILY_ACCOUNT_REQUIRED' still precedes
-- 'COALESCE(p_intentional' in the body below.
-- Untouched: v_public_listings, inventory, settlement, ledger, family,
-- invitation, Auth, RBAC, all other RPCs and migrations.
-- Rollback: re-applying the 00104 body RE-OPENS the pricing hole — emergency
-- break-glass only, with explicit security acceptance, time-boxed.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delivery_create_order(
  p_customer    jsonb,
  p_items       jsonb,
  p_intentional boolean DEFAULT false
)
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
  v_row_qty     numeric;
  v_row_unit    text;
  v_item_name   text;
  v_item_unit   numeric;
  v_item_qty    numeric;

  -- Pilot store / neighborhood (Phase 5)
  v_store_id    uuid;
  v_neigh_id    uuid;
  v_first_store uuid;
  v_any_store   boolean := FALSE;

  -- Gate A: family binding + duplicate window
  v_family_id   uuid;
  v_item_count  integer;
  v_dup_id      uuid;

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

  -- Gate A: server-derived family binding — the client never supplies it.
  SELECT fm.family_id INTO v_family_id
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active'
   LIMIT 1;

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

    -- B4 (00121): every payable line must be catalog-backed. An empty or
    -- missing catalog_ref is rejected HERE, before any subtotal accumulation,
    -- so a mixed basket aborts atomically and no partial order can persist.
    -- Client unit_price is never read anywhere below: the ONLY price source
    -- is v_public_listings (v_row_price).
    IF v_ref = '' THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;

    -- Catalog item — authoritative only, resolved against the SAME public
    -- visibility gate the shopper saw (published, in-stock, active).
    SELECT
      v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity, v.unit
      INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty, v_row_unit
    FROM public.v_public_listings v
    WHERE v.id = v_ref::uuid
      AND v.quantity > 0;

    IF v_row_id IS NULL THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Physically orderable := any domain; but monthly-rent rows (properties)
    -- are not delivery orders.
    IF v_row_period = 'monthly' THEN
      RAISE EXCEPTION 'ITEM_NOT_ORDERABLE' USING ERRCODE = 'P0002';
    END IF;

    v_item_name := btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, ''));
    v_item_unit := COALESCE(v_row_price, 0);
    v_item_qty  := COALESCE((v_item->>'quantity')::numeric, 1);

    -- Unit-aware server enforcement (Gate C1):
    --   kg            -> decimal allowed, scale <= 3
    --   everything else (piece/unit/NULL phones/…) -> integer only
    IF v_item_qty IS NULL OR v_item_qty <= 0 THEN
      RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_row_unit = 'kg' THEN
      IF v_item_qty <> round(v_item_qty, 3) THEN
        RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_item_qty <> trunc(v_item_qty) THEN
        RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
    END IF;
    -- Never exceed available stock; never silently become non-positive.
    v_item_qty := LEAST(v_item_qty, v_row_qty);
    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

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

    v_subtotal := v_subtotal + v_item_unit * v_item_qty;
  END LOOP;

  -- A consistent basket (one store) resolved above: use the committed store
  -- id for the order header. (Free-form-only baskets can no longer exist.)
  IF NOT v_any_store THEN
    v_store_id := NULL;
    v_neigh_id := NULL;
  END IF;

  -- Gate A (D3/pilot topology): pilot-store orders require a family account.
  -- Server-authoritative — this gate runs for EVERY call regardless of intent.
  IF v_store_id IS NOT NULL AND v_family_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = v_store_id AND s.slug LIKE 'pilot-%'
    ) THEN
      RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Gate A (OQ4=B, server half): retry-window fingerprint for unintended
  -- retries. p_intentional (explicit new order after the customer confirmed)
  -- bypasses ONLY this window — every other validation above/below still runs.
  v_item_count := jsonb_array_length(p_items);
  IF NOT COALESCE(p_intentional, FALSE) THEN
    SELECT o.id INTO v_dup_id
      FROM public.orders o
     WHERE o.user_id = v_uid
       AND o.status <> 'cancelled'
       AND o.created_at >= now() - interval '60 seconds'
       AND o.subtotal = v_subtotal
       AND (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) = v_item_count
     LIMIT 1;
    IF v_dup_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_ORDER' USING ERRCODE = 'P0002';
    END IF;
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
    store_id, neighborhood_id, user_id, family_id
  )
  VALUES (
    v_order_no, v_cust_name, v_cust_phone, v_zone_id, v_address,
    v_subtotal, v_fee, v_subtotal + v_fee, 'confirmed', v_notes,
    v_store_id, v_neigh_id, v_uid, v_family_id
  )
  RETURNING id INTO v_order_id;

  -- GATE 3: record the canonical 'created' event atomically with the order.
  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, event_type,
    actor_user_id, actor_role, reason, metadata
  ) VALUES (
    v_order_id, '', 'confirmed', 'created',
    v_uid, 'customer', '', '{}'
  );

  -- Pass 2: persist each resolved/sanitised item with the authoritative values.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ref := COALESCE(btrim((v_item->>'catalog_ref')::text), '');

    -- B4 (00121): belt-and-suspenders — Pass 1 already rejected empty refs,
    -- so this is unreachable for new orders; kept as a hard invariant so the
    -- free-form persistence path can never silently return.
    IF v_ref = '' THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;

    SELECT
      v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity, v.unit
      INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty, v_row_unit
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
      LEAST(COALESCE((v_item->>'quantity')::numeric, 1), v_row_qty)
    );
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
    'neighborhood_id', v_neigh_id,
    'family_id', v_family_id
  );
END;
$$;

-- Signature unchanged; re-assert the canonical grants (defense in depth).
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) TO authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply, read-only)
-- ============================================================================
-- 1. Single 3-arg signature preserved:
--      SELECT proname, pg_get_function_identity_arguments(oid)
--        FROM pg_proc WHERE proname = 'delivery_create_order';
-- 2. No client-price read in the live path (unit_price survives ONLY as the
--    order_items target column receiving the server-resolved value):
--      SELECT pg_get_functiondef('public.delivery_create_order(jsonb,jsonb,boolean)'::regprocedure)
--        NOT LIKE '%->>''unit_price''%';
--      -- expected: true (no read of the caller-supplied unit_price field)
-- 3. 00103 drift markers intact and ordered:
--      SELECT position('FAMILY_ACCOUNT_REQUIRED' in v) < position('COALESCE(p_intentional' in v)
--        FROM (SELECT pg_get_functiondef('public.delivery_create_order(jsonb,jsonb,boolean)'::regprocedure) AS v) t;
--      -- expected: true
-- 4. Grants: authenticated only (no anon/PUBLIC EXECUTE).
-- ============================================================================
