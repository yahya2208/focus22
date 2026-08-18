-- ============================================================================
-- FOCUS — CATALOG CENTRAL (05 — VERIFY for catalog_create_model RPC)
--
-- Run as `postgres` in the Supabase SQL Editor AFTER 05-...-apply.sql.
--
-- Design: every test runs inside its own DO ... EXCEPTION block so that
-- EXPECTED errors are captured (42501, 23505 collisions) instead of aborting
-- the batch. ACL (Test 3) is asserted READ-ONLY via has_function_privilege().
-- Each test writes one row to a session temp table with outcome =
-- 'EXPECTED PASS' or 'UNEXPECTED FAILURE'. The final SELECT prints the full
-- result grid. Runs continue through Tests 5a-6.
--
-- IMPORTANT: Tests 1, 5a, 5d assert identity against canonical_id values that
-- require the 06 slugify FIX to be applied first (06-catalog-create-model-id-
-- fix-apply.sql). Re-run 05 only AFTER 06 + guarded cleanup of the two stray
-- 'samsung-alaxy-*' rows (see owner-approved cleanup step).
--
-- DB writes: ONLY the explicit admin-path test block (Tests 5a/5d insert two
-- temp models, 5b/5c exercise collisions, 5e deletes them). Everything else
-- is read-only. No inventory / GATE 4 / Golden Catalog / other RPC changes.
-- ============================================================================

-- 0) Result harness (session-scoped; safe to re-run).
DROP TABLE IF EXISTS _05_test_results;
CREATE TEMP TABLE _05_test_results(seq integer, step text, outcome text, detail text);

-- ============================================================================
-- Test 1 — IDENTITY: SQL helper reproduces TS canonical_id for ALL 866 models.
-- ============================================================================
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n
  FROM public.catalog_models cm
  WHERE public.catalog_model_id(cm.brand_id, cm.name) <> cm.canonical_id;
  INSERT INTO _05_test_results VALUES (1, 'identity_all_866',
    CASE WHEN v_n = 0 THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END,
    'identity_mismatches=' || v_n);
END $$;

-- ============================================================================
-- Test 2 — OVERRIDES: MODEL_ID_OVERRIDES (canonical-adapter.ts:21-28) 1:1.
-- ============================================================================
DO $$
DECLARE
  o13 boolean := (public.catalog_model_id('xiaomi','Redmi Note 13 Pro+') = 'xiaomi-redmi-note-13-pro-plus');
  o14 boolean := (public.catalog_model_id('xiaomi','Redmi Note 14 Pro+') = 'xiaomi-redmi-note-14-pro-plus');
  o15 boolean := (public.catalog_model_id('xiaomi','Redmi Note 15 Pro+') = 'xiaomi-redmi-note-15-pro-plus');
  o16 boolean := (public.catalog_model_id('xiaomi','Redmi Note 16 Pro+') = 'xiaomi-redmi-note-16-pro-plus');
BEGIN
  INSERT INTO _05_test_results VALUES (2, 'overrides_1to1',
    CASE WHEN o13 AND o14 AND o15 AND o16 THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END,
    'o13=' || o13 || ' o14=' || o14 || ' o15=' || o15 || ' o16=' || o16);
END $$;

-- ============================================================================
-- Test 3 — ACL assertion (READ-ONLY): anon has NO EXECUTE; authenticated HAS it.
--          Uses has_function_privilege() directly on the function ACL.
--          EXPECTED: anon_execute = false, authenticated_execute = true.
-- ============================================================================
DO $$
DECLARE
  a_anon boolean;
  a_auth boolean;
  v_fn   text := 'public.catalog_create_model(text,text,text,integer,text[],text[])';
BEGIN
  SELECT has_function_privilege('anon', v_fn, 'EXECUTE') INTO a_anon;
  SELECT has_function_privilege('authenticated', v_fn, 'EXECUTE') INTO a_auth;
  INSERT INTO _05_test_results VALUES (3, 'acl_grants',
    CASE WHEN a_anon = false AND a_auth = true THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END,
    'anon_execute=' || a_anon || ' (expect false) authenticated_execute=' || a_auth || ' (expect true)');
END $$;

