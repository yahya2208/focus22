-- ============================================================================
-- 00062 — TELEMETRY ANALYTICS ANON ACL FIX (owner-approved correction)
--
-- PURPOSE
--   Guarantee that `public.get_telemetry_analytics(...)` is executable by the
--   `authenticated` role ONLY — never by `anon`. The analytics read path is
--   strictly staff/research (authorization is enforced INSIDE Postgres via
--   public.users.role), so anonymous visitors must never call it.
--
--   This is a corrective/idempotent ACL migration:
--     * REVOKE EXECUTE ... FROM anon        — removes any stray anon EXECUTE
--                                              (no-op if none exists)
--     * GRANT  EXECUTE ... TO authenticated — re-affirms the staff/reader grant
--
-- DESIRED END-STATE (logical ACL matrix):
--   * record_telemetry_event(jsonb):       anon=true,  authenticated=true
--   * get_telemetry_analytics(timestamptz,timestamptz,text,text,text,text):
--                                          anon=false, authenticated=true
--
-- CONSTRAINTS (unchanged by design)
--   * Does NOT modify the body of get_telemetry_analytics or
--     record_telemetry_event.
--   * Does NOT modify any other RPC, RBAC / ROLE_PERMISSIONS /
--     ROLE_CAPABILITY_MAP, tables, data, RLS, or telemetry taxonomy.
--   * Does NOT rewrite 00061 or touch any historical migration.
--
-- Post-apply verification: run in the Supabase SQL Editor (owner role):
--
--   SELECT
--     has_function_privilege(
--       'anon',
--       'public.get_telemetry_analytics(timestamptz,timestamptz,text,text,text,text)',
--       'EXECUTE'
--     ) AS analytics_anon,
--     has_function_privilege(
--       'authenticated',
--       'public.get_telemetry_analytics(timestamptz,timestamptz,text,text,text,text)',
--       'EXECUTE'
--     ) AS analytics_authenticated;
--
--   Expected: analytics_anon = false, analytics_authenticated = true
-- ============================================================================

BEGIN;

REVOKE EXECUTE
ON FUNCTION public.get_telemetry_analytics(
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text
)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_telemetry_analytics(
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text
)
TO authenticated;

COMMIT;
