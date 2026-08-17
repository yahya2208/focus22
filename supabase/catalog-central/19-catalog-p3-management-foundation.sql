-- ============================================================================
-- FOCUS — CATALOG CENTRAL (19 — P3 MANAGEMENT FOUNDATION)
--
-- Type: CREATE/DROP+CREATE FUNCTION, CREATE INDEX, ALTER CONSTRAINT.
-- Run as `postgres` in the Supabase SQL Editor AFTER:
--   01-catalog-schema-apply.sql
--   05-catalog-create-model-rpc-apply.sql
--   11-catalog-admin-schema-apply.sql
--   12-catalog-admin-rpcs.sql
--   14-catalog-p2-acl-fix.sql
--   15-catalog-p2-transition-guard.sql
--   16-catalog-p2-concurrency-guard.sql
--   17-catalog-p2-snapshot-rpc.sql
--   18-catalog-p2-verify.sql
--
-- SCOPE:
--   1) Index: catalog_models_approval_status_idx (for admin list filter)
--   2) CHECK constraint expansion: add REOPEN to catalog_model_history.action
--   3) catalog_admin_list_variants — add p_model_id parameter (DROP+CREATE)
--   4) catalog_admin_reopen_model — rejected → draft transition
--   5) catalog_admin_update_variant_specs — edit ram/storage/region/status
--   6) catalog_admin_get_model_history — read-only model audit trail
--
-- SAFETY:
--   * No existing table data modified (0 rows in catalog_model_history).
--   * No catalog_models rows modified.
--   * No catalog_variants rows modified.
--   * No inventory_items rows modified.
--   * All RPCs follow P2 security pattern:
--     SECURITY DEFINER, search_path=public, catalog_is_admin() gate,
--     REVOKE ALL FROM PUBLIC, REVOKE anon, GRANT authenticated.
--   * P2 RPCs (14–18) are NOT modified.
--   * No existing RPC signatures are changed except catalog_admin_list_variants
--     (adding optional parameter, no callers outside SQL verification scripts).
--
-- Rollback: 19-catalog-p3-management-foundation-rollback.sql
-- Verify:   20-catalog-p3-verify.sql
-- ============================================================================


-- ============================================================================
-- 1) INDEX — approval_status filter for admin list
-- ============================================================================

-- Verify no equivalent index exists before creating.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'catalog_models'
      AND indexdef   LIKE '%approval_status%'
  ) THEN
    RAISE NOTICE '19: catalog_models_approval_status_idx already exists — skipping';
  ELSE
    CREATE INDEX catalog_models_approval_status_idx
      ON public.catalog_models (approval_status);
    RAISE NOTICE '19: catalog_models_approval_status_idx created';
  END IF;
END $$;


-- ============================================================================
-- 2) CHECK CONSTRAINT EXPANSION — add REOPEN to model history actions
--
-- catalog_model_history.action CHECK currently:
--   ('CREATE','UPDATE','APPROVE','REJECT')
--
-- Expanding to:
--   ('CREATE','UPDATE','APPROVE','REJECT','REOPEN')
--
-- Safety: catalog_model_history has 0 rows (verified at P3 baseline).
--         No data will violate the new constraint.
-- ============================================================================

ALTER TABLE public.catalog_model_history
  DROP CONSTRAINT IF EXISTS catalog_model_history_action_check;

ALTER TABLE public.catalog_model_history
  ADD CONSTRAINT catalog_model_history_action_check
  CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT','REOPEN'));


-- ============================================================================
-- 3) catalog_admin_list_variants — ADD p_model_id FILTER
--
-- Old signature: (text DEFAULT NULL) → SETOF catalog_variants
-- New signature: (text DEFAULT NULL, uuid DEFAULT NULL) → SETOF catalog_variants
--
-- DROP required: PostgreSQL does not allow adding a parameter to an existing
-- function. The old signature has NO callers in TS/TSX/JS code (verified by grep).
--
-- Behavior:
--   p_status=NULL, p_model_id=NULL → all variants (unchanged default)
--   p_status='known', p_model_id=NULL → all known variants
--   p_status=NULL, p_model_id=uuid → all variants for that model
--   p_status='known', p_model_id=uuid → known variants for that model
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_admin_list_variants(text);

