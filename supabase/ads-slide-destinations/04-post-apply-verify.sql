-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DESTINATIONS (PHASE 4A) — POST-APPLY VERIFY (read-only)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 01-ads-slide-destinations-apply.sql. Verifies:
--   A) ad_images.destination_type / ad_images.destination EXIST and are NULLable
--      (NULL = inherit the ad destination — the default for every existing row).
--   B) the CHECK ad_images_destination_type_valid exists and is NOT VALID
--      (convalidated = f) — no VALIDATE this cycle.
--   C) enforcement probes (transaction-wrapped, ROLLED BACK — nothing
--      persists). Proves the exact truth table:
--        C1) destination_type = NULL       → PASS (inherit)
--        C2) destination_type = external   → PASS
--        C3) destination_type = whatsapp   → PASS
--        C4) destination_type = internal   → PASS
--        C5) destination_type = 'phone'    → REJECTED (check_violation)
--   D) the new RPC ad_replace_images_destinations exists and is executable by
--      authenticated (admin-gated inside), NOT by PUBLIC.
--   E) BACKWARD COMPATIBILITY: the 00021 RPCs (ad_add_image_devices /
--      ad_replace_images_devices) still exist and stay executable — 00024 is a
--      SUPERSET, never a replacement.
--   F) live rows untouched: every existing ad_images row keeps
--      destination_type IS NULL AND destination IS NULL (additive — no backfill).
--
-- SAFETY: sections A, B, D, E, F are SELECT/catalog-only. Section C runs inside
-- a single BEGIN;ROLLBACK transaction — the probe rows are rolled back,
-- NOTHING is written to production. The mirror trigger's side effects during
-- the probes are rolled back too.
-- ============================================================================

-- ============================================================================
-- SECTION A · the destination columns exist and are NULLable
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ad_images'
  AND column_name IN ('destination_type', 'destination')
ORDER BY column_name;

-- ============================================================================
-- SECTION B · the CHECK constraint exists and is NOT VALID
--   Expected definition:
--     CHECK ((destination_type IS NULL) OR (destination_type = ANY
--       (ARRAY['external'::text, 'whatsapp'::text, 'internal'::text])))
--   convalidated = f (NOT VALID — no VALIDATE this cycle).
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ad_images'::regclass
  AND conname = 'ad_images_destination_type_valid';

-- ============================================================================
-- SECTION C · enforcement probes (transaction-wrapped, ROLLED BACK)
--   Every probe inserts directly into ad_images (bypassing the RPCs) so the
--   CHECK is tested in isolation. Unique probe paths avoid any conflict; the
--   cover uniqueness index is avoided (no probe row is a cover).
-- ============================================================================
BEGIN;

-- C1) NULL destination_type → PASS (inherit).
DO $$
BEGIN
  INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id, destination_type, destination)
  VALUES ('home', '__probe_00024_null_dest__', 90001, FALSE, '', NULL, NULL);
  RAISE NOTICE 'PASS: destination_type NULL accepted (inherit)';
END $$;

-- C2) external → PASS.
DO $$
BEGIN
  INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id, destination_type, destination)
  VALUES ('home', '__probe_00024_external__', 90002, FALSE, '', 'external',
          '{"url":"https://example.com"}'::jsonb);
  RAISE NOTICE 'PASS: destination_type external accepted';
END $$;

-- C3) whatsapp → PASS.
DO $$
BEGIN
  INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id, destination_type, destination)
  VALUES ('home', '__probe_00024_whatsapp__', 90003, FALSE, '', 'whatsapp',
          '{"number":"201234567890","message":"مرحبا"}'::jsonb);
  RAISE NOTICE 'PASS: destination_type whatsapp accepted';
END $$;

-- C4) internal → PASS.
DO $$
BEGIN
  INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id, destination_type, destination)
  VALUES ('home', '__probe_00024_internal__', 90004, FALSE, '', 'internal',
          '{"screen":"showroom"}'::jsonb);
  RAISE NOTICE 'PASS: destination_type internal accepted';
END $$;

-- C5) 'phone' → REJECTED (phone slides live on device_id, never in the JSONB
--     discriminator).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ad_images (ad_placement, path, position, is_cover, device_id, destination_type, destination)
    VALUES ('home', '__probe_00024_phone__', 90005, FALSE, '', 'phone',
            '{"deviceId":"rec_00024_phone"}'::jsonb);
    RAISE EXCEPTION 'FAIL: destination_type phone accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: destination_type phone rejected (check_violation)';
  END;
END $$;

ROLLBACK;

-- ============================================================================
-- SECTION D · the new RPC exists, authenticated-only
-- ============================================================================
SELECT p.oid::regprocedure::text AS rpc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'ad_replace_images_destinations';

SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'ad_replace_images_destinations';

-- ============================================================================
-- SECTION E · backward compatibility — the 00021 RPCs survive unchanged
-- ============================================================================
SELECT p.oid::regprocedure::text AS rpc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_add_image_devices', 'ad_replace_images_devices')
ORDER BY 1;

SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_add_image_devices', 'ad_replace_images_devices')
ORDER BY 1;

-- ============================================================================
-- SECTION F · live rows untouched — every existing row inherits (NULL/NULL)
--   Expected: total_ad_images equals the pre-apply count AND
--   dest_type_assigned = 0 AND dest_assigned = 0.
-- ============================================================================
SELECT COUNT(*) AS total_ad_images,
       COUNT(*) FILTER (WHERE destination_type IS NOT NULL) AS dest_type_assigned,
       COUNT(*) FILTER (WHERE destination IS NOT NULL) AS dest_assigned
FROM public.ad_images;

-- ============================================================================
-- Expected summary:
--   A = 2 rows: destination_type TEXT nullable / destination jsonb nullable;
--   B = ad_images_destination_type_valid with the NULL-or-3-types definition,
--       convalidated = f (NOT VALID — no VALIDATE this cycle);
--   C = PASS/PASS/PASS/PASS/PASS (NULL, external, whatsapp, internal accepted;
--       phone rejected — all rolled back);
--   D = ad_replace_images_destinations present, auth_can_execute = t,
--       public_can_execute = f;
--   E = ad_add_image_devices + ad_replace_images_devices present with
--       auth_can_execute = t (backward compatible);
--   F = total_ad_images matches pre-apply, dest_type_assigned = 0,
--       dest_assigned = 0 (additive, all rows inherit).
-- ============================================================================
