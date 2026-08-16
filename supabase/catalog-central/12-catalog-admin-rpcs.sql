-- ============================================================================
-- FOCUS — CATALOG CENTRAL (12 — ADMIN UPDATE RPCs — FINAL P0)
--
-- Type: CREATE OR REPLACE FUNCTION only. Additive.
--
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   01-catalog-schema-apply.sql
--   05-catalog-create-model-rpc-apply.sql
--   11-catalog-admin-schema-apply.sql
--
-- IMPORTANT:
--   This is the FINAL P0-safe version after independent RPC review.
--
-- SCOPE:
--   * catalog_admin_update_model
--   * catalog_admin_update_variant
--   * catalog_admin_approve_model
--
-- SECURITY:
--   * SECURITY DEFINER
--   * SET search_path = public
--   * catalog_is_admin() authorization gate
--   * REVOKE ALL FROM PUBLIC
--   * GRANT EXECUTE TO authenticated
--   * No grant to anon
--
-- INVENTORY:
--   * No reference to inventory_items
--   * No inventory RPC changes
--
-- VARIANT IDENTITY:
--   * canonical_variant_id is derived from variant identity/specification.
--   * Therefore P0 DOES NOT permit direct modification of:
--       ram_mb
--       storage_gb
--       region
--       model_id
--       canonical_variant_id
--
--   Safe future spec correction:
--       archive old variant -> create new variant
--   This preserves the canonical_variant_id contract.
-- ============================================================================


-- ============================================================================
-- 12.1) catalog_admin_update_model
--
-- Editable:
--   * name
--   * series
--   * release_year
--   * model_numbers
--   * aliases
--   * owner_notes
--
-- Immutable:
--   * id
--   * canonical_id
--   * brand_id
--
-- Rules:
--   * NULL name = keep current name
--   * empty name = rejected
--   * name change resets approval_status to draft
--   * other field changes preserve approval_status
--   * duplicate model name within same brand is rejected
--   * no-op produces no history row and does not touch updated_at
--   * exactly one UPDATE history row per changed call
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_update_model(
  p_canonical_id   text,
  p_name           text,
  p_series         text DEFAULT NULL,
  p_release_year   integer DEFAULT NULL,
  p_model_numbers  text[] DEFAULT NULL,
  p_aliases        text[] DEFAULT NULL,
  p_owner_notes    text DEFAULT NULL
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


  -- Snapshot BEFORE any mutation.
  v_before := to_jsonb(v_row);

  -- NULL means keep existing name.
  v_new_name := COALESCE(btrim(p_name), v_row.name);

  v_name_changed :=
    v_new_name IS DISTINCT FROM v_row.name;


  -- --------------------------------------------------------------------------
  -- 4) NAME UNIQUENESS
  --
  -- The database unique index remains authoritative.
  -- The case-insensitive check is an additional early protection.
  -- The stored value itself is NOT lowercased.
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
  -- 5) APPLY MODEL FIELD CHANGES
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
  -- 6) NAME CHANGE REQUIRES RE-APPROVAL
  -- --------------------------------------------------------------------------
  IF v_name_changed THEN
    UPDATE public.catalog_models
    SET
      approval_status = 'draft',
      updated_at = now()
    WHERE id = v_row.id;
  END IF;


  -- --------------------------------------------------------------------------
  -- 7) RE-READ FINAL ROW
  -- --------------------------------------------------------------------------
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 8) AUDIT TRAIL
  --
  -- One history row only when something actually changed.
  -- before = complete pre-change snapshot
  -- after  = complete post-change snapshot
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
  -- 9) RETURN FINAL ROW
  -- --------------------------------------------------------------------------
  RETURN v_row;

END;
$$;


