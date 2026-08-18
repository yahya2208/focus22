-- ============================================================================
-- FOCUS — STANDALONE DEPLOYMENT: catalog_create_model AUDIT FIX
--
-- Purpose: Redeploy catalog_create_model with audit history INSERT.
-- The only change vs. the live function is 3 lines:
--   INSERT INTO public.catalog_model_history (model_id, action, after, actor_user_id)
--   VALUES (v_row.id, 'CREATE', to_jsonb(v_row), auth.uid());
--
-- Method: CREATE OR REPLACE FUNCTION (same signature, same body + 3 lines).
-- This is safe: CREATE OR REPLACE on an existing function replaces the body
-- without changing ownership, grants, or REVOKE rules.
--
-- Prerequisites:
--   - catalog_models table exists (schema 01)
--   - catalog_model_history table exists (schema 11)
--   - catalog_model_id(text, text) function exists (schema 05)
--   - catalog_is_admin() function exists (schema 01)
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
--   4. Verify with the test queries at the bottom
--
-- Rollback: Not needed — the previous function can be restored by re-running
--   05-catalog-create-model-rpc-apply.sql from git (minus the audit INSERT).
--   But since CREATE OR REPLACE is safe, no rollback is expected.
-- ============================================================================

-- ===========================================================================
-- STEP 1: Replace the function body with the audit-fix version
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.catalog_create_model(
  p_brand_id      text,
  p_name          text,
  p_series        text DEFAULT NULL,
  p_release_year  integer DEFAULT NULL,
  p_model_numbers text[] DEFAULT '{}',
  p_aliases       text[] DEFAULT '{}'
)
RETURNS public.catalog_models
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical text;
  v_row       public.catalog_models;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  IF p_brand_id IS NULL OR btrim(p_brand_id) = '' THEN
    RAISE EXCEPTION 'brand_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_release_year IS NOT NULL AND p_release_year <= 0 THEN
    RAISE EXCEPTION 'release_year must be a positive integer'
      USING ERRCODE = '22023';
  END IF;

  p_brand_id := btrim(p_brand_id);
  p_name     := btrim(p_name);
  v_canonical := public.catalog_model_id(p_brand_id, p_name);

  IF EXISTS (SELECT 1 FROM public.catalog_models
             WHERE brand_id = p_brand_id AND name = p_name) THEN
    RAISE EXCEPTION 'model already exists: brand=% name=% (unique brand_id+name)',
      p_brand_id, p_name
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_models WHERE canonical_id = v_canonical) THEN
    RAISE EXCEPTION 'canonical_id collision: % (deterministic identity already in use)',
      v_canonical
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.catalog_models
    (canonical_id, brand_id, name, series, release_year, model_numbers, aliases, status)
  VALUES
    (v_canonical, p_brand_id, p_name, p_series, p_release_year,
     COALESCE(p_model_numbers, '{}'), COALESCE(p_aliases, '{}'), 'active')
  RETURNING * INTO v_row;

  -- ── AUDIT FIX: record CREATE in history ──────────────────────────────────
  INSERT INTO public.catalog_model_history (model_id, action, after, actor_user_id)
  VALUES (v_row.id, 'CREATE', to_jsonb(v_row), auth.uid());
  -- ── END AUDIT FIX ────────────────────────────────────────────────────────

  RETURN v_row;
END;
$$;

-- ===========================================================================
-- STEP 2: Preserve existing grants (CREATE OR REPLACE does NOT change grants,
--         but we re-assert for safety documentation)
-- ===========================================================================
REVOKE ALL ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[]) TO authenticated;

-- ===========================================================================
-- POST-DEPLOYMENT VERIFICATION QUERIES (run these after deployment)
-- ===========================================================================

-- V1: Confirm function exists and has SECURITY DEFINER
SELECT
  p.proname AS function_name,
  pg_catalog.pg_get_function_arguments(p.oid) AS arguments,
  pg_catalog.pg_get_function_result(p.oid) AS return_type,
  CASE WHEN p.prosecdef THEN 'YES' ELSE 'NO' END AS security_definer,
  CASE WHEN p.provolatile = 'v' THEN 'VOLATILE'
       WHEN p.provolatile = 's' THEN 'STABLE'
       WHEN p.provolatile = 'i' THEN 'IMMUTABLE'
  END AS volatility
FROM pg_proc p
WHERE p.proname = 'catalog_create_model'
  AND p.pronamespace = 'public'::regnamespace;
-- Expected: 1 row, security_definer = YES, volatility = VOLATILE

-- V2: Confirm audit INSERT is in the function body
SELECT
  p.proname,
  CASE WHEN p.prosrc LIKE '%catalog_model_history%'
    THEN 'AUDIT FIX PRESENT'
    ELSE 'AUDIT FIX MISSING — DO NOT PROCEED'
  END AS audit_check,
  CASE WHEN p.prosrc LIKE '%v_row.id, ''CREATE'', to_jsonb(v_row), auth.uid()%'
    THEN 'EXACT MATCH'
    ELSE 'PATTERN MISMATCH — INSPECT MANUALLY'
  END AS pattern_check
FROM pg_proc p
WHERE p.proname = 'catalog_create_model'
  AND p.pronamespace = 'public'::regnamespace;
-- Expected: audit_check = 'AUDIT FIX PRESENT', pattern_check = 'EXACT MATCH'

-- V3: Confirm no other functions were changed
-- (should return same count as before deployment)
SELECT proname, prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE 'catalog_%'
ORDER BY proname;
-- Expected: same list as before deployment (no new/removed functions)

-- V4: Confirm grants unchanged
SELECT
  function_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name = 'catalog_create_model'
ORDER BY grantee, privilege_type;
-- Expected: 1 row — EXECUTE for 'authenticated'

-- V5: Confirm REVOKE on anon/public
SELECT
  function_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name = 'catalog_create_model'
  AND grantee IN ('anon', 'public');
-- Expected: 0 rows (no grants to anon or public)

-- ============================================================================
-- END OF DEPLOYMENT SQL
-- ============================================================================
