-- ============================================================================
-- verify/00085_pilot_operational_readiness_service.sql
-- ----------------------------------------------------------------------------
-- Read-only contract check for the Operational Readiness Service (Gate 8B
-- Step 2C). Fails loudly on drift. Does NOT mutate anything.
-- Run: psql -f supabase/verify/00085_pilot_operational_readiness_service.sql
-- ============================================================================

-- A. Core readiness RPC exists and is admin-only + SECURITY DEFINER + locked.
DO $$
DECLARE
  v_def text;
  v_ok  boolean;
  v_n   integer;
BEGIN
  -- A1. Readiness RPC + helpers exist.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('pilot_admin_set_operational_ready', 'pilot_write_readiness_event', 'pilot_clear_readiness_if_set');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'verify/00085: readiness RPC/helpers missing (found %)', v_n;
  END IF;

  -- A2. Readiness RPC security posture.
  SELECT pg_get_functiondef('public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%SECURITY DEFINER%' OR v_def NOT LIKE '%search_path TO ''''%'
     OR v_def NOT LIKE '%fn_admin_uid%' OR v_def NOT LIKE '%FOR UPDATE%'
     OR v_def NOT LIKE '%TRANSITION_NOT_ALLOWED%' OR v_def NOT LIKE '%pilot_write_readiness_event%' THEN
    RAISE EXCEPTION 'verify/00085: readiness RPC security contract broken';
  END IF;

  -- A3. ACLs: authenticated EXECUTE yes; anon no; helpers owner-only.
  SELECT has_function_privilege('authenticated',
    'public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)', 'EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'verify/00085: readiness authenticated EXECUTE missing'; END IF;
  SELECT has_function_privilege('anon',
    'public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)', 'EXECUTE') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'verify/00085: readiness anon EXECUTE open'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.role_routine_grants
   WHERE routine_schema = 'public'
     AND routine_name IN ('pilot_write_readiness_event', 'pilot_clear_readiness_if_set')
     AND grantee IN ('anon', 'authenticated') AND privilege_type = 'EXECUTE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'verify/00085: readiness helpers open beyond owner'; END IF;
END;
$$;

-- B. Lifecycle invalidation present in every membership-status RPC.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_set_operator_status(uuid, uuid, text)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_clear_readiness_if_set%' THEN
    RAISE EXCEPTION 'verify/00085: operator status invalidation missing';
  END IF;
  IF v_def NOT LIKE '%replaced as active operator%' THEN
    RAISE EXCEPTION 'verify/00085: operator replacement readiness clear missing';
  END IF;
  SELECT pg_get_functiondef('public.pilot_admin_set_courier_status(uuid, uuid, text)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_clear_readiness_if_set%' THEN
    RAISE EXCEPTION 'verify/00085: courier status invalidation missing';
  END IF;
  SELECT pg_get_functiondef('public.pilot_admin_set_courier(uuid, uuid, boolean)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%pilot_clear_readiness_if_set%' THEN
    RAISE EXCEPTION 'verify/00085: legacy courier invalidation missing';
  END IF;
END;
$$;

-- C. Admin list RPCs expose server-ready truth.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_list_operators(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%operational_ready%' THEN
    RAISE EXCEPTION 'verify/00085: list operators missing operational_ready';
  END IF;
  SELECT pg_get_functiondef('public.pilot_admin_list_couriers(uuid)'::regprocedure) INTO v_def;
  IF v_def IS NULL OR v_def NOT LIKE '%operational_ready%' THEN
    RAISE EXCEPTION 'verify/00085: list couriers missing operational_ready';
  END IF;
END;
$$;

-- D. No Pilot START surface (frozen; Step 2D is a separate gate).
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND (p.proname LIKE 'pilot_start%' OR p.proname LIKE 'start_pilot%');
  IF v_n <> 0 THEN RAISE EXCEPTION 'verify/00085: pilot-start RPC surface must not exist (found %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('pilot_start_history', 'pilot_cycle');
  IF v_n <> 0 THEN RAISE EXCEPTION 'verify/00085: pilot-start tables must not exist (found %)', v_n; END IF;
END;
$$;

-- E. Readiness state truth (E2E baseline view; read-only).
SELECT 'store_operators' AS member_kind,
       count(*) FILTER (WHERE operational_ready)          AS ready,
       count(*) FILTER (WHERE status = 'active')          AS active,
       count(*)                                           AS total
  FROM public.pilot_store_operators
UNION ALL
SELECT 'couriers',
       count(*) FILTER (WHERE operational_ready),
       count(*) FILTER (WHERE status = 'active'),
       count(*)
  FROM public.pilot_couriers;

-- F. Audit history full-dumpable by admin policy (structure only here).
SELECT count(*) AS readiness_audit_rows FROM public.pilot_operational_readiness_history;