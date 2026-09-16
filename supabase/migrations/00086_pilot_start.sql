-- ============================================================================
-- 00086  Delivery Operating System — PILOT START (authoritative run creation)
-- ----------------------------------------------------------------------------
-- GATE 8B STEP 4 (IMPLEMENTATION). Implements the frozen STEP 3 design
-- (docs/gates/gate8b-step3-pilot-start-design.md) **unchanged**:
--
--   * Architecture: Model D (hybrid) — ONE immutable run/state+audit table
--     `pilot_pilot_starts`. `ended_at IS NULL` IS the authoritative STARTED
--     state; there is no separate flag, no cycle/session table, and NO boolean
--     on stores/memberships.
--   * One open run per store, enforced structurally by the partial unique index
--     `pilot_pilot_starts_one_open (store_id) WHERE (ended_at IS NULL)`.
--   * Per-store `run_index` (1, 2, …) assigned inside the START transaction;
--     `UNIQUE (store_id, run_index)` guards the number sequence.
--   * START RPC  `pilot_admin_start_pilot(uuid, uuid, jsonb)` — SECURITY
--     DEFINER, search_path='', authenticated-only, `fn_admin_uid()` re-check
--     per call, deterministic error codes (§9 of the design).
--   * The RPC re-verifies every precondition INSIDE its own transaction under
--     row locks (FOR SHARE on store + operator + courier; FOR SHARE conflicts
--     with the FOR UPDATE/NO KEY UPDATE locks taken by the lifecycle/readiness
--     RPCs so races A/B/C/F serialize deterministically — see report §D).
--   * A second/retry START returns explicit `ALREADY_STARTED` (23505), both by
--     fast-path pre-check and by mapping the partial-unique-index violation.
--   * Admin read RPC `pilot_admin_pilot_start_status(uuid, uuid)` — STABLE,
--     SECURITY DEFINER, same guard. Powers the pre-START precondition readout
--     AND the post-START Option-A validity check (drift is DERIVED, never
--     stored; no lifecycle RPC is modified).
--
-- FROZEN NON-GOALS (design §24, honored):
--   * NO cycle/session table; NO STOP/END RPC; NO flag on 00065 tables.
--   * NO change to public.users.role / RBAC / RLS / telemetry / orders /
--     assignments / realtime / readiness / membership history / GPS.
--   * NO telemetry emission (design §16 — future gate; allowlist untouched).
--   * NO realtime publication of the START table (design §17).
--   * pilots are NOT auto-created; storefront/order-flow NOT gated by START
--     (design §13).
--   * 00080 / 00081 / 00082 / 00083 / 00084 / 00085 stay byte-for-byte
--     unchanged. `pilot_reset()` (00065) is NOT modified (design §15).
--
-- PRODUCTION SAFETY (STEP 4 boundary): this migration is created in the repo
-- ONLY. It is NOT applied to production in this gate; no production START is
-- invoked. The post-apply DO-block fails loudly on structural drift.
--
-- ROLLBACK (reverts to exact 00085 state):
--   * DROP FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb);
--   * DROP FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid);
--   * DROP TABLE public.pilot_pilot_starts;  (action table only, empty at gates)
-- ============================================================================


-- ============================================================================
-- 1) PILOT START RUN/STATE+audit stream — ONE table (design §7, Model D)
--    - store_id FK ON DELETE RESTRICT  → pilot_reset() deleting a STARTED
--      pilot-% store must be handled explicitly in a future gate; audit rows
--      are NEVER cascade-deleted (design §14/§15).
--    - operator/courier/actor user FKs are the "retained-history" SET NULL
--      pattern (identical to readiness-history actor FK, 00084): a run's
--      captured identities survive even if a user record is ever removed.
--    - successful START events only; failed attempts mutate nothing.
-- ============================================================================
CREATE TABLE public.pilot_pilot_starts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  run_index            integer NOT NULL CHECK (run_index >= 1),
  operator_user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  courier_user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_user_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role           text NOT NULL CHECK (actor_role IN ('admin', 'super_admin')),
  precondition_snapshot jsonb NOT NULL DEFAULT '{}',
  metadata             jsonb NOT NULL DEFAULT '{}',
  ended_at             timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pilot_pilot_starts IS
  'Pilot run state + immutable audit stream. ended_at IS NULL = the store has ONE '
  'authoritative open run (STARTED). Partial unique index (store_id) WHERE ended_at '
  'IS NULL guarantees exactly one open run per store structurally. run_index numbers '
  'per-store runs (1,2,...). store FK is ON DELETE RESTRICT so deleting a STARTED '
  'pilots store is a deliberate future-gate action; audit rows are never cascade-deleted. '
  'Successful START events only; failed attempts mutate nothing. NOT realtime.';

