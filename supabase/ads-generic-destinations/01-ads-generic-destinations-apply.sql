-- ============================================================================
-- FOCUS — ADS · GENERIC DESTINATIONS (PHASE 1 FOUNDATION) — APPLY
--
-- Type: Additive (ADD COLUMN + ADD CONSTRAINT). One-shot, guarded.
-- Mirrors: supabase/migrations/00022_generic_ads_destinations.sql
-- Executed by: OWNER in the Supabase SQL editor (project workflow).
--
-- PURPOSE
--   Prepare the existing ads system to support multiple destination types in
--   the future WITHOUT breaking any existing phone ad or the working
--   multi-image carousel. Database foundation only — no resolvers, no
--   adapters, no External/WhatsApp/Internal destinations, no Ads Manager
--   changes, no scheduling, no entity destinations, no ad rotation yet.
--
-- BACKWARD COMPATIBILITY (MANDATORY)
--   Existing rows are backfilled automatically by the column defaults:
--     destination_type = 'phone' · destination = '{}' · title = ''
--   Every existing phone ad keeps working exactly as it does now. No manual
--   re-entry required.
--
-- SAFETY
--   * ADD COLUMN IF NOT EXISTS + guarded ADD CONSTRAINT — safe to run once.
--   * The CHECK is VALIDATED (not NOT VALID) because the DEFAULT backfill
--     guarantees every existing row is already 'phone' at creation time.
--   * Nothing else is touched: ad_images, placement PK, image_path/image_url,
--     device_id, link, the 5 existing phone CHECKs, the image mirror trigger,
--     storage policies, RLS policies, existing ad RPCs.
--
-- IMPORTANT: 00020 / 00021 are HISTORICAL RECORDS of already-applied changes.
-- Do NOT re-run them. This script is additive against the CURRENT LIVE schema.
--
-- Rollback: see 02-ads-generic-destinations-rollback.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) destination_type — discriminator (default 'phone' preserves every
--    existing phone ad exactly).
-- ----------------------------------------------------------------------------
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS destination_type TEXT NOT NULL DEFAULT 'phone';

-- ----------------------------------------------------------------------------
-- 2) destination — per-type payload (JSONB). Empty object for phone ads.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS destination JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 3) title — generic headline/title for any ad type (optional).
-- ----------------------------------------------------------------------------
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------------------
-- 4) CHECK — allowed destination_type values only (validated; see header).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_destination_type_valid') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_destination_type_valid
      CHECK (destination_type IN ('phone', 'external', 'internal', 'whatsapp'));
  END IF;
END $$;

-- ============================================================================
-- Done. Run 04-post-apply-verify.sql next (read-only).
-- ============================================================================
