-- ============================================================================
-- 00080  Delivery Operating System — ORDER ASSIGNMENT SYSTEM
-- ----------------------------------------------------------------------------
-- Gate 4 (GATE-1 architecture §1 ORDER LIFECYCLE §1.1, §3 ASSIGNMENT,
-- §303 reassignment RPC, §305 migration map). Supersedes the 00080 slot
-- previously described in the architecture for realtime read policies: the
-- user repurposed GATE 4 for the assignment authority, so 00080 is this
-- migration and realtime remains out of scope (see map in report).
--
-- Type: Additive + hardening. One new admin-only RPC
-- pilot_admin_assign_order(uuid, uuid) and one hardening statement that
-- closes the direct client write path to public.orders.
--
-- PROBLEM (audit):
--   * public.orders inherits GRANT INSERT, UPDATE, DELETE ON orders TO
--     authenticated (00050:333) and the "Staff manage orders" RLS policy is
--     FOR ALL for users with role IN ('admin','super_admin'). Since
--     fn_admin_uid() is exactly that role predicate (00065), an admin account
--     can today bypass every SECURITY DEFINER RPC and run a plain
--     `UPDATE orders SET courier_user_id = ...` through PostgREST. GATE-4
--     §18 forbids that; assignment must flow through a safe RPC only.
--   * No admin assignment authority exists (audit of all pilot_admin_* shows
--     no assign/reassign function).
--
-- ASSIGNMENT MODEL (final, this gate):
--   * orders.courier_user_id + orders.courier_assigned_at (00068) remain the
--     SINGLE authoritative assignment record. There is NO new order status:
--     assignment never changes order.status (previous_status = new_status).
--   * Only an admin (fn_admin_uid()) may assign or reassign. Store operators
--     have NO assignment power (architecture chose admin-only; operator moves
--     orders through pilot_order_set_status). Couriers can never touch
--     courier_user_id (they accept unassigned orders via pilot_order_accept,
--     unchanged from 00079).
--   * FIRST assignment (courier_user_id IS NULL) records event_type
--     'courier_assigned' with metadata {"courier_user_id": <id>}.
--   * REASSIGNMENT (courier_user_id != new target) records event_type
--     'reassigned' with metadata {"previous_courier_user_id": <old>,
--     "new_courier_user_id": <new>}. Same-courier repeat is an idempotent
--     no-op that returns current state without writing history.
--   * History is the existing append-only order_status_history (00079,
--     same canonical event_types courier_assigned/reassigned; assigned
--     events carry actor_role 'admin').
--
-- ELIGIBILITY (server-side, no UI rule):
--   * Assignable window: order.status IN ('confirmed','preparing'). pending is
--     not yet confirmed by the store operator (premature to dispatch);
--     out_for_delivery onward the assignment is frozen; delivered/cancelled
--     are TERMINAL — assignment is immutable and the order can never be
--     reopened through assignment.
--   * Target courier must be an ACTIVE membership in public.pilot_couriers
--     whose store_id equals the order's store_id. That chains
--     order -> store -> neighborhood -> courier, so a courier from a
--     different neighborhood/store is rejected even before status rules.
--
-- CONCURRENCY (deterministic):
--   * The order row is locked (SELECT ... FOR UPDATE) inside the RPC. Two
--     simultaneous admin assignments serialize: the loser's wait re-reads the
--     winner's courier and records a correct 'reassigned' (or a no-op if the
--     same courier) — never a lost write.
--   * Courier-accept vs admin-assign: both UPDATE the same order row, so the
--     row lock serializes them. If accept commits first, a following admin
--     assign reads the accepted courier and records 'reassigned'. If assign
--     commits first, the guarded accept UPDATE (courier_user_id IS NULL,
--     00068/00079) matches zero rows and raises ORDER_UNASSIGNABLE. Both
--     orders are deterministic.
--   * The UPDATE is re-guarded (WHERE id = ... AND courier_user_id IS NOT
--     DISTINCT FROM <value read under lock>) so a surprise change between
--     read and write aborts the transaction with ORDER_UNASSIGNABLE instead
--     of silently overwriting.
--
-- ATOMICITY: assignment UPDATE + history INSERT happen in the single
-- SECURITY DEFINER function body = one implicit transaction. Level-crossing
-- is impossible; no AFTER trigger; no client path.
--
-- READ MODEL (GATE-4 §17, audit result): no new read RPC is needed.
--   * Staff (admin/operator): pilot_orders_for_store(uuid) returns SETOF
--     public.orders including courier_user_id + courier_assigned_at.
--   * Assigned courier:      pilot_orders_for_courier() exposes the order
--     with courier_assigned_at (00068).
--   * Owner/admin/operator:  pilot_order_timeline(order_id) returns the
--     courier_assigned/reassigned events in order (00079).
--   The assign RPC returns the authoritative new assignment state so the
--   caller never re-reads.
--
-- BOUNDARIES (this gate): NO order.status change; NO unassign path (GATE-1 §3
-- keeps the last assignee on cancel); NO operator/courier assignment power;
-- NO telemetry / RBAC / realtime / location / GPS / account changes; NO touch
-- of production data; assignment is dispatch-only.
--
-- Dependencies: 00068 (orders.courier_user_id/courier_assigned_at,
-- pilot_couriers), 00079 (order_status_history + event_types). Like 00079,
-- this migration is NOT applied to production (git-only until deployment).
--
-- Rollback (reverts to the exact 00079 state; no data loss — writes already
-- carried no client path):
--   * DROP FUNCTION public.pilot_admin_assign_order(uuid, uuid);
--   * GRANT INSERT, UPDATE, DELETE ON public.orders TO authenticated;
-- ============================================================================

