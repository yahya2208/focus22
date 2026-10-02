-- ============================================================================
-- 00119  PILOT ADMIN LIST NEIGHBORHOODS — SECURITY DEFINER admin guard.
-- ----------------------------------------------------------------------------
-- STOP-1. Single-object replacement: exactly ONE function redefined, no new
-- objects, no policy/table/grant changes, no backfill, no trigger.
--
-- Defect
--   00065 defined pilot_admin_list_neighborhoods() as LANGUAGE sql
--   SECURITY DEFINER with no admin check, and granted EXECUTE to
--   `authenticated`. SECURITY DEFINER runs as the owner and no table in this
--   schema uses FORCE ROW LEVEL SECURITY, so the function bypassed RLS
--   entirely and returned every neighborhood — including inactive/archived —
--   to any signed-in user/researcher, bypassing the app's catalog/write route
--   guard. The 00065 sibling pilot_admin_list_stores() checks
--   fn_admin_uid(); these two were the only pilot_admin_* functions in the
--   whole schema written without it.
--
-- Fix
--   Re-create the SAME function with the same signature (), the same
--   SETOF public.neighborhoods return type, the same STABLE/SECURITY DEFINER
--   attributes, the same SET search_path = '', and the identical
--   `SELECT n.* ... ORDER BY n.name ASC` body — now wrapped in the exact
--   guard pattern used by the 13 already-correct pilot_admin_* siblings:
--       v_uid uuid := public.fn_admin_uid();
--       IF v_uid IS NULL THEN
--         RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
--       END IF;
--   The plpgsql wrapper is required because the guard uses RAISE; this is
--   the same shape as pilot_admin_list_stores() in 00065 and as every
--   guarded pilot_admin_* function in the schema.
--
-- Compatibility
--   CREATE OR REPLACE only — no DROP. Same name, same argument list, same
--   return type, so the existing authenticated grant, the 00071 anon revoke
--   and every caller keep working unchanged. The only behavioural delta is
--   that a non-admin caller now receives SQLSTATE 42501 instead of rows.
--   Sole consumer is PilotOpsAdminScreen (app), which is already gated by
--   ProtectedRoute requiredResource="catalog" requiredAction="write", i.e.
--   admin/super_admin only — so no legitimate caller is affected.
--
-- NOT applied to any DB by this file alone. STOP-2
-- (pilot_admin_list_families) is deliberately OUT OF SCOPE here: it still
-- has a legitimate non-admin caller (PilotStoreOpsScreen operator view) and
-- must be handled by its own gated Gate A/Gate B pair.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pilot_admin_list_neighborhoods()
RETURNS SETOF public.neighborhoods
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT n.*
    FROM public.neighborhoods n
    ORDER BY n.name ASC;
END;
$$;
