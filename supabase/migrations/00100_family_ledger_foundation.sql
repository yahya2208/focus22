-- ============================================================================
-- 00100  FINANCIAL GATE A — Family membership · Ledger · Debts · Resolver
-- ----------------------------------------------------------------------------
-- Type: Additive (new tables, new RPCs). No published function is replaced.
--
-- GATE A architectural decisions codified here (D1–D4, OQ1=B, OQ2=B):
--   D1  = family_members is THE membership table (user ⇄ family_groups).
--   D2  = family resolution is SERVER-DERIVED from auth.uid() — the client can
--         never supply a family_id (no trusted selector from the browser).
--   OQ1=B = ONE account model: a single 'principal' role per family account.
--   OQ2=B = ONE user ⇄ ONE family: lifetime UNIQUE(user_id) — a user can never
--         hop between families.
--   D4  = BALANCE SOURCE OF TRUTH IS `SUM(ledger.amount)` AND NOTHING ELSE.
--         `ledger.balance_after` is an AUDIT SNAPSHOT ONLY (informational);
--         it is never read back to recompute a balance. `debts` is a MONITORING
--         record of the uncovered remainder of a PURCHASE that already exists
--         in the ledger — NOT a ledger account, NOT added to SUM(ledger), NOT
--         a second financial movement. There is no `SUM(ledger) + debt`
--         equation anywhere.
--
-- Sign convention (canonical, single financial movement per event):
--   CASH_DEPOSIT = +amount   (money added to the account)
--   PURCHASE     = -total    (ONE full-value movement per order settlement)
--   REFUND       = +amount   (money returned to the account)
--   REVERSAL     =  +/-void  (nullifies an erroneous ledger row)
--
-- Write path (server-authoritative, SECURITY DEFINER only):
--   pilot_admin_provision_family_member(user, family)  — membership (admin)
--   pilot_admin_deposit(family, amount)                — CASH_DEPOSIT (admin)
--   pilot_family_settle_and_deliver(...)               — PURCHASE (00102)
-- Direct INSERT/UPDATE/DELETE on ledger / debts / family_members is impossible
-- for anon+authenticated (no client write grants + RLS closed).
--
-- Dependencies: 00065 (family_groups, stores, neighborhoods, orders columns),
-- 00002 (public.users mirror), 00050 (orders, delivery_zones).
-- Rollback: DROP TABLE public.family_members; DROP TABLE public.ledger;
--           DROP TABLE public.debts; DROP FUNCTION
--           public.pilot_my_family(public.pilot_my_account aliases);
--           DROP FUNCTION public.pilot_admin_provision_family_member(uuid,uuid);
--           DROP FUNCTION public.pilot_admin_deposit(uuid,numeric,text);
-- ============================================================================

-- ============================================================================
-- 1) family_members — membership (ONE principal per family account)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.family_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES public.family_groups(id)  ON DELETE CASCADE,
  user_id    uuid NOT NULL UNIQUE REFERENCES public.users(id)   ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'principal'
             CHECK (role IN ('principal')),
  status     text NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- OQ1=B / OQ2=B backstops (defense in depth — the RPCs keep the invariant too):
--   * UNIQUE(user_id)        — a user belongs to exactly ONE family (lifetime).
--   * one ACTIVE principal   — a family has at most one live principal account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_one_active_principal
  ON public.family_members (family_id)
  WHERE role = 'principal' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members (family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user_status ON public.family_members (user_id, status);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Member read own membership" ON public.family_members;
CREATE POLICY "Member read own membership"
  ON public.family_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin read all memberships" ON public.family_members;
CREATE POLICY "Admin read all memberships"
  ON public.family_members FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage memberships" ON public.family_members;
CREATE POLICY "Admin manage memberships"
  ON public.family_members FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

GRANT SELECT ON public.family_members TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.family_members FROM authenticated;
REVOKE ALL ON public.family_members FROM anon;

-- ============================================================================
-- 2) ledger — the ONLY source of truth for a family's balance.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledger (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (
    transaction_type IN ('CASH_DEPOSIT', 'PURCHASE', 'REFUND', 'REVERSAL')
  ),
  amount           numeric(12,2) NOT NULL,
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference        text NOT NULL DEFAULT '',
  note             text NOT NULL DEFAULT '',
  balance_after    numeric(12,2) NOT NULL DEFAULT 0,
  created_by       uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Sign rule: the transaction_type fully determines the amount direction.
  -- There is no second financial movement to "cover" a debt — the PURCHASE is
  -- the complete order value; the uncovered remainder is tracked in `debts`.
  CONSTRAINT ledger_sign_rule CHECK (
    (transaction_type IN ('CASH_DEPOSIT', 'REFUND') AND amount > 0)
    OR (transaction_type = 'PURCHASE' AND amount < 0)
    OR (transaction_type = 'REVERSAL')
  ),
  CONSTRAINT ledger_amount_nonzero CHECK (amount <> 0)
);

