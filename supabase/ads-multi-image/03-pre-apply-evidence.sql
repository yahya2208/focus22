-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE PRE-APPLY EVIDENCE (Phase B). Run BEFORE
-- 01-ads-multi-image-apply.sql. Capture current state to prove the migration
-- is additive and reversible. Run as postgres (SQL Editor) and save output.
--
-- PASS CRITERIA (all must hold before apply is authorized):
--   1) table ad_images ABSENT (the migration is additive)
--   2) zero public.ad_% RPC functions (ad_is_admin / ad_add_image /
--      ad_remove_image / ad_replace_images must not exist yet)
--   3) zero public.sync_ads_image_mirror() triggers
--   4) baseline that MUST exist: public.ads (placement PK), public.users
--      with >= 1 admin/super_admin, bucket 'ads-images'
--   5) storage policies for 'ads-images' are the 4 ORIGINAL 00015 policies
--      (the 00020 apply REPLACES the upload policy, so capture the pre-image)
--   6) realtime: ad_images must NOT yet be a member of supabase_realtime
--   7) legacy image count = ads with image_path <> '' (backfill target in
--      05-ad-images-backfill.sql; 04-post-apply-verify.sql check 17 expects
--      the same count in ad_images)
-- ============================================================================

SELECT current_database() AS db, current_user AS role, now() AS captured_at;

-- 1) ad_images must NOT already exist (would make this NON-additive).
SELECT 'ad_images' AS table_name, to_regclass('public.ad_images')::text AS state;

-- 2) ad_% RPCs that must NOT already exist.
SELECT p.oid::regprocedure::text AS function
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'ad\_%'
ORDER BY function;

-- 3) Mirror-sync trigger that must NOT already exist.
SELECT tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND tgname = 'trg_ad_images_mirror';

-- 4a) Baseline: ads table with placement PK.
SELECT 'ads' AS table_name, to_regclass('public.ads')::text AS state;

-- 4b) Baseline: at least one admin/super_admin.
SELECT count(*) AS admin_count
FROM public.users WHERE role IN ('admin','super_admin');

-- 4c) Baseline: bucket 'ads-images' exists. B-2: the public flag is captured
--     here. Expect public = TRUE — the bucket has been PUBLIC since 00015:87-89,
--     so RLS on ad_images is NOT the boundary for direct file access. The
--     accepted access model (D-ADS-6): public bucket + DB-level gating of the
--     gallery listing. If a stricter "unpublished images unreachable" model is
--     required, that needs a private bucket + signed URLs (separate decision).
SELECT id, public FROM storage.buckets WHERE id = 'ads-images';

-- 5) Original 00015 storage policies on ads-images (expect the 4 ORIGINAL).
SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('Public read ads-images','Staff upload ads-images',
                     'Staff update ads-images','Staff delete ads-images')
ORDER BY policyname;

-- 6) Realtime pre-condition: ad_images must NOT be a publication member yet
--    (would make the guarded ALTER PUBLICATION a no-op and break additivity).
SELECT 'already_member' AS check_name, count(*) AS members
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'ad_images';

-- 7) Legacy single-image baseline — the backfill target count (05 file).
SELECT count(*) AS ads_with_image
FROM public.ads WHERE image_path IS NOT NULL AND image_path <> '';
