-- ============================================================================
-- FOCUS — ANONYMOUS CAMPAIGN QR MEASUREMENT — LIVE ACL REMEDIATION
-- (privileges-only — owner-approved execution 2026-08-09, ACL Remediation
-- directive §4)
--
-- Fixes the LIVE ACL of public.get_campaign_qr_metrics(uuid):
--   anon currently has EXECUTE (C2 FAIL); the intended final state is
--   anon = no EXECUTE, authenticated = EXECUTE.
--
-- ROOT CAUSE (live evidence):
--   Supabase default privileges grant EXECUTE on new functions to anon. The
--   apply script only did REVOKE FROM PUBLIC + GRANT TO authenticated; the
--   explicit anon grant survives REVOKE FROM PUBLIC, so anon kept EXECUTE.
--
-- SAFETY — privileges ONLY:
--   * NO DROP (no CASCADE, no function recreation);
--   * NO table / RLS / body changes;
--   * scan/funnel RPC grants are untouched (their state is correct).
--
-- HOW TO RUN: paste the WHOLE script into the Supabase SQL editor and run it
-- ONCE on the LIVE database, then run 03-campaign-qr-metrics-verify-readonly.sql
-- (all sections must read PASS, especially C2).
-- ============================================================================

-- ---------------------------------------------------------------- metrics RPC
REVOKE EXECUTE
  ON FUNCTION public.get_campaign_qr_metrics(UUID)
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.get_campaign_qr_metrics(UUID)
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.get_campaign_qr_metrics(UUID)
  TO authenticated;

-- ============================================================================
-- Expected after this file:
--   get_campaign_qr_metrics(uuid): anon EXECUTE = false, authenticated = true
-- record_campaign_qr_scan(text,text): anon = true, authenticated = true (untouched)
-- record_campaign_funnel(uuid,text,text): anon = true, authenticated = true (untouched)
--
-- Verify with (read-only):
--   SELECT 'anon' AS role_name,
--     has_function_privilege('anon','public.record_campaign_qr_scan(text,text)','EXECUTE')  AS scan_exec,
--     has_function_privilege('anon','public.record_campaign_funnel(uuid,text,text)','EXECUTE') AS funnel_exec,
--     has_function_privilege('anon','public.get_campaign_qr_metrics(uuid)','EXECUTE') AS metrics_exec
--   UNION ALL
--   SELECT 'authenticated',
--     has_function_privilege('authenticated','public.record_campaign_qr_scan(text,text)','EXECUTE'),
--     has_function_privilege('authenticated','public.record_campaign_funnel(uuid,text,text)','EXECUTE'),
--     has_function_privilege('authenticated','public.get_campaign_qr_metrics(uuid)','EXECUTE');
-- ============================================================================
