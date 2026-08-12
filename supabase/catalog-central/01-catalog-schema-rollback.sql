-- ============================================================================
-- FOCUS — CATALOG CENTRAL (GATE 1 — SCHEMA ROLLBACK)
--
-- Exact reverse of 01-catalog-schema-apply.sql. Idempotent (IF EXISTS).
-- Run ONLY if the owner aborts GATE 1. ERASES catalog schema objects.
-- The GATE 2 seed (02-catalog-seed-runtime.sql) must NOT have run — if it did,
-- stop: the seed rows are dropped by the table drops below; verify first.
-- inventory_items and every Phase 2C object are UNTOUCHED.
-- ============================================================================

-- 1) Admin / read RPCs (drop before tables — they depend on table row types).
DROP FUNCTION IF EXISTS public.catalog_reconciliation_report();
DROP FUNCTION IF EXISTS public.catalog_get_variant_history(text);
DROP FUNCTION IF EXISTS public.catalog_admin_list_variants(text);
DROP FUNCTION IF EXISTS public.catalog_archive_variant(text, text);
DROP FUNCTION IF EXISTS public.catalog_verify_variant(text, timestamptz);
DROP FUNCTION IF EXISTS public.catalog_create_variant(text, integer, integer, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.catalog_resolve_model(text, text);
DROP FUNCTION IF EXISTS public.catalog_get_model_variants(text, text);
DROP FUNCTION IF EXISTS public.catalog_is_admin();

-- 2) Identity helpers (internal).
DROP FUNCTION IF EXISTS public.catalog_variant_id(text, text, integer, integer, text);
DROP FUNCTION IF EXISTS public.catalog_storage_label(integer);
DROP FUNCTION IF EXISTS public.catalog_ram_label(integer);
DROP FUNCTION IF EXISTS public.catalog_fnv1a_hash(text);

-- 3) Tables (reversed dependency order). Indexes + policies drop with them.
DROP TABLE IF EXISTS public.catalog_variant_history;
DROP TABLE IF EXISTS public.catalog_variants;
DROP TABLE IF EXISTS public.catalog_models;

-- 4) Fail-closed confirmation.
DO $$
BEGIN
  IF to_regclass('public.catalog_models') IS NOT NULL
     OR to_regclass('public.catalog_variants') IS NOT NULL
     OR to_regclass('public.catalog_variant_history') IS NOT NULL THEN
    RAISE EXCEPTION 'GATE1 ROLLBACK FAIL: catalog tables still present';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'catalog\_%') THEN
    RAISE EXCEPTION 'GATE1 ROLLBACK FAIL: catalog functions still present';
  END IF;
  RAISE NOTICE 'GATE1 ROLLBACK PASS: catalog schema fully removed; inventory untouched.';
END $$;

-- ============================================================================
-- END OF GATE 1 ROLLBACK
-- ============================================================================