CREATE OR REPLACE FUNCTION public.catalog_admin_list_variants(
  p_status   text DEFAULT NULL,
  p_model_id uuid DEFAULT NULL
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
    AND (p_model_id IS NULL OR cv.model_id = p_model_id)
  ORDER BY cv.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_list_variants(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_list_variants(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_list_variants(text, uuid) TO authenticated;


-- ============================================================================
-- 4) catalog_admin_reopen_model — rejected → draft
--
-- Transition: rejected → draft (ONLY)
--
-- Blocked:
--   draft   → rejected error (already draft, nothing to reopen)
--   approved → rejected error (must reject first via approve_model)
--
-- Guards:
--   admin authorization (catalog_is_admin)
--   canonical_id validation (not null, not empty, model exists)
--   approval_status = 'rejected' (transition guard)
--   optimistic concurrency (p_expected_updated_at)
--
-- Audit:
--   catalog_model_history action = 'REOPEN'
--   before = snapshot before change
--   after  = snapshot after change
--   actor_user_id = auth.uid()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_reopen_model(
  p_canonical_id        text,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.catalog_models
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_row    public.catalog_models;
BEGIN

  -- 1) AUTHORIZATION
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  -- 2) VALIDATION
  IF p_canonical_id IS NULL OR btrim(p_canonical_id) = '' THEN
    RAISE EXCEPTION 'canonical_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 3) LOOKUP
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.canonical_id = btrim(p_canonical_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'model not found: %', p_canonical_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4) OPTIMISTIC CONCURRENCY
  IF p_expected_updated_at IS NOT NULL THEN
    IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION
        'concurrent modification detected: expected updated_at=% but found=% — refresh and retry',
        p_expected_updated_at, v_row.updated_at
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- 5) TRANSITION GUARD — only rejected → draft allowed
  IF v_row.approval_status IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION
      'cannot reopen model %: current approval_status is % (must be rejected)',
      v_row.canonical_id, v_row.approval_status
      USING ERRCODE = '23505';
  END IF;

  -- Snapshot BEFORE mutation.
  v_before := to_jsonb(v_row);

  -- 6) TRANSITION: rejected → draft
  UPDATE public.catalog_models
  SET approval_status = 'draft',
      updated_at      = now()
  WHERE id = v_row.id;

  -- 7) RE-READ FINAL ROW
  SELECT cm.*
    INTO v_row
  FROM public.catalog_models cm
  WHERE cm.id = v_row.id;

  -- 8) AUDIT TRAIL
  INSERT INTO public.catalog_model_history
    (model_id, action, before, after, actor_user_id)
  VALUES
    (v_row.id, 'REOPEN', v_before, to_jsonb(v_row), auth.uid());

  -- 9) RETURN
  RETURN v_row;

