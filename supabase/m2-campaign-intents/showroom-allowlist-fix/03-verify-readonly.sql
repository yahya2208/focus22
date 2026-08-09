-- ============================================================================
-- FOCUS — M2 · SHOWROOM ALLOWLIST FIX — VERIFY (03)  —  READ-ONLY
--
-- Verifies that 'showroom' is accepted server-side by inspecting METADATA ONLY:
--   * pg_get_functiondef(record_campaign_intent) contains 'showroom' in the
--     ad_placement allowlist
--   * the ad_placement CHECK constraint on campaign_intents contains 'showroom'
--   * the original placements are still present (nothing was lost)
--   * the function is still executable by anon and authenticated
--
-- STRICTLY READ-ONLY:
--   * NO INSERT / UPDATE / DELETE
--   * NO RPC invocation (no record_campaign_intent call)
--   * NO BEGIN / ROLLBACK transaction block
--   * catalogs (pg_catalog) only — no writes anywhere.
--
-- USAGE: run this file BEFORE and AFTER applying 04-live-fix.sql on LIVE.
--   BEFORE the fix: the 'showroom' assertions FAIL (expected).
--   AFTER  the fix: all assertions PASS.
-- A practical (write-side) acceptance test of the RPC itself lives in the
--   NON-LIVE file 05-acceptance-non-live.sql — never run that on production.
-- ============================================================================

DO $verify$
DECLARE
  v_function_def  TEXT;
  v_constraint_def TEXT;
  v_func_oid      OID;
BEGIN
  -- ---- 1) required objects exist ----------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'campaign_intents' AND c.relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'VERIFY FAIL — public.campaign_intents does not exist';
  END IF;

  SELECT p.oid INTO v_func_oid
  FROM pg_proc p
  WHERE p.oid = 'public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure;
  IF v_func_oid IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAIL — public.record_campaign_intent does not exist';
  END IF;

  -- ---- 2) function definition contains 'showroom' ------------------------
  SELECT pg_get_functiondef(v_func_oid) INTO v_function_def;
  IF position('showroom' in v_function_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL — showroom is NOT present in record_campaign_intent definition';
  END IF;

  -- ---- 3) ad_placement CHECK constraint contains 'showroom' --------------
  SELECT pg_get_constraintdef(c.oid) INTO v_constraint_def
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'public.campaign_intents'::regclass
    AND c.contype = 'c'
    AND a.attname = 'ad_placement';

  IF v_constraint_def IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAIL — ad_placement CHECK constraint not found';
  END IF;
  IF position('showroom' in v_constraint_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL — showroom is NOT present in the ad_placement CHECK constraint';
  END IF;

  -- ---- 4) original placements retained (no regression) -------------------
  IF position('phone-details' in v_constraint_def) = 0
     OR position('exchange' in v_constraint_def) = 0
     OR position('repair' in v_constraint_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL — the ad_placement CHECK constraint lost original placements';
  END IF;

  -- ---- 5) call path intact (metadata only) -------------------------------
  IF NOT has_function_privilege('anon', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAIL — anon can no longer execute record_campaign_intent';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAIL — authenticated can no longer execute record_campaign_intent';
  END IF;

  RAISE NOTICE 'VERIFY PASS — showroom is accepted in the RPC allowlist and the ad_placement CHECK constraint; original placements and grants intact.';
END
$verify$;

-- ----------------------------------------------------------------------------
-- Human-readable summary (read-only).
-- ----------------------------------------------------------------------------
SELECT
  c.conname                              AS constraint_name,
  pg_get_constraintdef(c.oid)            AS constraint_def,
  (position('showroom' in pg_get_constraintdef(c.oid)) > 0) AS showroom_accepted
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.conrelid = 'public.campaign_intents'::regclass
  AND c.contype = 'c'
  AND a.attname = 'ad_placement';

SELECT
  p.proname                                       AS function_name,
  (position('showroom' in pg_get_functiondef(p.oid)) > 0) AS showroom_in_allowlist,
  has_function_privilege('anon', p.oid, 'EXECUTE')           AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')  AS authenticated_can_execute
FROM pg_proc p
WHERE p.oid = 'public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure;
