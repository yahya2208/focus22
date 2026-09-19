-- ============================================================================
-- 00102  GATE A — Family order binding · duplicate window · settlement
-- ----------------------------------------------------------------------------
-- Type: Hardening + additive. One new column, ONE existing RPC re-created
-- (additive family branch + intent flag), one new settlement RPC.
--
-- 1) `orders.family_id`            — SERVER-WRITTEN ONLY. The client can never
--     supply a family_id; it is resolved from `family_members` via auth.uid()
--     inside `delivery_create_order` (D2). Legacy/guest orders keep NULL.
--
-- 2) `delivery_create_order`       — additive REPLACE of the 00079 body with
--     exactly three Gate A deltas:
--       a. Family resolution from auth.uid() -> orders.family_id.
--       b. FAMILY_ACCOUNT_REQUIRED: pilot-store orders need an active family
--          membership (server-authoritative — guests cannot order produce).
--       c. OQ4=B retry-window: an identical basket (same user, same subtotal,
--          same item count) created within 60 seconds raises DUPLICATE_ORDER
--          instead of silently duplicating.
--     New SIGNATURE keeps a default third parameter
--       (jsonb, jsonb, p_intentional boolean DEFAULT false) so existing two-
--      argument call sites keep working unchanged.
--
--     p_intentional is an INTENT MARKER ONLY:
--       * It is NOT authentication / authorization / an idempotency key /
--         a family selector / a security bypass.
--       * Its ONLY effect is to skip the retry window after the customer
--         explicitly confirmed a new order in the duplicate dialog.
--       * ALL server rules still run regardless of its value: auth.uid(),
--         family resolution, pilot-store gate, inventory/availability/pricing
--         resolution from v_public_listings, zone validation, order creation.
--       * Passing p_intentional=true without the prior DUPLICATE_ORDER
--         response merely creates the (already validated) order normally.
--
-- 3) `pilot_family_settle_and_deliver` — the financial settlement (D5=D debit
--     at delivery; D6=D actual quantities):
--       * Records delivered_quantity actuals (delegates to
--         pilot_set_delivered_actuals, 00101).
--       * Transitions the order to 'delivered' through the SINGLE canonical
--         state machine (pilot_assert_transition, 00079) — history is written
--         in the same transaction.
--       * Posts the ONE full-value financial movement: ledger PURCHASE =
--         −(final_total). final_total = Σ(delivered qty × unit_price) + fee.
--       * Tracks the uncovered remainder in `debts` (MONITORING ONLY).
--       * Guards: raises ORDER_ALREADY_SETTLED if a PURCHASE exists for the
--         order (the 00103 partial unique index is the structural backstop).
--
-- BALANCE INVARIANT: SUM(ledger.amount) is the single balance source of truth.
-- debts.remaining is DERIVED tracking and never enters SUM(ledger.amount).
-- No `SUM(ledger) + debt` equation exists anywhere in this migration.
--
-- Boundaaries honoured: orders/order_items/delivery_zones schema untouched
-- except the additive family_id column; pilot_assert_transition / operator /
-- courier RPCs unchanged; RBAC / ROLE_* / telemetry / pricing untouched.
--
-- Dependencies: 00079 (delivery_create_order + pilot_assert_transition),
-- 00065 (stores/family_groups/pilot store data marker), 00100 (family_members
-- /ledger/debts), 00101 (delivered_quantity).
-- Rollback: recreate delivery_create_order from the 00079 body; DROP FUNCTION
-- public.pilot_family_settle_and_deliver(uuid,jsonb,text); ALTER TABLE orders
-- DROP COLUMN family_id;
-- ============================================================================

-- ============================================================================
-- 1) orders.family_id — server-written family binding (D2)
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.family_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_family
  ON public.orders (family_id, created_at DESC);

COMMENT ON COLUMN public.orders.family_id IS
  'Server-authored (delivery_create_order, 00102). Never client-supplied; NULL for legacy/guest orders.';
-- No RLS exposure change: orders have no anon/authenticated direct access; the
-- column merely rides along with existing order RPCs (staff/owner surfaces).

-- ============================================================================
-- 2) delivery_create_order — 00079 body + Gate A deltas (family, dup window)
-- ============================================================================
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
  v_row_qty     integer;
  v_item_name   text;
  v_item_unit   numeric;
  v_item_qty    integer;

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
    'neighborhood_id', v_neigh_id,
    'family_id', v_family_id
  );
END;
$$;

-- ============================================================================
-- 3) pilot_family_settle_and_deliver — the ONE financial settlement path.
-- ============================================================================
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
    'debt_remaining', v_remaining
  );
END;
$$;

-- ============================================================================
-- 4) Grants — least privilege; legacy 2-arg call sites keep working via the
--    DEFAULT third parameter.
-- ============================================================================
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) TO authenticated;

-- ============================================================================
-- 5) Post-checks — structural contract; fail loudly on drift.
-- ============================================================================
DO $$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'family_id'
  ) THEN
    RAISE EXCEPTION '00102: orders.family_id missing';
  END IF;

  SELECT pg_get_functiondef('public.delivery_create_order(jsonb, jsonb, boolean)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '00102: delivery_create_order missing';
  END IF;
  -- All server-authoritative validation must appear in the body.
  IF v_def NOT LIKE '%v_public_listings%' THEN
    RAISE EXCEPTION '00102: delivery_create_order lost authoritative catalog resolution';
  END IF;
  IF v_def NOT LIKE '%FAMILY_ACCOUNT_REQUIRED%' THEN
    RAISE EXCEPTION '00102: pilot-store family gate missing';
  END IF;
  IF v_def NOT LIKE '%DUPLICATE_ORDER%' THEN
    RAISE EXCEPTION '00102: duplicate retry window missing';
  END IF;
  IF v_def NOT LIKE '%p_intentional%' THEN
    RAISE EXCEPTION '00102: p_intentional marker missing';
  END IF;
  -- Intent marker must never grant a privilege: the family gate sits BEFORE any
  -- use of p_intentional. Guard by checking gate-string index < intent-string
  -- index (gate runs unconditionally for every call).
  IF position('FAMILY_ACCOUNT_REQUIRED' in v_def) < 1
     OR position('COALESCE(p_intentional' in v_def) < 1
     OR position('FAMILY_ACCOUNT_REQUIRED' in v_def) > position('COALESCE(p_intentional' in v_def) THEN
    RAISE EXCEPTION '00102: p_intentional may precede server gates (security drift)';
  END IF;

  SELECT pg_get_functiondef('public.pilot_family_settle_and_deliver(uuid, jsonb, text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '00102: pilot_family_settle_and_deliver missing';
  END IF;
  IF v_def NOT LIKE '%ORDER_ALREADY_SETTLED%' THEN
    RAISE EXCEPTION '00102: financial idempotency guard missing';
  END IF;
  IF v_def NOT LIKE '%pilot_assert_transition%' THEN
    RAISE EXCEPTION '00102: settlement bypasses the canonical state machine';
  END IF;
END;
$$;