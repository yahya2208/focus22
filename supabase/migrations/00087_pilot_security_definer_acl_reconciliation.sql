-- ============================================================================
-- 00087  Pilot SECURITY DEFINER ACL reconciliation — DRAFT, DO NOT APPLY
-- ----------------------------------------------------------------------------
-- STATUS: DRAFT ONLY. Not recorded as applied. Not applied to any database.
-- DO NOT run `db push`, replay, or execute this file until review authorizes
-- execution explicitly. STAGING-first if ever authorized; NEVER Production
-- without a separate explicit approval.
--
-- Purpose: reconcile the 16 source-proven pilot SECURITY DEFINER RPCs
-- (00080–00086) to their intended per-function ACL contracts without touching
-- default privileges, RLS, RBAC, telemetry, GPS, realtime, orders, or
-- inventory, and without creating/dropping/altering any object.
--
-- Pattern (00083 reference): revoke-all-then-grant-intended, per function,
-- by exact name + argument types. Idempotent on re-run.
--
-- PRE-APPLY CHECKLIST (operator, all mandatory):
--   1. Target is STAGING (never Production in this gate).
--   2. U1 Q1 owner column confirms every function is owned by `postgres`;
--      if any owner differs, update the v_owner literal below and re-review.
--   3. Q4 readout confirms pg_default_acl for public/functions holds exactly
--      the grantor rows `postgres` + `supabase_admin`; the guard enforces it.
--   4. 00086 partial state disposition decided (cleanup draft reviewed).
--   5. Success-path + failure-path test drafts reviewed.
-- Contract source: docs/gates/gate8b-pilot-acl-repair-design.md §2.
-- ============================================================================

BEGIN;

-- ============================================================================
-- §A  authenticated-only (12): auth=T, public/anon/service=F
-- ============================================================================

-- A1 pilot_admin_assign_order(uuid,uuid) — 00080
REVOKE ALL ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_assign_order(uuid, uuid) TO authenticated;

