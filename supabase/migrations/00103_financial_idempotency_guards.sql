-- ============================================================================
-- 00103  GATE A — Financial idempotency guards + migration-invariant backstop
-- ----------------------------------------------------------------------------
-- Type: Hardening (index + invariants only). No behavior change.
--
-- The structural guarantees of the FINAL GATE A IMPLEMENTATION CONTRACT are
-- re-asserted here as DB-level invariants so that later migrations cannot
-- silently regress them:
--
--   1. ONE primary settlement per order: at most ONE ledger PURCHASE row per
--      related_order_id. This makes a double `pilot_family_settle_and_deliver`
--      structurally impossible (in addition to the ORDER_ALREADY_SETTLED RPC
--      check in 00102).
--   2. rlS/grants on the financial tables stay closed (no client writes).
--   3. p_intentional stays an intent marker inside delivery_create_order —
--      it must never precede the server-authoritative gates.
--   4. No `SUM(ledger) + debt` reconciliation equation exists in the codebase
--      (the balance is SUM(ledger.amount) only; debts are tracking records).
--
-- Rollback: DROP INDEX public.ledger_one_primary_settlement_per_order;
-- ============================================================================

-- ============================================================================
-- 1) Financial idempotency backstop — one primary settlement per order.
--    REFUNDs/REVERSALs are secondary rows and share the order safely.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS ledger_one_primary_settlement_per_order
  ON public.ledger (related_order_id)
  WHERE transaction_type = 'PURCHASE';

-- Nav: the typical settlement scan already uses idx_ledger_family_time; the
-- per-order lookup used by pilot_family_settle_and_deliver benefits from this
-- partial index too (PURCHASE rows are few — no extra full index needed).

-- ============================================================================
-- 2) Migration-invariant guards (structural, fail loudly on drift).
-- ============================================================================
DO $$
DECLARE
  v_def     text;
  v_dml     int;
  v_idx     text;
BEGIN
  -- One-primary-settlement index exists.
  SELECT indexdef INTO v_idx
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'ledger'
     AND indexname = 'ledger_one_primary_settlement_per_order';
  IF v_idx IS NULL OR v_idx NOT LIKE '%PURCHASE%' THEN
    RAISE EXCEPTION '00103: ledger settlement idempotency index missing';
  END IF;

  -- No client write grants on the financial tables (00100 invariant re-assert).
  SELECT count(*) INTO v_dml
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('family_members', 'ledger', 'debts')
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_dml <> 0 THEN
    RAISE EXCEPTION '00103: client WRITE grant on financial table detected';
  END IF;

  -- p_intentional must remain a non-privileged intent marker: it must appear
  -- in delivery_create_order only AFTER the unconditional server gates
  -- (FAMILY_ACCOUNT_REQUIRED resolves before any intent-driven branch).
  SELECT pg_get_functiondef('public.delivery_create_order(jsonb, jsonb, boolean)'::regprocedure)
    INTO v_def;
  IF v_def IS NOT NULL
     AND (position('FAMILY_ACCOUNT_REQUIRED' in v_def) < 1
          OR position('FAMILY_ACCOUNT_REQUIRED' in v_def) > position('COALESCE(p_intentional' in v_def)) THEN
    RAISE EXCEPTION '00103: p_intentional drifted ahead of server gates';
  END IF;

  -- Debt must remain a tracking record: no function may compute a balance as
  -- SUM(ledger) + debt. Scan the settlement + deposit + account RPCs.
  SELECT pg_get_functiondef('public.pilot_family_settle_and_deliver(uuid, jsonb, text)'::regprocedure)
    INTO v_def;
  IF v_def LIKE '%SUM(l.amount)% + %debt%'
     OR v_def LIKE '% + SUM(d.remaining)%'
     OR v_def LIKE '%COALESCE(SUM(l.amount), 0) + COALESCE(d.remaining' THEN
    RAISE EXCEPTION '00103: forbidden led debt reconciliation expression detected';
  END IF;

  SELECT pg_get_functiondef('public.pilot_my_account()'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%SUM(l.amount)%' THEN
    RAISE EXCEPTION '00103: pilot_my_account no longer sums the ledger (balance truth drift)';
  END IF;
END;
$$;