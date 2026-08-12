-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE POST-APPLY VERIFY (Phase B). Run AFTER
-- 01-ads-multi-image-apply.sql AND 05-ad-images-backfill.sql.
-- Every check should return the expected result. Save output as evidence.
-- ============================================================================

-- 1) Table exists.
SELECT '01_table' AS check, count(*) AS ok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'ad_images' AND c.relkind = 'r';

-- 2) RLS enabled.
SELECT '02_rls' AS check, count(*) AS ok
FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ad_images' AND rowsecurity = TRUE;

-- 3) Read policy for enabled ads exists; no write policies on the table.
SELECT '03_read_policy' AS check, count(*) AS ok
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ad_images'
  AND policyname = 'Public read enabled ad images';

SELECT '04_no_write_policies' AS check, count(*) AS ok
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ad_images'
  AND cmd IN ('INSERT','UPDATE','DELETE');

-- 5) Indexes (position+created_at, unique cover).
SELECT '05_indexes' AS check, count(*) AS ok
FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ad_images'
  AND indexname IN ('idx_ad_images_ad','uq_ad_images_cover');

-- 6) Mirror trigger exists.
SELECT '06_mirror_trigger' AS check, count(*) AS ok
FROM pg_trigger WHERE tgname = 'trg_ad_images_mirror';

-- 7) Exactly 4 ad_% RPCs.
SELECT '07_rpcs' AS check, count(*) AS ok
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'ad\_%';

-- 8) Defense in depth: NO ad_% function executable by PUBLIC. Expect 0 leaks.
SELECT '08_no_public_exec' AS check, count(*) AS leaked
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'ad\_%'
  AND (p.proacl IS NULL OR EXISTS (
    SELECT 1 FROM unnest(p.proacl) AS a WHERE (a)::text LIKE '=X/%'
  ));

-- 9) Storage policies still total 4 for ads-images (upload policy was
--    REPLACED in place, same name, hardened CHECK).
SELECT '09_storage_policies' AS check, count(*) AS ok
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('Public read ads-images','Staff upload ads-images',
                     'Staff update ads-images','Staff delete ads-images');

-- 10) Hardened upload policy: the CHECK now references ads-images/% AND a real
--     ads placement (the new defense-in-depth condition). Expect >= 1 rule whose
--     CHECK expression text mentions the ads-placement join.
SELECT '10_hardened_upload_policy' AS check, count(*) AS ok
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'Staff upload ads-images'
  AND with_check::text ILIKE '%placement%';

-- 11) Realtime: ad_images is a member of supabase_realtime. Expect 1.
SELECT '11_realtime' AS check, count(*) AS ok
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename = 'ad_images';

-- 12) Backfill: every legacy ad image now has exactly one ad_images row
--     (position 0, is_cover TRUE). Expect same count as 03 check 7.
SELECT '12_backfill_rows' AS check, count(*) AS ok
FROM public.ad_images
WHERE is_cover = TRUE AND position = 0;

-- 13) Mirror invariant: for every placement that HAS ad_images rows,
--     ads.image_path equals that placement's cover path. Expect 0 mismatches.
SELECT '13_mirror_invariant' AS check, count(*) AS mismatches
FROM public.ads a
WHERE EXISTS (SELECT 1 FROM public.ad_images i WHERE i.ad_placement = a.placement)
  AND a.image_path <> COALESCE((
    SELECT i2.path FROM public.ad_images i2
    WHERE i2.ad_placement = a.placement
    ORDER BY i2.is_cover DESC, i2.position ASC, i2.created_at ASC
    LIMIT 1
  ), '');

-- 14) Placement-count sanity: every ad_images placement is a real ad
--     (FK guarantees this; evidence anyway). Expect 0.
SELECT '14_orphan_placements' AS check, count(*) AS orphans
FROM public.ad_images i
WHERE NOT EXISTS (SELECT 1 FROM public.ads a WHERE a.placement = i.ad_placement);

-- 15) B-1: NO ad_% RPC may contain a direct DELETE FROM storage.objects.
--     Storage files are deleted by the CLIENT via the Storage API only.
--     Expect 0 violations.
SELECT '15_no_storage_delete_in_rpcs' AS check, count(*) AS violations
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'ad\_%'
  AND p.prosrc ~* 'delete\s+from\s+storage\.objects';

-- 16) B-2: bucket access model recorded. ads-images is PUBLIC (TRUE) since
--     00015:87-89; RLS on ad_images gates only the gallery listing (D-ADS-6).
--     Expect 1 (the bucket row with public = TRUE).
SELECT '16_bucket_public' AS check, count(*) AS ok
FROM storage.buckets
WHERE id = 'ads-images' AND public = TRUE;
