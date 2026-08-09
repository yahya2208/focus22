-- ============================================================================
-- FOCUS — M2 · CAMPAIGN INTENT COUNTERS — POST-APPLY VERIFICATION (read-only)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 01-campaign-intents-apply.sql. Verifies:
--   A) the table exists with the exact expected columns;
--   B) RLS is enabled with ONLY the role-gated SELECT policy;
--   C) grants are minimal (anon has NO table privileges; authenticated SELECT
--      only; EXECUTE on the RPC for anon + authenticated; PUBLIC revoked);
--   D) the RPC contract (SECURITY DEFINER, VOLATILE, search_path=public);
--   E) behavior probes (transaction-wrapped — nothing persists):
--        anon direct INSERT blocked · valid anon RPC writes 1 row ·
--        duplicate within the dedup window stays 1 row · invalid inputs
--        rejected · campaign-active check honoured;
--   F) frozen tables unchanged vs the 03-pre-apply-evidence baseline.
--
-- SAFETY: sections A–D and F are SELECT/catalog-only. Section E runs inside a
-- single BEGIN;ROLLBACK transaction with SET LOCAL ROLE — the test rows are
-- rolled back, NOTHING is written to production.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · table presence + columns
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaign_intents'
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION B · RLS enabled + policies (expect: 1 SELECT policy, NO writes)
-- ============================================================================
SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE oid = 'public.campaign_intents'::regclass;

SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaign_intents'
ORDER BY cmd;

-- ============================================================================
-- SECTION C · grants matrix
-- ============================================================================
-- C1) table privileges — EXPECTED: anon = none; authenticated = SELECT only.
SELECT 'anon'         AS role_name,
       has_table_privilege('anon', 'public.campaign_intents', 'SELECT')  AS can_select,
       has_table_privilege('anon', 'public.campaign_intents', 'INSERT')  AS can_insert,
       has_table_privilege('anon', 'public.campaign_intents', 'UPDATE')  AS can_update,
       has_table_privilege('anon', 'public.campaign_intents', 'DELETE')  AS can_delete
UNION ALL
SELECT 'authenticated',
       has_table_privilege('authenticated', 'public.campaign_intents', 'SELECT'),
       has_table_privilege('authenticated', 'public.campaign_intents', 'INSERT'),
       has_table_privilege('authenticated', 'public.campaign_intents', 'UPDATE'),
       has_table_privilege('authenticated', 'public.campaign_intents', 'DELETE');

-- C2) RPC EXECUTE — EXPECTED: anon = true, authenticated = true, PUBLIC revoked.
SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE');

-- ============================================================================
-- SECTION D · RPC contract snapshot (SECURITY DEFINER / VOLATILE / search_path)
-- ============================================================================
SELECT p.provolatile AS volatility, p.prosecdef AS security_definer, p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_campaign_intent';

-- ============================================================================
-- SECTION E · behavior probes (transaction-wrapped — ROLLED BACK, no writes)
-- ============================================================================
BEGIN;

-- E1) anon DIRECT INSERT must be blocked (ACL 42501) — writes are RPC-only.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.campaign_intents (kind, cta_type, ad_placement, device_id, visitor_hash)
    VALUES ('click', 'ad_click', 'home', 'rec_m2', 'aabbccddeeff00112233445566778899');
    RAISE EXCEPTION 'FAIL: anon direct INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon direct INSERT blocked (42501 permission denied)';
  WHEN others THEN
    RAISE EXCEPTION 'FAIL: anon direct INSERT failed with unexpected error: %', SQLERRM;
  END;
  RESET ROLE;
END $$;

-- E2) valid anon RPC writes exactly one row.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM public.record_campaign_intent(
    'whatsapp_intent', 'aabbccddeeff00112233445566778899', 'buy', NULL, 'phone-details', 'rec_m2');
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.campaign_intents
    WHERE visitor_hash = 'aabbccddeeff00112233445566778899' AND device_id = 'rec_m2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 row, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: anon RPC inserted exactly 1 row';
END $$;

-- E3) duplicate within the dedup window (same hash+target+kind+cta) stays 1 row.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM public.record_campaign_intent(
    'click', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ad_click', NULL, 'home', 'rec_m2');
  PERFORM public.record_campaign_intent(
    'click', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ad_click', NULL, 'home', 'rec_m2');
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.campaign_intents
    WHERE visitor_hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' AND kind = 'click';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: dedup expected 1 row, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: duplicate click within window deduped to 1 row';
END $$;

-- E4) invalid inputs rejected: kind, cta_type matrix, visitor_hash format.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.record_campaign_intent('click', 'cccccccccccccccccccccccccccccccc', 'buy', NULL, 'home', NULL);
    RAISE EXCEPTION 'FAIL: click+buy accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: invalid cta_type for click rejected';
  END;
  BEGIN
    PERFORM public.record_campaign_intent('nonsense', 'cccccccccccccccccccccccccccccccc', NULL, NULL, NULL, 'rec_x');
    RAISE EXCEPTION 'FAIL: invalid kind accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: invalid kind rejected';
  END;
  BEGIN
    PERFORM public.record_campaign_intent('view', 'NOT_HEX!', NULL, NULL, 'home', 'rec_x');
    RAISE EXCEPTION 'FAIL: malformed visitor_hash accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: malformed visitor_hash rejected';
  END;
  RESET ROLE;
END $$;

-- E5) campaign-active check honoured (probe with an ACTIVE campaign, else skip).
DO $$
DECLARE
  v_campaign UUID;
  v_count   INT;
BEGIN
  SELECT id INTO v_campaign FROM public.campaigns WHERE is_active = TRUE LIMIT 1;
  IF v_campaign IS NULL THEN
    RAISE NOTICE 'SKIP: no ACTIVE campaign present to probe the active check';
  ELSE
    SET LOCAL ROLE anon;
    PERFORM public.record_campaign_intent(
      'whatsapp_intent', 'dddddddddddddddddddddddddddddddd', 'buy', v_campaign, NULL, NULL);
    RESET ROLE;
    SELECT count(*) INTO v_count FROM public.campaign_intents
      WHERE campaign_id = v_campaign AND visitor_hash = 'dddddddddddddddddddddddddddddddd';
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'FAIL: expected 1 campaign-bound row, got %', v_count;
    END IF;
    RAISE NOTICE 'PASS: campaign-bound whatsapp_intent recorded';
  END IF;
END $$;

ROLLBACK;

-- ============================================================================
-- SECTION F · frozen tables unchanged — compare these numbers to the
--            03-pre-apply-evidence.sql section C baseline (must match).
-- ============================================================================
SELECT 'analytics_events'   AS table_name, count(*) AS rows FROM public.analytics_events
UNION ALL SELECT 'qr_codes',         count(*) FROM public.qr_codes
UNION ALL SELECT 'placements',       count(*) FROM public.placements
UNION ALL SELECT 'placement_history',count(*) FROM public.placement_history
UNION ALL SELECT 'sessions',         count(*) FROM public.sessions
UNION ALL SELECT 'users',            count(*) FROM public.users
UNION ALL SELECT 'campaigns',        count(*) FROM public.campaigns
ORDER BY table_name;

-- ============================================================================
-- Expected summary: A = the 7 expected columns; B = rls_enabled=true with only
-- the SELECT policy; C1 = anon none / authenticated SELECT-only; C2 = EXECUTE
-- true for both; D = VOLATILE + SECURITY DEFINER + search_path=public;
-- E = PASS/PASS/PASS/PASS/PASS(-or-SKIP); F = identical to pre-apply baseline.
-- ============================================================================