-- Security grants
REVOKE ALL
ON FUNCTION public.catalog_admin_update_model(
  text,
  text,
  text,
  integer,
  text[],
  text[],
  text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.catalog_admin_update_model(
  text,
  text,
  text,
  integer,
  text[],
  text[],
  text
)
TO authenticated;



-- ============================================================================
-- 12.2) catalog_admin_update_variant
--
-- FINAL P0 SAFETY DECISION:
--
-- This RPC edits ONLY:
--   * notes
--
-- It MUST NOT edit:
--   * ram_mb
--   * storage_gb
--   * region
--   * model_id
--   * canonical_variant_id
--
-- Reason:
--   canonical_variant_id represents the identity/specification of the variant.
--   Editing RAM/storage/region in-place would make the stored canonical ID
--   stale unless the ID is recalculated and collision-checked.
--
-- Safe P0 workflow for changing RAM/storage/region:
--
--   1. archive existing variant
--   2. create a new variant using catalog_create_variant
--   3. new canonical_variant_id is generated correctly
--
-- Rules:
--   * archived variants cannot be edited
--   * no-op produces no history row
--   * notes can be set to NULL intentionally
--   * exactly one UPDATE history row per changed call
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_update_variant(
  p_canonical_variant_id text,
  p_notes                text DEFAULT NULL
)
RETURNS public.catalog_variants
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before  jsonb;
  v_row     public.catalog_variants;
  v_changed boolean := false;
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
  IF p_canonical_variant_id IS NULL
     OR btrim(p_canonical_variant_id) = '' THEN

    RAISE EXCEPTION 'canonical_variant_id is required'
      USING ERRCODE = '22023';
  END IF;


  -- --------------------------------------------------------------------------
  -- 3) LOOKUP
  -- --------------------------------------------------------------------------
  SELECT cv.*
    INTO v_row
  FROM public.catalog_variants cv
  WHERE cv.canonical_variant_id = btrim(p_canonical_variant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'variant not found: %', p_canonical_variant_id
      USING ERRCODE = 'P0002';
  END IF;


  -- --------------------------------------------------------------------------
  -- 4) ARCHIVED VARIANT GUARD
  -- --------------------------------------------------------------------------
  IF v_row.status = 'archived' THEN
    RAISE EXCEPTION
      'cannot edit archived variant: restore it first'
      USING ERRCODE = '55000';
  END IF;


  -- Snapshot BEFORE mutation.
  v_before := to_jsonb(v_row);


  -- --------------------------------------------------------------------------
  -- 5) APPLY ONLY NOTES CHANGE
  --
  -- Explicit NULL is allowed and means clear notes.
  -- --------------------------------------------------------------------------
  IF p_notes IS DISTINCT FROM v_row.notes THEN

    UPDATE public.catalog_variants
    SET
      notes = p_notes,
      updated_at = now()
    WHERE id = v_row.id;

    v_changed := true;

  END IF;


  -- --------------------------------------------------------------------------
  -- 6) RE-READ FINAL ROW
  -- --------------------------------------------------------------------------
  SELECT cv.*
    INTO v_row
  FROM public.catalog_variants cv
  WHERE cv.id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 7) AUDIT TRAIL
  -- --------------------------------------------------------------------------
  IF v_changed THEN

    INSERT INTO public.catalog_variant_history
      (
        variant_id,
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
  -- 8) RETURN FINAL ROW
  -- --------------------------------------------------------------------------
  RETURN v_row;

END;
$$;


