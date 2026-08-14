-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE (MIGRATION 00020 — FILE ONLY, NOT EXECUTED)
--
-- Migration number: 00020 (00016-00019 are already taken by placements/inventory).
-- Source of truth: supabase/ads-multi-image/01-ads-multi-image-apply.sql (Phase B).
--   This file is the migration-format copy; keep the two in sync.
-- Type: Additive (CREATE TABLE / FUNCTION / INDEX / POLICY / TRIGGER / PUBLICATION only)
-- Status: PHASE B PREPARED FILE ONLY. NOT EXECUTED. NOT MIGRATED.
--   Do NOT run until the owner authorizes the Phase B (multi-image) GO.
--
-- PURPOSE
--   Give every ad placement an ordered multi-image set. Canonical = ad_images.
--   ads.image_path/image_url become a COMPATIBILITY MIRROR of the cover only:
--     * written ONLY by the ad RPCs / the sync trigger — never by the app and
--       never independently;
--     * image_url is derived (kept as '' and computed at render from image_path
--       via publicImageUrl in src/services/ads-service.ts) so only ONE stored
--       value exists (image_path mirror);
--     * conflict rule: ad_images WINS. The mirror is recomputed on every change;
--     * when a placement has no ad_images row, the trigger does nothing and the
--       legacy fields are left untouched during the transition.
--
-- SECURITY (mirrors the 00019 inventory pattern)
--   * Public (anon + authenticated) can SELECT only images of ENABLED ads.
--   * All writes go through SECURITY DEFINER RPCs gated to admin/super_admin
--     via ad_is_admin() (auth.uid() + public.users.role).
--   * Storage: new uploads must live under ads-images/{placement}/% (D-ADS-2)
--     or the legacy ads/{placement}/% convention, and the placement must be a
--     real ads row (defense in depth on top of the RPC prefix check).
--   * Read/update/delete storage policies keep their 00015 shape. The 00015
--     upload policy is REPLACED in place (same name, hardened CHECK).
--   * No direct INSERT/UPDATE/DELETE grants on ad_images (RPCs only write via
--     SECURITY DEFINER; direct table writes are REVOKEd).
--
-- TABLES
--   ad_images              NEW (multi-image relation; FK -> ads ON DELETE CASCADE)
--   ads                     exists (00015)
--   users (public.users)    exists
--
-- FUNCTIONS
--   sync_ads_image_mirror  NEW (trigger helper; keeps ads.image_path mirror fresh)
--   ad_is_admin            NEW (admin gate; pattern of 00019 inventory_is_admin)
--   ad_add_image           NEW (owner/admin RPC)
--   ad_remove_image        NEW (owner/admin RPC)
--   ad_replace_images      NEW (owner/admin RPC)
--
-- TRIGGERS
--   trg_ad_images_mirror   NEW (AFTER INSERT/UPDATE/DELETE sync of the cover)
--
-- Rollback: 02-ads-multi-image-rollback.sql (restores the 00015 upload policy).
-- Backfill: 05-ad-images-backfill.sql (run AFTER this migration, as postgres).
-- Verify:   04-post-apply-verify.sql (checks 1-16).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ad_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_placement TEXT NOT NULL REFERENCES public.ads(placement) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  is_cover     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ad_images_unique_path UNIQUE (ad_placement, path)
);
CREATE INDEX IF NOT EXISTS idx_ad_images_ad
  ON public.ad_images (ad_placement, position, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_images_cover
  ON public.ad_images (ad_placement) WHERE is_cover = TRUE;
CREATE OR REPLACE FUNCTION public.sync_ads_image_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement text := COALESCE(NEW.ad_placement, OLD.ad_placement);
  v_cover_path text;
BEGIN
  SELECT path INTO v_cover_path
  FROM public.ad_images
  WHERE ad_placement = v_placement
  ORDER BY is_cover DESC, position ASC, created_at ASC
  LIMIT 1;
  IF v_cover_path IS NOT NULL THEN
    UPDATE public.ads
    SET image_path = v_cover_path,
        image_url  = ''
    WHERE placement = v_placement;
  ELSE
    UPDATE public.ads
    SET image_path = '',
        image_url  = ''
    WHERE placement = v_placement;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;
DROP TRIGGER IF EXISTS trg_ad_images_mirror ON public.ad_images;
CREATE TRIGGER trg_ad_images_mirror
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_images
  FOR EACH ROW EXECUTE FUNCTION public.sync_ads_image_mirror();
ALTER TABLE public.ad_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read enabled ad images"
  ON public.ad_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ads a
    WHERE a.placement = ad_placement AND a.enabled = TRUE
  ));
REVOKE ALL ON public.ad_images FROM anon, authenticated;
GRANT SELECT ON public.ad_images TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.ad_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin','super_admin')
  );
$$;
CREATE OR REPLACE FUNCTION public.ad_add_image(
  p_ad_placement text,
  p_path         text,
  p_position     integer DEFAULT NULL,
  p_is_cover     boolean DEFAULT FALSE
)
RETURNS public.ad_images
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos integer := p_position;
  v_row public.ad_images;
