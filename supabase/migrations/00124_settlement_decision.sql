-- ============================================================================
-- 00124  Settlement decision: balance-gated PURCHASE with admin ACCEPT/REJECT
-- ----------------------------------------------------------------------------
-- Product rule: a family order settles against available_balance =
-- GREATEST(SUM(ledger.amount), 0). Shortfall no longer auto-overdrafts.
--
--   NORMAL + covered      -> existing full path (PURCHASE -total, debt settled)
--   NORMAL + shortfall    -> NO MUTATION; returns insufficient_balance probe
--   ACCEPT_DEBT + shortfall (admin/operator only)
--                         -> PURCHASE -covered, debt open(remaining=shortfall)
--   REJECT (admin/operator only)
--                         -> NO money/stock/actuals; order -> cancelled
--
-- Design points (see approved plan):
--   * Single transaction; family row FOR UPDATE serializes same-family
--     settles (skipped when v_family IS NULL — no money moves there).
--   * Probe phase is PURE compute: validates p_items (S1 rules), resolves
--     prices from stored order_items, checks stock availability with plain
--     reads, reads balance. It persists NOTHING (no actuals, no stock, no
--     ledger, no status, no history).
--   * Decision execution re-runs the FULL pipeline (record actuals, locked
--     stock loop, transition, money) so stale probe figures can never
--     execute. Idempotency check sits inside the lock.
--   * pilot_assert_transition gains optional p_reason/p_metadata (defaults
--     preserve every existing caller) and one additive matrix arm:
--     out_for_delivery -> cancelled for admin/store_operator (courier keeps
--     existing rights; REJECT itself is admin/operator-only anyway).
--   * push_log gains an event dimension (data-preserving; existing rows
--     become 'order_created') so settle-event pushes are not swallowed as
--     duplicates of the creation push.
-- Untouched: everything else — signatures gain only DEFAULT params,
-- signatures/returns of all other RPCs, ledger/debts/orders/history schemas
-- (except push_log key), Auth/RBAC, historical migrations.
-- Rollback: re-apply the 00113 + 00079 bodies from repo history (break-glass
-- only; restores silent-overdraft semantics — requires explicit acceptance).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) pilot_assert_transition — optional reason/metadata + OFD->cancelled arm
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pilot_assert_transition(
  p_order_id   uuid,
  p_new_status text,
  p_accept     boolean DEFAULT false,
  p_reason     text DEFAULT '',
  p_metadata   jsonb DEFAULT '{}'
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
  -- 00124 adds exactly one arm: out_for_delivery -> cancelled for
  -- admin/store_operator (REJECT path). Courier rights unchanged.
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
      OR (v_cur = 'out_for_delivery' AND p_new_status = 'cancelled')
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
    v_uid, v_role, COALESCE(p_reason, ''), COALESCE(p_metadata, '{}')
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'status', p_new_status,
    'transition', jsonb_build_object('from', v_cur, 'to', p_new_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_assert_transition(uuid, text, boolean, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean, text, jsonb) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2) pilot_family_settle_and_deliver — decision-gated settlement
-- ----------------------------------------------------------------------------
-- The legacy 3-arg overload must not survive: PostgreSQL would otherwise
-- route 3-arg calls to the OLD body (silent overdraft). Dropping it first
-- makes every call resolve to the 4-arg definition below with
-- p_decision DEFAULT 'NORMAL'. No data depends on the function object.
DROP FUNCTION IF EXISTS public.pilot_family_settle_and_deliver(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.pilot_family_settle_and_deliver(
  p_order_id uuid,
  p_items    jsonb DEFAULT '[]'::jsonb,
  p_reason   text DEFAULT '',
  p_decision text DEFAULT 'NORMAL'
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
  -- 00124 decision support
  v_is_admin     boolean := FALSE;
  v_is_operator  boolean := FALSE;
  v_cid          uuid;
  v_cq           numeric;
  v_oq           numeric;
  v_op           numeric;
  v_probe_sub    numeric := 0;
  v_available    numeric := 0;
  v_shortfall    numeric := 0;
  v_covered      numeric;
  v_sku_stock    numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('NORMAL', 'ACCEPT_DEBT', 'REJECT') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id, o.courier_user_id, o.family_id, o.status, o.order_number, o.delivery_fee
    INTO v_store, v_assigned, v_family, v_status, v_order_no, v_delivery_fee
  FROM public.orders o
  WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.fn_admin_uid() IS NOT NULL;
  v_is_operator := EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = v_store AND s.operator_user_id = v_uid
  );
  IF NOT (v_is_admin OR v_is_operator OR v_assigned = v_uid) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  -- Debt decisions are admin/operator-only. Couriers keep the normal path.
  IF p_decision IN ('ACCEPT_DEBT', 'REJECT') AND NOT (v_is_admin OR v_is_operator) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Family-level serialization: same-family settles queue here instead of
  -- double-spending one balance snapshot. Skipped when no family money moves.
  IF v_family IS NOT NULL THEN
    PERFORM 1 FROM public.family_groups WHERE id = v_family FOR UPDATE;
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

  -- === PROBE (pure compute — persists NOTHING) ===
  -- Validate p_items under S1 rules and resolve the effective total from
  -- server-stored prices. Mirrors the execution path below; execution
  -- re-validates everything, so stale probe figures can never run.
  v_probe_sub := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
  ) LOOP
    v_cid := (v_item->>'id')::uuid;
    v_cq  := (v_item->>'delivered_quantity')::numeric;
    IF v_cid IS NULL OR v_cq IS NULL OR v_cq < 0 THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT oi.quantity, oi.unit_price INTO v_oq, v_op
      FROM public.order_items oi
     WHERE oi.id = v_cid AND oi.order_id = p_order_id;
    IF v_oq IS NULL THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_cq > v_oq THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    v_probe_sub := v_probe_sub + v_cq * COALESCE(v_op, 0);
  END LOOP;
  -- Lines without submitted actuals keep their stored effective value.
  SELECT COALESCE(SUM(
      CASE WHEN oi.delivered_quantity IS NOT NULL
           THEN oi.delivered_quantity * oi.unit_price
           ELSE oi.quantity * oi.unit_price END
    ), 0)
    INTO v_final_sub
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
      ) AS pi WHERE (pi->>'id')::uuid = oi.id
    );
  v_probe_sub := v_probe_sub + v_final_sub;
  -- Stock availability, read-only (execution re-checks under row locks).
  FOR v_line IN
    SELECT oi.catalog_ref AS ref,
           COALESCE(
             (SELECT (pi->>'delivered_quantity')::numeric
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
                ) AS pi WHERE (pi->>'id')::uuid = oi.id),
             oi.delivered_quantity, oi.quantity) AS need
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    IF v_line.ref IS NULL OR btrim(v_line.ref) = ''
       OR v_line.ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      CONTINUE;
    END IF;
    IF v_line.need IS NULL OR v_line.need < 0 THEN
      RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_line.need = 0 THEN
      CONTINUE;
    END IF;
    SELECT ii.quantity INTO v_sku_stock
      FROM public.inventory_items ii
     WHERE ii.id = v_line.ref::uuid;
    IF v_sku_stock IS NOT NULL AND v_sku_stock < v_line.need THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Balance under the family lock; available never goes below zero so legacy
  -- negative balances cannot fund new spending.
  IF v_family IS NOT NULL THEN
    SELECT COALESCE(SUM(l.amount), 0) INTO v_prior
      FROM public.ledger l
     WHERE l.family_id = v_family;
  ELSE
    v_prior := 0;
  END IF;
  v_available := GREATEST(v_prior, 0);
  v_final_total := v_probe_sub + v_delivery_fee;
  v_shortfall := v_final_total - v_available;

  -- REJECT path: no money, no stock, no actuals. Transition + audit only.
  IF p_decision = 'REJECT' THEN
    PERFORM public.pilot_assert_transition(
      p_order_id, 'cancelled', false, 'INSUFFICIENT_BALANCE',
      jsonb_build_object('decision', 'REJECT', 'shortfall', GREATEST(v_shortfall, 0),
                         'balance', v_available, 'total', v_final_total)
    );
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'status', 'cancelled',
      'decision_applied', 'REJECT',
      'available_balance', v_available,
      'order_total', v_final_total,
      'shortfall', GREATEST(v_shortfall, 0)
    );
  END IF;

  -- NORMAL with shortfall: probe response only. No mutation of any kind —
  -- no actuals, no stock, no PURCHASE, no debt, no status, no history.
  IF v_shortfall > 0 AND p_decision = 'NORMAL' THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'status', 'insufficient_balance',
      'available_balance', v_available,
      'order_total', v_final_total,
      'shortfall', v_shortfall,
      'requires_admin_decision', (v_is_admin OR v_is_operator)
    );
  END IF;

  -- === EXECUTION (NORMAL-covered or ACCEPT_DEBT) ===
  -- Record actual fulfilled quantities (same authz; preparing/OFD only).
  -- S1 caps re-enforced inside; zero accepted, over-ordered rejected.
  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    PERFORM public.pilot_set_delivered_actuals(p_order_id, p_items);
  END IF;

  -- === ATOMIC INVENTORY DECREMENT (00113, bounds re-checked below) ===
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
  -- ACCEPT_DEBT carries attribution; NORMAL keeps the historical shape.
  IF p_decision = 'ACCEPT_DEBT' THEN
    v_covered := v_available;
    PERFORM public.pilot_assert_transition(
      p_order_id, 'delivered', false, 'ACCEPT_DEBT',
      jsonb_build_object('decision', 'ACCEPT_DEBT', 'shortfall', v_shortfall,
                         'balance', v_available, 'total', v_final_total)
    );
  ELSE
    v_covered := v_final_total;
    PERFORM public.pilot_assert_transition(p_order_id, 'delivered', false);
  END IF;

  v_final_total := v_final_sub + v_delivery_fee;

  -- Family-bound orders post the single full-value PURCHASE movement.
  -- ACCEPT_DEBT posts the covered portion only: the ledger can never go
  -- negative through this path (balance_after >= prior >= 0 by construction).
  IF v_family IS NOT NULL THEN
    v_after := v_prior - v_covered;

    INSERT INTO public.ledger (
      family_id, transaction_type, amount, related_order_id,
      reference, note, balance_after, created_by
    ) VALUES (
      v_family, 'PURCHASE', -v_covered, p_order_id,
      COALESCE(v_order_no, p_order_id::text),
      COALESCE(btrim(p_reason), ''), v_after, v_uid
    );

    -- Debt tracking (monitoring of the uncovered remainder — never a ledger
    -- account, never added to SUM(ledger.amount)).
    v_remaining := GREATEST(v_final_total - v_covered, 0);
    INSERT INTO public.debts (
      family_id, order_id, original_total, covered, remaining, status
    ) VALUES (
      v_family, p_order_id, v_final_total,
      v_covered, v_remaining,
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
    'stock_skipped', v_skipped,
    'decision_applied', p_decision,
    'available_balance', v_available,
    'shortfall', GREATEST(v_shortfall, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_family_settle_and_deliver(uuid, jsonb, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) push_log event dimension (data-preserving; existing rows = order_created)
-- ----------------------------------------------------------------------------
ALTER TABLE public.push_log ADD COLUMN IF NOT EXISTS event text NOT NULL DEFAULT 'order_created';
ALTER TABLE public.push_log DROP CONSTRAINT IF EXISTS push_log_pkey;
ALTER TABLE public.push_log ADD PRIMARY KEY (order_id, endpoint, event);

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply, read-only)
-- ============================================================================
-- 1. New 4-arg signature with NORMAL default (old 3-arg calls keep working):
--      SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--       WHERE proname = 'pilot_family_settle_and_deliver';
-- 2. Decision + lock + probe markers present, S1 caps intact:
--      SELECT pg_get_functiondef('public.pilot_family_settle_and_deliver(uuid,jsonb,text,text)'::regprocedure)
--        LIKE '%p_decision%insufficient_balance%FOR UPDATE%v_need > v_line.ordered%';
-- 3. Matrix arm + attribution params on assert_transition:
--      SELECT pg_get_functiondef('public.pilot_assert_transition(uuid,text,boolean,text,jsonb)'::regprocedure)
--        LIKE '%out_for_delivery%cancelled%';
-- 4. push_log key is (order_id, endpoint, event).
-- 5. Grants: authenticated-only EXECUTE on the new settle shape; assert_transition
--    stays revoke-only (internal use through definer callers).
-- ============================================================================