-- ============================================================================
-- 1) HARDENING — close the direct client write path on public.orders
-- ----------------------------------------------------------------------------
-- The RLS policy ("Staff manage orders", FOR ALL, admin/super_admin) alone is
-- NOT a guard for courier_user_id: Postgres RLS is row-level, cannot single
-- out one column, and fn_admin_uid() users pass the policy. Revoking the
-- table privilege preserves reads (SELECT stays; staff reads keep working via
-- "Staff read orders" / SECURITY DEFINER RPCs) while making every mutation of
-- an order — including assignment — flow exclusively through SECURITY DEFINER
-- functions, which run as owner and are unaffected. The FOR ALL policy becomes
-- inert (no privilege to filter) but is left untouched to minimise churn.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;

-- ============================================================================
-- 2) Admin assignment authority
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_assign_order(
  p_order_id       uuid,
  p_courier_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_store          uuid;
  v_status         public.orders.status%TYPE;
  v_current_courier public.orders.courier_user_id%TYPE;
  v_event_type     text;
  v_metadata       jsonb;
  v_updated_at     timestamptz := now();
  v_rows           int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR p_courier_user_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF public.fn_admin_uid() IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Row lock serialises concurrent assignments/accepts on the same order.
  SELECT o.store_id, o.status, o.courier_user_id
    INTO v_store, v_status, v_current_courier
    FROM public.orders o
   WHERE o.id = p_order_id
     FOR UPDATE;

  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Assignment never changes order.status; eligibility window is closed once
  -- the courier is out_for_delivery and terminal states are immutable.
  IF v_status IS DISTINCT FROM 'confirmed' AND v_status IS DISTINCT FROM 'preparing' THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_ALLOWED' USING ERRCODE = 'P0002';
  END IF;

  -- Courier eligibility: ACTIVE membership of the SAME store as the order
  -- (order -> store -> neighborhood -> courier chain; blocks cross-store /
  -- cross-neighborhood / inactive / suspended membership).
  PERFORM 1
    FROM public.pilot_couriers c
   WHERE c.user_id = p_courier_user_id
     AND c.store_id = v_store
     AND c.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURIER_INELIGIBLE' USING ERRCODE = '22023';
  END IF;

  -- Same-courier repeat is idempotent: no new event, return current state.
  IF v_current_courier IS NOT DISTINCT FROM p_courier_user_id THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'courier_user_id', v_current_courier,
      'courier_assigned_at', (SELECT courier_assigned_at FROM public.orders WHERE id = p_order_id),
      'status', v_status,
      'event_type', 'noop',
      'reassigned_from', NULL
    );
  END IF;

  IF v_current_courier IS NULL THEN
    v_event_type := 'courier_assigned';
    v_metadata   := jsonb_build_object('courier_user_id', p_courier_user_id);
  ELSE
    v_event_type := 'reassigned';
    v_metadata   := jsonb_build_object(
      'previous_courier_user_id', v_current_courier,
      'new_courier_user_id', p_courier_user_id
    );
  END IF;

  -- Re-guarded write under the held lock: abort instead of overwriting a
  -- state that changed after our read.
  UPDATE public.orders
     SET courier_user_id = p_courier_user_id,
         courier_assigned_at = v_updated_at,
         updated_at = v_updated_at
   WHERE id = p_order_id
     AND courier_user_id IS NOT DISTINCT FROM v_current_courier;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ORDER_UNASSIGNABLE' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, event_type,
    actor_user_id, actor_role, reason, metadata, created_at
  ) VALUES (
    p_order_id, v_status, v_status, v_event_type,
    v_uid, 'admin', '', v_metadata, v_updated_at
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'courier_user_id', p_courier_user_id,
    'courier_assigned_at', v_updated_at,
    'status', v_status,
    'event_type', v_event_type,
    'reassigned_from', v_current_courier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM anon;

-- ============================================================================
-- 3) Post-apply integrity (checks migrate; failures abort with clear reason)
-- ============================================================================
DO $$
DECLARE
  v_def             text;
  v_dml             int;
  v_hist_ok         boolean;
  v_grants_ok       int;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_assign_order(uuid, uuid)'::regprocedure)
    INTO v_def;

  IF v_def IS NULL OR v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'INTEGRITY_ADMIN_ASSIGN_LOCK_MISSING';
  END IF;
  IF v_def NOT LIKE '%courier_assigned%' OR v_def NOT LIKE '%reassigned%' THEN
    RAISE EXCEPTION 'INTEGRITY_ADMIN_ASSIGN_EVENTS_MISSING';
  END IF;
  IF v_def NOT LIKE '%COURIER_INELIGIBLE%' OR v_def NOT LIKE '%ASSIGNMENT_NOT_ALLOWED%' THEN
    RAISE EXCEPTION 'INTEGRITY_ADMIN_ASSIGN_GUARDS_MISSING';
  END IF;
  IF v_def NOT LIKE '%order_status_history%' THEN
    RAISE EXCEPTION 'INTEGRITY_ADMIN_ASSIGN_HISTORY_MISSING';
  END IF;
  IF v_def NOT LIKE '%fn_admin_uid%' THEN
    RAISE EXCEPTION 'INTEGRITY_ADMIN_ASSIGN_AUTH_MISSING';
  END IF;

  -- Direct DML on orders must be gone (SELECT stays).
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND grantee = 'authenticated'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION 'INTEGRITY_ORDERS_DIRECT_DML_NOT_REVOKED';
  END IF;

  -- Execution grants on the new RPC exactly once, never PUBLIC.
  SELECT count(*) = 1 INTO v_grants_ok
    FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name = 'pilot_admin_assign_order'
     AND grantee = 'authenticated'
     AND privilege_type = 'EXECUTE';
  IF NOT v_grants_ok THEN
    RAISE EXCEPTION 'INTEGRITY_ADMIN_ASSIGN_GRANT_MISSING';
  END IF;

  -- The history table and its event types must exist (00079 dependency).
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.tables t
     WHERE t.table_schema = 'public' AND t.table_name = 'order_status_history'
  ) INTO v_hist_ok;
  IF NOT v_hist_ok THEN
    RAISE EXCEPTION 'INTEGRITY_HISTORY_TABLE_MISSING';
  END IF;
END;
$$;