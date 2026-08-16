-- ============================================================================
-- FOCUS — ADS · GENERIC DESTINATIONS (PHASE 1 FOUNDATION) — PRE-APPLY EVIDENCE
-- (read-only)
--
-- Purpose: capture the read-only baseline BEFORE the owner executes
-- 01-ads-generic-destinations-apply.sql. Confirms:
--   A) the live ads table columns — the new destination columns must be ABSENT;
--   B) the target constraint ads_destination_type_valid is ABSENT (fresh apply);
--   C) the full live ads rows (incl. disabled) — the compatibility baseline
--      that must survive the apply unchanged (placement PK / enabled / link /
--      device_id / image_path / image_url all untouched);
--   D) the full live ad_images rows — multi-image baseline that must survive
--      unchanged (ad_images is NOT modified by this phase);
--   E) the image mirror trigger + function are present (must keep working);
--   F) RLS policies on ads + ad_images are present (must remain unchanged);
--   G) the existing ads RPCs are present (must remain unchanged);
--   H) live row counts (true counts, incl. disabled ads — the REST anon view
--      only exposes enabled rows, so this is the authoritative count);
--   I) the 5 existing phone-related CHECK constraints are present (NOT
--      removed / weakened by this phase).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL. Safe on production.
-- Run ONCE before applying.
-- ============================================================================

-- ============================================================================
-- SECTION A · ads table — current live columns (expect NO destination_type /
-- destination / title yet)
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads'
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION A2 · new destination columns ABSENT (expect 0 rows)
-- ============================================================================
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads'
  AND column_name IN ('destination_type', 'destination', 'title');

-- ============================================================================
-- SECTION B · target constraint ads_destination_type_valid ABSENT (expect 0 rows)
-- ============================================================================
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname = 'ads_destination_type_valid';

-- ============================================================================
-- SECTION C · full live ads rows (incl. disabled) — compatibility baseline
-- ============================================================================
SELECT placement, enabled, image_path, image_url, link, alt, device_id, sort_order
FROM public.ads
ORDER BY placement;

SELECT count(*) AS ads_total_rows FROM public.ads;

-- ============================================================================
-- SECTION D · full live ad_images rows — multi-image baseline (unchanged here)
-- ============================================================================
SELECT ad_placement, position, is_cover, device_id, path
FROM public.ad_images
ORDER BY ad_placement, position;

SELECT count(*) AS ad_images_total_rows,
       count(*) FILTER (WHERE is_cover) AS cover_count,
       count(DISTINCT ad_placement)     AS placements_with_images
FROM public.ad_images;

-- ============================================================================
-- SECTION E · image mirror trigger + function present (must keep working)
-- ============================================================================
SELECT trigger_name, event_object_table, action_timing, event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND event_object_table = 'ad_images'
ORDER BY trigger_name;

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'sync_ads_image_mirror';

-- ============================================================================
-- SECTION F · RLS policies on ads + ad_images (must remain unchanged)
-- ============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('ads', 'ad_images')
ORDER BY tablename, policyname;

-- ============================================================================
-- SECTION G · existing ads RPCs (must remain unchanged)
-- ============================================================================
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_is_admin', 'ad_add_image', 'ad_remove_image',
                    'ad_replace_images', 'ad_add_image_devices',
                    'ad_replace_images_devices')
ORDER BY p.proname;

-- ============================================================================
-- SECTION H · live row counts (authoritative — incl. disabled ads)
-- ============================================================================
SELECT
  (SELECT count(*) FROM public.ads)        AS ads_total,
  (SELECT count(*) FROM public.ad_images)  AS ad_images_total;

-- ============================================================================
-- SECTION I · existing phone-related CHECK constraints present (NOT touched)
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname IN ('ads_enabled_requires_link', 'ads_phone_link_requires_device',
                  'ads_device_id_format', 'ads_phone_link_matches_device',
                  'ads_device_requires_phone_link')
ORDER BY conname;

-- ============================================================================
-- Expected summary:
--   A  = current ads columns (NO destination_type / destination / title);
--   A2 = 0 rows; B = 0 rows;
--   C  = same N ads rows as the app currently renders (incl. disabled);
--   D  = same M ad_images rows (multi-image carousel intact);
--   E  = trg_ad_images_mirror + sync_ads_image_mirror() present;
--   F  = the same policy names as today;
--   G  = ad_is_admin + the 6 ad_* RPCs present;
--   H  = authoritative total counts (REST anon view shows only enabled rows);
--   I  = the 5 phone CHECK constraints present (convalidated may be f — NOT
--        VALID per the ads-device-links batch; unchanged here).
-- If A2 or B is non-empty, STOP — the apply already ran or a previous attempt
-- left columns/constraints behind.
-- ============================================================================
