-- ============================================================================
-- FOCUS — CATALOG CENTRAL (09 — LIVE ACL FIX for catalog_create_model)
-- (privileges-only — PENDING OWNER APPROVAL. Do NOT run without GO.)
--
-- Fixes the LIVE ACL of public.catalog_create_model(text,text,text,integer,text[],text[]):
--   anon currently has EXECUTE (Gate 05 FAIL); intended final state is
--   anon = no EXECUTE, authenticated = EXECUTE, public = no EXECUTE,
--   service_role = EXECUTE (untouched), postgres/owner = EXECUTE (untouched).
--
-- ROOT CAUSE (live evidence + repo precedent):
--   The anon=X/postgres entry was NOT written by any file in this repo. It was
--   injected by SUPABASE PLATFORM DEFAULT PRIVILEGES at function-creation time:
--   Supabase grants EXECUTE on every new public-schema function to anon,
--   authenticated and service_role. 05-apply created the function fresh (its
--   guard at lines 39-41 proves no pre-existing function), so proacl was seeded
--   by those defaults = {postgres=X, anon=X, authenticated=X, service_role=X}
--   (exactly the Q3 live evidence). The apply script's REVOKE ALL FROM PUBLIC
--   (line 140) only removes the PUBLIC pseudo-role grant — already absent, so
--   it is a no-op — and does NOT remove the explicit anon=X entry (lines 140-141
--   were therefore insufficient). Same phenomenon was already diagnosed and
--   fixed for public.get_campaign_qr_metrics(uuid) in
--   qr-measurement/01-campaign-qr-metrics-apply.sql:371-376 and
--   qr-measurement/04-campaign-qr-metrics-acl-live-fix.sql.
--
-- SAFETY — privileges ONLY on THIS ONE function:
--   * NO DROP / CASCADE / function recreation;
--   * NO function body / logic change;
--   * NO table / RLS / catalog data / Golden Catalog / inventory / GATE 4 / any
--     other RPC touched.
--   * service_role and owner ACL entries are not mentioned and remain intact.
--
-- SCOPE (all writes in this file):
--   1) REVOKE ALL ... FROM PUBLIC        (defensive; public_execute already false)
--   2) REVOKE EXECUTE ... FROM anon       (THE fix: removes anon=X/postgres)
--   3) GRANT EXECUTE ... TO authenticated (defensive re-assert of intended grant)
--   4) read-only verify SELECT (Result Grid) of the final privilege state
-- ============================================================================

REVOKE ALL
  ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[])
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[])
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[])
  TO authenticated;

-- ============================================================================
-- VERIFY (read-only Result Grid). Expected rows:
--   anon=false  authenticated=true  public=false  service_role=true  postgres=true
-- ============================================================================
SELECT 'anon'::text AS role_name,
       has_function_privilege('anon', 'public.catalog_create_model(text,text,text,integer,text[],text[])', 'EXECUTE') AS execute_priv
UNION ALL SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.catalog_create_model(text,text,text,integer,text[],text[])', 'EXECUTE')
UNION ALL SELECT 'public',
       has_function_privilege('public', 'public.catalog_create_model(text,text,text,integer,text[],text[])', 'EXECUTE')
UNION ALL SELECT 'service_role',
       has_function_privilege('service_role', 'public.catalog_create_model(text,text,text,integer,text[],text[])', 'EXECUTE')
UNION ALL SELECT 'postgres',
       has_function_privilege('postgres', 'public.catalog_create_model(text,text,text,integer,text[],text[])', 'EXECUTE')
ORDER BY role_name;

-- ============================================================================
-- END of 09 ACL fix. After approval + run, Gate 05 re-verify (05 ... v2) should
-- be 10/10 PASS.
-- ============================================================================
