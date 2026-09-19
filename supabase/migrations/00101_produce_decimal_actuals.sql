-- ============================================================================
-- 00101  GATE A — Checkout actuals · sold-by-weight support (D6=D)
-- ----------------------------------------------------------------------------
-- Type: Additive (new columns + one new RPC). No published function replaced.
--
-- D6 = D: "pay actual weight/quantity at delivery". The settlement computes the
-- final order value from DELIVERED quantities × server-authoritative prices.
--
-- What this migration adds:
--   1. `order_items.delivered_quantity numeric(12,3)` — the actual quantity
--      fulfilled at delivery (weight in kg for produce, count for units).
--      NULL until a store/courier records the actuals; the requested quantity
--      (`orders.order_items.quantity`) stays untouched and visible.
--   2. `inventory_items.sell_unit` — how an item is sold/measured:
--      'unit' (by the piece) or 'kg' (weighted produce). Additive metadata
--      used by the checkout UI (weight items show a kg stepper) and by the
--      settlement (delivered_quantity is measured in sell_unit).
--   3. `pilot_set_delivered_actuals(order, items)` — server-authoritative
--      recording of the actual fulfilled quantities. Authz: store operator,
--      admin, or the ORDER'S ASSIGNED courier. Only legal while the order is
--      preparing/out_for_delivery (before terminal settlement).
--
-- DECISION BOUNDARY (reported to the architectural owner, not silently
-- decided here): the plan's "widen inventory_items.quantity to NUMERIC so
-- 5.3 kg is a stockable amount" is NOT applied. `quantity` is INTEGER and is
-- consumed by a long dependency chain (v_public_inventory 00019,
-- v_public_listings 00037, inventory_calc_status(integer), the integer-typed
-- stock RPCs, the inventory_movements audit trigger). Rewriting a live
-- production column AND its dependents without a migration dry-run is a real
-- technical risk that requires an explicit decision. delivered_quantity
-- (numerically exact) + sell_unit (kg/unit) fully cover "pay the actual
-- weight" at settlement. Whole-unit inventory remains in whole units.
-- ============================================================================

-- ============================================================================
-- 1) order_items.delivered_quantity — actual fulfilled quantity (numeric).
-- ============================================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivered_quantity numeric(12,3);

-- When present it must be a real positive amount; whole-unit products use
-- integer values (e.g. 1.000, 3.000), weight products use kg (e.g. 5.300).
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_delivered_quantity_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_delivered_quantity_check
  CHECK (delivered_quantity IS NULL OR delivered_quantity > 0);

-- ============================================================================
-- 2) inventory_items.sell_unit — unit vs weight sale metadata.
--    Protected columns unchanged (buy_price / sell_price untouched).
-- ============================================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS sell_unit text NOT NULL DEFAULT 'unit'
  CHECK (sell_unit IN ('unit', 'kg'));

-- ============================================================================
-- 3) pilot_set_delivered_actuals — record actuals before settlement.
--    Payload: jsonb array of {id (order_item id), delivered_quantity}.
--    Authorised actor: store operator / admin / the assigned courier.
--    Rejects when the order is already delivered/cancelled (terminal) or the
--    caller is not authorised (PERMISSION_DENIED, no enumeration leak).
-- ============================================================================
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
    IF v_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
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

GRANT EXECUTE ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_set_delivered_actuals(uuid, jsonb) TO authenticated;

-- ============================================================================
-- 4) Post-checks
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
      AND column_name = 'delivered_quantity'
  ) THEN
    RAISE EXCEPTION '00101: order_items.delivered_quantity missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
      AND column_name = 'sell_unit'
  ) THEN
    RAISE EXCEPTION '00101: inventory_items.sell_unit missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'order_items'
      AND constraint_name = 'order_items_delivered_quantity_check'
  ) THEN
    RAISE EXCEPTION '00101: delivered_quantity check missing';
  END IF;
END;
$$;