-- Balance reads are per-family chronological scan + SUM(amount).
CREATE INDEX IF NOT EXISTS idx_ledger_family_time
  ON public.ledger (family_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_order
  ON public.ledger (related_order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type
  ON public.ledger (transaction_type);

ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated read/write grant: family balance is exposed ONLY
-- through `pilot_my_account` (SECURITY DEFINER, re-checks auth.uid() and the
-- caller's family). Admins can read directly through the policy below.
DROP POLICY IF EXISTS "Admin read ledger" ON public.ledger;
CREATE POLICY "Admin read ledger"
  ON public.ledger FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

REVOKE ALL ON public.ledger FROM anon;
REVOKE ALL ON public.ledger FROM authenticated;

-- ============================================================================
-- 3) debts — MONITORING record of the uncovered remainder of a PURCHASE.
--    NOT a ledger account. `remaining` is DERIVED at settlement/deposit time
--    from the ledger figures and is never added to SUM(ledger.amount).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.debts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
  order_id       uuid NOT NULL REFERENCES public.orders(id)        ON DELETE CASCADE,
  original_total numeric(12,2) NOT NULL CHECK (original_total > 0),
  covered        numeric(12,2) NOT NULL DEFAULT 0 CHECK (covered >= 0),
  remaining      numeric(12,2) NOT NULL DEFAULT 0 CHECK (remaining >= 0),
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'settled')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, order_id),
  CHECK (covered + remaining = original_total)
);

CREATE INDEX IF NOT EXISTS idx_debts_family_status
  ON public.debts (family_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_debts_order ON public.debts (order_id);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read debts" ON public.debts;
CREATE POLICY "Admin read debts"
  ON public.debts FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

REVOKE ALL ON public.debts FROM anon;
REVOKE ALL ON public.debts FROM authenticated;

-- ============================================================================
-- 4) Family resolver — SERVER-DERIVED membership (D2). The client never
--    selects a family; this function IS the identity source at checkout.
--    Returns the active principal membership for auth.uid() plus its family.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_my_family()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  RETURN QUERY
    SELECT jsonb_build_object(
      'member_id', fm.id,
      'user_id', fm.user_id,
      'family_id', fm.family_id,
      'role', fm.role,
      'status', fm.status,
      'family_name', fg.name,
      'family_name_ar', fg.name_ar,
      'family_status', fg.status,
      'neighborhood', nf.neighborhood_id,
      'neighborhood_name', n.name,
      'neighborhood_name_ar', n.name_ar,
      'store', s.id,
      'store_name', s.name,
      'store_name_ar', s.name_ar
    )
    FROM public.family_members fm
    JOIN public.family_groups fg ON fg.id = fm.family_id
    LEFT JOIN public.neighborhood_families nf ON nf.family_id = fg.id
    LEFT JOIN public.neighborhoods n ON n.id = nf.neighborhood_id AND n.status = 'active'
    LEFT JOIN LATERAL (
      SELECT s.id, s.name, s.name_ar
      FROM public.stores s
      WHERE s.neighborhood_id = nf.neighborhood_id AND s.status = 'active'
      ORDER BY s.created_at ASC
      LIMIT 1
    ) s ON TRUE
    WHERE fm.user_id = v_uid
      AND fm.status = 'active'
      AND fg.status = 'active'
    ORDER BY fm.created_at ASC
    LIMIT 1;
END;
$$;

-- ============================================================================
-- 5) Account read — balance (SUM(ledger.amount)) + open debts for MY family.
--    Lightweight intended for the family's own Account/MyOrders surface.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_my_account()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_family   uuid;
  v_balance  numeric(12,2) := 0;
  v_out      jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT fm.family_id INTO v_family
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active'
   LIMIT 1;

  IF v_family IS NULL THEN
    RETURN jsonb_build_object(
      'linked', FALSE,
      'balance', 0,
      'debts', '[]'::jsonb
    );
  END IF;

  -- The ONLY balance computation that exists: SUM(ledger.amount).
  SELECT COALESCE(SUM(l.amount), 0) INTO v_balance
    FROM public.ledger l
   WHERE l.family_id = v_family;

  SELECT jsonb_build_object(
    'linked', TRUE,
    'family_id', v_family,
    'balance', v_balance,
    'debts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'order_id', d.order_id,
        'order_number', o.order_number,
        'original_total', d.original_total,
        'covered', d.covered,
        'remaining', d.remaining,
        'status', d.status,
        'created_at', d.created_at
      ) ORDER BY d.created_at ASC)
      FROM public.debts d
      LEFT JOIN public.orders o ON o.id = d.order_id
      WHERE d.family_id = v_family
    ), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- ============================================================================