-- Structural concurrency + numbering guarantees.
CREATE UNIQUE INDEX pilot_pilot_starts_one_open
  ON public.pilot_pilot_starts (store_id) WHERE (ended_at IS NULL);

CREATE UNIQUE INDEX pilot_pilot_starts_store_run
  ON public.pilot_pilot_starts (store_id, run_index);

CREATE INDEX pilot_pilot_starts_store_time
  ON public.pilot_pilot_starts (store_id, created_at);

-- RLS: admin-read policy exactly mirrors the readiness-history convention (00084).
ALTER TABLE public.pilot_pilot_starts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read pilot start runs" ON public.pilot_pilot_starts;
CREATE POLICY "Admin read pilot start runs"
  ON public.pilot_pilot_starts FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.pilot_pilot_starts TO authenticated;

-- Append-only from the client: no direct INSERT/UPDATE/DELETE. The only write
-- path is the SECURITY DEFINER START RPC (same transaction as the read locks).
REVOKE INSERT, UPDATE, DELETE ON public.pilot_pilot_starts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pilot_pilot_starts FROM authenticated;


-- ============================================================================
-- 2) ADMIN START RPC — `pilot_admin_start_pilot`
--    One transaction. Re-reads every precondition under row locks; derives the
--    authoritative active operator from the membership table (single active per
--    store, structural), requires the courier to be an ACTIVE + READY member of
--    the SAME store, computes the next per-store run_index, and INSERTs exactly
--    one run row with a precondition snapshot. Returns the frozen success
--    payload (design §9). Errors are deterministic codes (design §9).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_start_pilot(
  p_store_id uuid,
  p_courier_user_id uuid,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := public.fn_admin_uid();
  v_role         text;
  v_store_status text;
  v_store_op     uuid;
  v_operator     uuid;
  v_op_status    text;
  v_op_ready     boolean;
  v_co_status    text;
  v_co_ready     boolean;
  v_run_index    int;
  v_run_id       uuid;
  v_started_at   timestamptz;
  v_snapshot     jsonb;
BEGIN
  -- Authorization: authenticated admin / super_admin only, re-checked per call.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL OR p_courier_user_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Readiness-style audit records the ACTUAL caller role (admin / super_admin).
  SELECT role INTO v_role FROM public.users WHERE id = v_uid;

  -- Idempotency fast path: a retry / duplicate Admin session for an already
  -- open run returns ALREADY_STARTED deterministically (design §6 Option B).
  PERFORM 1 FROM public.pilot_pilot_starts
   WHERE store_id = p_store_id AND ended_at IS NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'ALREADY_STARTED' USING ERRCODE = '23505';
  END IF;

  -- Store: exists + active + operator linkage. FOR SHARE serializes against the
  -- lifecycle/readiness RPCs and store archival/update (they lock FOR UPDATE).
  SELECT status, operator_user_id INTO v_store_status, v_store_op
    FROM public.stores
   WHERE id = p_store_id
   FOR SHARE;
  IF v_store_status IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_store_status <> 'active' THEN
    RAISE EXCEPTION 'STORE_INACTIVE' USING ERRCODE = '22023';
  END IF;

  -- Authoritative operator: the store's active membership row (exactly one per
  -- store by the partial unique index). FOR SHARE serializes readiness/lifecycle
  -- writes on the same row (FOR UPDATE).
  SELECT user_id, status, operational_ready INTO v_operator, v_op_status, v_op_ready
    FROM public.pilot_store_operators
   WHERE store_id = p_store_id AND status = 'active'
   FOR SHARE;
  IF v_operator IS NULL THEN
    RAISE EXCEPTION 'OPERATOR_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  -- Linkage: the legacy stores.operator_user_id pointer must equal the active
  -- membership operator (kept synchronized by 00081 activation/demotion).
  IF v_store_op IS DISTINCT FROM v_operator THEN
    RAISE EXCEPTION 'OPERATOR_NOT_LINKED' USING ERRCODE = '22023';
  END IF;
  IF v_op_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'OPERATOR_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;
  IF NOT v_op_ready THEN
    RAISE EXCEPTION 'OPERATOR_NOT_READY' USING ERRCODE = '22023';
  END IF;

  -- Courier: must be an ACTIVE + READY member of the SAME store.
  SELECT status, operational_ready INTO v_co_status, v_co_ready
    FROM public.pilot_couriers
   WHERE user_id = p_courier_user_id AND store_id = p_store_id
   FOR SHARE;
  IF v_co_status IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.pilot_couriers WHERE user_id = p_courier_user_id) THEN
      RAISE EXCEPTION 'COURIER_NOT_LINKED' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'COURIER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_co_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'COURIER_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;
  IF NOT v_co_ready THEN
    RAISE EXCEPTION 'COURIER_NOT_READY' USING ERRCODE = '22023';
  END IF;

  -- Next per-store run index. The partial unique index + UNIQUE(store,run_index)
  -- turn any concurrent race into ALREADY_STARTED, never a duplicate run.
  SELECT COALESCE(MAX(run_index), 0) + 1 INTO v_run_index
    FROM public.pilot_pilot_starts
   WHERE store_id = p_store_id;

  -- Immutable audit snapshot: the exact verified conditions at START.
  v_snapshot := jsonb_build_object(
    'store',    jsonb_build_object('id', p_store_id, 'status', v_store_status,
                                   'operator_user_id', v_store_op, 'ok', true),
    'operator', jsonb_build_object('user_id', v_operator, 'status', v_op_status,
                                   'operational_ready', v_op_ready),
    'courier',  jsonb_build_object('user_id', p_courier_user_id, 'store_id', p_store_id,
                                   'status', v_co_status, 'operational_ready', v_co_ready),
    'verified_at', now()
  );

  -- Atomic insert: exactly ONE run row when all preconditions held. The partial
  -- unique index is the structural arbiter under concurrency (races E/G).
  BEGIN
    INSERT INTO public.pilot_pilot_starts (
      store_id, run_index, operator_user_id, courier_user_id,
      actor_user_id, actor_role, precondition_snapshot, metadata
    ) VALUES (
      p_store_id, v_run_index, v_operator, p_courier_user_id,
      v_uid, v_role, v_snapshot, COALESCE(p_metadata, '{}')
    )
    RETURNING id, created_at INTO v_run_id, v_started_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_STARTED' USING ERRCODE = '23505';
  END;

  RETURN jsonb_build_object(
    'run_id',            v_run_id,
    'run_index',         v_run_index,
    'store_id',          p_store_id,
    'operator_user_id',  v_operator,
    'courier_user_id',   p_courier_user_id,
    'actor_user_id',     v_uid,
    'actor_role',        v_role,
    'status',            'started',
    'started_at',        v_started_at,
    'event_type',        'pilot_started'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_start_pilot(uuid, uuid, jsonb) FROM anon;


-- ============================================================================
-- 3) ADMIN READ RPC — `pilot_admin_pilot_start_status`
--    STABLE, SECURITY DEFINER, same admin guard. Returns:
--      * store readout (status / operator linkage);
--      * the open run (run_id, run_index, captured identities, started_at) or
--        NULL when NOT STARTED;
--      * the current operator membership and the supplied/run courier
--        membership — the panel renders server truth, no client inference;
--      * server-derived preconditions + aggregate `ready`;
--      * post-START drift validity (design §8, §10b — Option A, READ ONLY):
--        the run's captured operator/courier must STILL be ACTIVE + READY and
--        the operator must still be the store's active operator. `valid` is
--        null when not started; drift reasons are returned as codes.
--    This RPC modifies nothing and never modifies existing lifecycle RPCs.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_pilot_start_status(
  p_store_id uuid,
  p_courier_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := public.fn_admin_uid();
  v_store_status text;
  v_store_op     uuid;
  v_run          public.pilot_pilot_starts%ROWTYPE;
  v_started      boolean := false;
  v_operator     uuid;
  v_op_status    text;
  v_op_ready     boolean;
  v_op_linked    boolean;
  v_co_uid       uuid;
  v_co_status    text;
  v_co_ready     boolean;
  v_ready        boolean := false;
  v_valid        boolean := NULL;
  v_reasons      text[] := '{}'::text[];
  v_cop_status   text;
  v_cop_ready    boolean;
  v_cco_status   text;
  v_cco_ready    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT status, operator_user_id INTO v_store_status, v_store_op
    FROM public.stores WHERE id = p_store_id;
  IF v_store_status IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_run FROM public.pilot_pilot_starts
   WHERE store_id = p_store_id AND ended_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  v_started := v_run.id IS NOT NULL;

  -- Current active operator membership (panel readout + validity linkage check).
  SELECT user_id, status, operational_ready INTO v_operator, v_op_status, v_op_ready
    FROM public.pilot_store_operators
   WHERE store_id = p_store_id AND status = 'active';
  v_op_linked := v_operator IS NOT NULL AND v_operator IS NOT DISTINCT FROM v_store_op;

  -- Courier of interest: the provided candidate when starting, otherwise the
  -- run's captured courier (so a STARTED panel displays the verified member).
  v_co_uid := CASE WHEN v_started THEN v_run.courier_user_id ELSE p_courier_user_id END;
  IF v_co_uid IS NOT NULL THEN
    SELECT status, operational_ready INTO v_co_status, v_co_ready
      FROM public.pilot_couriers
     WHERE user_id = v_co_uid AND store_id = p_store_id;
  END IF;

  IF v_started THEN
    v_ready := false;
  ELSE
    v_ready := (v_store_status = 'active')
           AND v_op_linked
           AND (v_op_status = 'active')
           AND (v_op_ready = true)
           AND v_co_uid IS NOT NULL
           AND (v_co_status = 'active')
           AND (v_co_ready = true);
  END IF;

  -- Post-START drift validity (Option A — derived, read-only, no lifecycle hook).
  IF v_started THEN
    v_valid := true;
    IF v_run.operator_user_id IS NOT NULL THEN
      SELECT status, operational_ready INTO v_cop_status, v_cop_ready
        FROM public.pilot_store_operators
       WHERE store_id = p_store_id AND user_id = v_run.operator_user_id;
      IF v_cop_status IS NULL THEN
        v_valid := false; v_reasons := v_reasons || 'OPERATOR_NOT_FOUND'::text;
      ELSIF v_cop_status IS DISTINCT FROM 'active' THEN
        v_valid := false; v_reasons := v_reasons || 'OPERATOR_NOT_ACTIVE'::text;
      ELSIF NOT v_cop_ready THEN
        v_valid := false; v_reasons := v_reasons || 'OPERATOR_NOT_READY'::text;
      END IF;
      IF v_operator IS DISTINCT FROM v_run.operator_user_id THEN
        v_valid := false; v_reasons := v_reasons || 'OPERATOR_REPLACED'::text;
      END IF;
    END IF;
    IF v_run.courier_user_id IS NOT NULL THEN
      SELECT status, operational_ready INTO v_cco_status, v_cco_ready
        FROM public.pilot_couriers
       WHERE user_id = v_run.courier_user_id AND store_id = p_store_id;
      IF v_cco_status IS NULL THEN
        v_valid := false; v_reasons := v_reasons || 'COURIER_NOT_FOUND'::text;
      ELSIF v_cco_status IS DISTINCT FROM 'active' THEN
        v_valid := false; v_reasons := v_reasons || 'COURIER_NOT_ACTIVE'::text;
      ELSIF NOT v_cco_ready THEN
        v_valid := false; v_reasons := v_reasons || 'COURIER_NOT_READY'::text;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'started', v_started,
    'run', CASE WHEN v_started THEN jsonb_build_object(
        'run_id',           v_run.id,
        'run_index',        v_run.run_index,
        'started_at',       v_run.created_at,
        'operator_user_id', v_run.operator_user_id,
        'courier_user_id',  v_run.courier_user_id,
        'actor_user_id',    v_run.actor_user_id,
        'actor_role',       v_run.actor_role
      ) ELSE NULL END,
    'store', jsonb_build_object(
      'id', p_store_id, 'status', v_store_status,
      'operator_user_id', v_store_op,
      'active', (v_store_status = 'active'),
      'linked', v_op_linked
    ),
    'operator', CASE WHEN v_operator IS NOT NULL THEN jsonb_build_object(
      'user_id', v_operator, 'status', v_op_status,
      'operational_ready', v_op_ready,
      'active', (v_op_status = 'active'),
      'ready', (v_op_ready = true),
      'linked', v_op_linked
    ) ELSE NULL END,
    'courier', CASE WHEN v_co_uid IS NOT NULL THEN jsonb_build_object(
      'user_id', v_co_uid, 'store_id', p_store_id,
      'status', v_co_status,
      'operational_ready', v_co_ready,
      'linked', (v_co_status IS NOT NULL),
      'active', (v_co_status = 'active'),
      'ready', (v_co_ready = true)
    ) ELSE NULL END,
    'preconditions', jsonb_build_object(
      'store_active',    (v_store_status = 'active'),
      'operator_linked', v_op_linked,
      'operator_active', (v_op_status = 'active'),
      'operator_ready',  (v_op_ready = true),
      'courier_linked',  (v_co_status IS NOT NULL),
      'courier_active',  (v_co_status = 'active'),
      'courier_ready',   (v_co_ready = true)
    ),
    'ready', v_ready,
    'valid', v_valid,
    'validReasons', v_reasons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_pilot_start_status(uuid, uuid) FROM anon;


-- ============================================================================
-- 4) Post-apply integrity — structural drift fails loudly (00084/00085 pattern)
-- ============================================================================
DO $$
DECLARE
  v_def  text;
  v_ok   boolean;
  v_n    int;
  v_dml  int;
  c      record;
