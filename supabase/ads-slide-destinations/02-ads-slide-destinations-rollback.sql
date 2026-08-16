-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DESTINATIONS (PHASE 4A) — ROLLBACK
--
-- Removes the per-slide destination columns + constraint + the new RPC.
-- Restores ad_images to the 00021 shape. All destructive statements are
-- guarded by name so a rerun is a no-op.
--
-- DATA IMPACT: drops ad_images.destination_type and ad_images.destination
--   (per-slide destination assignments are lost). ads.*, 00020/00021/00022/00023
--   and the legacy RPCs (ad_replace_images, ad_add_image_devices,
--   ad_replace_images_devices) are untouched.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ad_replace_images_destinations(text, text[], boolean[], text[], text[], jsonb[]);

ALTER TABLE public.ad_images DROP CONSTRAINT IF EXISTS ad_images_destination_type_valid;

ALTER TABLE public.ad_images DROP COLUMN IF EXISTS destination_type;

ALTER TABLE public.ad_images DROP COLUMN IF EXISTS destination;
