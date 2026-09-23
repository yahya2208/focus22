-- ============================================================================
-- 00084 — OPERATIONAL READINESS (schema) — post-apply verification
-- Run in the Supabase SQL Editor (owner/postgres) after applying 00084.
-- READ-ONLY: SELECTs + a single DO-block contract check. No DML, no DDL, no
-- data mutation. Covers GATE 8B Step 2B §10 test matrix (1-14) plus the
-- post-correction checks A-I: A/B/C) actor_role accepts admin + super_admin
-- only; D/E) store_id/user_id FKs cannot cascade-delete audit rows; F/G/H)
-- active only — active+ready=false valid, active+ready=true structurally
-- allowed, non-active+ready=true rejected by the stored CHECK definition; I)
-- 00080-00083 invariants intact. Items F-H are proven via the EXACT stored
-- CHECK-definition assertion below — the same definition-assert convention
-- used by the 00080/00081 verify scripts — since executing violating writes
-- here would mutate state. The CHECK itself is declaratively enforced by
-- Postgres on every INSERT/UPDATE once 00084 is applied.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) operational_ready exists on pilot_store_operators with NOT NULL + false
-- 2) operational_ready exists on pilot_couriers   with NOT NULL + false
-- 3) both default false
-- ---------------------------------------------------------------------------
SELECT table_name, column_name, is_nullable,
       COALESCE(column_default, '<none>') AS default_expr
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('pilot_store_operators', 'pilot_couriers')
  AND column_name = 'operational_ready'
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- 4) Existing rows are NOT READY (data safety; frozen §9/H)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.pilot_store_operators)         AS operators,
  (SELECT count(*) FROM public.pilot_store_operators
     WHERE operational_ready)                                 AS operators_ready,
  (SELECT count(*) FROM public.pilot_couriers)                AS couriers,
  (SELECT count(*) FROM public.pilot_couriers
     WHERE operational_ready)                                 AS couriers_ready;

-- ---------------------------------------------------------------------------
-- 5/6/7/8) ACTIVE-ONLY invariant — exact stored CHECK (declarative proof).
--    F) active + ready=false valid; G) active + ready=true valid;
--    H) every non-active state (pending/suspended/inactive) forces ready=false
--       => non-active + ready=true is REJECTED by this CHECK. ACTIVE != READY.
-- ---------------------------------------------------------------------------
SELECT c.conname, pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
WHERE c.conrelid IN
  ('public.pilot_store_operators'::regclass, 'public.pilot_couriers'::regclass)
  AND c.conname IN ('pilot_store_operators_ready_active_only',
                    'pilot_couriers_ready_active_only')
ORDER BY c.conname;

-- ---------------------------------------------------------------------------
-- A/B/C) actor_role CHECK accepts admin AND super_admin (frozen authority).
-- The constraint definition itself is authoritative (structural-definition
-- convention; no violating DML executed here).
-- ---------------------------------------------------------------------------
SELECT pg_get_constraintdef(oid) AS actor_role_check
FROM pg_constraint
WHERE conrelid = 'public.pilot_operational_readiness_history'::regclass
  AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%actor_role%';

-- ---------------------------------------------------------------------------
-- 9/10) Readiness audit table exists with the required audit fields
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable,
       COALESCE(column_default, '<none>') AS default_expr
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pilot_operational_readiness_history'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 11/12/13) No direct anon/authenticated INSERT/UPDATE/DELETE on the audit
-- table (append-only); authenticated has SELECT (RLS admin-read).
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
ORDER BY grantee, privilege_type;

SELECT count(*) AS anon_or_authenticated_dml_grants
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

-- ---------------------------------------------------------------------------
-- D/E) Subject FKs MUST NOT cascade-delete audit rows: store_id -> stores,
-- user_id -> users, both NO ACTION (confdeltype 'a'/'r'); actor FK uses the
-- existing ledger convention (SET NULL on the ACTOR, never the audit subject).
-- ---------------------------------------------------------------------------
SELECT c.conname, t.relname AS referenced_table, c.confdeltype AS delete_rule
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.confrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
  AND c.contype = 'f'
ORDER BY c.conname;

-- ---------------------------------------------------------------------------
-- Audit NOT published to realtime (realtime untouched by 00084)
-- ---------------------------------------------------------------------------
SELECT count(*) AS readiness_history_in_realtime
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  AND tablename = 'pilot_operational_readiness_history';

-- ---------------------------------------------------------------------------
-- 14) 00080-00083 invariants remain intact (00084 must not weaken anything)
-- ---------------------------------------------------------------------------
-- 14a. membership ledger still write-closed for anon/authenticated (00081)
SELECT count(*) AS membership_ledger_dml_grants
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'pilot_membership_history'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

-- 14b. one-active-operator exclusivity index still present (00081)
SELECT indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'pilot_store_operators'
  AND indexname = 'pilot_store_operators_one_active';

-- 14c. provision RPC still service_role-only EXECUTE (00083)
SELECT has_function_privilege('service_role',
         'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)',
         'EXECUTE') AS service_role_exec,
       has_function_privilege('anon',
         'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)',
         'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated',
         'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)',
         'EXECUTE') AS authenticated_exec;

-- 14d. courier presence fields (00078) untouched
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pilot_couriers'
  AND column_name IN ('is_online', 'last_online_at')
ORDER BY column_name;

-- ---------------------------------------------------------------------------
-- Contract DO-block — fail loudly on any drift (definition-assert convention)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_col int;
  v_dml int;
  v_target int;
