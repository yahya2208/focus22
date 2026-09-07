-- ============================================================================
-- 00079  Delivery Operating System — ORDER LIFECYCLE + STATUS HISTORY
-- ----------------------------------------------------------------------------
-- Gate 3 (GATE-1 architecture §1 ORDER LIFECYCLE, §2 ORDER HISTORY, §3
-- ASSIGNMENT, §305 00079 scope).
--
-- Type: Hardening + additive. One new private helper, one new table, one new
-- read RPC; four existing RPCs RE-created with the SAME signatures, error codes
-- and grant contracts but server-authoritative bodies.
--
-- Single canonical state machine (GATE-1 §1.1). Actor kinds:
--   A = admin (fn_admin_uid), O = store operator (stores.operator_user_id),
--   C = assigned courier (orders.courier_user_id = auth.uid()), S = system.
--
--   (none)       -> confirmed          customer (delivery_create_order; event 'created')
--   pending      -> confirmed          A, O
--   pending      -> cancelled          A, O
--   confirmed    -> preparing          A, O
--   confirmed    -> cancelled          A, O
--   preparing    -> out_for_delivery   A, O, C      (C must be the assigned courier)
--   preparing    -> cancelled          A, O
--   out_for_delivery -> delivered      A, O, C      (C must be the assigned courier)
--
-- All other (from,to) pairs are REJECTED server-side with TRANSITION_NOT_ALLOWED
-- (22023); identity/scope failures raise PERMISSION_DENIED (42501). delivered
-- and cancelled are TERMINAL - no actor can leave them. The matrix lives in
-- EXACTLY ONE place: the private helper pilot_assert_transition. No frontend
-- rule set exists; no admin unrestricted "set any status" exists.
--
-- order_status_history is append-only and written ONLY by server-side
-- SECURITY DEFINER functions in the SAME transaction as the transition they
-- record (UPDATE + INSERT atomic; no AFTER trigger, no client path).
--
-- Event types (canonical, GATE-1 §2): created, confirmed, preparing,
-- out_for_delivery, delivered, cancelled, courier_assigned, reassigned,
-- status_set. This gate PRODUCES: created, <new_status> (status transitions
-- are named after the target status), courier_assigned. 'reassigned' and
-- 'status_set' remain in the canonical set (future admin reassignment) but no
-- path produces them yet.
--
-- Assignment (GATE-1 §1.1/§3): orders.courier_user_id + courier_assigned_at
-- remain the single authoritative assignment record (NO new order status).
-- pilot_order_accept keeps its race-safe unassigned-only UPDATE (exactly one
-- winner) and now records a courier_assigned event in the same transaction.
-- pilot_courier_set_status is tightened from store-scoped ACTIVE membership to
-- ASSIGNMENT-SCOPED: a courier may only progress an order assigned to them.
--
-- Delivery creation: delivery_create_order (00069 confirmed-first) records the
-- single 'created' event (previous_status=''). Legacy orders (today's 4) get
-- NO invented history; authoritative history begins at the new lifecycle point.
--
-- Telemetry/RBAC/Realtime/location are NOT touched (see Rollback + boundaries).
--
-- Rollback: (revert restores the exact 00078 state with no history loss):
--   * DROP TABLE public.order_status_history;           (drops indexes + RLS + policies)
--   * DROP FUNCTION public.pilot_assert_transition(uuid, text, boolean);
--   * DROP FUNCTION public.pilot_order_timeline(uuid);
--   * Re-apply the PREVIOUS definitions of the four CREATE OR REPLACE RPCs:
--     - pilot_order_set_status      (00065 migration body)
--     - pilot_order_accept          (00068 migration body)
--     - pilot_courier_set_status    (00070 migration body)
--     - delivery_create_order       (00069 migration body)
--   Since all four are CREATE OR REPLACE (definitions preserved in the earlier
--   immutable migrations), revert is a deterministic re-apply of earlier files.
-- ============================================================================

-- ============================================================================
-- 1) order_status_history — immutable, append-only, server-written timeline.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status  text NOT NULL CHECK (previous_status = '' OR previous_status IN
                       ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  new_status       text NOT NULL CHECK (new_status IN
                       ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled')),
  event_type       text NOT NULL CHECK (event_type IN
                       ('created','confirmed','preparing','out_for_delivery','delivered',
                        'cancelled','courier_assigned','reassigned','status_set')),
  actor_user_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role       text NOT NULL CHECK (actor_role IN
                       ('customer','store_operator','courier','admin')),
  reason           text NOT NULL DEFAULT '',
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Timeline retrieval is per-order; the leading order_id + time gives the exact
-- scan for pilot_order_timeline (and any future realtime per-order filter).
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_time
  ON public.order_status_history (order_id, created_at);

-- "When did this order reach status X" + admin status drill-down (GATE-1 §2).
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_status
  ON public.order_status_history (order_id, new_status);

-- Audit: "what did this actor do" (GATE-1 §2). Bounded per-actor day-views.
CREATE INDEX IF NOT EXISTS idx_order_status_history_actor_time
  ON public.order_status_history (actor_user_id, created_at);

-- No speculative index: the optional admin day-view partial index (created_at
-- DESC) is intentionally NOT built at pilot scale (documented in GATE-1 §2).

-- RLS: per GATE-1 §13, history is ADMIN-read-only at this gate (00079). Read
-- policies for owner/assignee/operator arrive with 00080 (Realtime). Direct
-- writes are impossible: NO INSERT/UPDATE/DELETE grant exists; the ONLY writers
-- are the SECURITY DEFINER functions below (function owner bypasses RLS).
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage order status history" ON public.order_status_history;
CREATE POLICY "Admin manage order status history"
  ON public.order_status_history FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.order_status_history TO authenticated;
-- Explicit write-path close: superuser DEFAULT PRIVILEGES would otherwise grant
-- INSERT/UPDATE/DELETE to anon/authenticated on newly created tables. The only
-- writers are the SECURITY DEFINER functions below (owner bypasses RLS).
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM anon;

-- ============================================================================
-- 2) Private transition authority — THE single canonical state machine.
--    SECURITY DEFINER + fixed search_path + NO client grant (owner-only), so
--    it can never be invoked directly by a client to bypass an RPC.
--    p_accept = true runs the race-safe ASSIGNMENT path (pilot_order_accept);
--    otherwise p_new_status is validated against the matrix below and applied
--    with UPDATE ... WHERE status = <read current> + ROW_COUNT=1 (concurrency).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_assert_transition(
  p_order_id   uuid,
  p_new_status text,
  p_accept     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_cur         text;
  v_order_store uuid;
  v_assigned    uuid;
  v_customer    uuid;
  v_role        text := 'customer';
  v_event_role  text := 'customer';
  v_allowed     boolean := false;
  v_done        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL
     OR (NOT p_accept AND COALESCE(p_new_status, '') NOT IN
         ('pending','confirmed','preparing','out_for_delivery','delivered','cancelled'))
  THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.store_id, o.courier_user_id, o.user_id
    INTO v_cur, v_order_store, v_assigned, v_customer
  FROM public.orders o
  WHERE o.id = p_order_id;
  IF v_order_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Authoritative actor resolution (computed server-side; never client-supplied).
  IF public.fn_admin_uid() IS NOT NULL THEN
    v_role := 'admin';
  ELSIF EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = v_order_store AND s.operator_user_id = v_uid
  ) THEN
    v_role := 'store_operator';
  ELSIF EXISTS (
    SELECT 1 FROM public.pilot_couriers pc
    WHERE pc.user_id = v_uid AND pc.store_id = v_order_store AND pc.status = 'active'
  ) THEN
    v_role := 'courier';
  ELSE
    v_role := 'customer';
  END IF;
  v_event_role := v_role;

  -- ===================================================================
  -- ASSIGNMENT MODE (pilot_order_accept): preserve the 00068 race-safe,
  -- unassigned-only guarded UPDATE and record the courier_assigned event.
  -- ===================================================================
  IF p_accept THEN
    IF v_role IN ('admin', 'courier', 'store_operator') THEN
      UPDATE public.orders
        SET courier_user_id     = v_uid,
            courier_assigned_at = now(),
            updated_at          = now()
      WHERE id = p_order_id
        AND courier_user_id IS NULL
        AND status IN ('confirmed', 'preparing');
      GET DIAGNOSTICS v_done = ROW_COUNT;
      IF v_done = 0 THEN
        RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';
      END IF;

      INSERT INTO public.order_status_history (
        order_id, previous_status, new_status, event_type,
        actor_user_id, actor_role, reason, metadata
      ) VALUES (
        p_order_id, v_cur, v_cur, 'courier_assigned',
        v_uid, v_event_role, 'Order accepted',
        jsonb_build_object('courier_user_id', v_uid)
      );

      RETURN jsonb_build_object(
        'order_id', p_order_id, 'status', v_cur, 'courier_user_id', v_uid
      );
    END IF;
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- ===================================================================
  -- STATUS MODE: validate against the single canonical matrix below.
  -- ===================================================================
  v_allowed := (
    (v_role IN ('admin', 'store_operator') AND (
      (v_cur = 'pending'          AND p_new_status = 'confirmed')
      OR (v_cur = 'pending'          AND p_new_status = 'cancelled')
      OR (v_cur = 'confirmed'        AND p_new_status = 'preparing')
      OR (v_cur = 'confirmed'        AND p_new_status = 'cancelled')
      OR (v_cur = 'preparing'        AND p_new_status = 'out_for_delivery')
      OR (v_cur = 'preparing'        AND p_new_status = 'cancelled')
      OR (v_cur = 'out_for_delivery' AND p_new_status = 'delivered')
    ))
    OR (v_role = 'courier' AND v_assigned = v_uid AND (
      (v_cur = 'preparing'         AND p_new_status = 'out_for_delivery')
      OR (v_cur = 'out_for_delivery' AND p_new_status = 'delivered')
    ))
  );

  IF NOT v_allowed THEN
    IF v_role = 'customer' OR (v_role = 'courier' AND v_assigned IS DISTINCT FROM v_uid) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  -- Atomic + race-safe: single guarded UPDATE on the read current status.
  UPDATE public.orders
    SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id AND status = v_cur;
  GET DIAGNOSTICS v_done = ROW_COUNT;
  IF v_done = 0 THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  -- History is written in the SAME transaction as the status change; a failure
  -- here rolls back the UPDATE above (no "status changed without history").
  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, event_type,
    actor_user_id, actor_role, reason, metadata
  ) VALUES (
    p_order_id, v_cur, p_new_status, p_new_status,
    v_uid, v_role, '', '{}'
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', p_new_status,
    'transition', jsonb_build_object('from', v_cur, 'to', p_new_status)
  );
