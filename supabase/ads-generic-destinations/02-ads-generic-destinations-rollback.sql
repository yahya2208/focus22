-- ============================================================================
-- FOCUS — ADS · GENERIC DESTINATIONS (PHASE 1 FOUNDATION) — ROLLBACK
--
-- Exact one-shot rollback of 00022_generic_ads_destinations.sql.
--   DROP ads_destination_type_valid constraint, then DROP the 3 columns.
--
-- WARNING:
--   * DROP COLUMN destination / destination_type / title discards any values
--     written into them (in this phase they only ever hold defaults: 'phone',
--     '{}', '' — so nothing is lost unless a later phase populated them).
--   * Nothing else is rolled back: the existing phone CHECKs, the mirror
--     trigger, RLS, storage, and RPCs are untouched by this phase and are NOT
--     affected by this rollback.
--
-- Run ONLY if the apply must be reverted. Owner execution in the SQL editor.
-- ============================================================================

-- 1) constraint
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_destination_type_valid;

-- 2) columns
ALTER TABLE public.ads DROP COLUMN IF EXISTS destination_type;
ALTER TABLE public.ads DROP COLUMN IF EXISTS destination;
ALTER TABLE public.ads DROP COLUMN IF EXISTS title;

-- ============================================================================
-- Done. Verify with 03-pre-apply-evidence.sql (Sections A/A2/B should match the
-- original pre-apply baseline).
-- ============================================================================
