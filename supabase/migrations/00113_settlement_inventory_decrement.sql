-- ============================================================================
-- 00113  GATE S1 — SETTLEMENT INVENTORY DECREMENT (atomic with PURCHASE).
-- ----------------------------------------------------------------------------
-- Additive ONLY: re-issues `pilot_family_settle_and_deliver` VERBATIM except
-- for ONE inserted block (atomic stock decrement, §3 below). Signature,
-- authz, financial math, ledger/debt writes, idempotency guard, grants and
-- response shape (plus two additive diagnostic keys) are preserved.
--
-- Why here: no reusable stock RPC exists for settle's caller set (the
-- inventory_add/remove/adjust_stock trio requires inventory_is_admin(),
-- which store operators and assigned couriers fail). Decrementing inside the
-- DEFINER settle body keeps ALL-OR-NOTHING: any failure rolls back actuals,
-- stock, transition, PURCHASE and debt together.
--
-- Movements: NOT written here. `trg_inventory_items_audit` (00019) derives
-- the audit row from the UPDATE below (before/after diff, negative delta,
-- action 'stock_removed'). Gate 2 MUST verify that trigger live before any
-- settlement test.
--
-- Quantity rule: per line, decrement COALESCE(delivered_quantity, quantity)
-- (delivered actuals recorded just above; requested fallback identical to
-- the subtotal math). Lines with empty/non-UUID catalog_ref (free-form
-- legacy rows) have no stock row: counted as skipped, never failed.
-- Insufficient stock raises INSUFFICIENT_STOCK (22023): no PURCHASE, no
-- delivered, no partial decrement. No clamping (clamping would misstate
-- fulfillment).
--
-- Response: the 8 historical keys are byte-identical; two ADDITIVE keys
-- (`stock_lines`, `stock_skipped`) expose the skip explicitly without
-- altering any existing consumer contract.
--
-- Order: after 00102 (shape source) and 00104 (numeric quantities). No other
-- dependency. NOT applied to any DB by this file alone.
-- Rollback: re-apply supabase/migrations/00102_family_order_settlement.sql
-- (restores the no-decrement body; same signature/grants).
-- ============================================================================

-- 1) Settle + deliver, with atomic inventory decrement.
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

  -- === §3 ATOMIC INVENTORY DECREMENT (00113 addition; all else verbatim) ===
  -- Per order line with a UUID catalog_ref, decrement the resolved fulfilled
  -- quantity. Row lock serialises concurrent settlements of the same stock.
  FOR v_line IN
    SELECT oi.catalog_ref AS ref,
           COALESCE(oi.delivered_quantity, oi.quantity) AS need
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    v_need := v_line.need;
    IF v_line.ref IS NULL OR btrim(v_line.ref) = ''
       OR v_line.ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      -- Free-form legacy line: no stock row exists. Explicit skip (counted in
      -- the additive response keys), never a failure.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF v_need IS NULL OR v_need <= 0 THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
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

-- 2) Grants — identical posture to 00102 (settle RPC only; create untouched).
REVOKE ALL ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text) TO authenticated;

-- ============================================================================
-- 3) Post-checks (fail loudly on drift).
-- ============================================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_family_settle_and_deliver(uuid, jsonb, text)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%INSUFFICIENT_STOCK%' THEN
    RAISE EXCEPTION '00113: stock guard missing from settle body';
  END IF;
  IF v_def NOT LIKE '%UPDATE public.inventory_items%' THEN
    RAISE EXCEPTION '00113: inventory decrement missing from settle body';
  END IF;
  IF v_def NOT LIKE '%ORDER_ALREADY_SETTLED%' THEN
    RAISE EXCEPTION '00113: financial idempotency guard missing';
  END IF;
  IF v_def NOT LIKE '%pilot_assert_transition%' THEN
    RAISE EXCEPTION '00113: settlement bypasses the canonical state machine';
  END IF;
END;
$$;
