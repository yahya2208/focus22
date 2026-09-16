-- ============================================================================
-- 00090 — Pilot courier-handoff invariant (GATE 2 implementation).
--
-- Root cause: the store_operator branch of `pilot_assert_transition` allowed
-- `preparing -> out_for_delivery` with NO courier assigned, producing orders
-- stranded in `out_for_delivery` with `courier_user_id IS NULL` (2 observed).
--
-- Change (single, surgical; everything else preserved verbatim from 00079):
--   * store_operator may only reach `out_for_delivery` when the order is
--     assigned to a courier (`v_assigned IS NOT NULL`).
--   * admin keeps the full prior matrix (incl. out_for_delivery -> delivered)
--     so stranded orders remain recoverable by an operator; courier matrix is
--     unchanged (`preparing -> out_for_delivery`, `out_for_delivery ->
--     delivered`); `confirmed -> out_for_delivery` is still NOT allowed for
--     the courier.
--
-- Authoritative definition: this file is the final CREATE of
-- `pilot_assert_transition` (supersedes 00079). ACL matches 00079: the
-- function stays internal-only, called by the SECURITY DEFINER wrappers
-- (`pilot_order_set_status`, `pilot_courier_set_status`, `pilot_order_accept`),
-- which own explicit execute rights on it as postgres.
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
  -- GATE 2: store_operator -> out_for_delivery requires an assigned courier
  -- (v_assigned IS NOT NULL); admin keeps the full prior matrix; courier is
  -- unchanged; courier `confirmed -> out_for_delivery` is NOT permitted.
  -- ===================================================================
  v_allowed := (
    (v_role = 'admin' AND (
      (v_cur = 'pending'          AND p_new_status = 'confirmed')
      OR (v_cur = 'pending'          AND p_new_status = 'cancelled')
      OR (v_cur = 'confirmed'        AND p_new_status = 'preparing')
      OR (v_cur = 'confirmed'        AND p_new_status = 'cancelled')
      OR (v_cur = 'preparing'        AND p_new_status = 'out_for_delivery')
      OR (v_cur = 'preparing'        AND p_new_status = 'cancelled')
      OR (v_cur = 'out_for_delivery' AND p_new_status = 'delivered')
    ))
    OR (v_role = 'store_operator' AND (
      (v_cur = 'pending'          AND p_new_status = 'confirmed')
      OR (v_cur = 'pending'          AND p_new_status = 'cancelled')
      OR (v_cur = 'confirmed'        AND p_new_status = 'preparing')
      OR (v_cur = 'confirmed'        AND p_new_status = 'cancelled')
      OR (v_cur = 'preparing'        AND p_new_status = 'cancelled')
      OR (v_cur = 'preparing'        AND p_new_status = 'out_for_delivery' AND v_assigned IS NOT NULL)
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

-- Internal-only ACL (identical posture to 00079:688-690): the function is
-- invoked exclusively by the SECURITY DEFINER wrappers running as postgres.
REVOKE ALL ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_assert_transition(uuid, text, boolean) FROM authenticated;