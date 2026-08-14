-- ============================================================================
-- FOCUS — ADS · PER-SLIDE DEVICE — POST-APPLY VERIFY (run AFTER 01-apply)
--
-- PASS CRITERIA (all must hold after 00021 is applied):
--   1) ad_images.device_id EXISTS and is NOT NULL (all rows '' for now).
--   2) format constraint ad_images_device_id_format exists (NOT VALID).
--   3) the two new RPCs exist and are executable by authenticated
--      (admin-gated inside), not by PUBLIC.
--   4) row count unchanged vs pre-apply (additive: no rows lost).
-- ============================================================================

SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ad_images'
  AND column_name = 'device_id';

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'ad_images_device_id_format';

SELECT p.oid::regprocedure::text AS rpc
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_add_image_devices','ad_replace_images_devices')
ORDER BY 1;

SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('ad_add_image_devices','ad_replace_images_devices')
ORDER BY 1;

SELECT COUNT(*) AS total_ad_images,
       COUNT(*) FILTER (WHERE device_id <> '') AS device_assigned_total
FROM public.ad_images;