BEGIN
  -- Columns present, NOT NULL, default false, on both tables.
  SELECT count(*) INTO v_col FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('pilot_store_operators', 'pilot_couriers')
      AND column_name = 'operational_ready'
      AND is_nullable = 'NO'
      AND column_default LIKE '%false%';
  IF v_col <> 2 THEN RAISE EXCEPTION 'VERIFY_READY_COLUMNS_MISSING'; END IF;

  -- No membership row may be ready.
  SELECT count(*) INTO v_target FROM public.pilot_store_operators WHERE operational_ready;
  IF v_target <> 0 THEN RAISE EXCEPTION 'VERIFY_OPERATOR_READY_EXISTS'; END IF;
  SELECT count(*) INTO v_target FROM public.pilot_couriers WHERE operational_ready;
  IF v_target <> 0 THEN RAISE EXCEPTION 'VERIFY_COURIER_READY_EXISTS'; END IF;

  -- Active-only CHECKs present with exact semantics.
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
    WHERE conrelid = 'public.pilot_store_operators'::regclass
      AND conname = 'pilot_store_operators_ready_active_only';
  IF v_def IS NULL OR v_def NOT LIKE '%operational_ready = false%'
     OR v_def NOT LIKE '%''active''::text%' THEN
    RAISE EXCEPTION 'VERIFY_OPERATOR_ACTIVE_ONLY_MISSING';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
    WHERE conrelid = 'public.pilot_couriers'::regclass
      AND conname = 'pilot_couriers_ready_active_only';
  IF v_def IS NULL OR v_def NOT LIKE '%operational_ready = false%'
     OR v_def NOT LIKE '%''active''::text%' THEN
    RAISE EXCEPTION 'VERIFY_COURIER_ACTIVE_ONLY_MISSING';
  END IF;

  -- Audit table + required fields.
  SELECT count(*) INTO v_col FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
      AND column_name IN ('id','member_kind','store_id','user_id','old_ready',
                          'new_ready','actor_user_id','actor_role','reason',
                          'metadata','created_at');
  IF v_col < 11 THEN RAISE EXCEPTION 'VERIFY_AUDIT_FIELDS_MISSING'; END IF;

  -- member_kind and actor_role value checks.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%''operator''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''courier''%'
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_MEMBER_KIND_MISSING'; END IF;
  -- A/B) actor_role CHECK accepts BOTH admin and super_admin ...
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%''admin''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''super_admin''%'
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_ACTOR_ROLE_MISSING'; END IF;
  -- C) ... and NO other actor role is accepted (definitional check).
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%actor_role%'
      AND (pg_get_constraintdef(c.oid) LIKE '%''guest''%'
           OR pg_get_constraintdef(c.oid) LIKE '%''anon''%'
           OR pg_get_constraintdef(c.oid) LIKE '%authenticated%'
           OR pg_get_constraintdef(c.oid) LIKE '%service_role%'
           OR pg_get_constraintdef(c.oid) LIKE '%''researcher''%')
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_ACTOR_ROLE_EXTRA_ALLOWED'; END IF;

  -- D) store_id FK -> stores must NOT cascade-delete audit rows (NO ACTION/RESTRICT).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%FOREIGN KEY (store_id)%'
      AND t.relname = 'stores' AND n.nspname = 'public'
      AND c.confdeltype IN ('a', 'r')
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_STORE_FK_CASCADE'; END IF;
  -- E) user_id FK -> users likewise.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%FOREIGN KEY (user_id)%'
      AND t.relname = 'users' AND n.nspname = 'public'
      AND c.confdeltype IN ('a', 'r')
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_USER_FK_CASCADE'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f' AND c.confdeltype = 'c'
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_FK_CASCADE'; END IF;

  -- No client DML on audit.
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION 'VERIFY_AUDIT_DML_OPEN'; END IF;

  -- Audit not in realtime.
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'pilot_operational_readiness_history'
  ) THEN RAISE EXCEPTION 'VERIFY_AUDIT_IN_REALTIME'; END IF;

  -- 00080-00083 invariants.
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pilot_membership_history'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION 'VERIFY_MEMBERSHIP_LEDGER_DML_OPEN'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_store_operators'
      AND indexname = 'pilot_store_operators_one_active'
  ) THEN RAISE EXCEPTION 'VERIFY_OPERATOR_EXCLUSIVITY_MISSING'; END IF;

  IF NOT has_function_privilege('service_role',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'VERIFY_PROVISION_GRANTS_DRIFTED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_couriers'
      AND column_name IN ('is_online', 'last_online_at')
  ) THEN RAISE EXCEPTION 'VERIFY_COURIER_PRESENCE_DRIFTED'; END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Inventory snapshot for the Gate-8B/2B report (zero mutations)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.pilot_store_operators)          AS operators,
  (SELECT count(*) FROM public.pilot_store_operators
     WHERE status = 'active')                                  AS active_operators,
  (SELECT count(*) FROM public.pilot_couriers)                 AS couriers,
  (SELECT count(*) FROM public.pilot_couriers
     WHERE status = 'active')                                  AS active_couriers,
  (SELECT count(*) FROM public.pilot_membership_history)       AS membership_history,
  (SELECT count(*) FROM public.pilot_operational_readiness_history) AS readiness_history,
  (SELECT count(*) FROM public.orders)                         AS orders,
  (SELECT count(*) FROM public.order_status_history)           AS order_status_history,
  (SELECT count(*) FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public') AS realtime_pub_tables,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public')   AS rls_policies,
  (SELECT count(*) FROM public.telemetry_events)               AS telemetry_events;