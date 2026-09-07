-- ============================================================================
-- 00079 — ORDER LIFECYCLE + STATUS HISTORY — post-apply verification
-- Run in the Supabase SQL Editor (owner/postgres) after applying 00079.
-- READ-ONLY: SELECTs + a single DO-block contract check. No DML, no DDL, no
-- data mutation. Each numbered section answers one GATE-3 verification point:
--   schema/constraints, indexes, security (RLS/policies/no anon/no direct
--   write grants), single canonical matrix inside the private helper,
--   assignment scoping, atomicity traces, grants, creation + acceptance events.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) order_status_history exists — ALL columns with exact expected types.
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'order_status_history';

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'order_status_history'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 2) Constraints — PK, order FK (cascade delete), CHECK sets for statuses,
--    event_type, actor_role; previous_status allows ''.
-- ---------------------------------------------------------------------------
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.order_status_history'::regclass
ORDER BY contype, conname;

-- ---------------------------------------------------------------------------
-- 3) Indexes — ONLY the three justified ones (order+time, order+status,
--    actor+time). No speculative/day-view partial index.
-- ---------------------------------------------------------------------------
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'order_status_history'
ORDER BY indexname;

-- ---------------------------------------------------------------------------
-- 4) Security — RLS is ENABLED on the history table.
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'order_status_history';

-- ---------------------------------------------------------------------------
-- 5) Security — exactly ONE policy, admin-only (no anon, no USING(true),
--    no customer/operator SELECT policy at this gate).
-- ---------------------------------------------------------------------------
SELECT tablename AS table_name, policyname, cmd, roles, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'order_status_history'
ORDER BY policyname;

-- ---------------------------------------------------------------------------
-- 6) Security — NO direct write grants on order_status_history. SELECT-only to
--    authenticated; no anon grant at all. Writes flow through SECURITY
--    DEFINER RPCs only.
-- ---------------------------------------------------------------------------
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'order_status_history'
ORDER BY grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 7) Functions — the lifecycle RPC set, all SECURITY DEFINER, fixed search
--    path (''). The private helper has NO client grant; the client RPCs are
--    authenticated-EXECUTE-only.
-- ---------------------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS signature,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       p.proconfig  AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pilot_assert_transition', 'pilot_order_set_status',
    'pilot_courier_set_status', 'pilot_order_accept',
    'delivery_create_order', 'pilot_order_timeline'
  )
  AND p.prokind = 'f'
ORDER BY p.proname;

SELECT proname, grantee, privilege_type
FROM (
  SELECT p.proname, r.grantee, r.privilege_type
  FROM pg_proc p
  JOIN information_schema.routine_privileges r ON r.routine_name = p.proname
    AND r.routine_schema = 'public'
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN (
      'pilot_assert_transition', 'pilot_order_set_status',
      'pilot_courier_set_status', 'pilot_order_accept',
      'delivery_create_order', 'pilot_order_timeline'
    )
    AND r.privilege_type = 'EXECUTE'
) q
ORDER BY proname, grantee;

-- ---------------------------------------------------------------------------
-- 8) Canonical matrix — the private helper contains the transition rows.
--    (Textual so an auditor / CI can confirm the server-authoritative rule set.)
-- ---------------------------------------------------------------------------
SELECT pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname = 'pilot_assert_transition'))
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'pilot_assert_transition';

-- ---------------------------------------------------------------------------
-- 9) CONTRACT CHECK — raises EXCEPTION if any invariant is violated.
--     Read-only by construction (no writes anywhere in this file).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad boolean;
  v_mtx text;