-- A2 pilot_admin_find_users(text,integer) — 00081
REVOKE ALL ON FUNCTION public.pilot_admin_find_users(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_find_users(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_find_users(text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_find_users(text, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_find_users(text, integer) TO authenticated;

-- A3 pilot_my_orders() — 00082
REVOKE ALL ON FUNCTION public.pilot_my_orders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_orders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_my_orders() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_my_orders() FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_my_orders() TO authenticated;

-- A4 pilot_order_detail(uuid) — 00082
REVOKE ALL ON FUNCTION public.pilot_order_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_order_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_order_detail(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_order_detail(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_order_detail(uuid) TO authenticated;

-- A5 pilot_admin_set_operator_status(uuid,uuid,text) — 00081 current 00085
REVOKE ALL ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_operator_status(uuid, uuid, text) TO authenticated;

-- A6 pilot_admin_set_courier_status(uuid,uuid,text) — 00081 current 00085
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier_status(uuid, uuid, text) TO authenticated;

-- A7 pilot_admin_set_courier(uuid,uuid,boolean) — 00081 current 00085
REVOKE ALL ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_courier(uuid, uuid, boolean) TO authenticated;

-- A8 pilot_admin_set_operational_ready(text,uuid,uuid,boolean,text,jsonb) — 00085
REVOKE ALL ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb) TO authenticated;

-- A9 pilot_admin_list_operators(uuid) — 00070 current 00085 (anon revoke added: source defect fix)
REVOKE ALL ON FUNCTION public.pilot_admin_list_operators(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_operators(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_operators(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_operators(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_operators(uuid) TO authenticated;

-- A10 pilot_admin_list_couriers(uuid) — 00070 current 00085 (anon revoke added: source defect fix)
REVOKE ALL ON FUNCTION public.pilot_admin_list_couriers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_couriers(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_couriers(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_couriers(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_couriers(uuid) TO authenticated;

-- A11 pilot_admin_start_pilot(uuid,uuid,jsonb) — 00086
REVOKE ALL ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) TO authenticated;

-- A12 pilot_admin_pilot_start_status(uuid,uuid) — 00086
REVOKE ALL ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) TO authenticated;

-- ============================================================================
-- §B  owner-only (3): all four roles F, no GRANT to anyone
-- ============================================================================

-- B1 pilot_write_membership_event 8-type ONLY (00081 source signature; no 7-arg form)
REVOKE ALL ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb) FROM service_role;

-- B2 pilot_write_readiness_event (00085)
REVOKE ALL ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb) FROM service_role;

-- B3 pilot_clear_readiness_if_set (00085)
REVOKE ALL ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb) FROM service_role;

-- ============================================================================
-- §C  service-role-only (1): service=T, rest F (00083 reference pattern)
-- ============================================================================

-- C1 pilot_provision_new_membership(text,uuid,uuid,uuid,text) — 00083
REVOKE ALL ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pilot_provision_new_membership(text, uuid, uuid, uuid, text) TO service_role;

-- ============================================================================
-- §D  Final deterministic guard — any deviation aborts the whole transaction
-- (existence+exact signature via regprocedure cast; owner; SECURITY DEFINER;
--  search_path; effective EXECUTE for all four roles; overload census;
--  default-priv identity; realtime absence)
-- ============================================================================
DO $$
DECLARE
  v_fn    regprocedure;
  v_owner oid := 'postgres'::regrole;  -- CONFIRM pre-apply via U1 Q1 owner column
  v_bad   text;
  v_roles text;
BEGIN
  -- ---- overload census: exactly one public overload per focus name ----
  SELECT string_agg(s.proname || ':' || s.cnt::text, ', ' ORDER BY s.proname) INTO v_bad
    FROM (SELECT p.proname, count(*) AS cnt
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('pilot_admin_assign_order','pilot_admin_find_users',
               'pilot_my_orders','pilot_order_detail','pilot_admin_set_operator_status',
               'pilot_admin_set_courier_status','pilot_admin_set_courier',
               'pilot_admin_set_operational_ready','pilot_admin_list_operators',
               'pilot_admin_list_couriers','pilot_admin_start_pilot',
               'pilot_admin_pilot_start_status','pilot_write_membership_event',
               'pilot_write_readiness_event','pilot_clear_readiness_if_set',
               'pilot_provision_new_membership')
           GROUP BY 1) s
   WHERE s.cnt <> 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '00087: unexpected overload count: %', v_bad;
  END IF;

  -- ---- A1 ----
  v_fn := 'public.pilot_admin_assign_order(uuid, uuid)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A1 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A1 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A1 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A1 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A1 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A1 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A1 service_role open'; END IF;

  -- ---- A2 ----
  v_fn := 'public.pilot_admin_find_users(text, integer)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A2 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A2 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A2 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A2 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A2 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A2 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A2 service_role open'; END IF;

  -- ---- A3 ----
  v_fn := 'public.pilot_my_orders()'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A3 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A3 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A3 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A3 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A3 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A3 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A3 service_role open'; END IF;

  -- ---- A4 ----
  v_fn := 'public.pilot_order_detail(uuid)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A4 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A4 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A4 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A4 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A4 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A4 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A4 service_role open'; END IF;

  -- ---- A5 ----
  v_fn := 'public.pilot_admin_set_operator_status(uuid, uuid, text)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A5 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A5 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A5 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A5 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A5 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A5 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A5 service_role open'; END IF;

  -- ---- A6 ----
  v_fn := 'public.pilot_admin_set_courier_status(uuid, uuid, text)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A6 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A6 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A6 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A6 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A6 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A6 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A6 service_role open'; END IF;

  -- ---- A7 ----
  v_fn := 'public.pilot_admin_set_courier(uuid, uuid, boolean)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A7 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A7 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A7 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A7 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A7 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A7 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A7 service_role open'; END IF;

  -- ---- A8 ----
  v_fn := 'public.pilot_admin_set_operational_ready(text, uuid, uuid, boolean, text, jsonb)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A8 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A8 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A8 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A8 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A8 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A8 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A8 service_role open'; END IF;

  -- ---- A9 ----
  v_fn := 'public.pilot_admin_list_operators(uuid)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A9 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A9 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A9 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A9 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A9 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A9 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A9 service_role open'; END IF;

  -- ---- A10 ----
  v_fn := 'public.pilot_admin_list_couriers(uuid)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A10 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A10 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A10 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A10 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A10 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A10 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A10 service_role open'; END IF;

  -- ---- A11 ----
  v_fn := 'public.pilot_admin_start_pilot(uuid, uuid, jsonb)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A11 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A11 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A11 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A11 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A11 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A11 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A11 service_role open'; END IF;

  -- ---- A12 ----
  v_fn := 'public.pilot_admin_pilot_start_status(uuid, uuid)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: A12 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A12 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: A12 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A12 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A12 anon open'; END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A12 authenticated missing'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: A12 service_role open'; END IF;

  -- ---- B1 (owner-only: all four roles must be false) ----
  v_fn := 'public.pilot_write_membership_event(text, uuid, uuid, text, text, uuid, text, jsonb)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: B1 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: B1 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: B1 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B1 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B1 anon open'; END IF;
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B1 authenticated open'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B1 service_role open'; END IF;

  -- ---- B2 ----
  v_fn := 'public.pilot_write_readiness_event(text, uuid, uuid, boolean, boolean, uuid, text, text, jsonb)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: B2 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: B2 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: B2 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B2 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B2 anon open'; END IF;
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B2 authenticated open'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B2 service_role open'; END IF;

  -- ---- B3 ----
  v_fn := 'public.pilot_clear_readiness_if_set(text, uuid, uuid, uuid, text, text, jsonb)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: B3 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: B3 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: B3 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B3 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B3 anon open'; END IF;
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B3 authenticated open'; END IF;
  IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: B3 service_role open'; END IF;

  -- ---- C1 (service-role-only) ----
  v_fn := 'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)'::regprocedure;
  IF (SELECT proowner FROM pg_proc WHERE oid = v_fn) IS DISTINCT FROM v_owner THEN RAISE EXCEPTION '00087: C1 owner drift'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: C1 not SECURITY DEFINER'; END IF;
  IF NOT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION '00087: C1 search_path drift'; END IF;
  IF has_function_privilege('public', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: C1 PUBLIC open'; END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: C1 anon open'; END IF;
  IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: C1 authenticated open'; END IF;
  IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN RAISE EXCEPTION '00087: C1 service_role missing'; END IF;

  -- ---- default-privilege identity (fail-closed; literal comparison is external) ----
  SELECT string_agg(d.defaclrole::regrole::text, ',' ORDER BY 1) INTO v_roles
    FROM pg_default_acl d
   WHERE d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'f';
  IF v_roles IS DISTINCT FROM 'postgres,supabase_admin' THEN
    RAISE EXCEPTION '00087: pg_default_acl grantor set changed: %', v_roles;
  END IF;

  -- ---- realtime absence ----
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                AND tablename = 'pilot_pilot_starts') THEN
    RAISE EXCEPTION '00087: pilot_pilot_starts published to realtime';
  END IF;
END;
$$;

COMMIT;
-- 00087 END (DRAFT)