-- 6) Membership provisioning (admin). Enforces OQ1=B/OQ2=B (one active
--    principal per family; a user is bound to ONE family for life).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_provision_family_member(
  p_user_id  uuid,
  p_family_id uuid,
  p_status   text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
  v_fam text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_family_id IS NULL
     OR COALESCE(p_status, '') NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT fg.status INTO v_fam FROM public.family_groups fg WHERE fg.id = p_family_id;
  IF v_fam IS NULL THEN
    RAISE EXCEPTION 'FAMILY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- OQ1=B: activating this principal demotes another active principal of the
  -- same family (the one-active-principal index is the structural backstop).
  IF p_status = 'active' THEN
    UPDATE public.family_members
       SET status = 'inactive', updated_at = now()
     WHERE family_id = p_family_id
       AND role = 'principal'
       AND user_id <> p_user_id
       AND status = 'active';
  END IF;

  INSERT INTO public.family_members (family_id, user_id, role, status)
  VALUES (p_family_id, p_user_id, 'principal', p_status)
  ON CONFLICT (user_id) DO UPDATE SET
    family_id = EXCLUDED.family_id,
    role      = 'principal',
    status    = CASE WHEN EXCLUDED.status = 'active' THEN 'active'
                     ELSE family_members.status END,
    updated_at = now();

  RETURN jsonb_build_object('family_id', p_family_id, 'user_id', p_user_id, 'status', p_status);
END;
$$;

-- ============================================================================
-- 7) Admin deposit — the ONLY CASH_DEPOSIT path. Posting a deposit also pays
--    down open debts FIFO (oldest first); any remainder stays in the balance.
--    balance_after = audit snapshot; SUM(ledger.amount) stays authoritative.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_deposit(
  p_family_id uuid,
  p_amount    numeric,
  p_note      text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := public.fn_admin_uid();
  v_prev    numeric := 0;
  v_after   numeric;
  v_row     record;
  v_left    numeric;
  BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_family_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.family_groups fg WHERE fg.id = p_family_id) THEN
    RAISE EXCEPTION 'FAMILY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(l.amount), 0) INTO v_prev
    FROM public.ledger l
   WHERE l.family_id = p_family_id;

  v_after := v_prev + p_amount;

  INSERT INTO public.ledger (
    family_id, transaction_type, amount, related_order_id,
    reference, note, balance_after, created_by
  ) VALUES (
    p_family_id, 'CASH_DEPOSIT', p_amount, NULL,
    'deposit', COALESCE(btrim(p_note), ''), v_after, v_uid
  );

  -- FIFO debt pay-down: earliest open debt first, capped by the deposit.
  v_left := p_amount;
  FOR v_row IN
    SELECT d.id, d.remaining, d.original_total
      FROM public.debts d
     WHERE d.family_id = p_family_id AND d.status = 'open'
     ORDER BY d.created_at ASC, d.id ASC
  LOOP
    IF v_left <= 0 THEN
      EXIT;
    END IF;
    IF v_left >= v_row.remaining THEN
      UPDATE public.debts
         SET remaining = 0,
             covered   = original_total,
             status    = 'settled',
             updated_at = now()
       WHERE id = v_row.id;
      v_left := v_left - v_row.remaining;
    ELSE
      UPDATE public.debts
         SET remaining = remaining - v_left,
             covered   = covered + v_left,
             updated_at = now()
       WHERE id = v_row.id;
      v_left := 0;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'family_id', p_family_id,
    'deposited', p_amount,
    'balance_after', v_after
  );
END;
$$;

-- ============================================================================
-- 8) Admin membership lookup (family ledger view for triage).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_list_family_members()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT jsonb_build_object(
      'member_id', fm.id,
      'family_id', fm.family_id,
      'family_name', fg.name,
      'user_id', fm.user_id,
      'user_email', u.email,
      'role', fm.role,
      'status', fm.status,
      'created_at', fm.created_at,
      'balance', COALESCE((
        SELECT SUM(l.amount)
          FROM public.ledger l
         WHERE l.family_id = fm.family_id
      ), 0)
    )
    FROM public.family_members fm
    JOIN public.family_groups fg ON fg.id = fm.family_id
    JOIN public.users u ON u.id = fm.user_id
    ORDER BY fg.name ASC, fm.created_at ASC;
END;
$$;

-- ============================================================================
-- 9) Grants — least privilege (REVOKE ALL first, then GRANT the minimal set).
-- ============================================================================
REVOKE ALL ON FUNCTION public.pilot_my_family() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_family() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_family() TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_my_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_my_account() TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_admin_provision_family_member(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_provision_family_member(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_provision_family_member(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_admin_deposit(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_deposit(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_deposit(uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.pilot_admin_list_family_members() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_family_members() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_family_members() TO authenticated;

-- ============================================================================
-- 10) Post-checks — structural contract; fail loudly on drift.
-- ============================================================================
DO $$
DECLARE
  v_dml int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN
      ('family_members', 'ledger', 'debts')) THEN
    RAISE EXCEPTION '00100: financial tables missing after migration';
  END IF;

  -- No client write grants on the financial tables.
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('family_members', 'ledger', 'debts')
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION '00100: client WRITE grant on financial table detected';
  END IF;

  -- Balance column presence + the SUM-based RPC exists.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ledger' AND column_name = 'amount'
  ) THEN
    RAISE EXCEPTION '00100: ledger.amount missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pilot_my_account'
      AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '00100: pilot_my_account missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pilot_admin_deposit'
      AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '00100: pilot_admin_deposit missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'family_members'
      AND indexname = 'idx_family_members_one_active_principal'
  ) THEN
    RAISE EXCEPTION '00100: one-active-principal index missing';
  END IF;
END;
$$;