-- Security grants
REVOKE ALL
ON FUNCTION public.catalog_admin_update_variant(
  text,
  text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.catalog_admin_update_variant(
  text,
  text
)
TO authenticated;



-- ============================================================================
-- 12.3) catalog_admin_approve_model
--
-- Approve or reject a model.
--
-- Approval gate:
--   Model MUST have >= 1 variant whose status is:
--     known
--     verified
--
-- Rejection:
--   Does NOT require a valid variant.
--
-- approval_status:
--   approved
--   rejected
--
-- Audit:
--   APPROVE or REJECT
--
-- No inventory access.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_approve_model(
  p_canonical_id text,
  p_approve      boolean
)
RETURNS public.catalog_models
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before         jsonb;
  v_row            public.catalog_models;
  v_valid_variants bigint;
  v_new_status     text;
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
  IF p_canonical_id IS NULL
     OR btrim(p_canonical_id) = '' THEN

    RAISE EXCEPTION 'canonical_id is required'
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


  -- Snapshot BEFORE mutation.
  v_before := to_jsonb(v_row);


  -- --------------------------------------------------------------------------
  -- 4) APPROVAL GATE
  --
  -- Only known/verified variants qualify.
  -- archived and unverified variants do not qualify.
  -- --------------------------------------------------------------------------
  IF p_approve THEN

    SELECT count(*)
      INTO v_valid_variants
    FROM public.catalog_variants cv
    WHERE cv.model_id = v_row.id
      AND cv.status IN ('known', 'verified');

    IF v_valid_variants = 0 THEN

      RAISE EXCEPTION
        'cannot approve model %: requires >= 1 variant with status known or verified (has 0)',
        v_row.canonical_id
        USING ERRCODE = '23505';

    END IF;

    v_new_status := 'approved';

  ELSE

    v_new_status := 'rejected';

  END IF;


  -- --------------------------------------------------------------------------
  -- 5) UPDATE APPROVAL STATUS
  -- --------------------------------------------------------------------------
  UPDATE public.catalog_models
  SET
    approval_status = v_new_status,
    updated_at = now()
  WHERE id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 6) RE-READ FINAL ROW
  -- --------------------------------------------------------------------------
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 7) AUDIT TRAIL
  -- --------------------------------------------------------------------------
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
      CASE
        WHEN p_approve THEN 'APPROVE'
        ELSE 'REJECT'
      END,
      v_before,
      to_jsonb(v_row),
      auth.uid()
    );


  -- --------------------------------------------------------------------------
  -- 8) RETURN FINAL ROW
  -- --------------------------------------------------------------------------
  RETURN v_row;

END;
$$;


-- Security grants
REVOKE ALL
ON FUNCTION public.catalog_admin_approve_model(
  text,
  boolean
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.catalog_admin_approve_model(
  text,
  boolean
)
TO authenticated;



-- ============================================================================
-- FINAL P0 NOTES
--
-- 1. catalog_admin_update_model
--    -> Can edit model metadata.
--    -> Identity fields remain immutable.
--    -> Name changes reset approval_status to draft.
--
-- 2. catalog_admin_update_variant
--    -> NOTES ONLY.
--    -> RAM/STORAGE/REGION are intentionally immutable in this RPC.
--    -> canonical_variant_id can therefore never become stale through this RPC.
--
-- 3. catalog_admin_approve_model
--    -> Approval requires >= 1 known/verified variant.
--    -> Rejection does not require a variant.
--
-- 4. Inventory
--    -> No inventory_items reference.
--    -> No inventory RPC modification.
--
-- 5. Security
--    -> SECURITY DEFINER.
--    -> SET search_path = public.
--    -> Admin gate.
--    -> PUBLIC execution revoked.
--    -> authenticated execution granted.
--    -> anon execution NOT granted.
--
-- 6. No existing catalog_create_* RPC is modified.
--
-- 7. SAFE WORKFLOW FOR SPECIFICATION CORRECTION:
--
--       Existing variant
--             |
--             v
--       catalog_archive_variant
--             |
--             v
--       catalog_create_variant
--             |
--             v
--       new canonical_variant_id
--
-- ============================================================================
-- DONE — RPC 12 FINAL P0
--
-- NEXT STEP:
--   Run 13-catalog-admin-rpc-verify.sql to confirm all 3 RPCs exist
--   with correct signatures and security.
--
-- Rollback:
--
-- DROP FUNCTION public.catalog_admin_update_model(
--   text, text, text, integer, text[], text[], text
-- );
--
-- DROP FUNCTION public.catalog_admin_update_variant(
--   text, text
-- );
--
-- DROP FUNCTION public.catalog_admin_approve_model(
--   text, boolean
-- );
-- ============================================================================
