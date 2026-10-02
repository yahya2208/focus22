-- ============================================================================
-- 00122  Gate B — guard pilot_admin_list_families + narrow projection
-- ----------------------------------------------------------------------------
-- Problem: pilot_admin_list_families() was SECURITY DEFINER with
-- authenticated EXECUTE, no in-function authorization, and SELECT fg.*
-- (all 14 family_groups columns incl. contact PII) to ANY authenticated
-- caller. Table RLS cannot constrain a definer-rights function.
--
-- Fix (minimal, additive):
--   1. Admin gate INSIDE the function using the canonical live idiom
--      (public.fn_admin_uid() IS NOT NULL). LANGUAGE sql cannot raise, so
--      the gate is a WHERE clause: non-admins receive ZERO rows
--      (deny-by-empty). No data reaches non-admins either way.
--      pilot_admin_require() is deliberately NOT used (dead helper, zero
--      callers — see discovery).
--   2. Projection narrowed to exactly the columns the sole consumer
--      (Command Center useFamilyWorkspace) reads: id, name, name_ar, slug,
--      status. Contact/preference/description/timestamp columns can no
--      longer leave the database through this path.
--   3. Return type changes from SETOF public.family_groups to an explicit
--      5-column TABLE (PostgreSQL cannot return a narrowed projection under
--      the composite return type). Function name + zero args unchanged, so
--      the PostgREST RPC contract and the TS blind-cast consumer are
--      unaffected — verified: no SQL-level callers exist.
--
-- Preserved: LANGUAGE sql, STABLE, SECURITY DEFINER, SET search_path = '',
-- owner (untouched), intended ACL (authenticated + postgres + service_role,
-- no anon/PUBLIC). Grants re-asserted below (defense in depth).
-- Untouched: everything else — family_groups schema/RLS, all other RPCs,
-- pilot_store_order_families, frontend, Auth/RBAC, historical migrations.
-- Rollback: re-applying the 00065 body RE-OPENS the PII path — emergency
-- break-glass only, with explicit security acceptance, time-boxed.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pilot_admin_list_families()
RETURNS TABLE (
  id      uuid,
  name    text,
  name_ar text,
  slug    text,
  status  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT fg.id, fg.name, fg.name_ar, fg.slug, fg.status
    FROM public.family_groups fg
   WHERE public.fn_admin_uid() IS NOT NULL
   ORDER BY fg.name ASC;
$$;

-- Intended effective ACL: authenticated (+ postgres/service_role by
-- ownership); no anon, no PUBLIC.
REVOKE ALL ON FUNCTION public.pilot_admin_list_families() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_list_families() FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_families() TO authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply, read-only)
-- ============================================================================
-- 1. Return shape narrowed:
--      SELECT pg_get_function_result('public.pilot_admin_list_families()'::regprocedure);
--      -- expected: TABLE(id uuid, name text, name_ar text, slug text, status text)
-- 2. Admin gate present:
--      SELECT pg_get_functiondef('public.pilot_admin_list_families()'::regprocedure)
--        LIKE '%fn_admin_uid()%';
--      -- expected: true
-- 3. No full-row read:
--      SELECT pg_get_functiondef('public.pilot_admin_list_families()'::regprocedure)
--        NOT LIKE '%fg.*%';
--      -- expected: true
-- 4. Grants: authenticated only (no anon/PUBLIC EXECUTE).
-- ============================================================================
