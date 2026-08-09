-- ============================================================================
-- CR-00006 · LV-3 — campaigns read RLS hardening — APPLY
-- ----------------------------------------------------------------------------
-- Type: Security hardening (RLS policy removal only).
-- Classification: baseline-guarded / fail-closed / single-application change.
--
-- NOT idempotent by design: after a successful apply the documented baseline
-- no longer holds, so re-running this script ABORTS safely instead of
-- succeeding silently.
--
-- Guards (fail-closed, BEFORE any mutation). Abort on ANY mismatch:
--   * policy "Authenticated read campaigns" EXISTS on public.campaigns
--   * policy "Admins manage campaigns"      EXISTS on public.campaigns
--   * RLS is ENABLED on public.campaigns
--
-- The ONLY mutation performed:
--   DROP POLICY "Authenticated read campaigns" ON public.campaigns;
--
-- Untouched: "Admins manage campaigns" (policy) · all RPCs · table schema ·
-- data · every other table. No silent fallback anywhere.
--
-- Reference: docs/security/operations/CR-00006-lv3-campaigns-read-rls.md
--            docs/security/production-security-audit.md (LV-3)
--            docs/security/remediation-roadmap.md (Phase 1 item 3 / LV-3)
-- ============================================================================

BEGIN;

-- ============================================================================
-- Guard block — verifies the exact documented baseline; ABORT on any mismatch.
-- ============================================================================
DO $$
DECLARE
  v_read  TEXT;
  v_admin TEXT;
  v_rls   BOOLEAN;
BEGIN
  SELECT policyname INTO v_read
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Authenticated read campaigns';

  SELECT policyname INTO v_admin
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Admins manage campaigns';

  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid = 'public.campaigns'::regclass;

  IF v_read IS NULL THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — "Authenticated read campaigns" is missing on public.campaigns; state differs from CR-00006 baseline. No change applied.';
  END IF;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — "Admins manage campaigns" is missing on public.campaigns; state differs from CR-00006 baseline. No change applied.';
  END IF;

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — RLS is not enabled on public.campaigns; state differs from CR-00006 baseline. No change applied.';
  END IF;
END $$;

-- ============================================================================
-- The single approved mutation (LV-3 closure): remove the broad authenticated
-- read. After this, the only policy on campaigns is "Admins manage campaigns"
-- (ALL, TO authenticated, USING is_admin()).
-- ============================================================================
DROP POLICY "Authenticated read campaigns" ON public.campaigns;

COMMIT;

-- ============================================================================
-- Post-apply confirmation (read-only). Expected: exactly ONE policy remains.
--   campaigns | Admins manage campaigns | ALL | {authenticated} | is_admin()
-- ============================================================================
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;
