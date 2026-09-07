-- ============================================================================
-- 00080 — ORDER ASSIGNMENT SYSTEM — post-apply verification
-- Run in the Supabase SQL Editor (owner/postgres) after applying 00080.
-- READ-ONLY: SELECTs + a single DO-block contract check. No DML, no DDL, no
-- data mutation. Each numbered section answers one GATE-4 verification point:
--   authorization (admin-only), assignment window, courier eligibility scope,
--   event types/metadata, atomicity (UPDATE+INSERT, guarded write),
--   concurrency (FOR UPDATE serialisation), grants, and the direct-write
--   closure on public.orders.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) pilot_admin_assign_order exists with the exact signature.
-- ---------------------------------------------------------------------------
SELECT p.proname, pg_get_function_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS result,
       p.provolatile, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pilot_admin_assign_order';

-- ---------------------------------------------------------------------------
-- 2) Execution grants — authenticated exactly once, never anon, never PUBLIC.
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'pilot_admin_assign_order'
ORDER BY grantee, privilege_type;

SELECT count(*) AS public_exec_grants
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'pilot_admin_assign_order'
  AND grantee = 'PUBLIC';

SELECT count(*) AS anon_exec_grants
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public' AND routine_name = 'pilot_admin_assign_order'
  AND grantee = 'anon';

-- ---------------------------------------------------------------------------
-- 3) Direct client write path on public.orders is CLOSED (INSERT/UPDATE/
--    DELETE revoked from authenticated); SELECT remains for staff reads.
-- ---------------------------------------------------------------------------
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'orders'
  AND grantee = 'authenticated'
ORDER BY privilege_type;

-- ---------------------------------------------------------------------------
-- 4) Function body contract (single source of truth — defence in depth).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_assign_order(uuid, uuid)'::regprocedure)
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'FAIL admin assign RPC missing';
  END IF;
  IF v_def NOT LIKE '%fn_admin_uid%' THEN
    RAISE EXCEPTION 'FAIL admin authorisation missing';
  END IF;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FAIL row lock missing (concurrency guarantee)';
  END IF;
  IF v_def NOT LIKE '%IS DISTINCT FROM %''confirmed%' AND v_def NOT LIKE '%confirmed%'
     AND v_def NOT LIKE '%preparing%' THEN
    RAISE EXCEPTION 'FAIL assignment window missing';
  END IF;
  IF v_def NOT LIKE '%pilot_couriers%' OR v_def NOT LIKE '%status = %active%' THEN
    RAISE EXCEPTION 'FAIL courier eligibility scope missing';
  END IF;
  IF v_def NOT LIKE '%courier_assigned%' OR v_def NOT LIKE '%reassigned%' THEN
    RAISE EXCEPTION 'FAIL event types missing';
  END IF;
  IF v_def NOT LIKE '%order_status_history%' THEN
    RAISE EXCEPTION 'FAIL history write missing';
  END IF;
  IF v_def NOT LIKE '%GET DIAGNOSTICS%' THEN
    RAISE EXCEPTION 'FAIL guarded write missing';
  END IF;
  IF v_def NOT LIKE '%COURIER_INELIGIBLE%' OR v_def NOT LIKE '%ASSIGNMENT_NOT_ALLOWED%' THEN
    RAISE EXCEPTION 'FAIL error guards missing';
  END IF;

  RAISE NOTICE 'ALL 00080 CONTRACT CHECKS PASSED';
END;
$$;