BEGIN
  IF NOT public.ad_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  IF p_path IS NULL OR btrim(p_path) = '' THEN
    RAISE EXCEPTION 'path is required'
      USING ERRCODE = '22023';
  END IF;
  IF NOT (
    p_path LIKE 'ads-images/' || p_ad_placement || '/%'
    OR p_path LIKE 'ads/' || p_ad_placement || '/%'
  ) THEN
    RAISE EXCEPTION 'path must start with ads-images/% or ads/%', p_ad_placement
      USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.ads WHERE placement = p_ad_placement FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ad % not found', p_ad_placement
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'ads-images' AND name = p_path
  ) THEN
    RAISE EXCEPTION 'object % does not exist in ads-images bucket', p_path
      USING ERRCODE = '23503';
  END IF;
  IF v_pos IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM public.ad_images WHERE ad_placement = p_ad_placement;
  END IF;
  IF p_is_cover THEN
    UPDATE public.ad_images
    SET is_cover = FALSE
    WHERE ad_placement = p_ad_placement AND is_cover = TRUE;
  END IF;
  INSERT INTO public.ad_images (ad_placement, path, position, is_cover)
  VALUES (p_ad_placement, p_path, v_pos, p_is_cover)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
CREATE OR REPLACE FUNCTION public.ad_remove_image(
  p_image_id uuid
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  IF NOT public.ad_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  SELECT path INTO v_path FROM public.ad_images WHERE id = p_image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'image % not found', p_image_id
      USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.ad_images WHERE id = p_image_id;
  RETURN v_path;
END;
$$;
CREATE OR REPLACE FUNCTION public.ad_replace_images(
  p_ad_placement text,
  p_paths        text[],
  p_covers       boolean[] DEFAULT NULL
)
RETURNS SETOF public.ad_images
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx   integer;
  v_path  text;
  v_count integer := COALESCE(array_length(p_paths, 1), 0);
  v_cover boolean := FALSE;
  v_covers_ok boolean := TRUE;
  v_row   public.ad_images;
BEGIN
  IF NOT public.ad_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'paths must not be empty'
      USING ERRCODE = '22023';
  END IF;
  IF p_covers IS NOT NULL AND array_length(p_covers, 1) <> v_count THEN
    RAISE EXCEPTION 'covers array length (%) must match paths (%)',
      array_length(p_covers, 1), v_count
      USING ERRCODE = '22023';
  END IF;
  IF p_covers IS NOT NULL THEN
    FOR v_idx IN 1..array_length(p_covers, 1) LOOP
      IF COALESCE(p_covers[v_idx], FALSE) THEN
        IF NOT v_covers_ok THEN
          RAISE EXCEPTION 'at most one image can be the cover'
            USING ERRCODE = '22023';
        END IF;
        v_covers_ok := FALSE;
      END IF;
    END LOOP;
  END IF;
  PERFORM 1 FROM public.ads WHERE placement = p_ad_placement;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ad % not found', p_ad_placement
      USING ERRCODE = 'P0002';
  END IF;
  FOR v_idx IN 1..v_count LOOP
    v_path := p_paths[v_idx];
    IF v_path IS NULL OR btrim(v_path) = '' THEN
      RAISE EXCEPTION 'path % is empty', v_idx
        USING ERRCODE = '22023';
    END IF;
    IF NOT (
      v_path LIKE 'ads-images/' || p_ad_placement || '/%'
      OR v_path LIKE 'ads/' || p_ad_placement || '/%'
    ) THEN
      RAISE EXCEPTION 'path % must start with ads-images/% or ads/%', v_path, p_ad_placement
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'ads-images' AND name = v_path
    ) THEN
      RAISE EXCEPTION 'object % does not exist in ads-images bucket', v_path
        USING ERRCODE = '23503';
    END IF;
  END LOOP;
  PERFORM 1 FROM public.ads WHERE placement = p_ad_placement FOR UPDATE;
  DELETE FROM public.ad_images WHERE ad_placement = p_ad_placement;
  FOR v_idx IN 1..v_count LOOP
    v_path  := p_paths[v_idx];
    v_cover := CASE WHEN p_covers IS NULL THEN (v_idx = 1) ELSE COALESCE(p_covers[v_idx], FALSE) END;
    INSERT INTO public.ad_images (ad_placement, path, position, is_cover)
    VALUES (p_ad_placement, v_path, v_idx - 1, v_cover)
    RETURNING * INTO v_row;
    RETURN NEXT v_row;
  END LOOP;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ad_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ad_add_image(text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ad_remove_image(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ad_replace_images(text, text[], boolean[]) TO authenticated;
REVOKE ALL ON FUNCTION public.ad_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_add_image(text, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_remove_image(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_replace_images(text, text[], boolean[]) FROM PUBLIC;
DROP POLICY IF EXISTS "Staff upload ads-images" ON storage.objects;
CREATE POLICY "Staff upload ads-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
    AND (name LIKE 'ads-images/%' OR name LIKE 'ads/%')
    AND EXISTS (
      SELECT 1 FROM public.ads a
      WHERE name LIKE 'ads-images/' || a.placement || '/%'
         OR name LIKE 'ads/' || a.placement || '/%'
    )
  );
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ad_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_images;
  END IF;
END $$;
