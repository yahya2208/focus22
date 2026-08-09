-- ============================================================================
-- CR-00007 · campaigns anon direct-grant — APPLY
-- ----------------------------------------------------------------------------
-- Type: Least-privilege hardening (single table ACL change). NOT an emergency
-- exposure remediation — RLS already blocks anon (direct table grant + RLS ⇒
-- effective access). This CR only removes the unnecessary legacy/default anon
-- ACL on public.campaigns.
--
-- Classification: baseline-guarded / fail-closed / single-application change.
-- NOT idempotent by design: after a successful apply the documented baseline
-- no longer holds, so re-running this script ABORTS safely.
--
-- Guards (fail-closed, BEFORE any mutation). Abort on ANY mismatch:
--   1. RLS is ENABLED on public.campaigns
--   2. policy "Admins manage campaigns" EXISTS on public.campaigns
--   3. NO broad authenticated SELECT policy exists on public.campaigns
--   4. anon currently HAS table privileges on public.campaigns (baseline match;
--      abort if already revoked — nothing to do)
--   5. authenticated still HAS SELECT on public.campaigns (admin CRUD intact)
--   6. lookup_campaign_by_short_code EXISTS
--   7. RPC still SECURITY DEFINER
--   8. RPC still STABLE
--   9. RPC still search_path=public
--
-- The ONLY mutation performed:
--   REVOKE ALL ON public.campaigns FROM anon;
--
-- Untouched: authenticated grants · service_role grants · RLS policies ·
-- all RPCs · table schema · data · every other table. No silent fallback.
--
-- Reference: docs/security/operations/CR-00007-campaigns-anon-grant.md
-- ============================================================================

BEGIN;

-- ============================================================================
-- Guard block — verifies the exact documented baseline; ABORT on any mismatch.
-- ============================================================================
DO $$
DECLARE
  v_admin TEXT;
  v_broad BOOLEAN;
  v_rls   BOOLEAN;
  v_anon_sel BOOLEAN;
  v_auth_sel BOOLEAN;
  v_rpc_ok BOOLEAN;
BEGIN
  SELECT policyname INTO v_admin
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Admins manage campaigns';

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'campaigns'
      AND cmd = 'SELECT' AND 'authenticated' = ANY(roles)
  ) INTO v_broad;

  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid = 'public.campaigns'::regclass;

  SELECT has_table_privilege('anon', 'campaigns', 'SELECT') INTO v_anon_sel;
  SELECT has_table_privilege('authenticated', 'campaigns', 'SELECT') INTO v_auth_sel;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'lookup_campaign_by_short_code'
      AND p.prosecdef
      AND p.provolatile = 's'
      AND p.proconfig @> ARRAY['search_path=public']::text[]
  ) INTO v_rpc_ok;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — policy "Admins manage campaigns" is missing on public.campaigns. No change applied.';
  END IF;

  IF v_broad THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — a broad authenticated SELECT policy exists on public.campaigns; state differs from CR-00007 baseline. No change applied.';
  END IF;

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — RLS is not enabled on public.campaigns. No change applied.';
  END IF;

  IF v_anon_sel IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — anon has NO direct privileges on public.campaigns (already revoked / state differs). Nothing to apply.';
  END IF;

  IF v_auth_sel IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — authenticated lost SELECT on public.campaigns; admin CRUD would be broken. No change applied.';
  END IF;

  IF v_rpc_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — lookup_campaign_by_short_code is missing or its SECURITY DEFINER / STABLE / search_path=public posture differs. No change applied.';
  END IF;
END $$;

-- ============================================================================
-- The single approved mutation (CR-00007): remove the unnecessary anon ACL.
-- ============================================================================
REVOKE ALL ON public.campaigns FROM anon;

COMMIT;

-- ============================================================================
-- Post-apply confirmation (read-only). Expected: anon → all FALSE.
-- ============================================================================
SELECT 'anon' AS role_name,
       has_table_privilege('anon', 'campaigns', 'SELECT')  AS can_select,
       has_table_privilege('anon', 'campaigns', 'INSERT')  AS can_insert,
       has_table_privilege('anon', 'campaigns', 'UPDATE')  AS can_update,
       has_table_privilege('anon', 'campaigns', 'DELETE')  AS can_delete;
