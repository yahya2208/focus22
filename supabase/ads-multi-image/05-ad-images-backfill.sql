-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE BACKFILL (Phase B)
--
-- Type: DATA (INSERT only). DRAFT FOR REVIEW — NOT EXECUTED.
-- Run as postgres in the Supabase SQL Editor, AFTER 01-ads-multi-image-apply.sql,
-- only after the owner's Phase B GO.
--
-- PURPOSE
--   Existing single-image ads keep working unchanged (acceptance criterion #6).
--   Each legacy ad with a non-empty image_path becomes a one-image gallery:
--   position 0, is_cover TRUE, created_at = the ad's updated_at (stable order).
--
-- GUARANTEES
--   * ALL-OR-NOTHING: one transaction. A single multi-row INSERT is atomic in
--     PostgreSQL; any row violating the unique (ad_placement, path) constraint
--     aborts the whole statement → 0 rows committed. The guard below then
--     ROLLBACKs if the committed count does not match the pre-apply legacy
--     count from 03-pre-apply-evidence.sql check 7.
--   * No file moves: rows reference the SAME storage objects that ads
--     already render today.
--   * No RPC is used: ad_add_image requires an admin session; a one-shot
--     maintenance backfill runs as postgres.
--   * ON CONFLICT (ad_placement, path) DO NOTHING makes the backfill re-runnable.
--
-- NOTE ON THE MIRROR
--   The mirror-sync trigger (01 file) fires per inserted row and recomputes
--   ads.image_path from ad_images. For backfilled ads the cover IS image_path,
--   so ads.image_path is unchanged and image_url is blanked (derived at render
--   from image_path via publicImageUrl — same value, so no visual change).
--
-- Rollback: run 02-ads-multi-image-rollback.sql.
-- Verify: 04-post-apply-verify.sql (checks 12–14).
-- ============================================================================

BEGIN;

-- Insert: one row per legacy ad that has an image (position 0, cover). Ads
-- WITHOUT an image get NO ad_images row (nothing fabricated). ON CONFLICT makes
-- the statement re-runnable — a repeated run inserts nothing new.
INSERT INTO public.ad_images (ad_placement, path, position, is_cover, created_at)
SELECT placement, image_path, 0, TRUE, COALESCE(updated_at, now())
FROM public.ads
WHERE image_path IS NOT NULL AND image_path <> ''
ON CONFLICT (ad_placement, path) DO NOTHING;

-- Guard (AFTER the insert, same transaction): legacy ads with an image must be
-- mirrored 1:1. Any mismatch forces ROLLBACK of the whole transaction — a failed
-- run can never leave a half backfill. Expected count = 03-pre-apply-evidence
-- check 7 (run before apply) / 04-post-apply-verify check 12 (run after).
DO $$
DECLARE
  v_legacy  integer;
  v_mirrored integer;
BEGIN
  SELECT count(*) INTO v_legacy
  FROM public.ads WHERE image_path IS NOT NULL AND image_path <> '';

  SELECT count(*) INTO v_mirrored
  FROM public.ad_images;

  IF v_legacy <> v_mirrored THEN
    RAISE EXCEPTION 'backfill incomplete: legacy ads with image = % but ad_images rows = %',
      v_legacy, v_mirrored;
  END IF;
END $$;

COMMIT;