END;
$$;

-- ============================================================================
-- 3) pilot_order_set_status — redefined, server-authoritative (GATE-1 §1.2).
--    Same signature/error-codes/grants. Re-checks operator_or_admin (unchanged),
--    then delegates to the shared matrix. Operator today is limited to the
--    O-column; admin explicitly keeps ONLY the same matrix (no unrestricted
--    admin override).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_order_set_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_store uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR COALESCE(p_status, '') NOT IN (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id INTO v_store FROM public.orders o WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN public.pilot_assert_transition(p_order_id, p_status, false);
END;
$$;

-- ============================================================================
-- 4) pilot_courier_set_status — redefined, ASSIGNMENT-SCOPED (GATE-1 §3).
--    Courier may only progress an order whose courier_user_id = auth.uid()
--    (or an admin), validated PLUS matrix PLUS active-membership server-side.
--    This removes courier-A-modifying-courier-B's-order (00070 store-scoped).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_courier_set_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR COALESCE(p_status, '') NOT IN (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND (o.courier_user_id = v_uid OR public.fn_admin_uid() IS NOT NULL)
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id) THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN public.pilot_assert_transition(p_order_id, p_status, false);
END;
$$;

-- ============================================================================
-- 5) pilot_order_accept — preserved race-safe claim (00068). The guarded
--    unassigned-only UPDATE now lives inside pilot_assert_transition; the
--    courier_assigned history event is written in the same transaction.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_order_accept(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_store uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id INTO v_store FROM public.orders o WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.pilot_couriers pc
      WHERE pc.user_id = v_uid AND pc.store_id = v_store AND pc.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN public.pilot_assert_transition(p_order_id, NULL, true);
END;
$$;

-- ============================================================================
-- 6) delivery_create_order — recorded 'created' event (GATE-1 §1.1/-§2).
--    Minimal change: keeps the 00069 confirmed-first body VERBATIM and adds
--    exactly one INSERT of the 'created' history event. No checkout rewrite.
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
    'neighborhood_id', v_neigh_id
  );
