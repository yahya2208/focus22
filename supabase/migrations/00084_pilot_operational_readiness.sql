-- ============================================================================
-- 00084  Delivery Operating System — OPERATIONAL READINESS (schema only)
-- ----------------------------------------------------------------------------
-- GATE 8B Step 2B. Frozen contract implementation (STEP 2A design freeze,
-- Model D): authoritative current readiness state + immutable readiness audit.
--
-- SCOPE (narrow, schema-only — READY, not implemented RPCs/UI):
--   A) Add frozen current-state column `operational_ready` to BOTH:
--        public.pilot_store_operators   (operator membership)
--        public.pilot_couriers          (courier membership)
--      NOT NULL DEFAULT false. Existing rows become NOT READY.
--   B) Enforce the ACTIVE-ONLY invariant DECLARATIVELY:
--        operational_ready = true  =>  status = 'active'   (READY requires ACTIVE)
--        ACTIVE != READY           (active + ready=false is VALID)
--        (CHECK constraint, not a trigger — the schema permits it cleanly).
--      Status vocabularies used are the ACTUAL discovered values:
--        operator status CHECK (pending, active, suspended)
--        courier  status CHECK (pending, active, inactive, suspended)
--   C) Create the append-only readiness audit table:
--        public.pilot_operational_readiness_history
--      exactly mirroring the existing membership-ledger conventions (00081):
--      uuid PK / member_kind / store_id / user_id / old+new / actor /
--      reason / metadata / created_at; SELECT-to-authenticated (admin RLS) and
--      NO direct anon/authenticated INSERT/UPDATE/DELETE.
--
-- EXPLICIT NON-GOALS (frozen boundaries, NOT in this migration):
--   * NO readiness-write RPC; NO pilot-admin readiness RPC (STEP 2C).
--   * NO Pilot Start state / history / RPC (future separate stream).
--   * NO modification of membership/status RPC bodies
--     (pilot_admin_set_operator_status / set_courier_status /
--      set_courier / provision) — their invalidation hooks are a LATER step.
--   * NO pilot-cycle table; NO self-declare field; NO online/presence inputs.
--   * NO GPS/location/PostGIS; is_online / last_online_at UNTOUCHED.
--   * NO RBAC / users.role / pilot_role / telemetry / realtime / orders changes.
--   * 00080 / 00081 / 00082 / 00083 remain byte-for-byte unchanged.
--
-- SEMANTIC GUARANTEES (frozen, see gate8b-step2-readiness-design-freeze.md):
--   ACTIVE != READY          (independent column; active+false is valid)
--   READY != START           (no start mechanism in this migration)
--   non-active + ready=true  => impossible (CHECK)
--   readiness is Admin-confirmed operational state, NOT an AppRole; it never
--   modifies public.users.role / user_metadata.pilot_role / RBAC / membership.
--
-- PRODUCTION SAFETY (GATE 8B Step 2B §11/§12):
--   * This migration is created in the repo ONLY. It is NOT applied to
--     production here. No readiness record is created; no participant is
--     marked READY; no accounts are approved/suspended; no pilot starts.
--   * The post-apply DO-block below fails loudly on structural drift.
-- Rollback (git-only, deterministic; reverts to exact 00083 state):
--   * DROP TABLE IF EXISTS public.pilot_operational_readiness_history;
--   * ALTER TABLE public.pilot_store_operators DROP COLUMN IF EXISTS operational_ready;
--   * ALTER TABLE public.pilot_couriers        DROP COLUMN IF EXISTS operational_ready;
--   * (constraints drop with the columns)
-- ============================================================================


-- ============================================================================
-- 1) CURRENT-STATE COLUMN — both membership tables
-- ============================================================================
ALTER TABLE public.pilot_store_operators
  ADD COLUMN IF NOT EXISTS operational_ready boolean NOT NULL DEFAULT false;

ALTER TABLE public.pilot_couriers
  ADD COLUMN IF NOT EXISTS operational_ready boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pilot_store_operators.operational_ready IS
  'Admin-confirmed operational readiness (NOT ACTIVE, NOT online, NOT an AppRole). '
  'Only true while status = ''active'' (CHECK-enforced). Set ONLY by a future '
  'admin-authorized RPC; never by client/self-declare. Never affects '
  'public.users.role / user_metadata.pilot_role / RBAC / membership status.';

COMMENT ON COLUMN public.pilot_couriers.operational_ready IS
  'Admin-confirmed operational readiness (NOT ACTIVE, NOT online, NOT an AppRole). '
  'Only true while status = ''active'' (CHECK-enforced). Set ONLY by a future '
  'admin-authorized RPC; never by client/self-declare. Never affects '
  'public.users.role / user_metadata.pilot_role / RBAC / membership status.';


