-- ============================================================================
-- CR-00006 · LV-3 — campaigns read RLS hardening — ROLLBACK
-- ----------------------------------------------------------------------------
-- Restores exactly the policy removed by the apply script:
--   CREATE POLICY "Authenticated read campaigns" ON public.campaigns
--     FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
--
-- Guard (fail-closed): fails if the policy already exists on public.campaigns
-- (nothing to roll back; prevents a duplicate/conflicting policy).
-- Single-application, fail-closed. No silent fallback.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_read TEXT;
BEGIN
  SELECT policyname INTO v_read
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Authenticated read campaigns';

  IF v_read IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: "Authenticated read campaigns" already exists on public.campaigns; nothing to roll back.';
  END IF;
END $$;

CREATE POLICY "Authenticated read campaigns" ON public.campaigns
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

COMMIT;

-- ============================================================================
-- Post-rollback confirmation (read-only). Expected: BOTH policies present.
--   Authenticated read campaigns | SELECT | {authenticated} | auth.role()
--   Admins manage campaigns      | ALL    | {authenticated} | is_admin()
-- ============================================================================
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;
