-- ============================================================================
-- FOCUS — CATALOG CENTRAL (16 — P2 CONCURRENCY GUARD for update_model)
--
-- Type: DROP + CREATE FUNCTION (signature change). Additive guard logic.
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   12-catalog-admin-rpcs.sql
--   14-catalog-p2-acl-fix.sql
--
-- SCOPE:
--   Replaces catalog_admin_update_model with P2-guarded version:
--     * Optimistic concurrency (p_expected_updated_at parameter) — D6
--     * All existing logic preserved exactly (name uniqueness, rename reset,
--       field immutability, audit trail).
--
-- SIGNATURE CHANGE:
--   OLD: catalog_admin_update_model(text, text, text, integer, text[], text[], text)
--   NEW: catalog_admin_update_model(text, text, text, integer, text[], text[], text, timestamptz DEFAULT NULL)
--   The new parameter is optional — existing callers continue to work.
--
-- SAFETY:
--   * No inventory_items reference.
--   * No table modifications beyond function replacement.
--   * admin gate (catalog_is_admin) preserved.
--   * All field immutability rules preserved.
--   * REVOKE/GRANT re-applied after function creation.
-- ============================================================================


-- ── DROP old signature ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.catalog_admin_update_model(
  text, text, text, integer, text[], text[], text
);


-- ── CREATE new function with concurrency guard ──────────────────────────────

CREATE OR REPLACE FUNCTION public.catalog_admin_update_model(
  p_canonical_id          text,
  p_name                  text,
  p_series                text DEFAULT NULL,
  p_release_year          integer DEFAULT NULL,
  p_model_numbers         text[] DEFAULT NULL,
  p_aliases               text[] DEFAULT NULL,
  p_owner_notes           text DEFAULT NULL,
  p_expected_updated_at   timestamptz DEFAULT NULL
)
RETURNS public.catalog_models
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before      jsonb;
  v_row         public.catalog_models;
  v_new_name    text;
  v_name_changed boolean := false;
  v_changed     boolean := false;
