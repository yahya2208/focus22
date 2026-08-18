-- ============================================================================
-- FOCUS — CATALOG CENTRAL (05 — ROLLBACK for catalog_create_model RPC)
--
-- Reverses 05-catalog-create-model-rpc-apply.sql ONLY. Does not touch any
-- other catalog object, inventory, RLS, or the Golden Catalog.
-- Run as `postgres` in the Supabase SQL Editor.
-- ============================================================================

DROP FUNCTION IF EXISTS public.catalog_create_model(text, text, text, integer, text[], text[]);
DROP FUNCTION IF EXISTS public.catalog_model_id(text, text);

-- ============================================================================
-- END OF 05 ROLLBACK.
-- ============================================================================
