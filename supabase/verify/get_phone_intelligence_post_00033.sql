-- ============================================================================
-- EXECUTABLE REGRESSION GATE — get_phone_intelligence after migration 00033.
-- Run the whole file in Supabase SQL Editor as ONE batch. Read-only.
--
-- PART A proves the INSTALLED function body is actually the fixed one
-- (pg_proc introspection — catches "migration did not stick" failures).
-- PART B executes the authorized staff path via session-local JWT claim
-- simulation and asserts the five production requirements.
--
-- Expected output: CHECK 1,2,3,3b,4,5 PASS notices + final ALL CHECKS PASSED.
-- ============================================================================

-- ── PART A: installed-source verification ───────────────────────────────────
DO $$
DECLARE
  v_src text;
  v_casts int;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'get_phone_intelligence';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'FUNCTION NOT INSTALLED';
  END IF;

  v_casts := (length(v_src) - length(replace(v_src, '.device_id::text', '')))
             / length('.device_id::text');

  IF v_casts = 11 AND position('ii.id::text' in v_src) > 0 THEN
    RAISE NOTICE 'PART A PASS — installed body has all 11 text↔text device joins';
  ELSE
    RAISE EXCEPTION 'PART A FAIL — installed body has % text-joins (need 11). Migration 00033 did not stick.', v_casts;
  END IF;
END $$;

-- ── PART B: execute the authorized path ─────────────────────────────────────
DO $$
DECLARE
  v_staff uuid := 'PASTE_STAFF_UUID_HERE'; -- from: SELECT id FROM public.users WHERE role IN ('admin','super_admin','researcher') LIMIT 1;
  v_res   jsonb;
  v_fail  int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);

  v_res := public.get_phone_intelligence('all', NULL);

  IF v_res ? 'error' THEN
    RAISE NOTICE 'CHECK 1 FAIL — error key: %', v_res->>'error';
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE 'CHECK 1 PASS — no 42883 / no error key';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_res->'search_analytics') AS a(x)
    WHERE a.x->>'query' IN ('oppo','samsung')
      AND (a.x->>'selection_count')::int >= 1
  ) AND (
    SELECT count(*) FROM jsonb_array_elements(v_res->'search_analytics') AS a(x)
    WHERE a.x->>'query' IN ('oppo','samsung')
  ) = 2 THEN
    RAISE NOTICE 'CHECK 2 PASS — search_analytics has oppo+samsung with selections';
  ELSE
    RAISE NOTICE 'CHECK 2 FAIL — oppo/samsung missing or selection_count < 1';
    v_fail := v_fail + 1;
  END IF;

  -- CHECK 3 — contract-exact (00031 Section 5): search_to_phone aggregates
  -- EXCLUSIVELY from phone_search_selections. Expected devices are therefore
  -- derived from the ACTUAL table (read here as owner for ground truth), never
  -- from the search-result/inventory set. Samsung is demanded only if a real
  -- Samsung selection row exists.
  IF jsonb_typeof(v_res->'search_to_phone') <> 'array' THEN
    RAISE NOTICE 'CHECK 3 FAIL — search_to_phone is not an array';
    v_fail := v_fail + 1;
  ELSIF EXISTS (
    SELECT 1 FROM (
      SELECT device_id, count(*)::int AS cnt
      FROM public.phone_search_selections
      WHERE device_id IS NOT NULL AND device_id <> ''
      GROUP BY device_id
    ) e
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_res->'search_to_phone') AS t(x)
      WHERE t.x->>'device_id' = e.device_id
        AND (t.x->>'selection_count')::int = e.cnt
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_res->'search_to_phone') AS t(x)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.phone_search_selections s
      WHERE s.device_id = t.x->>'device_id'
    )
  ) THEN
    RAISE NOTICE 'CHECK 3 FAIL — search_to_phone does not mirror actual phone_search_selections exactly';
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE 'CHECK 3 PASS — search_to_phone mirrors actual selected devices with exact counts';
  END IF;

  -- Known live-fixture pin: the debugged real pick (Oppo A5s). Required only
  -- while its selection row actually exists.
  IF EXISTS (
    SELECT 1 FROM public.phone_search_selections
    WHERE device_id = '9ae7b89b-4464-4731-942a-7cc3192cce0e'
  ) AND COALESCE((
    SELECT (t.x->>'selection_count')::int
    FROM jsonb_array_elements(v_res->'search_to_phone') AS t(x)
    WHERE t.x->>'device_id' = '9ae7b89b-4464-4731-942a-7cc3192cce0e'
  ), 0) < 1 THEN
    RAISE NOTICE 'CHECK 3b FAIL — documented Oppo A5s pick missing from search_to_phone';
    v_fail := v_fail + 1;
  ELSE
    RAISE NOTICE 'CHECK 3b PASS — known Oppo A5s fixture pick present (or no longer in selections)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'search_without_selection') AS w(x)
                 WHERE w.x->>'query' IN ('oppo','samsung')) THEN
    RAISE NOTICE 'CHECK 4 PASS — search_without_selection clean';
  ELSE
    RAISE NOTICE 'CHECK 4 FAIL — oppo/samsung wrongly listed without selection';
    v_fail := v_fail + 1;
  END IF;

  IF jsonb_typeof(v_res->'demand_overview') = 'array' THEN
    RAISE NOTICE 'CHECK 5 PASS — demand_overview present (array)';
  ELSE
    RAISE NOTICE 'CHECK 5 FAIL — demand_overview missing or not an array';
    v_fail := v_fail + 1;
  END IF;

  RAISE NOTICE '==== RESULT: % ====', CASE WHEN v_fail = 0
    THEN 'ALL CHECKS PASSED — safe to commit'
    ELSE v_fail || ' CHECK(S) FAILED' END;
END $$;
