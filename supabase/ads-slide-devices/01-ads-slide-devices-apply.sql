-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DEVICE (ADDITIVE) — APPLY
--
-- Migration number: 00021 (00020 is reserved by ads-multi-image).
-- Source of truth: supabase/ads-slide-devices/01-ads-slide-devices-apply.sql.
--   The migration-format copy is supabase/migrations/00021_ad_images_device_id.sql;
--   keep the two in sync.
--
-- Type: Additive (ADD COLUMN + ADD CONSTRAINT NOT VALID + NEW RPCs).
-- One-shot: safe to run once on the live DB. Every statement is guarded by
-- name/IF NOT EXISTS so a partial/duplicate run does not stack objects.
--
-- PURPOSE
--   Associate EACH ad_images row with its OWN inventory device so every
--   carousel slide can drive its own phone-details/WhatsApp handoff:
--     * ad_images.device_id  — the InventoryRecord.id for THAT slide
--                              ('' = no device, same convention as ads.device_id).
--     * the runtime link is DERIVED at render time by the app
--       (ads-service buildAdPhoneLink → #/phone-details?device=<id>).
--   The DB enforces FORMAT ONLY. It does NOT (and cannot) check inventory
--   existence — that lives in the Ads Manager (InventoryService
--   .getExchangeableDevices()) exactly like ads.device_id (ads-device-links).
--
-- NON-DESTRUCTIVE / SAFETY
--   * 00020 / ads-multi-image / RLS / Storage policies are NOT touched.
--   * Existing 6 ad_images rows keep working: new column defaults to ''.
--   * Constraint added NOT VALID (existing rows not scanned), matching the
--     ads-device-links two-phase pattern.
--   * New RPCs have NEW NAMES (ad_replace_images_devices / ad_add_image_devices)
--     and mirror the 00020 RPCs exactly (same admin gate, path-prefix rule,
--     storage-object existence check, at-most-one-cover, all-or-nothing) plus a
--     device_id / p_device_ids[] argument. Old callers keep the 00020 RPCs.
--   * No backfill, no re-run of 05-ad-images-backfill.sql.
--
-- Client side: ads-service passes device_ids ONLY when at least one slide has
-- a device; otherwise it keeps calling the 00020 RPCs (device-free).
-- ============================================================================

-- 1) ad_images.device_id — structured source of truth per slide.
ALTER TABLE public.ad_images
  ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';

-- 1.1) Format guard: '' (no device) or a sane id length. NOT VALID so the
--      existing 6 rows are not scanned; new/updated rows are enforced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_images_device_id_format'
  ) THEN
    ALTER TABLE public.ad_images
      ADD CONSTRAINT ad_images_device_id_format
      CHECK (device_id = '' OR char_length(device_id) BETWEEN 1 AND 128)
      NOT VALID;
  END IF;
END
$$;

-- ============================================================================
-- 2) ad_add_image_devices — mirror of 00020's ad_add_image (same admin gate,
--    prefix rule, ad-exists + FOR UPDATE serialization, storage-object
--    existence check, cover demotion) plus an optional p_device_id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ad_add_image_devices(
  p_ad_placement text,
  p_path         text,
  p_position     integer DEFAULT NULL,
  p_is_cover     boolean DEFAULT FALSE,
  p_device_id    text DEFAULT ''
)
RETURNS public.ad_images
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos    integer := p_position;
  v_device text   := COALESCE(p_device_id, '');
  v_row    public.ad_images;
BEGIN
  IF NOT public.ad_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL OR btrim(p_path) = '' THEN
    RAISE EXCEPTION 'path is required'
      USING ERRCODE = '22023';
  END IF;

  -- Same prefix rule as 00020 (new canonical ads-images/{placement}/% and
  -- legacy ads/{placement}/%).
  IF NOT (
    p_path LIKE 'ads-images/' || p_ad_placement || '/%'
    OR p_path LIKE 'ads/' || p_ad_placement || '/%'
  ) THEN
    RAISE EXCEPTION 'path must start with ads-images/% or ads/%', p_ad_placement
      USING ERRCODE = '22023';
  END IF;

  IF v_device <> '' AND (char_length(v_device) < 1 OR char_length(v_device) > 128) THEN
    RAISE EXCEPTION 'invalid device_id format'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent image writes for the same ad (position + cover).
  PERFORM 1 FROM public.ads WHERE placement = p_ad_placement FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ad % not found', p_ad_placement
      USING ERRCODE = 'P0002';
  END IF;

  -- The object must already exist in the bucket before it can be attached
  -- (same rule as 00020's ad_add_image).
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

  INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id)
  VALUES (p_ad_placement, p_path, v_pos, p_is_cover, v_device)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 3) ad_replace_images_devices — mirror of 00020's ad_replace_images (admin
--    gate, at-most-one-cover, ad-exists, per-path prefix + storage-object
--    existence BEFORE any write, FOR UPDATE serialization, all-or-nothing)
--    plus a parallel p_device_ids[] array ('' = no device). The array must
--    match p_paths length and every non-empty id must respect the format rule.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ad_replace_images_devices(
  p_ad_placement text,
  p_paths        text[],
  p_covers       boolean[] DEFAULT NULL,
  p_device_ids   text[] DEFAULT NULL
)
RETURNS SETOF public.ad_images
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx       integer;
  v_path      text;
  v_dev       text;
  v_count     integer := COALESCE(array_length(p_paths, 1), 0);
  v_cover     boolean := FALSE;
  v_covers_ok boolean := TRUE;
  v_dev_ids   text[];
  v_dev_count integer;
  v_row       public.ad_images;
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

  -- device_ids defaults to an all-empty array and must match the paths length.
  v_dev_ids   := COALESCE(p_device_ids, array_fill(''::text, ARRAY[v_count]));
  v_dev_count := COALESCE(array_length(v_dev_ids, 1), 0);
  IF v_dev_count <> v_count THEN
    RAISE EXCEPTION 'device_ids array length (%) must match paths (%)',
      v_dev_count, v_count
      USING ERRCODE = '22023';
  END IF;
  FOR v_idx IN 1..v_dev_count LOOP
    v_dev := COALESCE(v_dev_ids[v_idx], '');
    IF v_dev <> '' AND (char_length(v_dev) < 1 OR char_length(v_dev) > 128) THEN
      RAISE EXCEPTION 'invalid device_id format'
        USING ERRCODE = '22023';
    END IF;
    v_dev_ids[v_idx] := v_dev;
  END LOOP;

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
    INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id)
    VALUES (p_ad_placement, v_path, v_idx - 1, v_cover, v_dev_ids[v_idx])
    RETURNING * INTO v_row;
    RETURN NEXT v_row;
  END LOOP;
  RETURN;
END;
$$;

-- ============================================================================
-- 4) Executable by authenticated sessions (admin-gated inside), hidden from
--    anon.
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.ad_add_image_devices(text, text, integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ad_replace_images_devices(text, text[], boolean[], text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.ad_add_image_devices(text, text, integer, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ad_replace_images_devices(text, text[], boolean[], text[]) FROM PUBLIC;
