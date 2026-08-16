-- ============================================================================
-- FOCUS — MIGRATION 00022 · GENERIC ADS DESTINATIONS (additive foundation)
--
-- Type: Additive (ADD COLUMN + ADD CONSTRAINT ONLY). One-shot, guarded.
--
-- PURPOSE
--   Prepare the existing ads system to support multiple destination types in
--   the future WITHOUT breaking any existing phone ad or the working
--   multi-image carousel. This is the database foundation of the "Generic Ads
--   System" (PHASE 1). No resolver / adapter / UI work is included here.
--
--   New columns on public.ads (all with backward-compatible defaults):
--     * destination_type TEXT  NOT NULL DEFAULT 'phone'   — discriminator.
--     * destination     JSONB  NOT NULL DEFAULT '{}'      — per-type payload.
--     * title           TEXT   NOT NULL DEFAULT ''
--
--   BACKWARD COMPATIBILITY (MANDATORY)
--     * Existing rows are backfilled automatically by the column defaults:
--         destination_type = 'phone' · destination = '{}' · title = ''
--       No existing advertisement requires manual re-entry.
--     * The app reads ads via SELECT * (src/services/ads-service.ts:183) —
--       the new columns are additive and ignored by the current render path.
--
--   CHECK CONSTRAINT (VALIDATED — safe on existing rows)
--     * ads_destination_type_valid: destination_type IN
--       ('phone','external','internal','whatsapp').
--     * Validated (not NOT VALID) because the DEFAULT backfill guarantees every
--       existing row satisfies it at creation time.
--
--   EXPLICITLY NOT TOUCHED (per PHASE 1 scope)
--     * public.ad_images — column list unchanged, multi-image architecture
--       unchanged (destination column deferred to a later phase).
--     * ads.placement primary key · image_path · image_url · device_id · link.
--     * Existing phone-related CHECK constraints (ads_enabled_requires_link,
--       ads_phone_link_requires_device, ads_device_id_format,
--       ads_phone_link_matches_device, ads_device_requires_phone_link).
--     * sync_ads_image_mirror / trg_ad_images_mirror · storage policies ·
--       RLS policies · existing ad RPCs (ad_add_image, ad_remove_image,
--       ad_replace_images, ad_replace_images_devices, ...).
--
--   IMPORTANT: migrations/00020_* and 00021_* are HISTORICAL RECORDS of
--   already-applied changes — DO NOT re-run them. 00022 is additive against
--   the CURRENT LIVE schema only.
--
-- Rollback: see supabase/ads-generic-destinations/02-*-rollback.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) destination_type — destination discriminator (default 'phone' preserves
--    the exact behavior of every existing phone ad).
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
-- 4) CHECK — allowed destination_type values only. Validated (not NOT VALID):
--    the default backfill guarantees all existing rows are already 'phone'.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_destination_type_valid') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_destination_type_valid
      CHECK (destination_type IN ('phone', 'external', 'internal', 'whatsapp'));
  END IF;
END $$;

-- ============================================================================
-- Done. Run supabase/ads-generic-destinations/04-post-apply-verify.sql next.
-- ============================================================================
