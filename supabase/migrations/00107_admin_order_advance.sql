-- ============================================================================
-- GATE V1.4 — ADMIN-OWNED ORDER FULFILLMENT (Vegetables Pilot).
-- Additive ONLY: one admin RPC advancing pilot orders along an explicit
-- whitelist, with status-history writes. No enum change (no 'ready' value;
-- preparing doubles as ready-for-handoff, labelled in UI only).
--
-- Why this exists: nothing in the codebase writes pending→confirmed or
-- →preparing today, and the only delivered-writer is the courier path
-- (pilot_courier_set_status, OFD-gated). The Vegetables Pilot runs
-- Family → Order → Admin → Prepare → External Handoff with NO courier:
--   pending → confirmed (accept) → preparing (start preparation;
--     UI-labelled ready-for-handoff) → delivered (explicit admin marking
--     AFTER the external handoff) ; pending/confirmed → cancelled.
-- Money boundary (verified, §11): pilot_family_settle_and_deliver posts
-- the money movement without touching orders.status, and
-- pilot_set_delivered_actuals requires preparing/out_for_delivery — so settle
-- runs BEFORE the delivered marking (UI enforces the order). This RPC writes
-- STATUS + HISTORY ONLY: no money math, no stock moves, no courier binding
-- (courier_user_id is never read nor written here), no access-control changes.
-- Order: after 00104 (numeric quantities) and 00079 (status history table).
-- Depends on: public.orders(id, status), public.order_status_history,
--   public.fn_admin_uid(). NOT applied to any DB by this file alone.
-- ============================================================================

-- 1) pilot_admin_advance_order(p_order_id, p_to_status) → admin-only advance.
CREATE OR REPLACE FUNCTION public.pilot_admin_advance_order(
  p_order_id  uuid,
  p_to_status text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := public.fn_admin_uid();
  v_cur    text;
  v_number text;
  v_ok     boolean := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL
     OR COALESCE(p_to_status, '') NOT IN
       ('confirmed', 'preparing', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.status, o.order_number INTO v_cur, v_number
    FROM public.orders o
   WHERE o.id = p_order_id;
  IF v_cur IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Explicit whitelist — any other pair (including out of terminal states
  -- and any *-courier state) is rejected. No courier columns touched.
  IF (v_cur = 'pending'   AND p_to_status IN ('confirmed', 'cancelled'))
     OR (v_cur = 'confirmed' AND p_to_status IN ('preparing', 'cancelled'))
     OR (v_cur = 'preparing' AND p_to_status = 'delivered') THEN
    v_ok := TRUE;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'TRANSITION_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders o
     SET status = p_to_status,
         updated_at = now()
   WHERE o.id = p_order_id;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, event_type,
    actor_user_id, actor_role, reason, metadata
  ) VALUES (
    p_order_id, v_cur, p_to_status, p_to_status,
    v_uid, 'admin', '', '{}'
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'order_number', v_number,
    'previous_status', v_cur,
    'status', p_to_status
  );
END;
$$;

-- 2) Grants — least privilege: admin callers only (checked inside via
-- fn_admin_uid), callable by authenticated, invisible to anon/PUBLIC.
REVOKE ALL ON FUNCTION public.pilot_admin_advance_order(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_advance_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_advance_order(uuid, text) TO authenticated;
