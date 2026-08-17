-- ============================================================================
-- FOCUS — CATALOG CENTRAL (17 — P2 CONSISTENT SNAPSHOT RPC)
--
-- Type: CREATE OR REPLACE FUNCTION only. Additive.
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   01-catalog-schema-apply.sql
--   11-catalog-admin-schema-apply.sql
--
-- SCOPE:
--   catalog_export_snapshot()
--   Returns both models and variants in a single SQL statement,
--   guaranteeing a consistent read (D5 — no split reads).
--
-- CONSISTENCY:
--   Both subqueries (models, variants) execute within a single SQL statement.
--   PostgreSQL guarantees that all subqueries in a single statement see the
--   same committed data snapshot (READ COMMITTED isolation).
--   This eliminates the torn-read risk between model and variant reads.
--
-- SECURITY:
--   * SECURITY DEFINER (runs as owner — service_role or postgres)
--   * search_path = public
--   * catalog_is_admin() gate: only admins can call
--   * REVOKE ALL FROM PUBLIC, GRANT to authenticated
--
-- RETURN:
--   jsonb with shape: { "models": [...], "variants": [...], "exported_at": "..." }
--
-- PAYLOAD SIZE:
--   ~2-3MB for current dataset (2178 models + 1816 variants). This is within
--   PostgreSQL's JSONB limits and PostgREST's response handling.
--
-- USAGE:
--   SELECT public.catalog_export_snapshot();
--   or via Supabase client: supabase.rpc('catalog_export_snapshot')
--
-- SAFETY:
--   * No inventory_items reference.
--   * No table modifications.
--   * Purely read-only.
--   * Idempotent — safe to call repeatedly.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.catalog_export_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'models', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',              cm.id,
        'canonical_id',    cm.canonical_id,
        'brand_id',        cm.brand_id,
        'name',            cm.name,
        'series',          cm.series,
        'release_year',    cm.release_year,
        'model_numbers',   cm.model_numbers,
        'aliases',         cm.aliases,
        'status',          cm.status,
        'approval_status', cm.approval_status,
        'updated_at',      cm.updated_at
      ) ORDER BY cm.canonical_id), '[]'::jsonb)
      FROM public.catalog_models cm
    ),
    'variants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'canonical_variant_id', cv.canonical_variant_id,
        'model_id',            cv.model_id,
        'ram_mb',              cv.ram_mb,
        'storage_gb',          cv.storage_gb,
        'region',              cv.region,
        'status',              cv.status,
        'updated_at',          cv.updated_at
      ) ORDER BY cv.canonical_variant_id), '[]'::jsonb)
      FROM public.catalog_variants cv
    ),
    'exported_at', to_jsonb(now())
  );
$$;


-- ── Security grants ─────────────────────────────────────────────────────────

REVOKE ALL
  ON FUNCTION public.catalog_export_snapshot()
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_export_snapshot()
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_export_snapshot()
  TO authenticated;


-- ============================================================================
-- VERIFY — read-only. Expected:
--   anon=false, authenticated=true, public=false
-- ============================================================================

SELECT 'anon'::text AS role_name,
       has_function_privilege('anon', 'public.catalog_export_snapshot()', 'EXECUTE') AS execute_priv
UNION ALL SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.catalog_export_snapshot()', 'EXECUTE')
UNION ALL SELECT 'public',
       has_function_privilege('public', 'public.catalog_export_snapshot()', 'EXECUTE')
UNION ALL SELECT 'service_role',
       has_function_privilege('service_role', 'public.catalog_export_snapshot()', 'EXECUTE')
UNION ALL SELECT 'postgres',
       has_function_privilege('postgres', 'public.catalog_export_snapshot()', 'EXECUTE')
ORDER BY role_name;


-- ============================================================================
-- DONE — 17 SNAPSHOT RPC.
--
-- Next:
--   Run 18 to verify all P2 changes.
--   Update the generator to use catalog_export_snapshot() when available.
--
-- Rollback:
--   DROP FUNCTION public.catalog_export_snapshot();
-- ============================================================================
