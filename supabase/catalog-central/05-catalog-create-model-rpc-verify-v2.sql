-- ============================================================================
-- FOCUS — CATALOG CENTRAL (05 — VERIFY v2 for catalog_create_model RPC)
--
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   06-catalog-create-model-id-fix-apply.sql  (slugify fix)
--   07-catalog-create-model-id-fix-cleanup.sql (removes the 2 stray rows)
--
-- DESIGN (fixes v1 editor issues):
--   * NO TEMP TABLE, NO session state dependency.
--   * NO trailing DO $$ (v1's summary DO + editor "limit of 100" caused the
--     "unterminated dollar-quoted string" / "relation does not exist" errors).
--   * File ENDS with a single plain SELECT that produces the Result Grid
--     of 10 rows — nothing is read from the Messages tab.
--   * All exception handling (expected 42501 / 23505) lives inside ONE
--     function, public.catalog_gate05_verify(), with guaranteed cleanup even
--     if a test fails.
--
-- READ/WRITE SCOPE:
--   WRITE: only the admin-path tests (5a/5d insert two temp models, 5e deletes
--          them; a defensive cleanup removes ONLY the 4 known test-artifact
--          canonical_ids: samsung-galaxy-z-test, samsung-galaxy-z2-test,
--          samsung-alaxy-est, samsung-alaxy-2-est).
--   READ : identity over catalog_models, overrides, ACL (has_function_privilege),
--          catalog/inventory baselines.
--   TOUCHED OBJECTS: none besides those tests. Does NOT re-apply 06, does NOT
--   modify catalog_create_model/catalog_model_id/RLS/grants/inventory/GATE 4.
--
-- NEW OBJECT introduced (Gate-05-test scoped): public.catalog_gate05_verify().
--   REVOKE ALL FROM PUBLIC, no grants -> only postgres/owner can call it.
--   Optional removal later:  DROP FUNCTION public.catalog_gate05_verify();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_gate05_verify()
RETURNS TABLE(seq integer, step text, outcome text, detail text)
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_admin  uuid;
  v_row    public.catalog_models;
  v_fn     text := 'public.catalog_create_model(text,text,text,integer,text[],text[])';
  a_anon   boolean;
  a_auth   boolean;
  v_n      bigint;
  v_models bigint;
  v_inv    bigint;
  v_fp     text;
  v_mism   bigint;