-- ============================================================================
-- Test 4 — no-auth / editor context (auth.uid() = NULL) is NOT admin.
--          EXPECTED: 42501 Forbidden: admin role required.
-- ============================================================================
DO $$
BEGIN
  BEGIN
    PERFORM public.catalog_create_model('samsung','NoAuth Test',NULL,NULL,'{}','{}');
    RAISE EXCEPTION 'no error raised (no-auth was allowed to execute)' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN insufficient_privilege THEN
      INSERT INTO _05_test_results VALUES (4, 'no_auth_forbidden', 'EXPECTED PASS', SQLERRM);
    WHEN OTHERS THEN
      INSERT INTO _05_test_results VALUES (4, 'no_auth_forbidden', 'UNEXPECTED FAILURE',
        SQLERRM || ' / ' || SQLSTATE);
  END;
END $$;

-- ============================================================================
-- Test 5a — ADMIN create succeeds. (auth.uid() forced to a real admin via
--           request.jwt.claim.sub; the RPC then passes catalog_is_admin()).
-- ============================================================================
DO $$
DECLARE
  v_admin uuid;
  v_row   public.catalog_models;
BEGIN
  SELECT id INTO v_admin FROM public.users
  WHERE role IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1;
  IF v_admin IS NULL THEN
    INSERT INTO _05_test_results VALUES (5, 'admin_create', 'UNEXPECTED FAILURE',
      'no admin user found in public.users');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  SELECT * INTO v_row
  FROM public.catalog_create_model('samsung','Galaxy Z Test',NULL,NULL,'{}','{}');

  IF v_row.canonical_id = 'samsung-galaxy-z-test' AND v_row.status = 'active' THEN
    INSERT INTO _05_test_results VALUES (5, 'admin_create', 'EXPECTED PASS',
      'canonical_id=' || v_row.canonical_id || ' status=' || v_row.status);
  ELSE
    INSERT INTO _05_test_results VALUES (5, 'admin_create', 'UNEXPECTED FAILURE',
      'canonical_id=' || COALESCE(v_row.canonical_id,'NULL') || ' status=' || COALESCE(v_row.status,'NULL'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _05_test_results VALUES (5, 'admin_create', 'UNEXPECTED FAILURE',
    SQLERRM || ' / ' || SQLSTATE);
END $$;

-- ============================================================================
-- Test 5b — EXACT duplicate (brand_id+name). EXPECTED: 23505 model already exists.
-- ============================================================================
DO $$
BEGIN
  BEGIN
    PERFORM public.catalog_create_model('samsung','Galaxy Z Test',NULL,NULL,'{}','{}');
    RAISE EXCEPTION 'no error raised (duplicate was accepted)' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO _05_test_results VALUES (6, 'duplicate_collision', 'EXPECTED PASS', SQLERRM);
    WHEN OTHERS THEN
      INSERT INTO _05_test_results VALUES (6, 'duplicate_collision', 'UNEXPECTED FAILURE',
        SQLERRM || ' / ' || SQLSTATE);
  END;
END $$;

-- ============================================================================
-- Test 5c — SAME slug, different spacing -> canonical_id collision.
--          EXPECTED: 23505 canonical_id collision.
-- ============================================================================
DO $$
BEGIN
  BEGIN
    PERFORM public.catalog_create_model('samsung','Galaxy  Z  Test',NULL,NULL,'{}','{}');
    RAISE EXCEPTION 'no error raised (canonical collision was accepted)' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO _05_test_results VALUES (7, 'canonical_collision', 'EXPECTED PASS', SQLERRM);
    WHEN OTHERS THEN
      INSERT INTO _05_test_results VALUES (7, 'canonical_collision', 'UNEXPECTED FAILURE',
        SQLERRM || ' / ' || SQLSTATE);
  END;
END $$;

-- ============================================================================
-- Test 5d — ADMIN create WITH metadata (series / release_year / numbers / aliases).
-- ============================================================================
DO $$
DECLARE
  v_admin uuid;
  v_row   public.catalog_models;
BEGIN
  SELECT id INTO v_admin FROM public.users
  WHERE role IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  SELECT * INTO v_row
  FROM public.catalog_create_model(
    p_brand_id=>'samsung', p_name=>'Galaxy Z2 Test', p_series=>'Z',
    p_release_year=>2026, p_model_numbers=>ARRAY['SM-Z998'], p_aliases=>ARRAY['Z2Test']);

  IF v_row.canonical_id = 'samsung-galaxy-z2-test'
     AND v_row.series = 'Z' AND v_row.release_year = 2026 THEN
    INSERT INTO _05_test_results VALUES (8, 'metadata_create', 'EXPECTED PASS',
      'canonical_id=' || v_row.canonical_id || ' series=' || v_row.series || ' year=' || v_row.release_year);
  ELSE
    INSERT INTO _05_test_results VALUES (8, 'metadata_create', 'UNEXPECTED FAILURE',
      'canonical_id=' || COALESCE(v_row.canonical_id,'NULL') || ' series=' || COALESCE(v_row.series,'NULL')
      || ' year=' || COALESCE(v_row.release_year::text,'NULL'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _05_test_results VALUES (8, 'metadata_create', 'UNEXPECTED FAILURE',
    SQLERRM || ' / ' || SQLSTATE);
END $$;

-- ============================================================================
-- Test 5e — CLEANUP: remove the two temp models.
-- ============================================================================
DO $$
DECLARE
  v_n bigint;
BEGIN
  DELETE FROM public.catalog_models
  WHERE canonical_id IN ('samsung-galaxy-z-test','samsung-galaxy-z2-test');
  SELECT count(*) INTO v_n FROM public.catalog_models
  WHERE canonical_id IN ('samsung-galaxy-z-test','samsung-galaxy-z2-test');
  IF v_n = 0 THEN
    INSERT INTO _05_test_results VALUES (9, 'cleanup', 'EXPECTED PASS', 'temp models removed');
  ELSE
    INSERT INTO _05_test_results VALUES (9, 'cleanup', 'UNEXPECTED FAILURE', 'remaining=' || v_n);
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _05_test_results VALUES (9, 'cleanup', 'UNEXPECTED FAILURE',
    SQLERRM || ' / ' || SQLSTATE);
END $$;

-- ============================================================================
-- Test 6 — FINAL BASELINES: catalog back to 866, inventory untouched.
-- ============================================================================
DO $$
DECLARE
  v_models bigint;
  v_inv    bigint;
  v_fp     text;
  v_ok     boolean;
BEGIN
  SELECT count(*) INTO v_models FROM public.catalog_models;
  SELECT count(*), md5(string_agg(
      id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
      ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
      ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id))
  INTO v_inv, v_fp FROM public.inventory_items;

  v_ok := (v_models = 866) AND (v_inv = 17) AND (v_fp = '1c5d9b8a117a93f03335e7296abddec1');
  INSERT INTO _05_test_results VALUES (10, 'final_baselines',
    CASE WHEN v_ok THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END,
    'models=' || v_models || ' (expect 866) inventory=' || v_inv || ' (expect 17)'
    || ' fp=' || v_fp || ' (expect 1c5d9b8a117a93f03335e7296abddec1)');
END $$;

-- ============================================================================
-- FINAL RESULT GRID — one row per test, EXPECTED PASS or UNEXPECTED FAILURE.
-- ============================================================================
SELECT seq AS test, step, outcome, detail
FROM _05_test_results
ORDER BY seq;

-- ============================================================================
-- SUMMARY NOTICE (Messages tab).
-- ============================================================================
DO $$
DECLARE
  v_p integer;
  v_u integer;
BEGIN
  SELECT count(*) INTO v_p FROM _05_test_results WHERE outcome = 'EXPECTED PASS';
  SELECT count(*) INTO v_u FROM _05_test_results WHERE outcome = 'UNEXPECTED FAILURE';
  IF v_u = 0 THEN
    RAISE NOTICE '05 VERIFY FINAL: ALL TESTS EXPECTED PASS (% of 10)', v_p;
  ELSE
    RAISE NOTICE '05 VERIFY FINAL: UNEXPECTED FAILURES (% of 10) — STOP, do not proceed', v_u;
  END IF;
END $$;

-- ============================================================================
-- END OF 05 VERIFY.
-- ============================================================================
