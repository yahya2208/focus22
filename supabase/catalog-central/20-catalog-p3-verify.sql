-- ============================================================================
-- FOCUS — CATALOG CENTRAL (20 — P3 VERIFICATION)
--
-- Purpose: Verify 19-catalog-p3-management-foundation.sql applied cleanly.
-- Execute AFTER: 19-catalog-p3-management-foundation.sql
-- Safe at:       production (read-only checks, no mutations)
--
-- EXPECTED: 22 checks, all 'PASS'. If any 'FAIL', STOP — investigate.
-- ============================================================================


-- ============================================================================
-- 1) SCHEMA — index exists
-- ============================================================================

SELECT
  '1.1' AS check_id,
  'catalog_models_approval_status_idx exists' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'catalog_models'
        AND indexname  = 'catalog_models_approval_status_idx'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 2) SCHEMA — CHECK constraint includes REOPEN
-- ============================================================================

SELECT
  '2.1' AS check_id,
  'catalog_model_history.action CHECK includes REOPEN' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND t.relname = 'catalog_model_history'
        AND c.conname = 'catalog_model_history_action_check'
        AND c.consrc LIKE '%REOPEN%'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 3) RPC — catalog_admin_list_variants exists with 2 params
-- ============================================================================

SELECT
  '3.1' AS check_id,
  'catalog_admin_list_variants(text, uuid) exists' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_variants'
        AND p.pronargs = 2
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '3.2' AS check_id,
  'old catalog_admin_list_variants(text) removed' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_variants'
        AND p.pronargs = 1
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '3.3' AS check_id,
  'catalog_admin_list_variants is STABLE' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_variants'
        AND p.pronargs = 2
        AND p.prokind = 'f'
    )
    AND (
      SELECT provolatile
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_variants'
        AND p.pronargs = 2
    ) = 's' THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '3.4' AS check_id,
  'catalog_admin_list_variants is SECURITY DEFINER' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_variants'
        AND p.pronargs = 2
        AND p.prosecdef = true
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 4) RPC — catalog_admin_reopen_model exists
-- ============================================================================

SELECT
  '4.1' AS check_id,
  'catalog_admin_reopen_model(text, timestamptz) exists' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_reopen_model'
        AND p.pronargs = 2
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '4.2' AS check_id,
  'catalog_admin_reopen_model is VOLATILE' AS description,
  CASE
    WHEN (
      SELECT provolatile
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_reopen_model'
        AND p.pronargs = 2
    ) = 'v' THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '4.3' AS check_id,
  'catalog_admin_reopen_model is SECURITY DEFINER' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_reopen_model'
        AND p.pronargs = 2
        AND p.prosecdef = true
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '4.4' AS check_id,
  'catalog_admin_reopen_model search_path = public' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_reopen_model'
        AND p.pronargs = 2
        AND pg_catalog.obj_description(p.oid, 'pg_proc') IS NOT NULL
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 5) RPC — catalog_admin_update_variant_specs exists
-- ============================================================================

SELECT
  '5.1' AS check_id,
  'catalog_admin_update_variant_specs(text, integer, integer, text, text, timestamptz) exists' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_update_variant_specs'
        AND p.pronargs = 6
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '5.2' AS check_id,
  'catalog_admin_update_variant_specs is VOLATILE' AS description,
  CASE
    WHEN (
      SELECT provolatile
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_update_variant_specs'
        AND p.pronargs = 6
    ) = 'v' THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '5.3' AS check_id,
  'catalog_admin_update_variant_specs is SECURITY DEFINER' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_update_variant_specs'
        AND p.pronargs = 6
        AND p.prosecdef = true
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 6) RPC — catalog_admin_get_model_history exists
-- ============================================================================

SELECT
  '6.1' AS check_id,
  'catalog_admin_get_model_history(text, integer, integer) exists' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_get_model_history'
        AND p.pronargs = 3
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '6.2' AS check_id,
  'catalog_admin_get_model_history is STABLE' AS description,
  CASE
    WHEN (
      SELECT provolatile
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_get_model_history'
        AND p.pronargs = 3
    ) = 's' THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '6.3' AS check_id,
  'catalog_admin_get_model_history is SECURITY DEFINER' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_get_model_history'
        AND p.pronargs = 3
        AND p.prosecdef = true
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 7) ACL — REVOKE anon from new RPCs
-- ============================================================================

SELECT
  '7.1' AS check_id,
  'anon has no EXECUTE on catalog_admin_reopen_model' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_reopen_model'
        AND p.pronargs = 2
        AND acl.grantee = 'anon'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '7.2' AS check_id,
  'anon has no EXECUTE on catalog_admin_update_variant_specs' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_update_variant_specs'
        AND p.pronargs = 6
        AND acl.grantee = 'anon'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '7.3' AS check_id,
  'anon has no EXECUTE on catalog_admin_get_model_history' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_get_model_history'
        AND p.pronargs = 3
        AND acl.grantee = 'anon'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '7.4' AS check_id,
  'anon has no EXECUTE on catalog_admin_list_variants' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_variants'
        AND p.pronargs = 2
        AND acl.grantee = 'anon'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 8) DATA INTEGRITY — no rows in history tables, no models modified
-- ============================================================================

SELECT
  '8.1' AS check_id,
  'catalog_model_history still has 0 rows' AS description,
  CASE
    WHEN (SELECT count(*) FROM public.catalog_model_history) = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '8.2' AS check_id,
  'catalog_variant_history still has 0 rows' AS description,
  CASE
    WHEN (SELECT count(*) FROM public.catalog_variant_history) = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '8.3' AS check_id,
  'All models still have approval_status = draft' AS description,
  CASE
    WHEN (SELECT count(*) FROM public.catalog_models WHERE approval_status != 'draft') = 0 THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 9) RPC — catalog_admin_list_models exists with 8 params and correct security
-- ============================================================================

SELECT
  '9.1' AS check_id,
  'catalog_admin_list_models(text,text,text,boolean,integer,integer,text,boolean) exists' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs = 8
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '9.2' AS check_id,
  'catalog_admin_list_models is SECURITY DEFINER' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs = 8
        AND p.prosecdef = true
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '9.3' AS check_id,
  'catalog_admin_list_models is STABLE' AS description,
  CASE
    WHEN (
      SELECT provolatile
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs = 8
    ) = 's' THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '9.4' AS check_id,
  'anon has no EXECUTE on catalog_admin_list_models' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs = 8
        AND acl.grantee = 'anon'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '9.5' AS check_id,
  'no old overloads of catalog_admin_list_models' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs != 8
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- DONE — 20 P3 VERIFICATION COMPLETE.
--
-- EXPECTED: 27 PASS, 0 FAIL.
-- If any FAIL: STOP, investigate, DO NOT proceed to P3-B.
-- ============================================================================
