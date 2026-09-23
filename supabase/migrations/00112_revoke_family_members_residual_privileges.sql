-- ============================================================================
-- 00112  REVOKE residual authenticated privileges on financial tables.
-- ----------------------------------------------------------------------------
-- Corrective, additive, idempotent. No tables/columns/policies/RPCs touched.
--
-- ROOT CAUSE: Supabase platform default privileges grant ALL (SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) to anon + authenticated on
-- newly created tables. 00094:58 / 00100:87 revoked only
--   REVOKE INSERT, UPDATE, DELETE ON public.family_members FROM authenticated
-- (preserving the intended SELECT), and anon received REVOKE ALL — so
-- authenticated retained TRUNCATE (+ REFERENCES, TRIGGER) on family_members.
-- ledger / debts received REVOKE ALL FROM authenticated (clean), but are
-- re-asserted here so the three financial tables share one explicit contract.
-- The 00094 / 00100 / 00103 guards check INSERT/UPDATE/DELETE only, which is
-- why the residual survived every gate.
--
-- TARGET STATE (authenticated, direct table privileges):
--   family_members → SELECT only
--   ledger         → none
--   debts          → none
-- Untouched: postgres, service_role, anon (already REVOKE ALL), RLS,
-- policies, RPCs, all other tables/grants. No data changes.
-- Order: after 00111 (lexical). No dependency created: pure REVOKE + guard.
-- Rollback: re-GRANT is never correct; rollback = no-op (privileges stay
-- revoked). To restore pre-state by hand, see GRANT lines in 00094/00100.
-- ============================================================================

-- 1) family_members — strip every non-SELECT privilege from authenticated.
--    REVOKE is idempotent: revoking a privilege the role lacks is a no-op
--    (with a NOTICE, never an ERROR), so re-apply is safe.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.family_members FROM authenticated;

-- 2) ledger / debts — explicit no-direct-access (already REVOKE ALL upstream;
--    re-asserted so this file is the single readable contract).
REVOKE ALL ON public.ledger FROM authenticated;
REVOKE ALL ON public.debts  FROM authenticated;

-- 3) Re-assert the intended SELECT (idempotent; repairs drift, never widens).
GRANT SELECT ON public.family_members TO authenticated;

-- ============================================================================
-- 4) Post-checks (project guard style — fail loudly on drift).
-- ============================================================================
DO $$
DECLARE
  v_bad integer;
BEGIN
  -- No residual write/adjacent privilege for authenticated on any of the three.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('family_members', 'ledger', 'debts')
     AND grantee = 'authenticated'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00112: residual authenticated privilege on financial table detected (%)', v_bad;
  END IF;

  -- family_members keeps exactly SELECT for authenticated.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'family_members'
     AND grantee = 'authenticated'
     AND privilege_type <> 'SELECT';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00112: family_members has non-SELECT authenticated grant (%)', v_bad;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'family_members'
       AND grantee = 'authenticated'
       AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION '00112: family_members SELECT for authenticated missing';
  END IF;

  -- ledger / debts expose zero direct privileges to authenticated.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('ledger', 'debts')
     AND grantee = 'authenticated';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00112: ledger/debts has authenticated table grant (%)', v_bad;
  END IF;
END;
$$;
