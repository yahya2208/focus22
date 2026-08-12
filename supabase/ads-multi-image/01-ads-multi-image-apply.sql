-- ============================================================================
-- FOCUS — ADS MULTI-IMAGE (Phase B) — APPLY
--
-- Type: Additive (CREATE TABLE / FUNCTION / POLICY / TRIGGER / PUBLICATION only)
-- Status: DRAFT FOR REVIEW. NOT EXECUTED. NOT MIGRATED.
--   Do NOT run until the owner approves Plan P0-2 (Phase B GO).
--   Migration copy (when approved): supabase/migrations/00020_ads_multi_image.sql
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
--       when a placement has no ad_images row, the trigger does nothing and the
--       legacy fields are left untouched during the transition.
--
-- SECURITY (mirrors 00019 inventory pattern)
--   * Public (anon + authenticated) can SELECT only images of ENABLED ads.
--   * All writes go through SECURITY DEFINER RPCs gated to admin/super_admin
--     via ad_is_admin() (auth.uid() + public.users.role).
--   * Storage: new uploads must live under ads-images/{placement}/% (D-ADS-2)
--     or the legacy ads/{placement}/% convention, and the placement must be a
--     real ads row (defense in depth on top of the RPC prefix check).
--     Read/update/delete policies keep their 00015 shape.
--   * No direct INSERT/UPDATE/DELETE grants on ad_images (RPCs only).
--
-- Depends on: public.users (role checks), public.ads (placement PK),
--   storage.buckets 'ads-images' (created by 00015), update_updated_at() (00015).
-- Idempotent guards (IF NOT EXISTS / DO blocks).
--
-- ROLLBACK: see 02-ads-multi-image-rollback.sql (exact, reversed order).
-- EVIDENCE: 03-pre-apply-evidence.sql (before), 04-post-apply-verify.sql (after).
-- BACKFILL: 05-ad-images-backfill.sql (existing single-image ads → ad_images).
-- ============================================================================

-- UUIDs via gen_random_uuid() (PG 13+ core). No extension needed.

-- ============================================================================
-- 1) ad_images — ordered image set per ad (canonical source for ad images)
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

-- One cover per ad (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_images_cover
  ON public.ad_images (ad_placement) WHERE is_cover = TRUE;

-- ============================================================================
-- 2) Mirror sync trigger — ads.image_path/image_url = derived cover only
-- ============================================================================
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
  -- Canonical = ad_images. Cover = the is_cover row, else first by (position, created_at).
  SELECT path INTO v_cover_path
  FROM public.ad_images
  WHERE ad_placement = v_placement
  ORDER BY is_cover DESC, position ASC, created_at ASC
  LIMIT 1;

  -- Only placements that HAVE ad_images rows are mirrored. image_url is derived
  -- at render time (publicImageUrl) — the mirror stores the single path value.
  IF v_cover_path IS NOT NULL THEN
    UPDATE public.ads
    SET image_path = v_cover_path,
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

-- ============================================================================
-- 3) Row Level Security
-- ============================================================================
ALTER TABLE public.ad_images ENABLE ROW LEVEL SECURITY;

-- Public: images of ENABLED ads only.
CREATE POLICY "Public read enabled ad images"
  ON public.ad_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ads a
    WHERE a.placement = ad_placement AND a.enabled = TRUE
  ));

-- ============================================================================
-- 4) Grants / Revokes (writes via RPCs only — no direct write grants)
-- ============================================================================
REVOKE ALL ON public.ad_images FROM anon, authenticated;
GRANT SELECT ON public.ad_images TO anon, authenticated;

-- ============================================================================
-- 5) SECURITY DEFINER RPCs — the ONLY write path.
--    Naming ad_* keeps the 14 inventory_% function pin in 04-post-apply-verify
--    (and sql-migration-gate.test.ts) untouched.
-- ============================================================================

-- 5.0) Role gate helper.
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

