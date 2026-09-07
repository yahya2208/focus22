-- ============================================================================
-- 00081 READ-ONLY VERIFICATION — pilot account provisioning & admin approval
-- Run with read-only privileges only. Never mutates production data.
-- Mirrors the §35 Gate-5 production audit and re-checks every §3 inventory item.
-- Exit status: each assertion is a check; a missing feature raises a clear
-- 'VERIFY_*' exception (DO blocks roll back nothing — they only read).
-- ============================================================================

-- 1) Functions exist with the exact signatures the frontend calls.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'pilot_admin_set_operator_status(uuid, uuid, text)',
    'pilot_admin_set_courier_status(uuid, uuid, text)',
    'pilot_admin_set_courier(uuid, uuid, boolean)',
    'pilot_admin_find_users(text, integer)',
    'pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb)'
  ] LOOP
    IF to_regprocedure('public.' || v) IS NULL THEN
      RAISE EXCEPTION 'VERIFY_FN_MISSING %', v;
    END IF;
  END LOOP;
END;
$$;

-- 2) Audit ledger exists and is append-only for clients (no direct DML grants).
DO $$
DECLARE
  c int;
  g int;
BEGIN
  SELECT count(*) INTO c FROM information_schema.tables
   WHERE table_schema='public' AND table_name='pilot_membership_history';
  IF c <> 1 THEN RAISE EXCEPTION 'VERIFY_LEDGER_MISSING'; END IF;

  SELECT count(*) INTO g FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='pilot_membership_history'
     AND grantee='authenticated'
     AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF g <> 0 THEN RAISE EXCEPTION 'VERIFY_LEDGER_DIRECT_WRITE_OPEN'; END IF;

  SELECT count(*) INTO c FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='pilot_membership_history'
     AND grantee='authenticated' AND privilege_type='SELECT';
  IF c < 1 THEN RAISE EXCEPTION 'VERIFY_LEDGER_NO_ADMIN_READ'; END IF;
END;
$$;

-- 3) Operator exclusivity index (one active operator per store).
DO $$
DECLARE i text;
BEGIN
  SELECT indexdef INTO i FROM pg_indexes
   WHERE schemaname='public' AND tablename='pilot_store_operators'
     AND indexname='pilot_store_operators_one_active';
  IF i IS NULL THEN RAISE EXCEPTION 'VERIFY_EXCLUSIVITY_INDEX_MISSING'; END IF;
  IF i NOT LIKE '%WHERE status = %active%' THEN
    RAISE EXCEPTION 'VERIFY_EXCLUSIVITY_INDEX_NOT_PARTIAL';
  END IF;
END;
$$;

-- 4) State machines are present in the deployed bodies (server-side approval).
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_set_operator_status(uuid, uuid, text)'::regprocedure) INTO d;
  IF d NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN RAISE EXCEPTION 'VERIFY_OPERATOR_SM_MISSING'; END IF;
  IF d NOT LIKE '%pilot_write_membership_event%' THEN RAISE EXCEPTION 'VERIFY_OPERATOR_AUDIT_MISSING'; END IF;

  SELECT pg_get_functiondef('public.pilot_admin_set_courier_status(uuid, uuid, text)'::regprocedure) INTO d;
  IF d NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN RAISE EXCEPTION 'VERIFY_COURIER_SM_MISSING'; END IF;
  IF d NOT LIKE '%pilot_write_membership_event%' THEN RAISE EXCEPTION 'VERIFY_COURIER_AUDIT_MISSING'; END IF;

  SELECT pg_get_functiondef('public.pilot_admin_set_courier(uuid, uuid, boolean)'::regprocedure) INTO d;
  IF d NOT LIKE '%pending%' THEN RAISE EXCEPTION 'VERIFY_LEGACY_BYPASS_OPEN'; END IF;
  IF d NOT LIKE '%TRANSITION_NOT_ALLOWED%' THEN RAISE EXCEPTION 'VERIFY_LEGACY_SM_MISSING'; END IF;
END;
$$;

-- 5) Lookup RPC is admin-guarded.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_find_users(text, integer)'::regprocedure) INTO d;
  IF d NOT LIKE '%PERMISSION_DENIED%' THEN RAISE EXCEPTION 'VERIFY_FIND_USERS_GUARD_MISSING'; END IF;
END;
$$;

-- 6) Operational enforcement points survive (read-only surface check):
--    * courier acceptance requires status='active'            (00079/00080 body)
--    * operator gating stays stores.operator_user_id = uid    (00065/00070 body)
--    * lifecycle RPCs still re-check membership server-side
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_assert_transition(uuid, text)'::regprocedure) INTO d;
  IF d IS NULL OR d NOT LIKE '%status = ''active''%' THEN
    RAISE EXCEPTION 'VERIFY_COURIER_ACTIVE_GATE_MISSING';
  END IF;

  SELECT pg_get_functiondef('public.pilot_orders_for_store(uuid)'::regprocedure) INTO d;
  IF d IS NULL OR d NOT LIKE '%operator_user_id = v_uid%' THEN
    RAISE EXCEPTION 'VERIFY_OPERATOR_GATE_MISSING';
  END IF;
END;
$$;

-- 7) Inventory snapshot for the Gate-5 report (zero mutations).
SELECT
  (SELECT count(*) FROM public.pilot_membership_history)  AS membership_history,
  (SELECT count(*) FROM public.pilot_store_operators)    AS operators,
  (SELECT count(*) FROM public.pilot_couriers)           AS couriers,
  (SELECT count(*) FROM public.pilot_couriers
     WHERE status = 'active')                            AS active_couriers,
  (SELECT count(*) FROM public.pilot_store_operators
     WHERE status = 'active')                            AS active_operators,
  (SELECT count(*) FROM public.stores
     WHERE operator_user_id IS NOT NULL)                 AS stores_with_operator,
  (SELECT count(*) FROM public.users)                    AS users;