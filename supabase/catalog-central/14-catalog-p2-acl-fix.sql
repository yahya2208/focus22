-- ============================================================================
-- FOCUS — CATALOG CENTRAL (14 — P2 ACL FIX for admin RPCs)
--
-- Type: Privileges only. No function body changes.
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   12-catalog-admin-rpcs.sql
--
-- SCOPE:
--   Fix the LIVE ACL of:
--     catalog_admin_approve_model(text, boolean)
--     catalog_admin_update_variant(text, text)
--   anon currently has EXECUTE (confirmed by P2 Discovery live probe 42501).
--   Intended final state:
--     anon = no EXECUTE, authenticated = EXECUTE, public = no EXECUTE,
--     service_role = EXECUTE (untouched), postgres/owner = EXECUTE (untouched).
--
-- ROOT CAUSE:
--   Same as file 09. Supabase platform default privileges inject
--   anon=X, authenticated=X, service_role=X on new public-schema functions
--   at creation time. Files 12 applied REVOKE ALL FROM PUBLIC + GRANT TO
--   authenticated, but did not explicitly REVOKE anon.
--
-- SAFETY:
--   * Privileges only — no function body changes, no table changes.
--   * Mirrors the exact pattern from file 09.
--   * service_role and owner ACL entries remain intact.
--   * INVENTORY NOT TOUCHED.
-- ============================================================================

-- ── catalog_admin_approve_model ──────────────────────────────────────────────

REVOKE ALL
  ON FUNCTION public.catalog_admin_approve_model(text, boolean)
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_admin_approve_model(text, boolean)
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_admin_approve_model(text, boolean)
  TO authenticated;


-- ── catalog_admin_update_variant ─────────────────────────────────────────────

REVOKE ALL
  ON FUNCTION public.catalog_admin_update_variant(text, text)
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_admin_update_variant(text, text)
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_admin_update_variant(text, text)
  TO authenticated;


-- ============================================================================
-- VERIFY — read-only. Expected:
--   anon=false, authenticated=true, public=false, service_role=true, postgres=true
-- ============================================================================

-- approve_model
SELECT 'anon'::text AS role_name,
       has_function_privilege('anon', 'public.catalog_admin_approve_model(text,boolean)', 'EXECUTE') AS execute_priv
UNION ALL SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.catalog_admin_approve_model(text,boolean)', 'EXECUTE')
UNION ALL SELECT 'public',
       has_function_privilege('public', 'public.catalog_admin_approve_model(text,boolean)', 'EXECUTE')
UNION ALL SELECT 'service_role',
       has_function_privilege('service_role', 'public.catalog_admin_approve_model(text,boolean)', 'EXECUTE')
UNION ALL SELECT 'postgres',
       has_function_privilege('postgres', 'public.catalog_admin_approve_model(text,boolean)', 'EXECUTE')
ORDER BY role_name;

-- update_variant
SELECT 'anon'::text AS role_name,
       has_function_privilege('anon', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE') AS execute_priv
UNION ALL SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE')
UNION ALL SELECT 'public',
       has_function_privilege('public', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE')
UNION ALL SELECT 'service_role',
       has_function_privilege('service_role', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE')
UNION ALL SELECT 'postgres',
       has_function_privilege('postgres', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE')
ORDER BY role_name;


-- ============================================================================
-- HARD STOP verification: raise if anon still has EXECUTE
-- ============================================================================

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.catalog_admin_approve_model(text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P2 ACL FAIL: anon still has EXECUTE on catalog_admin_approve_model';
  END IF;
  IF has_function_privilege('anon', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P2 ACL FAIL: anon still has EXECUTE on catalog_admin_update_variant';
  END IF;
END $$;


-- ============================================================================
-- DONE — 14 P2 ACL FIX.
--   Next: run 15 to apply transition guard + concurrency to approve_model.
--   Rollback: GRANT EXECUTE ... TO anon (emergency only).
-- ============================================================================
