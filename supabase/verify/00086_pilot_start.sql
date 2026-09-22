-- ============================================================================
-- verify/00086_pilot_start.sql
-- ----------------------------------------------------------------------------
-- Read-only contract check for Pilot START (Gate 8B Step 4). Fails loudly on
-- drift. Does NOT mutate anything.
-- Run: psql -f supabase/verify/00086_pilot_start.sql
-- ============================================================================

-- A. START + status RPCs exist and are SECURITY DEFINER + locked + admin-guarded.
DO $$
DECLARE
  v_def text;
  v_ok  boolean;
  v_n   integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('pilot_admin_start_pilot', 'pilot_admin_pilot_start_status');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'verify/00086: start RPCs missing (found %)', v_n;
  END IF;

  SELECT pg_get_functiondef('public.pilot_admin_start_pilot(uuid, uuid, jsonb)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%SECURITY DEFINER%' OR v_def NOT LIKE '%search_path TO ''''%'
     OR v_def NOT LIKE '%fn_admin_uid%' OR v_def NOT LIKE '%FOR SHARE%'
     OR v_def NOT LIKE '%ALREADY_STARTED%' OR v_def NOT LIKE '%pilot_pilot_starts%' THEN
    RAISE EXCEPTION 'verify/00086: start RPC security contract broken';
  END IF;

  SELECT pg_get_functiondef('public.pilot_admin_pilot_start_status(uuid, uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%SECURITY DEFINER%' OR v_def NOT LIKE '%search_path TO ''''%'
     OR v_def NOT LIKE '%fn_admin_uid%' OR v_def NOT LIKE '%valid%' THEN
    RAISE EXCEPTION 'verify/00086: status RPC security contract broken';
  END IF;
END;
$$;

-- B. ACLs: authenticated EXECUTE yes; anon no; service_role no (no service-role
--    browser path for an Admin-only operation).
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT has_function_privilege('authenticated',
    'public.pilot_admin_start_pilot(uuid, uuid, jsonb)', 'EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'verify/00086: start authenticated EXECUTE missing'; END IF;
  SELECT has_function_privilege('anon',
    'public.pilot_admin_start_pilot(uuid, uuid, jsonb)', 'EXECUTE') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'verify/00086: start anon EXECUTE open'; END IF;
  SELECT has_function_privilege('service_role',
    'public.pilot_admin_start_pilot(uuid, uuid, jsonb)', 'EXECUTE') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'verify/00086: start service_role EXECUTE open'; END IF;
  SELECT has_function_privilege('authenticated',
    'public.pilot_admin_pilot_start_status(uuid, uuid)', 'EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'verify/00086: status authenticated EXECUTE missing'; END IF;
END;
$$;

-- C. Table structure: columns, open-run partial unique index, run numbering
--    constraint, store FK RESTRICT (no cascade), user FKs retained-history
--    SET NULL, admin-read RLS policy, client writes fully closed.
DO $$
DECLARE
  c record;
  v_n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_pilot_starts'
      AND column_name IN ('id','store_id','run_index','operator_user_id','courier_user_id',
                          'actor_user_id','actor_role','precondition_snapshot','metadata',
                          'ended_at','created_at')
  ) THEN RAISE EXCEPTION 'verify/00086: pilot_pilot_starts columns missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_pilot_starts'
      AND indexname = 'pilot_pilot_starts_one_open'
  ) THEN RAISE EXCEPTION 'verify/00086: open-run partial unique index missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_pilot_starts'
      AND indexname = 'pilot_pilot_starts_store_run'
  ) THEN RAISE EXCEPTION 'verify/00086: store-run unique index missing'; END IF;

  FOR c IN
    SELECT pg_get_constraintdef(c2.oid) AS def, c2.confdeltype AS deltype
      FROM pg_constraint c2
     WHERE c2.conrelid = 'public.pilot_pilot_starts'::regclass AND c2.contype = 'f'
  LOOP
    IF c.def LIKE '%REFERENCES public.stores(id)%' THEN
      IF c.deltype <> 'r' THEN RAISE EXCEPTION 'verify/00086: store FK must be ON DELETE RESTRICT'; END IF;
    ELSIF c.def LIKE '%REFERENCES public.users(id)%' THEN
      IF c.deltype <> 'n' THEN RAISE EXCEPTION 'verify/00086: user FK must be ON DELETE SET NULL'; END IF;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pilot_pilot_starts'
      AND policyname = 'Admin read pilot start runs'
  ) THEN RAISE EXCEPTION 'verify/00086: start admin-read policy missing'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pilot_pilot_starts'
      AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_n <> 0 THEN RAISE EXCEPTION 'verify/00086: start client DML open (found %)', v_n; END IF;
END;
$$;

-- D. No Pilot START table in realtime; no GPS/location surface.
DO $$
DECLARE
  v_n integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'pilot_pilot_starts'
  ) THEN RAISE EXCEPTION 'verify/00086: pilot starts must not be realtime'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE '%gps%' OR p.proname LIKE '%geo%' OR p.proname LIKE '%location%'
          OR p.proname LIKE '%distance%' OR p.proname LIKE '%rout%' OR p.proname LIKE '%eta%');
  IF v_n <> 0 THEN RAISE EXCEPTION 'verify/00086: gps/location surface must not exist (found %)', v_n; END IF;
END;
$$;

-- E. START data truth (read-only informational): open runs per store are at
--    most one each (structural), and the stream is currently empty at gate
--    time (no production START was executed in STEP 4).
SELECT 'open_run_count' AS metric, count(*) AS value
  FROM public.pilot_pilot_starts WHERE ended_at IS NULL
UNION ALL
SELECT 'total_run_rows', count(*) FROM public.pilot_pilot_starts;

-- F. Full run history is admin-readable via RLS; structure only here.
SELECT count(*) AS pilot_start_audit_rows FROM public.pilot_pilot_starts;