-- ============================================================================
-- 2) ACTIVE-ONLY INVARIANT (declarative CHECK; no trigger needed)
--    operational_ready = true  is valid ONLY while status = 'active'.
--    Every non-active state (pending / suspended / inactive) forces false.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pilot_store_operators'::regclass
      AND conname = 'pilot_store_operators_ready_active_only'
  ) THEN
    ALTER TABLE public.pilot_store_operators
      ADD CONSTRAINT pilot_store_operators_ready_active_only
      CHECK (status = 'active' OR operational_ready = false);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pilot_couriers'::regclass
      AND conname = 'pilot_couriers_ready_active_only'
  ) THEN
    ALTER TABLE public.pilot_couriers
      ADD CONSTRAINT pilot_couriers_ready_active_only
      CHECK (status = 'active' OR operational_ready = false);
  END IF;
END;
$$;


-- ============================================================================
-- 3) READINESS AUDIT — append-only stream, mirroring membership-ledger (00081)
--    conventions: uuid PK, member_kind/old/new actor/reason/metadata/created_at.
--    Written ONLY inside a future admin-authorized SECURITY DEFINER RPC in the
--    SAME transaction as the readiness change (single Postgres tx).
--    DELIBERATE DEVIATION from the membership ledger: store_id/user_id FKs here
--    are NO ACTION (not CASCADE) so deleting a store/user can NEVER silently
--    delete readiness history — audit rows are append-only and preserved.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pilot_operational_readiness_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_kind   text NOT NULL CHECK (member_kind IN ('operator', 'courier')),
  -- Append-only invariant: deleting a referenced STORE/USER must NEVER
  -- cascade-delete audit rows. NO ACTION (default) preserves audit identity;
  -- columns stay NOT NULL (no SET NULL for the audit subject).
  store_id      uuid NOT NULL REFERENCES public.stores(id),
  user_id       uuid NOT NULL REFERENCES public.users(id),
  old_ready     boolean NOT NULL,
  new_ready     boolean NOT NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role    text NOT NULL CHECK (actor_role IN ('admin', 'super_admin')),
  reason        text NOT NULL DEFAULT '',
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readiness_history_user_time
  ON public.pilot_operational_readiness_history (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_readiness_history_store_time
  ON public.pilot_operational_readiness_history (store_id, created_at);

ALTER TABLE public.pilot_operational_readiness_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read readiness history" ON public.pilot_operational_readiness_history;
CREATE POLICY "Admin read readiness history"
  ON public.pilot_operational_readiness_history FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.pilot_operational_readiness_history TO authenticated;

-- Append-only from the client's perspective: no direct INSERT/UPDATE/DELETE.
-- Default CREATE TABLE privileges grant ALL to anon/authenticated in Supabase;
-- close the client write path now (schema-preparation step, §6). The future
-- readiness RPC is SECURITY DEFINER owned by the table owner and needs nothing
-- here. Pilot Start stays a SEPARATE stream; NOT implemented.
REVOKE INSERT, UPDATE, DELETE ON public.pilot_operational_readiness_history FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pilot_operational_readiness_history FROM authenticated;

COMMENT ON TABLE public.pilot_operational_readiness_history IS
  'Append-only audit of operational-readiness changes (false<->true). Conceptually '
  'distinct from pilot_membership_history (lifecycle) and the future Pilot Start '
  'history. Store/user FKs are NO ACTION: deleting a store or user cannot delete '
  'audit rows. NO client writes: the only write path is a future admin-authorized '
  'SECURITY DEFINER RPC, same-transaction with the readiness change.';


-- ============================================================================
-- 4) Post-apply integrity — structural drift fails loudly (00083 convention)
-- ============================================================================
DO $$
DECLARE
  v_col  record;
  v_def  text;
  v_dml  int;
  v_ready_true int;
