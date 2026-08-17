-- ============================================================================
-- FOCUS — CATALOG CENTRAL (05 — catalog_create_model RPC, ADDITIVE)
--
-- Type: CREATE OR REPLACE FUNCTION only. Run as `postgres` in the Supabase
--       SQL Editor AFTER GATE 1 + GATE 2 are applied and verified.
--
-- Scope (owner mandate, approved for file creation only — DB APPLY NOT GO).
--   * Add ONLY the two functions below. Nothing else changes.
--   * No existing file/object is modified. No inventory / GATE 4 / Golden
--     Catalog / catalog_create_variant changes.
--   * This closes the gap "no safe way to create a NEW catalog model".
--   * This is NOT a fix for the Golden(3004) -> Runtime(866) -> UI(816) gap;
--     that is a separate future phase.
--
-- IDENTITY RULES (single source of truth = TypeScript):
--   canonical_id = resolveModelId(brand_id, name) from
--   src/catalog/canonical-adapter.ts  (MODEL_ID_OVERRIDES at lines 21-28,
--   modelIdFor at src/catalog/canonical.ts:125).
--   catalog_model_id() below mirrors those rules 1:1. Any future override
--   change MUST be made in TS first, then mirrored here and re-verified by
--   05-catalog-create-model-rpc-verify.sql (identity test = 0 mismatches
--   across all 866 seeded models).
--
-- Security: SECURITY DEFINER (runs as owner), search_path = public pinned,
--           admin-gated via catalog_is_admin(), REVOKE ALL + EXECUTE only to
--           authenticated. RLS on catalog_models unchanged (public SELECT only).
--
-- Verify with 05-catalog-create-model-rpc-verify.sql.
-- Roll back with 05-catalog-create-model-rpc-rollback.sql.
-- ============================================================================

-- 0) ADDITIVITY GUARD — fail closed if preconditions are wrong.
DO $$
BEGIN
  IF to_regclass('public.catalog_models') IS NULL THEN
    RAISE EXCEPTION '05 FAIL: catalog_models missing — run 01-catalog-schema-apply.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE pronamespace = 'public'::regnamespace AND proname = 'catalog_create_model') THEN
    RAISE EXCEPTION '05 FAIL: catalog_create_model already exists (not additive)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE pronamespace = 'public'::regnamespace AND proname = 'catalog_model_id') THEN
    RAISE EXCEPTION '05 FAIL: catalog_model_id already exists (not additive)';
  END IF;
END $$;

-- 1) Internal identity helper — mirrors resolveModelId() 1:1 (TS single source).
--    Not callable by any role (REVOKE ALL, no grant).
CREATE OR REPLACE FUNCTION public.catalog_model_id(p_brand_id text, p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  -- slugify() port (src/catalog/canonical.ts:98). ASCII-only corpus verified;
  -- non-ASCII names must go through MODEL_ID_OVERRIDES instead.
  v_slug := lower(btrim(p_name));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  IF v_slug = '' THEN v_slug := 'unknown'; END IF;
  -- MODEL_ID_OVERRIDES (canonical-adapter.ts:21-28) then modelIdFor.
  RETURN CASE
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 13 Pro+' THEN 'xiaomi-redmi-note-13-pro-plus'
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 14 Pro+' THEN 'xiaomi-redmi-note-14-pro-plus'
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 15 Pro+' THEN 'xiaomi-redmi-note-15-pro-plus'
    WHEN p_brand_id = 'xiaomi' AND btrim(p_name) = 'Redmi Note 16 Pro+' THEN 'xiaomi-redmi-note-16-pro-plus'
    ELSE btrim(p_brand_id) || '-' || v_slug
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_model_id(text, text) FROM PUBLIC;

-- 2) Admin RPC — create a NEW catalog model (fail-closed on collisions).
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

  INSERT INTO public.catalog_model_history (model_id, action, after, actor_user_id)
  VALUES (v_row.id, 'CREATE', to_jsonb(v_row), auth.uid());

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_create_model(text, text, text, integer, text[], text[]) TO authenticated;

-- ============================================================================
-- END OF 05 APPLY. Verify with 05-catalog-create-model-rpc-verify.sql.
-- ============================================================================