END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_reopen_model(text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_reopen_model(text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_reopen_model(text, timestamptz) TO authenticated;


-- ============================================================================
-- 5) catalog_admin_update_variant_specs — edit RAM/storage/region/status
--
-- Edits: ram_mb, storage_gb, region, status
-- Immutable: id, canonical_variant_id (recalculated), model_id, source_type,
--            verified_by, verified_at, created_by, notes
--
-- canonical_variant_id is RECALCULATED from:
--   catalog_variant_id(brand_id, canonical_id, new_ram, new_storage, new_region)
-- Collision check: if new canonical_variant_id already exists for a different
-- variant, the update is rejected.
--
-- History: catalog_variant_history (NOT catalog_model_history)
--   action = 'UPDATE'
--   before = pre-change snapshot
--   after  = post-change snapshot
--
-- Guards:
--   admin authorization
--   variant existence
--   archived variant cannot be edited
--   at least one spec must change
--   ram_mb > 0 if provided
--   storage_gb > 0 if provided
--   status must be valid CHECK value if provided
--   canonical_variant_id collision check
--   optimistic concurrency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_update_variant_specs(
  p_canonical_variant_id  text,
  p_ram_mb                integer      DEFAULT NULL,
  p_storage_gb            integer      DEFAULT NULL,
  p_region                text         DEFAULT NULL,
  p_status                text         DEFAULT NULL,
  p_expected_updated_at   timestamptz  DEFAULT NULL
)
RETURNS public.catalog_variants
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model    public.catalog_models;
  v_row      public.catalog_variants;
  v_before   jsonb;
  v_new_ram  integer;
  v_new_stor integer;
  v_new_reg  text;
  v_new_stat text;
  v_new_cvid text;
  v_changed  boolean := false;
BEGIN

  -- 1) AUTHORIZATION
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  -- 2) VALIDATION
  IF p_canonical_variant_id IS NULL OR btrim(p_canonical_variant_id) = '' THEN
    RAISE EXCEPTION 'canonical_variant_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 3) LOOKUP
  SELECT cv.*
    INTO v_row
  FROM public.catalog_variants cv
  WHERE cv.canonical_variant_id = btrim(p_canonical_variant_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'variant not found: %', p_canonical_variant_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4) ARCHIVED VARIANT GUARD
  IF v_row.status = 'archived' THEN
    RAISE EXCEPTION
      'cannot edit archived variant: restore it first'
      USING ERRCODE = '55000';
  END IF;

  -- 5) OPTIMISTIC CONCURRENCY
  IF p_expected_updated_at IS NOT NULL THEN
    IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION
        'concurrent modification detected: expected updated_at=% but found=% — refresh and retry',
        p_expected_updated_at, v_row.updated_at
        USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Resolve effective new values (NULL = keep current).
  v_new_ram  := COALESCE(p_ram_mb, v_row.ram_mb);
  v_new_stor := COALESCE(p_storage_gb, v_row.storage_gb);
  v_new_reg  := p_region;  -- NULL is a valid region value (means "global")
  v_new_stat := COALESCE(p_status, v_row.status);

  -- 6) SPEC CHANGE DETECTION
  IF v_new_ram  IS DISTINCT FROM v_row.ram_mb
     OR v_new_stor IS DISTINCT FROM v_row.storage_gb
     OR v_new_reg  IS DISTINCT FROM v_row.region
     OR v_new_stat IS DISTINCT FROM v_row.status
  THEN
    v_changed := true;
  END IF;

  IF NOT v_changed THEN
    RAISE EXCEPTION 'no spec changes provided'
      USING ERRCODE = '22023';
  END IF;

  -- 7) FIELD VALIDATION
  IF v_new_ram <= 0 THEN
    RAISE EXCEPTION 'ram_mb must be a positive integer'
      USING ERRCODE = '22023';
  END IF;
  IF v_new_stor <= 0 THEN
    RAISE EXCEPTION 'storage_gb must be a positive integer'
      USING ERRCODE = '22023';
  END IF;
  IF v_new_stat NOT IN ('unverified','known','verified','archived') THEN
    RAISE EXCEPTION 'invalid status: %', v_new_stat
      USING ERRCODE = '22023';
  END IF;

  -- 8) LOOKUP MODEL for canonical_variant_id recalculation
  SELECT cm.*
    INTO v_model
  FROM public.catalog_models cm
  WHERE cm.id = v_row.model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent model not found for variant %', v_row.canonical_variant_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 9) RECALCULATE canonical_variant_id
  v_new_cvid := public.catalog_variant_id(
    v_model.brand_id, v_model.canonical_id,
    v_new_ram, v_new_stor, v_new_reg
  );

  -- 10) COLLISION CHECK — new canonical_variant_id must not exist for a different variant
  IF v_new_cvid IS DISTINCT FROM v_row.canonical_variant_id THEN
    IF EXISTS (
      SELECT 1 FROM public.catalog_variants cv
      WHERE cv.canonical_variant_id = v_new_cvid
        AND cv.id != v_row.id
    ) THEN
      RAISE EXCEPTION
        'canonical_variant_id collision: % already exists for a different variant',
        v_new_cvid
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Snapshot BEFORE mutation.
  v_before := to_jsonb(v_row);

  -- 11) APPLY UPDATE
  UPDATE public.catalog_variants
  SET ram_mb               = v_new_ram,
      storage_gb            = v_new_stor,
      region                = v_new_reg,
      status                = v_new_stat,
      canonical_variant_id  = v_new_cvid,
      updated_at            = now()
  WHERE id = v_row.id;

  -- 12) RE-READ FINAL ROW
  SELECT cv.*
    INTO v_row
  FROM public.catalog_variants cv
  WHERE cv.id = v_row.id;

  -- 13) AUDIT TRAIL (catalog_variant_history, NOT catalog_model_history)
  INSERT INTO public.catalog_variant_history
    (variant_id, action, before, after, actor_user_id)
  VALUES
    (v_row.id, 'UPDATE', v_before, to_jsonb(v_row), auth.uid());

  -- 14) RETURN
  RETURN v_row;

