-- ============================================================================
-- 00123  GATE S1 — settlement bounds: actuals cap, zero-delivery, no storeless
-- ----------------------------------------------------------------------------
-- D1 (defense in depth): enforce 0 <= delivered_quantity <= ordered_quantity
--   (a) at record time in pilot_set_delivered_actuals, and
--   (b) again at settle time in pilot_family_settle_and_deliver.
-- D3: delivered_quantity = 0 is now legal. NULL = unrecorded (falls back to
--   ordered); 0 = nothing delivered (no stock, no money, counted in neither
--   stock_lines nor stock_skipped); siblings settle normally.
-- D2: delivery_create_order rejects baskets that resolve no store
--   (NOT v_any_store) with ARGUMENTS_INVALID before the order header INSERT.
--   Legacy NULL-store rows are untouched by this guard.
-- Constraint: order_items_delivered_quantity_check relaxed from (> 0) to
--   (>= 0). No cross-column CHECK is added (legacy rows stay untouched).
-- Everything else (signatures, return shapes, authz, grants, catalog/stock/
-- qty/monthly/store/family/duplicate/zone checks, PURCHASE/debt math,
-- idempotency, history) is carried over UNCHANGED from 00101 / 00113 / 00121.
-- Rollback: re-applying the 00101 + 00113 + 00121 bodies restores prior
-- semantics (kept in repo history); re-tightening the CHECK requires the
-- same coordinated migration, never a bare ALTER.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A) pilot_set_delivered_actuals — accept 0, reject negative and over-ordered
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pilot_set_delivered_actuals(
  p_order_id uuid,
  p_items    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_store     uuid;
  v_assigned  uuid;
  v_item      jsonb;
  v_id        uuid;
  v_qty       numeric;
  v_ordered   numeric;
  v_updated   integer := 0;
  v_status    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id, o.courier_user_id, o.status
    INTO v_store, v_assigned, v_status
  FROM public.orders o
  WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
    OR v_assigned = v_uid
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('preparing', 'out_for_delivery') THEN
    RAISE EXCEPTION 'ACTUALS_NOT_RECORDABLE' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_id  := (v_item->>'id')::uuid;
    v_qty := (v_item->>'delivered_quantity')::numeric;
    -- D3: zero is a legal recorded actual (nothing delivered on this line).
    IF v_id IS NULL OR v_qty IS NULL OR v_qty < 0 THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    -- D1 (record-time cap): delivered may never exceed the ordered quantity.
    SELECT oi.quantity INTO v_ordered
      FROM public.order_items oi
     WHERE oi.id = v_id AND oi.order_id = p_order_id;
    IF v_ordered IS NULL THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_qty > v_ordered THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    UPDATE public.order_items
       SET delivered_quantity = v_qty
     WHERE id = v_id AND order_id = p_order_id;
    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  RETURN jsonb_build_object('order_id', p_order_id, 'updated_items', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- B) pilot_family_settle_and_deliver — settle-time cap + zero-line handling
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pilot_family_settle_and_deliver(
  p_order_id uuid,
  p_items    jsonb DEFAULT '[]'::jsonb,
  p_reason   text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_store        uuid;
  v_assigned     uuid;
  v_family       uuid;
  v_status       text;
  v_seq          text;
  v_order_no     text;
  v_delivery_fee numeric := 0;
  v_final_sub    numeric := 0;
  v_final_total  numeric;
  v_prior        numeric := 0;
  v_after        numeric;
  v_remaining    numeric;
  v_done         integer;
  v_line         record;
  v_need         numeric;
  v_stock        numeric;
  v_stock_n      integer := 0;
  v_skipped      integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id, o.courier_user_id, o.family_id, o.status, o.order_number, o.delivery_fee
    INTO v_store, v_assigned, v_family, v_status, v_order_no, v_delivery_fee
  FROM public.orders o
  WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
    OR v_assigned = v_uid
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Financial idempotency: ONE primary settlement per order. The 00103 partial
  -- unique index is the structural backstop; this check gives the clean error.
  -- Placed BEFORE any mutation: retries never double-decrement stock.
  IF EXISTS (
    SELECT 1 FROM public.ledger l
    WHERE l.related_order_id = p_order_id AND l.transaction_type = 'PURCHASE'
  ) THEN
    RAISE EXCEPTION 'ORDER_ALREADY_SETTLED' USING ERRCODE = 'P0002';
  END IF;

  -- Record actual fulfilled quantities first (same authz; preparing/OFD only).
  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    PERFORM public.pilot_set_delivered_actuals(p_order_id, p_items);
  END IF;

  -- === ATOMIC INVENTORY DECREMENT (00113; D1 cap + D3 zero handling in 00123)
  -- Per order line with a UUID catalog_ref, decrement the resolved fulfilled
  -- quantity. Row lock serialises concurrent settlements of the same stock.
  FOR v_line IN
    SELECT oi.catalog_ref AS ref,
           COALESCE(oi.delivered_quantity, oi.quantity) AS need,
           oi.quantity AS ordered
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    v_need := v_line.need;
    IF v_need IS NULL THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    -- D3: recorded zero = nothing delivered on this line. No stock decrement,
    -- no subtotal contribution, counted in NEITHER stock_lines NOR
    -- stock_skipped; sibling lines continue normally.
    IF v_need = 0 THEN
      CONTINUE;
    END IF;
    -- D1 (settle-time cap, defense in depth): delivered may never exceed the
    -- ordered quantity, regardless of which path recorded the actual. Placed
    -- before the skips so legacy free-form lines are capped too.
    IF v_need < 0 OR v_need > v_line.ordered THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_line.ref IS NULL OR btrim(v_line.ref) = ''
       OR v_line.ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      -- Free-form legacy line: no stock row exists. Explicit skip (counted in
      -- the additive response keys), never a failure.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    SELECT ii.quantity INTO v_stock
      FROM public.inventory_items ii
     WHERE ii.id = v_line.ref::uuid
     FOR UPDATE;
    IF v_stock IS NULL THEN
      -- Catalog row vanished after ordering: same explicit-skip class.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF v_stock < v_need THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = '22023';
    END IF;
    UPDATE public.inventory_items ii
       SET quantity   = ii.quantity - v_need,
           total_sold = ii.total_sold + v_need,
           status     = public.inventory_calc_status(ii.quantity - v_need)
     WHERE ii.id = v_line.ref::uuid;
    v_stock_n := v_stock_n + 1;
  END LOOP;

  -- Final value: delivered qty when recorded for EVERY line, else requested.
  SELECT COALESCE(SUM(
      CASE WHEN oi.delivered_quantity IS NOT NULL
           THEN oi.delivered_quantity * oi.unit_price
           ELSE oi.quantity * oi.unit_price END
    ), 0)
    INTO v_final_sub
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  -- Canonical delivery transition (writes history atomically).
  PERFORM public.pilot_assert_transition(p_order_id, 'delivered', false);

  v_final_total := v_final_sub + v_delivery_fee;

  -- Family-bound orders post the single full-value PURCHASE movement.
  IF v_family IS NOT NULL THEN
    SELECT COALESCE(SUM(l.amount), 0) INTO v_prior
      FROM public.ledger l
     WHERE l.family_id = v_family;

    v_after := v_prior - v_final_total;

    INSERT INTO public.ledger (
      family_id, transaction_type, amount, related_order_id,
      reference, note, balance_after, created_by
    ) VALUES (
      v_family, 'PURCHASE', -v_final_total, p_order_id,
      COALESCE(v_order_no, p_order_id::text),
      COALESCE(btrim(p_reason), ''), v_after, v_uid
    );

    -- Debt tracking (monitoring of the uncovered remainder — never a ledger
    -- account, never added to SUM(ledger.amount)).
    v_remaining := GREATEST(v_final_total - GREATEST(v_prior, 0), 0);
    INSERT INTO public.debts (
      family_id, order_id, original_total, covered, remaining, status
    ) VALUES (
      v_family, p_order_id, v_final_total,
      v_final_total - v_remaining, v_remaining,
      CASE WHEN v_remaining > 0 THEN 'open' ELSE 'settled' END
    )
    ON CONFLICT (family_id, order_id) DO UPDATE SET
      original_total = EXCLUDED.original_total,
      covered        = EXCLUDED.covered,
      remaining      = EXCLUDED.remaining,
      status         = EXCLUDED.status,
      updated_at     = now();
  ELSE
    -- Legacy/guest order (no family money model): no ledger, no debt.
    v_after := NULL;
    v_remaining := NULL;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', 'delivered',
    'final_subtotal', v_final_sub,
    'delivery_fee', v_delivery_fee,
    'final_total', v_final_total,
    'balance_after', v_after,
    'debt_remaining', v_remaining,
    'stock_lines', v_stock_n,
    'stock_skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- C) delivery_create_order — reject storeless baskets (D2)
-- ----------------------------------------------------------------------------
-- Carried over VERBATIM from 00121_b4_order_price_authority.sql except the
-- single block below: NOT v_any_store now raises instead of NULL-ing the
-- store header. B4 catalog authority and every other validation are
-- byte-identical to 00121.
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

  -- D2 (00123): every new order must resolve a store. A basket with no store
  -- mapping (historically: free-form-only; now: unmapped catalog items) is
  -- rejected HERE, before the order header INSERT. Legacy NULL-store rows
  -- are untouched by this guard — it constrains creation only.
  IF NOT v_any_store THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- D) Relax the delivered_quantity CHECK (NULL or >= 0; no cross-column CHECK)
-- ----------------------------------------------------------------------------
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_delivered_quantity_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_delivered_quantity_check
  CHECK (delivered_quantity IS NULL OR delivered_quantity >= 0);

-- ----------------------------------------------------------------------------
-- E) Re-assert the canonical grants (verbatim; no widening)
-- ----------------------------------------------------------------------------
-- (Grants are asserted inline above per function, mirroring 00101/00102/00104
-- convention: REVOKE ALL FROM PUBLIC, REVOKE anon, GRANT authenticated.)

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply, read-only)
-- ============================================================================
-- 1. Actuals cap + zero acceptance live in the record body:
--      SELECT pg_get_functiondef('public.pilot_set_delivered_actuals(uuid,jsonb)'::regprocedure)
--        LIKE '%v_qty > v_ordered%';
--      SELECT pg_get_functiondef('public.pilot_set_delivered_actuals(uuid,jsonb)'::regprocedure)
--        LIKE '%v_qty < 0%';
-- 2. Settle cap + zero skip live in the settle body:
--      SELECT pg_get_functiondef('public.pilot_family_settle_and_deliver(uuid,jsonb,text)'::regprocedure)
--        LIKE '%v_need > v_line.ordered%';
-- 3. Storeless creation rejected:
--      SELECT pg_get_functiondef('public.delivery_create_order(jsonb,jsonb,boolean)'::regprocedure)
--        LIKE '%IF NOT v_any_store THEN%';
-- 4. CHECK relaxed:
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname = 'order_items_delivered_quantity_check';
--      -- expected: CHECK ((delivered_quantity IS NULL) OR (delivered_quantity >= (0)::numeric))
-- 5. 00103 markers intact in the create body (FAMILY_ACCOUNT_REQUIRED before
--    COALESCE(p_intentional), single 3-arg signature, authenticated-only EXECUTE).
-- ============================================================================
