-- ============================================================================
-- P1 AUDIT FIX — add model_id to catalog_admin_get_model_history
--
-- Problem: CREATE OR REPLACE cannot change RETURNS TABLE row type (PG 42P13).
-- Solution: DROP + CREATE inside a single transaction.
--
-- Changes vs. original:
--   1. RETURN TABLE gains: model_id uuid (after id)
--   2. SELECT gains: h.model_id (after h.id)
--   Everything else is byte-for-byte identical.
--
-- How to run:
--   1. Supabase Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
-- ============================================================================

BEGIN;

-- 1) DROP (non-CASCADE — no dependent objects exist)
DROP FUNCTION IF EXISTS public.catalog_admin_get_model_history(text, integer, integer);

-- 2) CREATE with model_id added to return contract
CREATE OR REPLACE FUNCTION public.catalog_admin_get_model_history(
  p_canonical_id text,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  model_id      uuid,
  action        text,
  "before"      jsonb,
  "after"       jsonb,
  actor_user_id uuid,
  actor_email   text,
  created_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model public.catalog_models;
  v_lim   integer;
  v_off   integer;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_canonical_id IS NULL OR btrim(p_canonical_id) = '' THEN
    RAISE EXCEPTION 'canonical_id is required'
      USING ERRCODE = '22023';
  END IF;

  v_lim := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_off := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT cm.*
    INTO v_model
  FROM public.catalog_models cm
  WHERE cm.canonical_id = btrim(p_canonical_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'model not found: %', p_canonical_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.model_id,
    h.action,
    h."before",
    h."after",
    h.actor_user_id,
    u.email::text AS actor_email,
    h.created_at
  FROM public.catalog_model_history h
  LEFT JOIN public.users u ON u.id = h.actor_user_id
  WHERE h.model_id = v_model.id
  ORDER BY h.created_at DESC
  LIMIT v_lim
  OFFSET v_off;

END;
$$;

-- 3) Restore exact grants/revokes
REVOKE ALL ON FUNCTION public.catalog_admin_get_model_history(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_get_model_history(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_get_model_history(text, integer, integer) TO authenticated;

COMMIT;