END;
$$;

-- ============================================================================
-- 7) pilot_order_timeline — ordered immutable history for the AUTHORISED
--    viewer only (owner / assigned courier / store operator / admin).
--    No enumeration leak: a non-authorised id returns ORDER_NOT_FOUND.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_order_timeline(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_ok     boolean;
  v_events jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        public.fn_admin_uid() IS NOT NULL
        OR o.user_id = v_uid
        OR o.courier_user_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.stores s
          WHERE s.id = o.store_id AND s.operator_user_id = v_uid
        )
      )
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'order_id', h.order_id,
        'previous_status', h.previous_status,
        'new_status', h.new_status,
        'event_type', h.event_type,
        'actor_user_id', h.actor_user_id,
        'actor_role', h.actor_role,
        'reason', h.reason,
        'metadata', h.metadata,
        'created_at', h.created_at
      )
      ORDER BY h.created_at ASC, h.id ASC
    ),
    '[]'::jsonb
  ) INTO v_events
  FROM public.order_status_history h
  WHERE h.order_id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'events', v_events);
END;
$$;

-- ============================================================================
-- 8) Grants — least privilege, identical REVOKE ALL + anon-revoke + GRANT
--    EXECUTE contract for client-facing RPCs. The private helper gets NO grant
--    (owner-only; clients cannot invoke it to bypass the matrix).
-- ============================================================================
REVOKE ALL ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM authenticated;

