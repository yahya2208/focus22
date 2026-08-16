-- ============================================================================
-- FOCUS — CATALOG CENTRAL (11 — ADMIN SCHEMA ROLLBACK)
-- Type: DROP COLUMN + DROP TABLE. Companion to 11-catalog-admin-schema-apply.sql.
-- Run as `postgres` in the Supabase SQL Editor.
-- WARNING: destroys approval_status, owner_notes, catalog_model_history.
-- ============================================================================

DROP TABLE IF EXISTS public.catalog_model_history CASCADE;
ALTER TABLE public.catalog_models DROP COLUMN IF EXISTS approval_status;
ALTER TABLE public.catalog_models DROP COLUMN IF EXISTS owner_notes;

-- ============================================================================
-- DONE — 11 ADMIN SCHEMA ROLLBACK.
-- ============================================================================
