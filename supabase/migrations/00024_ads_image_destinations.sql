-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DESTINATIONS (MIGRATION 00024 — FILE ONLY, NOT EXECUTED)
--
-- Migration number: 00024 (00023 is reserved by ads-destination-enabled).
-- Source of truth: supabase/ads-slide-destinations/01-ads-slide-destinations-apply.sql.
--   This file is the migration-format copy; keep the two in sync.
--   Same convention as 00021/00022/00023 (FILE ONLY, NOT EXECUTED — applied via the
--   SQL Editor as postgres).
--
-- PURPOSE
--   Give each ad_images row its OWN destination (external/whatsapp/internal) so
--   every carousel slide can resolve its own target independently of the ad-level
--   destination. NULL/NULL = INHERIT the ad destination (the default for every
--   existing row — zero re-save). destination_type is CHECKed to NULL or
--   external/whatsapp/internal (NOT VALID) — phone slides stay expressed solely
--   via ad_images.device_id (00021), never in a JSONB discriminator.
--
-- Scope: ADD COLUMN + ADD CONSTRAINT NOT VALID + ONE new RPC
--   (ad_replace_images_destinations — a SUPERSET of ad_replace_images_devices
--   plus device_ids + per-slide destination types/payloads). The 00021 RPCs and
--   ad_replace_images stay unchanged and executable (backward compatibility).
--
-- Rollback: supabase/ads-slide-destinations/02-*-rollback.sql.
-- Verify:   supabase/ads-slide-destinations/04-post-apply-verify.sql.
-- ============================================================================
ALTER TABLE public.ad_images
  ADD COLUMN IF NOT EXISTS destination_type TEXT;

-- ----------------------------------------------------------------------------
-- 2) ad_images.destination — per-slide JSONB payload (same shape as the
--    ad-level ads.destination for the chosen type). NULL = INHERIT.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ad_images
  ADD COLUMN IF NOT EXISTS destination JSONB;

-- ----------------------------------------------------------------------------
-- 3) CHECK — allowed per-slide destination_type values. NULL (inherit) or
--    external/whatsapp/internal. 'phone' is NOT in the list, so the DB proves
--    phone slides can only be expressed via device_id. NOT VALID so the
--    existing rows (all NULL) are not scanned; new/updated rows are enforced.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_images_destination_type_valid'
  ) THEN
    ALTER TABLE public.ad_images
      ADD CONSTRAINT ad_images_destination_type_valid
      CHECK (
        destination_type IS NULL
        OR destination_type IN ('external', 'whatsapp', 'internal')
      )
      NOT VALID;
  END IF;
END
$$;

-- ============================================================================
-- 4) ad_replace_images_destinations — superset of 00021's
--    ad_replace_images_devices (admin gate, at-most-one-cover, ad-exists,
--    per-path prefix + storage-object existence BEFORE any write, FOR UPDATE
--    serialization, all-or-nothing) plus per-slide destination types/payloads.
--    The arrays must all match p_paths length:
--      * p_device_ids[]         — '' = no device (00021 contract).
--      * p_destination_types[]  — NULL/'' = inherit the ad destination;
--                                 else ∈ {external, whatsapp, internal}.
--      * p_destinations[]       — NULL = inherit; else the JSONB payload.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ad_replace_images_destinations(
  p_ad_placement      text,
  p_paths             text[],
  p_covers            boolean[] DEFAULT NULL,
  p_device_ids        text[] DEFAULT NULL,
  p_destination_types text[] DEFAULT NULL,
  p_destinations      jsonb[] DEFAULT NULL
)
RETURNS SETOF public.ad_images
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx            integer;
  v_path           text;
  v_dev            text;
  v_dest_type      text;
  v_count          integer := COALESCE(array_length(p_paths, 1), 0);
  v_cover          boolean := FALSE;
  v_covers_ok      boolean := TRUE;
  v_dev_ids        text[];
  v_dev_count      integer;
  v_dest_types     text[];
  v_dest_count     integer;
  v_dests          jsonb[];
  v_dest_payload   jsonb;
  v_row            public.ad_images;
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

  -- device_ids defaults to an all-empty array and must match the paths length
  -- (same contract as 00021's ad_replace_images_devices).
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

  -- destination_types defaults to an all-NULL array (inherit) and must match
  -- the paths length. NULL/'' = inherit; non-empty must be a valid type.
  v_dest_types := COALESCE(p_destination_types, array_fill(NULL::text, ARRAY[v_count]));
  v_dest_count := COALESCE(array_length(v_dest_types, 1), 0);
  IF v_dest_count <> v_count THEN
    RAISE EXCEPTION 'destination_types array length (%) must match paths (%)',
      v_dest_count, v_count
      USING ERRCODE = '22023';
  END IF;
  FOR v_idx IN 1..v_dest_count LOOP
    v_dest_type := NULLIF(btrim(COALESCE(v_dest_types[v_idx], '')), '');
    IF v_dest_type IS NOT NULL
       AND v_dest_type NOT IN ('external', 'whatsapp', 'internal') THEN
      RAISE EXCEPTION 'invalid destination_type (%) for image % — NULL or external/whatsapp/internal only',
        v_dest_type, v_idx
        USING ERRCODE = '22023';
    END IF;
    v_dest_types[v_idx] := v_dest_type;
  END LOOP;

  -- destinations defaults to an all-NULL array (inherit) and must match the
  -- paths length. Payload shape is NOT validated here (adapters own it).
  v_dests := COALESCE(p_destinations, array_fill(NULL::jsonb, ARRAY[v_count]));
  IF COALESCE(array_length(v_dests, 1), 0) <> v_count THEN
    RAISE EXCEPTION 'destinations array length (%) must match paths (%)',
      COALESCE(array_length(v_dests, 1), 0), v_count
      USING ERRCODE = '22023';
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

  -- Insert the new ordered set with the per-slide destination contract.
  FOR v_idx IN 1..v_count LOOP
    v_path          := p_paths[v_idx];
    v_cover         := CASE WHEN p_covers IS NULL THEN (v_idx = 1) ELSE COALESCE(p_covers[v_idx], FALSE) END;
    v_dest_payload  := v_dests[v_idx];
    INSERT INTO public.ad_images (
      ad_placement, path, position, is_cover, device_id, destination_type, destination
    )
    VALUES (
      p_ad_placement, v_path, v_idx - 1, v_cover,
      v_dev_ids[v_idx], v_dest_types[v_idx], v_dest_payload
    )
    RETURNING * INTO v_row;
    RETURN NEXT v_row;
  END LOOP;
  RETURN;
END;
$$;

-- ============================================================================
-- 5) Executable by authenticated sessions (admin-gated inside), hidden from
--    anon. The old RPCs keep their own grants untouched.
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.ad_replace_images_destinations(text, text[], boolean[], text[], text[], jsonb[]) TO authenticated;
REVOKE ALL ON FUNCTION public.ad_replace_images_destinations(text, text[], boolean[], text[], text[], jsonb[]) FROM PUBLIC;

-- ============================================================================
-- Done. Run supabase/ads-slide-destinations/04-post-apply-verify.sql next.
-- ============================================================================