REVOKE ALL ON FUNCTION public.pilot_order_timeline(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_order_timeline(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_order_timeline(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_order_set_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_order_set_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_order_set_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_courier_set_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_courier_set_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_courier_set_status(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_order_accept(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_order_accept(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_order_accept(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated;

-- ============================================================================
-- 9) Post-checks — fail loudly if the structural contract is not met.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_status_history'
  ) THEN
    RAISE EXCEPTION '00079: order_status_history missing after migration';
  END IF;
  -- Guard asserts the count of the six canonical base columns is EXACTLY 6
  -- (raises when any is missing). Historical bug: `HAVING count(*)=0` inverted
  -- the check so it fired precisely when the columns existed.
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'order_status_history'
        AND column_name IN ('order_id','previous_status','new_status','event_type','actor_role','created_at')
  ) <> 6 THEN
    RAISE EXCEPTION '00079: order_status_history base columns missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_namespace n JOIN pg_proc p ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN (
      'pilot_assert_transition', 'pilot_order_timeline'
    )
  ) THEN
    RAISE EXCEPTION '00079: lifecycle RPC(s) missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'order_status_history'
      AND indexname = 'idx_order_status_history_order_time'
  ) THEN
    RAISE EXCEPTION '00079: order_status_history timeline index missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_status_history'
      AND policyname = 'Admin manage order status history'
  ) THEN
    RAISE EXCEPTION '00079: order_status_history admin policy missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'order_status_history'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION '00079: authenticated has a WRITE grant on order_status_history';
  END IF;
END;
$$;