BEGIN
  -- (A) START RPC exists with the frozen security + behaviour shape.
  SELECT pg_get_functiondef('public.pilot_admin_start_pilot(uuid, uuid, jsonb)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION '00086: start RPC missing'; END IF;
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN RAISE EXCEPTION '00086: start RPC not SECURITY DEFINER'; END IF;
  IF v_def NOT LIKE '%search_path TO ''''%' THEN RAISE EXCEPTION '00086: start RPC search_path not empty'; END IF;
  IF v_def NOT LIKE '%fn_admin_uid%' THEN RAISE EXCEPTION '00086: start RPC admin guard missing'; END IF;
  IF v_def NOT LIKE '%FOR SHARE%' THEN RAISE EXCEPTION '00086: start RPC precondition locks missing'; END IF;
  IF v_def NOT LIKE '%ALREADY_STARTED%' THEN RAISE EXCEPTION '00086: start RPC idempotency guard missing'; END IF;
  IF v_def NOT LIKE '%INSERT INTO public.pilot_pilot_starts%' THEN RAISE EXCEPTION '00086: start RPC run insert missing'; END IF;
  IF v_def NOT LIKE '%precondition_snapshot%' THEN RAISE EXCEPTION '00086: start RPC snapshot missing'; END IF;
  IF v_def NOT LIKE '%COALESCE(MAX(run_index), 0) + 1%' THEN RAISE EXCEPTION '00086: start RPC run_index derivation missing'; END IF;

  -- (B) START RPC ACL: authenticated YES, anon/PUBLIC NO.
  SELECT has_function_privilege('authenticated',
    'public.pilot_admin_start_pilot(uuid, uuid, jsonb)', 'EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION '00086: start RPC authenticated EXECUTE missing'; END IF;
  SELECT has_function_privilege('anon',
    'public.pilot_admin_start_pilot(uuid, uuid, jsonb)', 'EXECUTE') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION '00086: start RPC anon EXECUTE open'; END IF;
  SELECT has_function_privilege('service_role',
    'public.pilot_admin_start_pilot(uuid, uuid, jsonb)', 'EXECUTE') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION '00086: start RPC service_role EXECUTE open (no service-role browser path)'; END IF;

  -- (C) Read RPC exists, guarded, STABLE, and exposes the run + validity.
  SELECT pg_get_functiondef('public.pilot_admin_pilot_start_status(uuid, uuid)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL THEN RAISE EXCEPTION '00086: start status RPC missing'; END IF;
  IF v_def NOT LIKE '%SECURITY DEFINER%' THEN RAISE EXCEPTION '00086: status RPC not SECURITY DEFINER'; END IF;
  IF v_def NOT LIKE '%STABLE%' THEN RAISE EXCEPTION '00086: status RPC not STABLE'; END IF;
  IF v_def NOT LIKE '%fn_admin_uid%' THEN RAISE EXCEPTION '00086: status RPC admin guard missing'; END IF;
  IF v_def NOT LIKE '%valid%' OR v_def NOT LIKE '%validReasons%' THEN
    RAISE EXCEPTION '00086: status RPC drift validity missing';
  END IF;
  SELECT has_function_privilege('authenticated',
    'public.pilot_admin_pilot_start_status(uuid, uuid)', 'EXECUTE') INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION '00086: status RPC authenticated EXECUTE missing'; END IF;

  -- (D) Table structure: columns / constraints / open-run partial UQ / run UQ.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pilot_pilot_starts'
      AND column_name IN ('id','store_id','run_index','operator_user_id','courier_user_id',
                          'actor_user_id','actor_role','precondition_snapshot','metadata',
                          'ended_at','created_at')
  ) THEN RAISE EXCEPTION '00086: pilot_pilot_starts columns missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_pilot_starts'
      AND indexname = 'pilot_pilot_starts_one_open'
  ) THEN RAISE EXCEPTION '00086: open-run partial unique index missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_pilot_starts'
      AND indexname = 'pilot_pilot_starts_store_run'
  ) THEN RAISE EXCEPTION '00086: store-run unique index missing'; END IF;

  -- (E) FKs: store RESTRICT (audit preservation) — user FKs SET NULL, no CASCADE.
  FOR c IN
    SELECT pg_get_constraintdef(c2.oid) AS def, c2.confdeltype AS deltype
      FROM pg_constraint c2
     WHERE c2.conrelid = 'public.pilot_pilot_starts'::regclass AND c2.contype = 'f'
  LOOP
    IF c.def LIKE '%REFERENCES public.stores(id)%' THEN
      IF c.deltype <> 'r' THEN RAISE EXCEPTION '00086: store FK must be ON DELETE RESTRICT'; END IF;
    ELSIF c.def LIKE '%REFERENCES public.users(id)%' THEN
      IF c.deltype <> 'n' THEN RAISE EXCEPTION '00086: user FK must be ON DELETE SET NULL (retained history)'; END IF;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c2
    WHERE c2.conrelid = 'public.pilot_pilot_starts'::regclass AND c2.contype = 'f'
      AND c2.confdeltype = 'c'
  ) THEN RAISE EXCEPTION '00086: pilot start FK cascades'; END IF;

  -- (F) RLS enabled + admin-read policy present; client writes fully closed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pilot_pilot_starts'
      AND policyname = 'Admin read pilot start runs'
  ) THEN RAISE EXCEPTION '00086: start admin-read policy missing'; END IF;
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pilot_pilot_starts'
      AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION '00086: start client DML open'; END IF;

  -- (G) START table is NOT realtime-subscribed.
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'pilot_pilot_starts'
  ) THEN RAISE EXCEPTION '00086: pilot starts in realtime'; END IF;

  -- (H) No GPS / location / geofence expressed anywhere in the migration surface.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE '%gps%' OR p.proname LIKE '%geo%' OR p.proname LIKE '%location%'
          OR p.proname LIKE '%distance%' OR p.proname LIKE '%rout%' OR p.proname LIKE '%eta%');
  IF v_n <> 0 THEN RAISE EXCEPTION '00086: gps/location surface must not exist'; END IF;

  -- (I) 00080-00085 invariants remain intact.
  --   i1. existing admin RPCs not redefined; no change to frozen tables.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (
     'pilot_admin_assign_order','pilot_order_set_status','pilot_courier_set_status',
     'record_telemetry_event','fn_admin_uid','pilot_admin_upsert_store',
     'pilot_admin_set_operational_ready','pilot_admin_set_operator_status',
     'pilot_admin_set_courier_status','pilot_admin_set_courier'
   );
  IF v_n <> 10 THEN RAISE EXCEPTION '00086: existing RPC surface drifted'; END IF;
  --   i2. one-active-operator exclusivity index still present (00081).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pilot_store_operators'
      AND indexname = 'pilot_store_operators_one_active'
  ) THEN RAISE EXCEPTION '00086: operator exclusivity index missing'; END IF;
  --   i3. orders realtime tables present and READY/order surfaces intact (00082/00080).
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename IN ('orders', 'order_status_history')
  ) THEN RAISE EXCEPTION '00086: orders realtime tables missing'; END IF;
  --   i4. readiness client DML still closed (00084).
  SELECT count(*) INTO v_dml FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'pilot_operational_readiness_history'
      AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN RAISE EXCEPTION '00086: readiness client DML reopened'; END IF;
  --   i5. START history must be empty at migration time (fresh audit stream).
  SELECT count(*) INTO v_dml FROM public.pilot_pilot_starts;
  IF v_dml <> 0 THEN RAISE EXCEPTION '00086: start history must be empty pre-E2E'; END IF;
END;
$$;