BEGIN
  -- (A) operational_ready columns exist with the frozen shape.
  FOR v_col IN
    SELECT n.nspname, c.relname, a.attname, a.attnotnull,
           pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
    FROM pg_attribute a
    JOIN pg_class c        ON c.oid = a.attrelid
    JOIN pg_namespace n    ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND c.relname IN ('pilot_store_operators', 'pilot_couriers')
      AND a.attname = 'operational_ready'
  LOOP
    IF NOT v_col.attnotnull OR v_col.default_expr IS NULL
       OR v_col.default_expr NOT LIKE '%false%' THEN
      RAISE EXCEPTION '00084: operational_ready NOT NOT NULL DEFAULT false on %.%',
        v_col.nspname, v_col.relname;
    END IF;
  END LOOP;
  IF NOT FOUND THEN
    RAISE EXCEPTION '00084: operational_ready column missing';
  END IF;

  -- (B) Active-only CHECK present on both membership tables (exact def).
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.pilot_store_operators'::regclass
     AND conname = 'pilot_store_operators_ready_active_only';
  IF v_def IS NULL
     OR v_def NOT LIKE '%operational_ready%'
     OR v_def NOT LIKE '%''active''%' THEN
    RAISE EXCEPTION '00084: operator active-only CHECK missing/misdefined: %', v_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.pilot_couriers'::regclass
     AND conname = 'pilot_couriers_ready_active_only';
  IF v_def IS NULL
     OR v_def NOT LIKE '%operational_ready%'
     OR v_def NOT LIKE '%''active''%' THEN
    RAISE EXCEPTION '00084: courier active-only CHECK missing/misdefined: %', v_def;
  END IF;

  -- (C) Audit table exists with every required field.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
      AND column_name IN
        ('id','member_kind','store_id','user_id','old_ready','new_ready',
         'actor_user_id','actor_role','reason','created_at')
  ) THEN
    RAISE EXCEPTION '00084: readiness history missing required field(s)';
  END IF;

  -- member_kind + actor_role value checks (existing project convention).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conrelid =
      'public.pilot_operational_readiness_history'::regclass AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%''operator''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''courier''%'
  ) THEN
    RAISE EXCEPTION '00084: readiness member_kind CHECK missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conrelid =
      'public.pilot_operational_readiness_history'::regclass AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%''admin''%'
      AND pg_get_constraintdef(c.oid) LIKE '%''super_admin''%'
  ) THEN
    RAISE EXCEPTION '00084: readiness actor_role CHECK must accept admin AND super_admin';
  END IF;

  -- (C2) Subject FKs MUST NOT cascade-delete audit rows (append-only invariant):
  --      store_id -> stores, user_id -> users, both NO ACTION, NOT NULL kept.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%FOREIGN KEY (store_id)%'
      AND t.relname = 'stores' AND n.nspname = 'public'
      AND c.confdeltype IN ('a', 'r')
  ) THEN
    RAISE EXCEPTION '00084: readiness store_id FK must not cascade audit deletes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%FOREIGN KEY (user_id)%'
      AND t.relname = 'users' AND n.nspname = 'public'
      AND c.confdeltype IN ('a', 'r')
  ) THEN
    RAISE EXCEPTION '00084: readiness user_id FK must not cascade audit deletes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.pilot_operational_readiness_history'::regclass
      AND c.contype = 'f' AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION '00084: no readiness-history FK may cascade';
  END IF;

  -- (D) No direct client DML on the audit table.
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION '00084: readiness history client DML is OPEN';
  END IF;

  -- (E) Audit table is NOT published to realtime (realtime untouched).
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'pilot_operational_readiness_history'
  ) THEN
    RAISE EXCEPTION '00084: readiness history must NOT be in supabase_realtime';
  END IF;

  -- (F) Every existing membership row is NOT READY (frozen §9/H).
  SELECT count(*) INTO v_ready_true
    FROM public.pilot_store_operators WHERE operational_ready;
  IF v_ready_true <> 0 THEN
    RAISE EXCEPTION '00084: existing operator row is ready';
  END IF;
  SELECT count(*) INTO v_ready_true
    FROM public.pilot_couriers WHERE operational_ready;
  IF v_ready_true <> 0 THEN
    RAISE EXCEPTION '00084: existing courier row is ready';
  END IF;

  -- (G) 00080-00083 invariants remain intact (this migration must not weaken).
  --   g1. membership ledger still has NO anon/authenticated DML grants.
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'pilot_membership_history'
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION '00084: membership ledger DML reopened';
  END IF;
  --   g2. one-active-operator exclusivity index still present (00081).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_store_operators'
      AND indexname = 'pilot_store_operators_one_active'
  ) THEN
    RAISE EXCEPTION '00084: operator exclusivity index missing';
  END IF;
  --   g3. provision RPC is still service_role-only (00083).
  IF NOT has_function_privilege('service_role',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '00084: provision service_role EXECUTE missing';
  END IF;
  IF has_function_privilege('anon',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.pilot_provision_new_membership(text, uuid, uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '00084: provision RPC no longer service_role-only';
  END IF;
  --   g4. courier presence fields (00078) untouched.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_couriers'
      AND column_name IN ('is_online', 'last_online_at')
  ) THEN
    RAISE EXCEPTION '00084: is_online/last_online_at must remain untouched';
  END IF;
END;
$$;