-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DEVICE — PRE-APPLY EVIDENCE (run BEFORE 01-apply)
--
-- Run as postgres in the Supabase SQL Editor and save the output.
-- PASS CRITERIA (all must hold before 00021 is applied):
--   1) ad_images.device_id column ABSENT (proves the change is additive).
--   2) the two new RPC names ABSENT (no partial apply/reapply side effects).
--   3) ad_images row count is unchanged and sane (baseline for post-apply
--      verify: 6 backfilled rows expected for the 6 placements).
-- ============================================================================

SELECT current_database() AS db, current_user AS role, now() AS captured_at;

-- 1) device_id must NOT exist yet on ad_images.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ad_images'
  AND column_name = 'device_id';

-- 2) the new RPCs must NOT exist yet.
SELECT p.oid::regprocedure::text AS existing_rpc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_add_image_devices','ad_replace_images_devices');

-- 3) baseline rows + placement distribution.
SELECT ad_placement, COUNT(*) AS images
FROM public.ad_images
GROUP BY ad_placement
ORDER BY ad_placement;

SELECT COUNT(*) AS total_ad_images FROM public.ad_images;
