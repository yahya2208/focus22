-- ============================================================================
-- FOCUS — CATALOG CENTRAL (06 — catalog_model_id slugify FIX)
--
-- Fixes the slugify port in public.catalog_model_id() so it matches the
-- TypeScript canonical rule EXACTLY (src/catalog/canonical.ts:113-119):
--
--   TS: input.toLowerCase().normalize('NFKD')
--          .replace(/[^a-z0-9]+/g,'-')
--          .replace(/^-+|-+$/g,'') || 'unknown'
--
-- BUG (05): v_slug := lower(regexp_replace(btrim(p_name), '[^a-z0-9]+','-','g'))
--   -> the regex ran BEFORE lower(), so uppercase letters were DROPPED
--      ('Galaxy Z Test' -> 'alaxy-est' instead of 'galaxy-z-test').
--      Verified on production: identity_mismatches = 862 of 866.
--
-- FIX: lowercase FIRST, then regex. NFKD is a no-op for the ASCII corpus
--      (verified: 0 non-ASCII model names among the 866).
--      Local proof: corrected SQL == TS for all 866 names -> 0 mismatches.
--
-- Scope: ONLY CREATE OR REPLACE FUNCTION public.catalog_model_id(text,text).
--        No other DB object / inventory / GATE 4 / Golden Catalog changes.
--        catalog_create_model() is unchanged (it calls catalog_model_id()).
--        CREATE OR REPLACE preserves the existing privileges (REVOKE ALL).
--
-- Run as `postgres` in the Supabase SQL Editor AFTER 05 apply (already done).
-- Verify with 05-catalog-create-model-rpc-verify.sql (updated ACL + identity).
-- Rollback of the two functions: 05-catalog-create-model-rpc-rollback.sql.
-- ============================================================================

-- 0) Additivity guard — catalog_model_id must already exist (from 05).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc
                 WHERE pronamespace = 'public'::regnamespace AND proname = 'catalog_model_id') THEN
    RAISE EXCEPTION '06 FAIL: catalog_model_id missing — run 05 apply first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.catalog_model_id(p_brand_id text, p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  -- slugify() port, exact order: lower -> regex -> trim '-' (canonical.ts:113)
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

-- ============================================================================
-- END OF 06 APPLY (function fix only). Verify with 05-...-verify.sql.
-- ============================================================================
