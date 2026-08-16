-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DESTINATIONS (PHASE 4A) — PRE-APPLY EVIDENCE (read-only)
--
-- Run as postgres in the Supabase SQL Editor and save the output BEFORE
-- executing 01-ads-slide-destinations-apply.sql.
--
-- PASS CRITERIA (all must hold before 00024 is applied):
--   1) ad_images.destination_type / ad_images.destination columns ABSENT
--      (proves the change is additive).
--   2) the new RPC ad_replace_images_destinations ABSENT (no partial
--      apply/reapply side effects).
--   3) the new CHECK constraint ad_images_destination_type_valid ABSENT.
--   4) the 00021 contract is PRESENT (device_id column + its format CHECK +
--      the two 00021 RPCs) — 00024 is a SUPERSET, never a replacement.
--   5) ad_images row count + placement distribution — baseline for the
--      post-apply verify (must be identical after apply: additive, NULL/NULL).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL.
-- ============================================================================

SELECT current_database() AS db, current_user AS role, now() AS captured_at;

-- 1) destination columns must NOT exist yet on ad_images.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ad_images'
  AND column_name IN ('destination_type', 'destination')
ORDER BY column_name;

-- 2) the new RPC must NOT exist yet.
SELECT p.oid::regprocedure::text AS existing_rpc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'ad_replace_images_destinations';

-- 3) the new CHECK constraint must NOT exist yet.
SELECT conname
FROM pg_constraint
WHERE conname = 'ad_images_destination_type_valid';

-- 4) the 00021 contract is present (superset baseline).
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ad_images'
  AND column_name = 'device_id';

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'ad_images_device_id_format';

SELECT p.oid::regprocedure::text AS existing_rpc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_add_image_devices', 'ad_replace_images_devices')
ORDER BY 1;

-- 5) baseline rows + placement distribution (post-apply must match exactly).
SELECT ad_placement, COUNT(*) AS images
FROM public.ad_images
GROUP BY ad_placement
ORDER BY ad_placement;

SELECT COUNT(*) AS total_ad_images FROM public.ad_images;
