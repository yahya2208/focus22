-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DEVICE — ROLLBACK
--
-- Removes the per-slide device column + constraints + the two new RPCs.
-- Restores ad_images to the 00020 shape. All destructive statements are
-- guarded by name so a rerun is a no-op.
--
-- DATA IMPACT: drops ad_images.device_id (per-slide assignments are lost).
--   ads.* and 00020 RPCs are untouched.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ad_add_image_devices(text, text, integer, boolean, text);
DROP FUNCTION IF EXISTS public.ad_replace_images_devices(text, text[], boolean[], text[]);

ALTER TABLE public.ad_images DROP CONSTRAINT IF EXISTS ad_images_device_id_format;

ALTER TABLE public.ad_images DROP COLUMN IF EXISTS device_id;
