-- ============================================================================
-- FOCUS — M2 · WHATSAPP_HANDOFF_STARTED KIND — POST-APPLY VERIFICATION
-- (read-only + transaction-wrapped behavior probes)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 10-whatsapp-handoff-kind-apply.sql. Verifies:
--   A) the RPC kind allowlist now contains whatsapp_handoff_started and the
--      matrix requires cta_type = inquiry ONLY;
--   B) EXECUTE grants are intact;
--   C) behavior probes (transaction-wrapped — NOTHING persists):
--        C1 · whatsapp_handoff_started + inquiry ACCEPTED via anon RPC
--        C2 · whatsapp_handoff_started + cta_type 'buy' REJECTED
--        C3 · a bogus kind ('nonsense') is STILL REJECTED
--        C4 · view + non-NULL cta_type is STILL REJECTED (regression)
--        C5 · anon direct INSERT is STILL blocked (writes stay RPC-only);
--   D) frozen tables unchanged vs the 10-pre-apply-evidence baseline.
--
-- SAFETY: sections A, B, D are SELECT/catalog-only. Section C runs inside a
-- single BEGIN;ROLLBACK transaction with SET LOCAL ROLE — the probe rows are
-- rolled back, NOTHING is written to production.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · new kind present + inquiry-only matrix + original kinds intact
-- ============================================================================
SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%whatsapp_handoff_started%' AS handoff_kind_present;

SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%kind whatsapp_handoff_started requires cta_type inquiry%' AS handoff_inquiry_only;

SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%kind click requires cta_type ad_click%' AS click_matrix_intact,
       pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%kind whatsapp_intent requires cta_type buy|exchange|installment|inquiry%' AS intent_matrix_intact,
       pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%kind view requires cta_type NULL%' AS view_matrix_intact;

-- ============================================================================
-- SECTION B · EXECUTE grants intact
-- ============================================================================
SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE');

-- ============================================================================
-- SECTION C · behavior probes (transaction-wrapped — ROLLED BACK, no writes)
-- ============================================================================
BEGIN;

-- C1) whatsapp_handoff_started + inquiry ACCEPTED via anon RPC.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM public.record_campaign_intent(
    'whatsapp_handoff_started', '11111111111111111111111111111111', 'inquiry', NULL, 'home',
    'rec_abcdef12');
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.campaign_intents
    WHERE visitor_hash = '11111111111111111111111111111111'
      AND kind = 'whatsapp_handoff_started'
      AND cta_type = 'inquiry'
      AND ad_placement = 'home'
      AND device_id = 'rec_abcdef12';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 whatsapp_handoff_started row, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: whatsapp_handoff_started + inquiry accepted via anon RPC';
END $$;

-- C2) whatsapp_handoff_started + cta_type 'buy' REJECTED (inquiry ONLY).
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.record_campaign_intent(
      'whatsapp_handoff_started', '22222222222222222222222222222222', 'buy', NULL, 'home',
      'rec_abcdef12');
    RAISE EXCEPTION 'FAIL: whatsapp_handoff_started with cta_type buy accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: whatsapp_handoff_started with cta_type buy rejected';
  END;
  RESET ROLE;
END $$;

-- C3) a bogus kind ('nonsense') is STILL REJECTED.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.record_campaign_intent(
      'nonsense', '33333333333333333333333333333333', NULL, NULL, 'home', NULL);
    RAISE EXCEPTION 'FAIL: nonsense kind accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: nonsense kind still rejected';
  END;
  RESET ROLE;
END $$;

-- C4) view + non-NULL cta_type is STILL REJECTED (regression).
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.record_campaign_intent(
      'view', '44444444444444444444444444444444', 'inquiry', NULL, 'home', NULL);
    RAISE EXCEPTION 'FAIL: view with non-null cta_type accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: view with non-null cta_type rejected';
  END;
  RESET ROLE;
END $$;

-- C5) anon direct INSERT still blocked — writes remain RPC-only.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.campaign_intents (kind, cta_type, ad_placement, device_id, visitor_hash)
    VALUES ('whatsapp_handoff_started', 'inquiry', 'home', 'rec_abcdef12', '55555555555555555555555555555555');
    RAISE EXCEPTION 'FAIL: anon direct INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon direct INSERT blocked (42501)';
  WHEN others THEN
    RAISE EXCEPTION 'FAIL: anon direct INSERT failed with unexpected error: %', SQLERRM;
  END;
  RESET ROLE;
END $$;

ROLLBACK;

-- ============================================================================
-- SECTION D · frozen tables unchanged — compare to the 10-pre-apply baseline
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
-- Expected summary: A = all true (handoff_kind_present, handoff_inquiry_only,
-- and the three original matrix flags intact); B = EXECUTE true for both;
-- C = PASS x5 (rolled back); D = identical to the 10-pre-apply baseline.
-- ============================================================================
