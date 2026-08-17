-- ============================================================================
-- FOCUS — CATALOG CENTRAL (21-VERIFY — LIST MODELS SECURITY FIX VERIFICATION)
--
-- Purpose: Verify 21-catalog-p3-list-models-security-fix.sql applied correctly.
-- Execute AFTER: 21-catalog-p3-list-models-security-fix.sql
-- Safe at:       production (read-only checks, no mutations)
--
-- EXPECTED: 8 checks, all 'PASS'. If any 'FAIL', STOP — investigate.
-- ============================================================================


-- ============================================================================
-- 1) STRUCTURE — catalog_admin_list_models exists with 8 params
-- ============================================================================

SELECT
  '1.1' AS check_id,
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


-- ============================================================================
-- 2) SECURITY — prosecdef = true (SECURITY DEFINER)
-- ============================================================================

SELECT
  '2.1' AS check_id,
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


-- ============================================================================
-- 3) VOLATILITY — STABLE (read-only function)
-- ============================================================================

SELECT
  '3.1' AS check_id,
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


-- ============================================================================
-- 4) ACL — anon has no EXECUTE
-- ============================================================================

SELECT
  '4.1' AS check_id,
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


-- ============================================================================
-- 5) ACL — PUBLIC has no EXECUTE
-- ============================================================================

SELECT
  '5.1' AS check_id,
  'PUBLIC has no EXECUTE on catalog_admin_list_models' AS description,
  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs = 8
        AND acl.grantee = 'PUBLIC'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 6) ACL — authenticated has EXECUTE
-- ============================================================================

SELECT
  '6.1' AS check_id,
  'authenticated has EXECUTE on catalog_admin_list_models' AS description,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_proc_acl acl ON acl.oid = p.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'catalog_admin_list_models'
        AND p.pronargs = 8
        AND acl.grantee = 'authenticated'
        AND acl.privilege_type = 'EXECUTE'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- 7) OVERLOADS — no old overloads exist
-- ============================================================================

SELECT
  '7.1' AS check_id,
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
-- 8) DATA INTEGRITY — no data was modified by the fix
-- ============================================================================

SELECT
  '8.1' AS check_id,
  'catalog_models count unchanged (2178)' AS description,
  CASE
    WHEN (SELECT count(*) FROM public.catalog_models) = 2178 THEN 'PASS'
    ELSE 'FAIL'
  END AS result;

SELECT
  '8.2' AS check_id,
  'catalog_variants count unchanged (1816)' AS description,
  CASE
    WHEN (SELECT count(*) FROM public.catalog_variants) = 1816 THEN 'PASS'
    ELSE 'FAIL'
  END AS result;


-- ============================================================================
-- DONE — 21-VERIFY COMPLETE.
--
-- EXPECTED: 8 PASS, 0 FAIL.
-- ============================================================================
