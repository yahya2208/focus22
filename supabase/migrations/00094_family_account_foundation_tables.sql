-- ============================================================================
-- 00094 FAMILY ACCOUNT FOUNDATION TABLES (Plan-B structural subset).
--
-- SCOPE: structural foundation ONLY — family_members + ledger + debts with
-- constraints, indexes, RLS, grants/revokes and structural guards. NO RPCs:
-- pilot_my_family / pilot_my_account / deposit / provisioning RPCs arrive
-- with 00100 (applied whole, later in order); 00103's SUM-check targets that
-- file and is unaffected by this subset.
--
-- PARITY: sections below are verbatim excerpts of
-- 00100_family_ledger_foundation.sql (tables/constraints/indexes/RLS/grants).
-- Order: before 00100. NOT applied to any DB by this file alone.
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
-- Post-checks — foundation structural contract; fail loudly on drift.
-- (Subset of 00100 checks: RPC-existence checks live in 00100 itself.)
-- ============================================================================
DO $$
DECLARE
  v_dml int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN
      ('family_members', 'ledger', 'debts')) THEN
    RAISE EXCEPTION '00094: financial tables missing after migration';
  END IF;

  -- No client write grants on the financial tables.
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('family_members', 'ledger', 'debts')
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION '00094: client WRITE grant on financial table detected';
  END IF;

  -- Balance column presence.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ledger' AND column_name = 'amount'
  ) THEN
    RAISE EXCEPTION '00094: ledger.amount missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'family_members'
      AND indexname = 'idx_family_members_one_active_principal'
  ) THEN
    RAISE EXCEPTION '00094: one-active-principal index missing';
  END IF;
END;
$$;
