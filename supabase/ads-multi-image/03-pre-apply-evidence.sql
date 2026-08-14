-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE PRE-APPLY EVIDENCE (Phase B). Run BEFORE
-- 01-ads-multi-image-apply.sql. Capture current state so we can prove the
-- migration is additive and reversible. Run as postgres (SQL Editor) and save
-- the output. Save output as evidence.
--
-- PASS CRITERIA (all must hold before apply is authorized):
--   1) table ad_images absent (would make the migration NON-additive)
--   2) zero public.ad_% functions AND sync_ads_image_mirror absent
--   3) bucket 'ads-images' EXISTS (00015 baseline) with its 4 policies; the
--      upload policy is the one the apply REPLACES in place (same name)
--   4) realtime: ad_images NOT yet a member of the EXISTING supabase_realtime
--      publication (the apply adds it there; it NEVER creates a new publication)
--   5) public.users exists with >= 1 admin/super_admin (baseline for ad_is_admin)
--   6) gen_random_uuid() available (used by ad_images.id) and users.id is uuid
--   7) legacy ads with a non-empty image_path — the exact count the backfill
--      guard in 05-ad-images-backfill.sql compares against (must match
--      04-post-apply-verify.sql check 12 after the backfill)
-- ============================================================================

SELECT current_database() AS db, current_user AS role, now() AS captured_at;

-- 1) ad_images must NOT already exist (would make the migration NON-additive).
SELECT 'ad_images' AS table_name, to_regclass('public.ad_images')::text AS state;

-- 2) Functions that must NOT already exist (the RPC suite is CREATE OR REPLACE,
--    so absence is required to prove additivity of the whole migration).
SELECT p.oid::regprocedure::text AS function
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'ad\_%'
ORDER BY function;

-- 2b) The mirror helper is NOT ad_% prefixed, so check it separately.
SELECT 'sync_ads_image_mirror' AS function,
       to_regprocedure('public.sync_ads_image_mirror()')::text AS state;

-- 3) Storage baseline from 00015: bucket EXISTS and the 4 named policies exist.
--    The upload policy is replaced in place by the apply (hardened CHECK); the
--    other three keep their 00015 shape.
SELECT 'bucket_exists' AS check_name, count(*) AS ok
FROM storage.buckets WHERE id = 'ads-images';

SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('Public read ads-images','Staff upload ads-images',
                     'Staff update ads-images','Staff delete ads-images')
ORDER BY policyname;

-- 4) Realtime pre-condition: ad_images must NOT already be a member of the
--    existing supabase_realtime publication (would make the ALTER PUBLICATION
--    a no-op and break the additivity proof).
SELECT 'already_member' AS check_name, count(*) AS members
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename = 'ad_images';

-- 5) Baseline that MUST exist: users table with at least one admin/super_admin.
SELECT count(*) AS admin_count
FROM public.users WHERE role IN ('admin','super_admin');

-- 6) UUID generator availability (ad_images.id uses gen_random_uuid()) and the
--    users.id column type (FK updated_by / role baseline is uuid).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p WHERE p.proname = 'gen_random_uuid';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id';

-- 7) Legacy ads with a non-empty image_path. The backfill (05) mirrors each of
--    these as a one-image gallery (position 0, is_cover TRUE), and its guard
--    rolls back unless the resulting ad_images count equals this number.
SELECT count(*) AS legacy_ads_with_image
FROM public.ads WHERE image_path IS NOT NULL AND image_path <> '';
