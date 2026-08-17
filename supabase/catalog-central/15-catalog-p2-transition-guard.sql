-- ============================================================================
-- FOCUS — CATALOG CENTRAL (15 — P2 TRANSITION GUARD + CONCURRENCY)
--
-- Type: DROP + CREATE FUNCTION (signature change). Additive guard logic.
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   12-catalog-admin-rpcs.sql
--   14-catalog-p2-acl-fix.sql
--
-- SCOPE:
--   Replaces catalog_admin_approve_model with P2-guarded version:
--     * Optimistic concurrency (p_expected_updated_at parameter) — D6
--     * Active status gate (status='active' required for approval) — D3
--     * Transition guard (draft → approved only) — D2
--     * Existing variant gate preserved (≥1 known/verified variant)
--
-- SIGNATURE CHANGE:
--   OLD: catalog_admin_approve_model(text, boolean)
--   NEW: catalog_admin_approve_model(text, boolean, timestamptz DEFAULT NULL)
--   The new parameter is optional — existing callers continue to work.
--
-- STATE MACHINE (D2 + D3):
--   draft  → approved   (requires: status=active, ≥1 valid variant)
--   draft  → rejected   (no additional condition)
--   approved → rejected (via p_approve=false)
--   rejected → draft    (via catalog_admin_update_model name change)
--   rejected → approved BLOCKED (must reopen → draft first)
--   archived → *        BLOCKED (archived cannot be approved)
--   approved → approved BLOCKED (must reject/reopen first)
--
-- SAFETY:
--   * No inventory_items reference.
--   * No table modifications.
--   * admin gate (catalog_is_admin) preserved.
--   * REVOKE/GRANT re-applied after function creation.
-- ============================================================================


-- ── DROP old signature ──────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.catalog_admin_approve_model(text, boolean);


-- ── CREATE new function with P2 guards ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.catalog_admin_approve_model(
  p_canonical_id          text,
  p_approve               boolean,
  p_expected_updated_at   timestamptz DEFAULT NULL
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


  -- --------------------------------------------------------------------------
  -- 4) OPTIMISTIC CONCURRENCY (D6)
  --
  -- If the caller provides p_expected_updated_at, verify the row has not been
  -- modified since the caller read it. This prevents silent overwrites when
  -- two admins act on the same model concurrently.
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


  -- Snapshot BEFORE mutation.
  v_before := to_jsonb(v_row);


  IF p_approve THEN

    -- -----------------------------------------------------------------------
    -- 5) ACTIVE STATUS GATE (D3)
    --
    -- Archived or non-active models cannot be approved.
    -- Must be restored to active status first via catalog_admin_update_model.
    -- -----------------------------------------------------------------------
    IF v_row.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION
        'cannot approve model %: status is % (requires active)',
        v_row.canonical_id, v_row.status
        USING ERRCODE = '23505';
    END IF;


    -- -----------------------------------------------------------------------
    -- 6) TRANSITION GUARD (D2)
    --
    -- Only draft → approved is allowed.
    -- Rejected models must first be reopened to draft via
    -- catalog_admin_update_model (name change resets to draft).
    -- Approved models must first be rejected, then reopened.
    -- -----------------------------------------------------------------------
    IF v_row.approval_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION
        'cannot approve model %: current approval_status is % (must be draft)',
        v_row.canonical_id, v_row.approval_status
        USING ERRCODE = '23505';
    END IF;


    -- -----------------------------------------------------------------------
    -- 7) APPROVAL GATE (existing P1 guard, preserved)
    --
    -- Only known/verified variants qualify.
    -- archived and unverified variants do not qualify.
    -- -----------------------------------------------------------------------
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
  -- 8) UPDATE APPROVAL STATUS
  -- --------------------------------------------------------------------------
  UPDATE public.catalog_models
  SET
    approval_status = v_new_status,
    updated_at = now()
  WHERE id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 9) RE-READ FINAL ROW
  -- --------------------------------------------------------------------------
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.id = v_row.id;


  -- --------------------------------------------------------------------------
  -- 10) AUDIT TRAIL
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
  -- 11) RETURN FINAL ROW
  -- --------------------------------------------------------------------------
  RETURN v_row;

END;
$$;


-- ── Security grants ─────────────────────────────────────────────────────────

REVOKE ALL
  ON FUNCTION public.catalog_admin_approve_model(text, boolean, timestamptz)
  FROM PUBLIC;

REVOKE EXECUTE
  ON FUNCTION public.catalog_admin_approve_model(text, boolean, timestamptz)
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.catalog_admin_approve_model(text, boolean, timestamptz)
  TO authenticated;


-- ============================================================================
-- DONE — 15 TRANSITION GUARD + CONCURRENCY for approve_model.
--
-- New parameter p_expected_updated_at is optional (DEFAULT NULL).
-- Existing callers that pass only (text, boolean) continue to work.
--
-- Security grants applied to new 3-parameter signature.
--
-- Next:
--   Run 16 to add concurrency to update_model.
--   Run 17 to create the snapshot RPC.
--   Run 18 to verify all P2 changes.
--
-- Rollback:
--   DROP FUNCTION public.catalog_admin_approve_model(text, boolean, timestamptz);
--   Then re-apply file 12 (original approve_model).
-- ============================================================================
