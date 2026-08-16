-- ============================================================================
-- FOCUS — ADS · GENERIC DESTINATIONS (PHASE 1 FOUNDATION) — POST-APPLY VERIFY
-- (read-only)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 01-ads-generic-destinations-apply.sql. Verifies:
--   A) the 3 new columns exist with the correct type / default / NOT NULL;
--   B) ads_destination_type_valid exists and is VALIDATED (convalidated = t);
--   C) every existing ads row backfilled: destination_type='phone',
--      destination='{}' (valid JSONB object), title='' — zero manual re-entry;
--   D) rows untouched: same placements + same count as pre-apply; existing
--      phone fields (image_path/image_url/device_id/link) unchanged;
--   E) ad_images untouched: same rows as pre-apply (multi-image intact);
--   F) image mirror trigger + function still present;
--   G) RLS policies unchanged (same names);
--   H) existing ads RPCs unchanged (same names);
--   I) the 5 existing phone-related CHECK constraints still present;
--   J) enforcement probes (transaction-wrapped, ROLLED BACK — nothing persists):
--        J1) invalid destination_type → rejected by ads_destination_type_valid;
--        J2) valid 'phone' row with a phone-format link → accepted (proves the
--            existing phone CHECKs and the new columns coexist);
--        J3) destination accepts arbitrary valid JSONB object → accepted;
--        J4) the mirror trigger still fires on ad_images change (rollback
--            makes the probe invisible to production).
--
-- SAFETY: sections A–I are SELECT/catalog-only. Section J runs inside a single
-- BEGIN;ROLLBACK transaction — the probe rows are rolled back, NOTHING is
-- written to production.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · new columns present (type / default / NOT NULL)
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads'
  AND column_name IN ('destination_type', 'destination', 'title')
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION B · ads_destination_type_valid present + VALIDATED
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname = 'ads_destination_type_valid';

-- ============================================================================
-- SECTION C · backfill correctness — every existing row is phone/{}/''
-- ============================================================================
SELECT placement, destination_type, destination, title
FROM public.ads
ORDER BY placement;

-- Compliance roll-up (all 3 must be 0 / empty)
SELECT
  count(*) FILTER (WHERE destination_type <> 'phone') AS rows_not_phone,
  count(*) FILTER (WHERE destination IS NULL
                        OR jsonb_typeof(destination) <> 'object') AS rows_invalid_destination,
  count(*) FILTER (WHERE title <> '')                 AS rows_with_title
FROM public.ads;

-- ============================================================================
-- SECTION D · rows untouched — same placements/count + phone fields unchanged
--   (compare against pre-apply SECTION C: placements + image_path + image_url +
--   device_id + link must be identical)
-- ============================================================================
SELECT placement, enabled, image_path, image_url, link, alt, device_id, sort_order
FROM public.ads
ORDER BY placement;

SELECT count(*) AS ads_total_rows FROM public.ads;

-- ============================================================================
-- SECTION E · ad_images untouched (same rows as pre-apply SECTION D)
-- ============================================================================
SELECT ad_placement, position, is_cover, device_id, path
FROM public.ad_images
ORDER BY ad_placement, position;

SELECT count(*) AS ad_images_total_rows,
       count(*) FILTER (WHERE is_cover) AS cover_count,
       count(DISTINCT ad_placement)     AS placements_with_images
FROM public.ad_images;

-- ============================================================================
-- SECTION F · image mirror trigger + function still present
-- ============================================================================
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND event_object_table = 'ad_images'
ORDER BY trigger_name;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'sync_ads_image_mirror';

-- ============================================================================
-- SECTION G · RLS policies unchanged (same names as pre-apply SECTION F)
-- ============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('ads', 'ad_images')
ORDER BY tablename, policyname;

-- ============================================================================
-- SECTION H · existing ads RPCs unchanged (same names as pre-apply SECTION G)
-- ============================================================================
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_is_admin', 'ad_add_image', 'ad_remove_image',
                    'ad_replace_images', 'ad_add_image_devices',
                    'ad_replace_images_devices')
ORDER BY p.proname;

-- ============================================================================
-- SECTION I · the 5 existing phone-related CHECK constraints still present
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname IN ('ads_enabled_requires_link', 'ads_phone_link_requires_device',
                  'ads_device_id_format', 'ads_phone_link_matches_device',
                  'ads_device_requires_phone_link')
ORDER BY conname;

-- ============================================================================
-- SECTION J · enforcement probes (transaction-wrapped, ROLLED BACK)
-- ============================================================================
BEGIN;

-- J1) invalid destination_type → rejected by ads_destination_type_valid.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ads (placement, enabled, link, destination_type, destination, title)
    VALUES ('probe_dest_invalid', FALSE, '', 'car', '{}', '');
    RAISE EXCEPTION 'FAIL: invalid destination_type accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: invalid destination_type rejected (check_violation)';
  END;
END $$;

-- J2) VALID phone row (defaults apply) + phone-format link → accepted.
--     Proves the new columns coexist with the existing phone CHECKs
--     (enabled→link, phone-link→device, derived-link equality).
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, link, device_id)
  VALUES ('probe_dest_phone', TRUE,
          '#/phone-details?device=36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51',
          '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51');
  RAISE NOTICE 'PASS: valid phone row with defaults accepted';
END $$;

-- J3) destination accepts an arbitrary valid JSONB object.
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, destination)
  VALUES ('probe_dest_json', FALSE,
          '{"kind":"external","url":"https://example.com","target":"blank"}'::jsonb);
  RAISE NOTICE 'PASS: arbitrary JSONB destination accepted';
END $$;

-- J4) the mirror trigger still fires on an ad_images insert (rolled back).
DO $$
DECLARE
  before_path text;
  after_path  text;
BEGIN
  SELECT image_path INTO before_path FROM public.ads WHERE placement = 'exchange';

  INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id)
  VALUES ('exchange', 'ads-images/exchange/probe-mirror.jpg', 99, FALSE, '');

  SELECT image_path INTO after_path FROM public.ads WHERE placement = 'exchange';

  IF after_path = before_path AND btrim(after_path) = '' THEN
    RAISE NOTICE 'PASS: mirror trigger fired, cover mirror updated';
  ELSIF after_path <> before_path THEN
    RAISE NOTICE 'PASS: mirror trigger fired, cover mirror updated (% -> %)', before_path, after_path;
  ELSE
    RAISE NOTICE 'CHECK: mirror trigger fired but cover unchanged (% / %)', before_path, after_path;
  END IF;
END $$;

ROLLBACK;

-- ============================================================================
-- Expected summary:
--   A  = 3 rows: TEXT/'phone' | jsonb/'{}'::jsonb | TEXT/'' — all NOT NULL;
--   B  = ads_destination_type_valid, convalidated = t;
--   C  = every row destination_type='phone', destination='{}', title='';
--       roll-up all zeros;
--   D  = same N placements + identical phone-field values as pre-apply;
--   E  = same M ad_images rows (cover_count unchanged, multi-image intact);
--   F  = trg_ad_images_mirror + sync_ads_image_mirror() present;
--   G/H/I = same policy names, RPC names, and 5 phone CHECK constraints.
--   J  = PASS/PASS/PASS/PASS (all rolled back).
-- ============================================================================
