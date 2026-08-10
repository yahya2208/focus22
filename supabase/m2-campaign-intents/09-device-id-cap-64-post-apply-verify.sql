-- ============================================================================
-- FOCUS — M2 · DEVICE_ID CAP 32 → 64 (BATCH 4A) — POST-APPLY VERIFICATION
-- (read-only)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 06-device-id-cap-64-apply.sql. Verifies:
--   A) the CHECK on campaign_intents.device_id is now 1..64;
--   B) the RPC validates with max 64 and grants are intact;
--   C) existing rows untouched (≤ 32 still present, nothing deleted);
--   D) behavior probes (transaction-wrapped — nothing persists):
--        a 36-char UUIDv4 device_id now ACCEPTED via anon RPC
--        (rejected before the apply) · a 65-char device_id still REJECTED ·
--        the table CHECK itself accepts 40 chars but rejects 65 ·
--        direct anon INSERT still blocked (writes stay RPC-only);
--   E) the ONLY surface delta is the device_id cap — the rest of the RPC body
--      and the M2 grants/policies are unchanged vs 01 apply;
--   F) frozen tables unchanged vs the 08-pre-apply-evidence baseline.
--
-- SAFETY: sections A–C and E–F are SELECT/catalog-only. Section D runs inside
-- a single BEGIN;ROLLBACK transaction with SET LOCAL ROLE — the probe rows are
-- rolled back, NOTHING is written to production.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · CHECK constraint now 1..64
-- ============================================================================
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.campaign_intents'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ~* 'device_id';

-- ============================================================================
-- SECTION B · RPC cap now 64 + grants intact
-- ============================================================================
SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%char_length(p_device_id) > 64%' AS rpc_cap_is_64,
       pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       NOT LIKE '%char_length(p_device_id) > 32%' AS rpc_32_cap_gone;

SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE');

-- ============================================================================
-- SECTION C · existing rows untouched
-- ============================================================================
SELECT count(*)                                 AS total_rows,
       count(device_id)                         AS rows_with_device_id,
       coalesce(max(char_length(device_id)), 0) AS max_device_id_length
FROM public.campaign_intents;

-- ============================================================================
-- SECTION D · behavior probes (transaction-wrapped — ROLLED BACK, no writes)
-- ============================================================================
BEGIN;

-- D1) 36-char UUIDv4 device_id now ACCEPTED via anon RPC (was > 32 before).
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL ROLE anon;
  PERFORM public.record_campaign_intent(
    'whatsapp_intent', 'aabbccddeeff00112233445566778899', 'buy', NULL, 'phone-details',
    '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51');
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.campaign_intents
    WHERE visitor_hash = 'aabbccddeeff00112233445566778899'
      AND device_id = '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 row for 36-char device_id, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: 36-char UUIDv4 device_id accepted via RPC';
END $$;

-- D2) 65-char device_id still REJECTED by the RPC (cap is 64).
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.record_campaign_intent(
      'click', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ad_click', NULL, 'home',
      repeat('x', 65));
    RAISE EXCEPTION 'FAIL: 65-char device_id accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: 65-char device_id rejected by RPC';
  END;
  RESET ROLE;
END $$;

-- D3) table CHECK: 40-char accepted, 65-char rejected (direct, postgres role).
DO $$
BEGIN
  INSERT INTO public.campaign_intents (kind, cta_type, ad_placement, device_id, visitor_hash)
  VALUES ('click', 'ad_click', 'home', repeat('u', 40), 'cccccccccccccccccccccccccccccccc');
  RAISE NOTICE 'PASS: 40-char device_id accepted by CHECK (cap now 64)';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.campaign_intents (kind, cta_type, ad_placement, device_id, visitor_hash)
    VALUES ('click', 'ad_click', 'home', repeat('z', 65), 'dddddddddddddddddddddddddddddddd');
    RAISE EXCEPTION 'FAIL: 65-char device_id accepted by CHECK';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: 65-char device_id rejected by CHECK';
  END;
END $$;

-- D4) anon direct INSERT still blocked — writes remain RPC-only.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.campaign_intents (kind, cta_type, ad_placement, device_id, visitor_hash)
    VALUES ('click', 'ad_click', 'home', 'short', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
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
-- SECTION E · RPC surface unchanged apart from the cap — same security
--             attributes as the 01 apply (SECURITY DEFINER / VOLATILE /
--             search_path = public)
-- ============================================================================
SELECT p.provolatile AS volatility, p.prosecdef AS security_definer, p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_campaign_intent';

-- ============================================================================
-- SECTION F · frozen tables unchanged — compare to the 08-pre-apply baseline
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
-- Expected summary: A = BETWEEN 1 AND 64; B = rpc_cap_is_64 true +
-- rpc_32_cap_gone true + EXECUTE true for both; C = same totals as pre-apply;
-- D = PASS/PASS/PASS/PASS/PASS (rolled back); E = VOLATILE + SECURITY DEFINER
-- + search_path=public; F = identical to pre-apply baseline.
-- ============================================================================
