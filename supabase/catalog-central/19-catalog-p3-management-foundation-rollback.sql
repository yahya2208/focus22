-- ============================================================================
-- FOCUS — CATALOG CENTRAL (19 — P3 MANAGEMENT FOUNDATION — ROLLBACK)
--
-- Purpose: Undo everything from 19-catalog-p3-management-foundation.sql
--
-- Execute AFTER: 19-catalog-p3-management-foundation.sql
-- Safe at:       production (if migrated)
--
-- ORDER: Reverse of apply (6 → 5 → 4 → 3 → 2 → 1)
-- ============================================================================


-- ============================================================================
-- 6) DROP catalog_admin_get_model_history
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_admin_get_model_history(text, integer, integer);


-- ============================================================================
-- 5) DROP catalog_admin_update_variant_specs
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_admin_update_variant_specs(text, integer, integer, text, text, timestamptz);


-- ============================================================================
-- 4) DROP catalog_admin_reopen_model
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_admin_reopen_model(text, timestamptz);


-- ============================================================================
-- 3) RESTORE catalog_admin_list_variants — DROP new, CREATE old signature
--
-- Old: (text DEFAULT NULL) → SETOF catalog_variants
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_admin_list_variants(text, uuid);

CREATE OR REPLACE FUNCTION public.catalog_admin_list_variants(
  p_status text DEFAULT NULL
)
RETURNS SETOF public.catalog_variants
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT cv.*
  FROM public.catalog_variants cv
  WHERE (p_status IS NULL OR btrim(p_status) = '' OR cv.status = p_status)
  ORDER BY cv.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_list_variants(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_list_variants(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_list_variants(text) TO authenticated;


-- ============================================================================
-- 2) RESTORE CHECK CONSTRAINT — remove REOPEN from model history actions
--
-- catalog_model_history.action CHECK after rollback:
--   ('CREATE','UPDATE','APPROVE','REJECT')
-- ============================================================================

ALTER TABLE public.catalog_model_history
  DROP CONSTRAINT IF EXISTS catalog_model_history_action_check;

ALTER TABLE public.catalog_model_history
  ADD CONSTRAINT catalog_model_history_action_check
  CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT'));


-- ============================================================================
-- 1) DROP approval_status index
-- ============================================================================

DROP INDEX IF EXISTS public.catalog_models_approval_status_idx;


-- ============================================================================
-- DONE — 19 ROLLBACK COMPLETE.
--
-- All objects from 19-catalog-p3-management-foundation.sql are removed.
-- Schema matches P2 baseline (3d29392).
-- ============================================================================
