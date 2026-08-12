-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE ROLLBACK (Phase B — REVERSED ORDER)
-- Exact reverse of 01-ads-multi-image-apply.sql. Idempotent.
-- DROP ... IF EXISTS / guarded DO blocks.
-- Run only if the owner aborts the migration after it was applied.
--
-- WHAT SURVIVES THIS ROLLBACK
--   * public.ads rows and ads.image_path / image_url (mirror) — untouched.
--   * All bucket objects in storage.buckets 'ads-images' — untouched.
--     (B-1: the ad_* RPCs NEVER delete storage objects. Files are deleted by the
--     client via the Storage API after a successful RPC; this rollback file also
--     never deletes any object.)
--   * 00015 storage policies "Public read/Staff update/Staff delete ads-images"
--     and the "Public read ads-images" SELECT policy — untouched.
--
-- WHAT IS ERASED
--   * ad_images rows (all placements) + the mirror-sync trigger.
--   * The 4 ad_* RPCs + grants.
--   * The hardened 00020 upload policy (original 00015 upload policy restored
--     VERBATIM below so storage behavior returns exactly to pre-migration).
--   * ad_images membership in supabase_realtime.
-- ============================================================================

-- 1) Mirror-sync trigger + helper (dependent function first)
DROP TRIGGER IF EXISTS trg_ad_images_mirror ON public.ad_images;
DROP FUNCTION IF EXISTS public.sync_ads_image_mirror();

-- 2) ad_images table (drops its RLS policies + indexes + constraints with it)
DROP TABLE IF EXISTS public.ad_images;

-- 3) RPCs (grants/REVOKEs disappear with the functions)
DROP FUNCTION IF EXISTS public.ad_is_admin();
DROP FUNCTION IF EXISTS public.ad_add_image(text, text, integer, boolean);
DROP FUNCTION IF EXISTS public.ad_remove_image(uuid);
DROP FUNCTION IF EXISTS public.ad_replace_images(text, text[], boolean[]);

-- 4) Storage upload policy — restore the 00015 version VERBATIM
--    (00015_ads_tables.sql:97-103).
DROP POLICY IF EXISTS "Staff upload ads-images" ON storage.objects;
CREATE POLICY "Staff upload ads-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- 5) Realtime — remove ad_images from the existing publication (guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ad_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.ad_images;
  END IF;
END $$;