BEGIN
  -- Test 1 — identity: SQL helper == TS canonical_id for ALL 866 models.
  SELECT count(*) INTO v_mism
  FROM public.catalog_models cm
  WHERE public.catalog_model_id(cm.brand_id, cm.name) <> cm.canonical_id;
  seq := 1; step := 'identity_all_866';
  outcome := CASE WHEN v_mism = 0 THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END;
  detail  := 'identity_mismatches=' || v_mism;
  RETURN NEXT;

  -- Test 2 — overrides (MODEL_ID_OVERRIDES, canonical-adapter.ts:21-28) 1:1.
  seq := 2; step := 'overrides_1to1';
  outcome := CASE WHEN
      public.catalog_model_id('xiaomi','Redmi Note 13 Pro+') = 'xiaomi-redmi-note-13-pro-plus'
      AND public.catalog_model_id('xiaomi','Redmi Note 14 Pro+') = 'xiaomi-redmi-note-14-pro-plus'
      AND public.catalog_model_id('xiaomi','Redmi Note 15 Pro+') = 'xiaomi-redmi-note-15-pro-plus'
      AND public.catalog_model_id('xiaomi','Redmi Note 16 Pro+') = 'xiaomi-redmi-note-16-pro-plus'
    THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END;
  detail := 'o13/o14/o15/o16=true (expect all true)';
  RETURN NEXT;

  -- Test 3 — ACL assertion (READ-ONLY): anon has NO EXECUTE, authenticated HAS.
  SELECT has_function_privilege('anon', v_fn, 'EXECUTE') INTO a_anon;
  SELECT has_function_privilege('authenticated', v_fn, 'EXECUTE') INTO a_auth;
  seq := 3; step := 'acl_grants';
  outcome := CASE WHEN a_anon = false AND a_auth = true THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END;
  detail  := 'anon_execute=' || a_anon || ' (expect false) authenticated_execute=' || a_auth || ' (expect true)';
  RETURN NEXT;

  -- Test 4 — no-auth (auth.uid() NULL, admin claim NOT set yet) -> 42501.
  BEGIN
    PERFORM public.catalog_create_model('samsung','NoAuth Test',NULL,NULL,'{}','{}');
    seq := 4; step := 'no_auth_forbidden'; outcome := 'UNEXPECTED FAILURE';
    detail := 'no error raised (no-auth was allowed)';
    RETURN NEXT;
  EXCEPTION
    WHEN insufficient_privilege THEN
      seq := 4; step := 'no_auth_forbidden'; outcome := 'EXPECTED PASS'; detail := SQLERRM;
      RETURN NEXT;
    WHEN OTHERS THEN
      seq := 4; step := 'no_auth_forbidden'; outcome := 'UNEXPECTED FAILURE';
      detail := SQLERRM || ' / ' || SQLSTATE;
      RETURN NEXT;
  END;

  -- Admin context for tests 5a-5e.
  SELECT id INTO v_admin FROM public.users
  WHERE role IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1;
  IF v_admin IS NULL THEN
    seq := 5; step := 'admin_create'; outcome := 'UNEXPECTED FAILURE';
    detail := 'no admin user found in public.users';
    RETURN NEXT;
  ELSE
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

    BEGIN
      -- 5a — admin create succeeds.
      SELECT * INTO v_row
      FROM public.catalog_create_model('samsung','Galaxy Z Test',NULL,NULL,'{}','{}');
      seq := 5; step := 'admin_create';
      IF v_row.canonical_id = 'samsung-galaxy-z-test' AND v_row.status = 'active' THEN
        outcome := 'EXPECTED PASS'; detail := 'canonical_id=' || v_row.canonical_id || ' status=' || v_row.status;
      ELSE
        outcome := 'UNEXPECTED FAILURE';
        detail := 'canonical_id=' || COALESCE(v_row.canonical_id,'NULL') || ' status=' || COALESCE(v_row.status,'NULL');
      END IF;
      RETURN NEXT;

      -- 5b — exact duplicate (brand_id+name) -> 23505.
      BEGIN
        PERFORM public.catalog_create_model('samsung','Galaxy Z Test',NULL,NULL,'{}','{}');
        seq := 6; step := 'duplicate_collision'; outcome := 'UNEXPECTED FAILURE';
        detail := 'no error raised (duplicate was accepted)';
        RETURN NEXT;
      EXCEPTION
        WHEN unique_violation THEN
          seq := 6; step := 'duplicate_collision'; outcome := 'EXPECTED PASS'; detail := SQLERRM;
          RETURN NEXT;
        WHEN OTHERS THEN
          seq := 6; step := 'duplicate_collision'; outcome := 'UNEXPECTED FAILURE';
          detail := SQLERRM || ' / ' || SQLSTATE;
          RETURN NEXT;
      END;

      -- 5c — same slug, different spacing -> canonical_id collision 23505.
      BEGIN
        PERFORM public.catalog_create_model('samsung','Galaxy  Z  Test',NULL,NULL,'{}','{}');
        seq := 7; step := 'canonical_collision'; outcome := 'UNEXPECTED FAILURE';
        detail := 'no error raised (canonical collision was accepted)';
        RETURN NEXT;
      EXCEPTION
        WHEN unique_violation THEN
          seq := 7; step := 'canonical_collision'; outcome := 'EXPECTED PASS'; detail := SQLERRM;
          RETURN NEXT;
        WHEN OTHERS THEN
          seq := 7; step := 'canonical_collision'; outcome := 'UNEXPECTED FAILURE';
          detail := SQLERRM || ' / ' || SQLSTATE;
          RETURN NEXT;
      END;

      -- 5d — admin create WITH metadata.
      SELECT * INTO v_row
      FROM public.catalog_create_model(
        p_brand_id=>'samsung', p_name=>'Galaxy Z2 Test', p_series=>'Z',
        p_release_year=>2026, p_model_numbers=>ARRAY['SM-Z998'], p_aliases=>ARRAY['Z2Test']);
      seq := 8; step := 'metadata_create';
      IF v_row.canonical_id = 'samsung-galaxy-z2-test'
         AND v_row.series = 'Z' AND v_row.release_year = 2026 THEN
        outcome := 'EXPECTED PASS';
        detail := 'canonical_id=' || v_row.canonical_id || ' series=' || v_row.series || ' year=' || v_row.release_year;
      ELSE
        outcome := 'UNEXPECTED FAILURE';
        detail := 'canonical_id=' || COALESCE(v_row.canonical_id,'NULL')
          || ' series=' || COALESCE(v_row.series,'NULL')
          || ' year=' || COALESCE(v_row.release_year::text,'NULL');
      END IF;
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      -- Guaranteed cleanup if 5a-5d failed midway. Deletes ONLY the known
      -- test-artifact canonical_ids (clean + stray); never any other row.
      DELETE FROM public.catalog_models
      WHERE canonical_id IN ('samsung-galaxy-z-test','samsung-galaxy-z2-test',
                             'samsung-alaxy-est','samsung-alaxy-2-est');
      seq := 99; step := 'admin_block'; outcome := 'UNEXPECTED FAILURE';
      detail := 'unexpected error in 5a-5d: ' || SQLERRM || ' / ' || SQLSTATE;
      RETURN NEXT;
    END;

    -- 5e — cleanup of the two temp models created above.
    DELETE FROM public.catalog_models
    WHERE canonical_id IN ('samsung-galaxy-z-test','samsung-galaxy-z2-test');
    SELECT count(*) INTO v_n FROM public.catalog_models
    WHERE canonical_id IN ('samsung-galaxy-z-test','samsung-galaxy-z2-test');
    seq := 9; step := 'cleanup';
    outcome := CASE WHEN v_n = 0 THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END;
    detail  := 'temp models removed (remaining=' || v_n || ')';
    RETURN NEXT;
  END IF;

  -- Test 6 — final baselines: catalog 866, inventory 17 + fingerprint unchanged.
  SELECT count(*) INTO v_models FROM public.catalog_models;
  SELECT count(*), md5(string_agg(
      id::text||'|'||coalesce(source_key,'')||'|'||coalesce(model_id,'')
      ||'|'||coalesce(quantity,0)::text||'|'||coalesce(status,'')
      ||'|'||coalesce(is_published,false)::text, ',' ORDER BY id))
  INTO v_inv, v_fp FROM public.inventory_items;

  seq := 10; step := 'final_baselines';
  outcome := CASE WHEN v_models = 866 AND v_inv = 17
                        AND v_fp = '1c5d9b8a117a93f03335e7296abddec1'
              THEN 'EXPECTED PASS' ELSE 'UNEXPECTED FAILURE' END;
  detail := 'models=' || v_models || ' (expect 866) inventory=' || v_inv
    || ' (expect 17) fp=' || v_fp || ' (expect 1c5d9b8a117a93f03335e7296abddec1)';
  RETURN NEXT;

  RETURN;
END;
$fn$;

REVOKE ALL ON FUNCTION public.catalog_gate05_verify() FROM PUBLIC;

-- ============================================================================
-- FINAL RESULT GRID (the ONLY statement the editor needs to show).
-- EXPECT: 10 rows, all outcome = 'EXPECTED PASS'.
-- ============================================================================
SELECT * FROM public.catalog_gate05_verify();

-- ============================================================================
-- END OF 05 VERIFY v2.
-- ============================================================================