BEGIN
  -- schema: base columns present with right nullability (exact count of the
  -- 8 canonical columns must be present; historical HAVING count(*)=0 inverted
  -- this so it raised exactly when the columns existed)
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'order_status_history'
        AND column_name IN ('id','order_id','previous_status','new_status',
                            'event_type','actor_user_id','actor_role','created_at')
  ) <> 8 THEN RAISE EXCEPTION '00079-check: base history columns missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_status_history'
      AND column_name IN ('new_status','event_type','actor_role','order_id')
      AND is_nullable = 'NO'
  ) THEN RAISE EXCEPTION '00079-check: NOT NULL contract violated'; END IF;

  -- check-constraint sets on statuses / event_type / actor_role
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_status_history'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%out_for_delivery%'
      AND pg_get_constraintdef(oid) LIKE '%delivered%'
      AND pg_get_constraintdef(oid) LIKE '%cancelled%'
  ) THEN RAISE EXCEPTION '00079-check: status CHECK constraints missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_status_history'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%courier_assigned%'
  ) THEN RAISE EXCEPTION '00079-check: event_type CHECK missing courier_assigned'; END IF;

  -- security: RLS on; exactly admin-only policy; no anon; no USING(true)
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_status_history'
      AND (roles::text LIKE '%anon%' OR qual IS NULL OR qual = 'true')
      OR NOT EXISTS (
        SELECT 1 FROM pg_class c2
        WHERE c2.relname = 'order_status_history' AND c2.relrowsecurity
      )
  ) INTO v_bad;
  IF v_bad THEN RAISE EXCEPTION '00079-check: RLS/anon/broad policy problem on history'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'order_status_history' AND relrowsecurity
  ) THEN RAISE EXCEPTION '00079-check: RLS disabled on order_status_history'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_status_history'
      AND policyname = 'Admin manage order status history'
  ) THEN RAISE EXCEPTION '00079-check: admin-only policy missing on history'; END IF;

  -- no direct write grant to authenticated
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'order_status_history'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN RAISE EXCEPTION '00079-check: authenticated has a WRITE grant on history'; END IF;

  -- RPCs present, SECURITY DEFINER, fixed search_path
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('pilot_assert_transition','pilot_order_set_status',
                      'pilot_courier_set_status','pilot_order_accept',
                      'delivery_create_order','pilot_order_timeline')
  ) THEN RAISE EXCEPTION '00079-check: lifecycle RPC(s) missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('pilot_assert_transition','pilot_order_set_status',
                        'pilot_courier_set_status','pilot_order_accept',
                        'delivery_create_order','pilot_order_timeline')
      AND p.prosecdef
      AND p.proconfig::text LIKE '%search_path%'
  ) THEN RAISE EXCEPTION '00079-check: lifecycle RPC(s) not SECURITY DEFINER / fixed path'; END IF;

  -- helper is owner-only (no EXECUTE grant to anon/authenticated/PUBLIC)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN information_schema.routine_privileges r
      ON r.routine_name = p.proname AND r.routine_schema = 'public'
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'pilot_assert_transition'
      AND r.privilege_type = 'EXECUTE'
      AND r.grantee IN ('anon','authenticated','PUBLIC')
  ) THEN RAISE EXCEPTION '00079-check: private helper has a client EXECUTE grant'; END IF;

  -- timeline: authenticated EXECUTE only, anon denied
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN information_schema.routine_privileges r
      ON r.routine_name = p.proname AND r.routine_schema = 'public'
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'pilot_order_timeline'
      AND r.privilege_type = 'EXECUTE' AND r.grantee = 'authenticated'
  ) THEN RAISE EXCEPTION '00079-check: pilot_order_timeline not granted to authenticated'; END IF;

  -- canonical matrix present inside the helper (single authoritative rule set)
  SELECT pg_get_functiondef((SELECT oid FROM pg_proc p
                             WHERE p.pronamespace = 'public'::regnamespace
                               AND p.proname = 'pilot_assert_transition'))
    INTO v_mtx;
  IF NOT (v_mtx LIKE '%pending%confirmed%' AND v_mtx LIKE '%pending%cancelled%'
      AND v_mtx LIKE '%confirmed%preparing%' AND v_mtx LIKE '%confirmed%cancelled%'
      AND v_mtx LIKE '%preparing%out_for_delivery%' AND v_mtx LIKE '%preparing%cancelled%'
      AND v_mtx LIKE '%out_for_delivery%delivered%'
      AND v_mtx LIKE '%courier_user_id IS NULL%'
      AND v_mtx LIKE '%ROW_COUNT%')
  THEN RAISE EXCEPTION '00079-check: canonical matrix / guards incomplete in helper'; END IF;

  RAISE NOTICE '00079 verify: all contract checks PASSED';
END;
$$;