-- 5.1) Attach an image to an ad. Validates prefix ads-images/{placement}/% and
--      that the object really exists in the bucket; locks the ad row FOR UPDATE
--      so position/cover cannot race; demotes the previous cover. Mirrors
--      public.inventory_add_image (00019:861-932).
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

  -- The path must live inside THIS ad's folder. Accepts the new canonical
  -- convention ads-images/{placement}/% (D-ADS-2) AND the legacy ads/{placement}/%
  -- convention so existing single-image ads (criterion #6) can be attached.
  IF NOT (
    p_path LIKE 'ads-images/' || p_ad_placement || '/%'
    OR p_path LIKE 'ads/' || p_ad_placement || '/%'
  ) THEN
    RAISE EXCEPTION 'path must start with ads-images/% or ads/%', p_ad_placement
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent image writes for the same ad (position + cover).
  PERFORM 1 FROM public.ads WHERE placement = p_ad_placement FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ad % not found', p_ad_placement
      USING ERRCODE = 'P0002';
  END IF;

  -- The object must already exist in the bucket before it can be attached.
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

-- 5.2) Remove an image. B-1: this RPC deletes ONLY the canonical DB row and
--      RETURNS the removed storage path. The caller then deletes the actual file
--      via the Storage API (supabase.storage.from('ads-images').remove([path]))
--      — direct DELETE FROM storage.objects is NOT used, per Supabase's guidance
--      (SQL metadata deletion does not guarantee the physical file is removed and
--      can leave orphaned objects).
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

  -- Return the removed path so the caller can delete the storage object via the
  -- Storage API. Row-first ordering: a failed API delete leaves an orphan object
  -- (reconcilable), never a DB row referencing a deleted file.
  RETURN v_path;
END;
$$;

-- 5.3) Atomic replace of a placement's full ordered set. The client uploads all
--      files first, then calls this once. Validates every path (prefix + object
--      existence) BEFORE any write; removes the previous rows; inserts the new
--      set with positions 0..n-1 and at most one cover. Any violation aborts the
--      whole function (all-or-nothing).
--
--      B-1 (storage deletion): this RPC NEVER touches storage.objects (no direct
--      SQL delete). It returns the NEW set; the caller already holds the previous
--      paths (it queried them before the replace) and calls
--      supabase.storage.from('ads-images').remove(previous − new) via the Storage
--      API so the physical files are actually deleted. An object existence check
--      (SELECT storage.objects) is kept for validation only.
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

  -- At most one cover (uq_ad_images_cover would reject a second TRUE).
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

  -- Validate every path BEFORE any write (prefix + object existence).
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

  -- Serialize concurrent replaces for the same ad.
  PERFORM 1 FROM public.ads WHERE placement = p_ad_placement FOR UPDATE;

  -- Remove previous rows. Storage objects are NOT deleted here (B-1): the caller
  -- computes previous − new and removes the files via the Storage API.
  DELETE FROM public.ad_images WHERE ad_placement = p_ad_placement;

  -- Insert the new ordered set.
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

-- Defense in depth: no anonymous/PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.ad_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_add_image(text, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_remove_image(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_replace_images(text, text[], boolean[]) FROM PUBLIC;

-- ============================================================================
-- 6) Storage policy hardening (replaces the generic 00015 upload policy).
--    Accepts BOTH the new canonical prefix ads-images/{placement}/% (D-ADS-2)
--    and the legacy ads/{placement}/% convention (still used by the single-image
--    flow during the transition), and only for a REAL placement. This keeps
--    legacy uploads working until the app cutover while blocking stray paths.
-- ============================================================================
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

-- Read / update / delete policies keep their 00015 shape (already present).
-- ============================================================================
-- 7) Realtime — ad_images joins the publication so clients invalidate + refetch.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ad_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_images;
  END IF;
END $$;

-- ============================================================================
-- DONE — ads multi-image apply script (Phase B draft, additive).
-- Backfill existing single-image ads: 05-ad-images-backfill.sql.
-- Verify: 04-post-apply-verify.sql. Roll back: 02-ads-multi-image-rollback.sql.
-- ============================================================================