END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_update_variant_specs(text, integer, integer, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_update_variant_specs(text, integer, integer, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_update_variant_specs(text, integer, integer, text, text, timestamptz) TO authenticated;


-- ============================================================================
-- 6) catalog_admin_get_model_history — read-only model audit trail
--
-- Returns catalog_model_history rows for a given model, with actor email.
--
-- Security:
--   SECURITY DEFINER — bypasses RLS on catalog_model_history
--   (catalog_model_history has no read policy; REVOKE ALL FROM anon/authenticated)
--
-- Pagination:
--   p_limit (default 50, max 200)
--   p_offset (default 0, non-negative)
--
-- Ordering:
--   created_at DESC (newest first) — deterministic, not client-configurable
--
-- READ-ONLY: STABLE, no mutations
-- ============================================================================

CREATE OR REPLACE FUNCTION public.catalog_admin_get_model_history(
  p_canonical_id text,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
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
  -- 1) AUTHORIZATION
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  -- 2) VALIDATION
  IF p_canonical_id IS NULL OR btrim(p_canonical_id) = '' THEN
    RAISE EXCEPTION 'canonical_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- Clamp limits to safe range.
  v_lim := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_off := GREATEST(COALESCE(p_offset, 0), 0);

  -- 3) LOOKUP MODEL
  SELECT cm.*
    INTO v_model
  FROM public.catalog_models cm
  WHERE cm.canonical_id = btrim(p_canonical_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'model not found: %', p_canonical_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4) RETURN HISTORY with actor email
  RETURN QUERY
  SELECT
    h.id,
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

REVOKE ALL ON FUNCTION public.catalog_admin_get_model_history(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_get_model_history(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_get_model_history(text, integer, integer) TO authenticated;


-- ============================================================================
-- DONE — 19 P3 MANAGEMENT FOUNDATION.
--
-- New objects created:
--   1 index: catalog_models_approval_status_idx
--   1 constraint change: catalog_model_history_action_check (+REOPEN)
--   4 RPCs:
--     catalog_admin_list_variants(text, uuid)  — updated signature
--     catalog_admin_reopen_model(text, timestamptz) — new
--     catalog_admin_update_variant_specs(text, integer, integer, text, text, timestamptz) — new
--     catalog_admin_get_model_history(text, integer, integer) — new
--
-- No existing table data modified.
-- No P2 RPCs modified.
--
-- Verify with: 20-catalog-p3-verify.sql
-- Rollback with: 19-catalog-p3-management-foundation-rollback.sql
-- ============================================================================
