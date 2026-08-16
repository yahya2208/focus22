-- ============================================================================
-- FOCUS — CATALOG CENTRAL (11 — ADMIN SCHEMA: approval_status + owner_notes)
--
-- Type: ALTER TABLE ADD COLUMN only. Additive, fail-closed.
-- Run as `postgres` in the Supabase SQL Editor.
--
-- SCOPE (owner mandate, Canonical Catalog Admin P0)
--   * Add approval_status + owner_notes to catalog_models.
--   * Add catalog_model_history for audit trail of model edits.
--   * No catalog_variants changes.
--   * No inventory_items changes.
--
-- Safety:
--   * Additivity guard: fails if columns already exist.
--   * Default approval_status = 'draft' (safe — no existing row gets
--     a state that bypasses any future approval gate).
--   * No row UPDATE statements — only ADD COLUMN / CREATE TABLE.
-- ============================================================================

-- 0) ADDITIVITY GUARD
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_models'
      AND column_name = 'approval_status'
  ) THEN
    RAISE EXCEPTION '11 FAIL: catalog_models.approval_status already exists (not additive)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_models'
      AND column_name = 'owner_notes'
  ) THEN
    RAISE EXCEPTION '11 FAIL: catalog_models.owner_notes already exists (not additive)';
  END IF;
  IF to_regclass('public.catalog_model_history') IS NOT NULL THEN
    RAISE EXCEPTION '11 FAIL: catalog_model_history already exists (not additive)';
  END IF;
END $$;

-- 1) ADD COLUMNS to catalog_models
ALTER TABLE public.catalog_models
  ADD COLUMN approval_status text NOT NULL DEFAULT 'draft'
    CONSTRAINT catalog_models_approval_status_check
    CHECK (approval_status IN ('draft','approved','rejected'));

ALTER TABLE public.catalog_models
  ADD COLUMN owner_notes text NULL;

COMMENT ON COLUMN public.catalog_models.approval_status IS 'Owner approval gate: draft -> approved (requires >=1 valid variant). Rejected = explicit denial.';
COMMENT ON COLUMN public.catalog_models.owner_notes IS 'Owner notes for model-level context. Free text, nullable.';

-- 2) CATALOG_MODEL_HISTORY — append-only audit trail of model edits.
--    Mirrors catalog_variant_history pattern.
CREATE TABLE public.catalog_model_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      uuid NOT NULL
                REFERENCES public.catalog_models (id) ON DELETE CASCADE,
  action        text NOT NULL
                CONSTRAINT catalog_model_history_action_check
                CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT')),
  before        jsonb NULL,
  after         jsonb NULL,
  actor_user_id uuid NULL REFERENCES public.users (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalog_model_history IS 'Append-only audit trail of model edits; written only by admin RPCs.';

CREATE INDEX catalog_model_history_model_created_idx
  ON public.catalog_model_history (model_id, created_at DESC);
CREATE INDEX catalog_model_history_action_idx
  ON public.catalog_model_history (action);

-- 3) RLS + GRANTS on catalog_model_history
--    No public read policy — admin RPC only.
ALTER TABLE public.catalog_model_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catalog_model_history FROM anon, authenticated;

-- ============================================================================
-- DONE — 11 ADMIN SCHEMA APPLY.
--   Verify with 11-catalog-admin-schema-verify.sql.
--   Roll back with 11-catalog-admin-schema-rollback.sql.
-- ============================================================================
