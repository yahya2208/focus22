-- ============================================================================
-- FOCUS — CATALOG CENTRAL (21 — P3 LIST MODELS SECURITY FIX)
--
-- Type: DROP+CREATE FUNCTION, REVOKE/GRANT ACL.
-- Run as: postgres in Supabase SQL Editor AFTER 19-catalog-p3-management-foundation.sql
--
-- PROBLEM:
--   catalog_admin_list_models exists on the live DB but was omitted from
--   migration 19. The live version was created without:
--     - SECURITY DEFINER
--     - SET search_path = public
--   This means prosecdef=false and search_path is not locked down.
--
-- FIX:
--   DROP the existing function (exact 8-param signature).
--   CREATE with proper security: SECURITY DEFINER, SET search_path = public,
--   catalog_is_admin() gate, REVOKE/GRANT ACL.
--
-- SAFETY:
--   * No catalog_models rows modified.
--   * No catalog_variants rows modified.
--   * No inventory_items rows modified.
--   * No other RPCs modified.
--   * Existing P2 RPCs untouched.
-- ============================================================================


-- ============================================================================
-- 1) DROP existing function (exact 8-param overload)
--
-- The function exists on the live DB with 8 params:
--   (text, text, text, boolean, integer, integer, text, boolean)
--
-- DROP is required because PostgreSQL does not allow changing security
-- properties (SECURITY DEFINER) via CREATE OR REPLACE.
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_admin_list_models(
  text, text, text, boolean, integer, integer, text, boolean
);


-- ============================================================================
-- 2) CREATE catalog_admin_list_models — server-side paginated model listing
--
-- Returns catalog_models with variant_count via LEFT JOIN.
-- Supports: search, brand filter, approval filter, has_variants filter,
--           pagination (limit/offset), configurable ordering.
--
-- Security: SECURITY DEFINER, search_path=public, catalog_is_admin() gate.
-- ACL: REVOKE ALL FROM PUBLIC, REVOKE anon, GRANT authenticated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_list_models(
  p_search        text    DEFAULT NULL,
  p_brand         text    DEFAULT NULL,
  p_approval      text    DEFAULT NULL,
  p_has_variants  boolean DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0,
  p_order_by      text    DEFAULT 'brand_id',
  p_order_asc     boolean DEFAULT true
)
RETURNS TABLE (
  id              uuid,
  canonical_id    text,
  brand_id        text,
  name            text,
  series          text,
  release_year    integer,
  status          text,
  approval_status text,
  variant_count   bigint,
  updated_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim  integer;
  v_off  integer;
  v_sort text;
  v_dir  text;
BEGIN
  -- 1) AUTHORIZATION
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  -- 2) CLAMP PAGINATION
  v_lim := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_off := GREATEST(COALESCE(p_offset, 0), 0);

  -- 3) ORDER BY WHITELIST (prevents SQL injection via dynamic ORDER BY)
  v_sort := CASE COALESCE(p_order_by, 'brand_id')
    WHEN 'brand_id'        THEN 'cm.brand_id'
    WHEN 'name'            THEN 'cm.name'
    WHEN 'approval_status' THEN 'cm.approval_status'
    WHEN 'updated_at'      THEN 'cm.updated_at'
    WHEN 'variant_count'   THEN 'vcnt.cnt'
    ELSE 'cm.brand_id'
  END;

  v_dir := CASE WHEN p_order_asc THEN 'ASC' ELSE 'DESC' END;

  -- 4) RETURN QUERY (dynamic SQL to allow non-constant ORDER BY)
  RETURN QUERY
  EXECUTE format(
    'SELECT
       cm.id,
       cm.canonical_id,
       cm.brand_id,
       cm.name,
       cm.series,
       cm.release_year,
       cm.status,
       cm.approval_status,
       COALESCE(vcnt.cnt, 0)::bigint AS variant_count,
       cm.updated_at
     FROM public.catalog_models cm
     LEFT JOIN LATERAL (
       SELECT count(*)::bigint AS cnt
       FROM public.catalog_variants cv
       WHERE cv.model_id = cm.id
     ) vcnt ON true
     WHERE ($1 IS NULL OR btrim($1) = '''' OR cm.name ILIKE ''%%'' || $1 || ''%%''
                  OR cm.canonical_id ILIKE ''%%'' || $1 || ''%%''
                  OR cm.brand_id ILIKE ''%%'' || $1 || ''%%''
                  OR cm.series ILIKE ''%%'' || $1 || ''%%''
                  OR EXISTS (SELECT 1 FROM unnest(cm.model_numbers) t(v) WHERE v ILIKE ''%%'' || $1 || ''%%'')
                  OR EXISTS (SELECT 1 FROM unnest(cm.aliases) t(v) WHERE v ILIKE ''%%'' || $1 || ''%%''))
       AND ($2 IS NULL OR btrim($2) = '''' OR cm.brand_id = $2)
       AND ($3 IS NULL OR btrim($3) = '''' OR cm.approval_status = $3)
       AND ($4 IS NULL OR ($4 = true  AND vcnt.cnt > 0)
                      OR ($4 = false AND vcnt.cnt = 0))
     ORDER BY %s %s NULLS LAST, cm.canonical_id ASC
     LIMIT $5 OFFSET $6',
    v_sort, v_dir
  )
  USING p_search, p_brand, p_approval, p_has_variants, v_lim, v_off;

END;
$$;


-- ============================================================================
-- 3) ACL — REVOKE/GRANT
-- ============================================================================

REVOKE ALL ON FUNCTION public.catalog_admin_list_models(
  text, text, text, boolean, integer, integer, text, boolean
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.catalog_admin_list_models(
  text, text, text, boolean, integer, integer, text, boolean
) FROM anon;

GRANT EXECUTE ON FUNCTION public.catalog_admin_list_models(
  text, text, text, boolean, integer, integer, text, boolean
) TO authenticated;


-- ============================================================================
-- DONE — 21 LIST MODELS SECURITY FIX.
--
-- Verify with: 20-catalog-p3-verify.sql
-- ============================================================================