BEGIN

  -- --------------------------------------------------------------------------
  -- 1) AUTHORIZATION
  -- --------------------------------------------------------------------------
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;


  -- --------------------------------------------------------------------------
  -- 2) VALIDATION
  -- --------------------------------------------------------------------------
  IF p_canonical_id IS NULL OR btrim(p_canonical_id) = '' THEN
    RAISE EXCEPTION 'canonical_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name cannot be empty'
      USING ERRCODE = '22023';
  END IF;

  IF p_release_year IS NOT NULL AND p_release_year <= 0 THEN
    RAISE EXCEPTION 'release_year must be a positive integer'
      USING ERRCODE = '22023';
  END IF;


  -- --------------------------------------------------------------------------
  -- 3) LOOKUP
  -- --------------------------------------------------------------------------
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.canonical_id = btrim(p_canonical_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'model not found: %', p_canonical_id
      USING ERRCODE = 'P0002';
  END IF;


  -- --------------------------------------------------------------------------
  -- 4) OPTIMISTIC CONCURRENCY (D6)
  --
  -- If the caller provides p_expected_updated_at, verify the row has not been
  -- modified since the caller read it. This prevents silent overwrites when
  -- two admins edit the same model concurrently.
  --
  -- If p_expected_updated_at is NULL (legacy callers), skip this check.
  -- --------------------------------------------------------------------------
  IF p_expected_updated_at IS NOT NULL THEN
    IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION
        'concurrent modification detected: expected updated_at=% but found=% — refresh and retry',
        p_expected_updated_at, v_row.updated_at
        USING ERRCODE = '55000';
    END IF;
  END IF;


  -- Snapshot BEFORE any mutation.
  v_before := to_jsonb(v_row);

  -- NULL means keep existing name.
  v_new_name := COALESCE(btrim(p_name), v_row.name);

  v_name_changed :=
    v_new_name IS DISTINCT FROM v_row.name;


  -- --------------------------------------------------------------------------
  -- 5) NAME UNIQUENESS
  -- --------------------------------------------------------------------------
  IF v_name_changed THEN

    IF EXISTS (
      SELECT 1
      FROM public.catalog_models cm
      WHERE cm.brand_id = v_row.brand_id
        AND lower(btrim(cm.name)) = lower(btrim(v_new_name))
        AND cm.id <> v_row.id
    ) THEN
      RAISE EXCEPTION
        'duplicate model: brand=% name=% already exists',
        v_row.brand_id,
        v_new_name
        USING ERRCODE = '23505';
    END IF;

  END IF;


  -- --------------------------------------------------------------------------
  -- 6) APPLY MODEL FIELD CHANGES
  -- --------------------------------------------------------------------------

  IF v_name_changed THEN
    UPDATE public.catalog_models
    SET
      name = v_new_name,
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;
  END IF;


  IF p_series IS DISTINCT FROM v_row.series THEN
    UPDATE public.catalog_models
    SET
      series = p_series,
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;
  END IF;


  IF p_release_year IS DISTINCT FROM v_row.release_year THEN
    UPDATE public.catalog_models
    SET
      release_year = p_release_year,
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;
  END IF;


  IF p_model_numbers IS DISTINCT FROM v_row.model_numbers THEN
    UPDATE public.catalog_models
    SET
      model_numbers = COALESCE(p_model_numbers, '{}'),
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;
  END IF;


  IF p_aliases IS DISTINCT FROM v_row.aliases THEN
    UPDATE public.catalog_models
    SET
      aliases = COALESCE(p_aliases, '{}'),
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;
  END IF;


  IF p_owner_notes IS DISTINCT FROM v_row.owner_notes THEN
    UPDATE public.catalog_models
    SET
      owner_notes = p_owner_notes,
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;
  END IF;


  -- --------------------------------------------------------------------------
  -- 7) NAME CHANGE REQUIRES RE-APPROVAL
  -- --------------------------------------------------------------------------
  IF v_name_changed THEN
    UPDATE public.catalog_models
    SET
      approval_status = 'draft',
      updated_at = now()
    WHERE id = v_row.id;
  END IF;


  -- --------------------------------------------------------------------------
  -- 8) RE-READ FINAL ROW
  -- --------------------------------------------------------------------------
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 9) AUDIT TRAIL
  -- --------------------------------------------------------------------------
  IF v_changed THEN

    INSERT INTO public.catalog_model_history
      (
        model_id,
        action,
        before,
        after,
        actor_user_id
      )
    VALUES
      (
        v_row.id,
        'UPDATE',
        v_before,
        to_jsonb(v_row),
        auth.uid()
      );

  END IF;


  -- --------------------------------------------------------------------------
  -- 10) RETURN FINAL ROW
  -- --------------------------------------------------------------------------
  RETURN v_row;

END;
$$;


-- ── Security grants ─────────────────────────────────────────────────────────

REVOKE ALL
  ON FUNCTION public.catalog_admin_update_model(
    text, text, text, integer, text[], text[], text, timestamptz
  )
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_admin_update_model(
    text, text, text, integer, text[], text[], text, timestamptz
  )
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_admin_update_model(
    text, text, text, integer, text[], text[], text, timestamptz
  )
  TO authenticated;


-- ============================================================================
-- DONE — 16 CONCURRENCY GUARD for update_model.
--
-- New parameter p_expected_updated_at is optional (DEFAULT NULL).
-- Existing callers that pass only 7 parameters continue to work.
--
-- Security grants applied to new 8-parameter signature.
--
-- Next:
--   Run 17 to create the snapshot RPC.
--   Run 18 to verify all P2 changes.
--
-- Rollback:
--   DROP FUNCTION public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz);
--   Then re-apply file 12 (original update_model).
-- ============================================================================
