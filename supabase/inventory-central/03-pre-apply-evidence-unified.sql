-- ============================================================================
-- FOCUS — PRE-APPLY EVIDENCE (PHASE 2C) — UNIFIED READ-ONLY EDITION
--
-- PURPOSE: A single-result-set version of 03-pre-apply-evidence.sql.
-- The Supabase SQL Editor displays one grid at a time, so the original
-- multi-statement file (9 separate SELECTs) shows only its LAST result
-- set in the UI. This edition collapses every check into ONE SELECT
-- (UNION ALL), so the whole evidence grid can be copied in one go.
--
-- READ-ONLY: SELECT only. No CREATE / INSERT / UPDATE / DELETE / ALTER /
-- GRANT / REVOKE. Nothing is created or modified.
--
-- Run as postgres in the Supabase SQL Editor and save the single grid.
-- Every expected value is embedded in the 'expected' column so the result
-- can be verified against GREEN without another document.
-- ============================================================================

SELECT
  'context' AS check_name,
  current_database() || ' | ' || current_user || ' | ' || now() AS detail,
  '-' AS expected,
  'captured' AS actual_value

UNION ALL SELECT '01_tables_absent', 'inventory_items',
  'NULL (must be absent)', to_regclass('public.inventory_items')::text

UNION ALL SELECT '01_tables_absent', 'inventory_images',
  'NULL (must be absent)', to_regclass('public.inventory_images')::text

UNION ALL SELECT '01_tables_absent', 'inventory_movements',
  'NULL (must be absent)', to_regclass('public.inventory_movements')::text

UNION ALL SELECT '01_tables_absent', 'v_public_inventory',
  'NULL (must be absent)', to_regclass('public.v_public_inventory')::text

UNION ALL SELECT '02_no_inventory_functions', 'count of public.inventory_%',
  '0',
  (SELECT count(*)::text
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%')

UNION ALL SELECT '03_bucket_absent', 'bucket inventory-images',
  '0',
  (SELECT count(*)::text FROM storage.buckets WHERE id = 'inventory-images')

UNION ALL SELECT '04_no_storage_policies', 'storage policies referencing the bucket',
  '0',
  (SELECT count(*)::text
   FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND (policyname LIKE '%inventory-images%' OR policyname LIKE 'Public read inventory images%'))

UNION ALL SELECT '05_realtime_additive', 'members of supabase_realtime',
  '0',
  (SELECT count(*)::text
   FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('inventory_items','inventory_images'))

UNION ALL SELECT '06_admin_baseline', 'admin/super_admin count',
  '>= 1',
  (SELECT count(*)::text FROM public.users WHERE role IN ('admin','super_admin'))

UNION ALL SELECT '07_gen_random_uuid', 'gen_random_uuid available',
  '1',
  (SELECT count(*)::text FROM pg_proc p WHERE p.proname = 'gen_random_uuid')

UNION ALL SELECT '08_users_id_uuid', 'users.id data_type',
  'uuid',
  (SELECT data_type::text
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id')

ORDER BY check_name, detail;
