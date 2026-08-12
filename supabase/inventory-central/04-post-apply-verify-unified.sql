-- ============================================================================
-- FOCUS — POST-APPLY VERIFY (PHASE 2C) — UNIFIED READ-ONLY EDITION
--
-- PURPOSE: Single-result-set version of 04-post-apply-verify.sql.
-- The Supabase SQL Editor displays one grid at a time, so the original
-- multi-statement file (15 separate SELECTs) shows only its LAST result
-- set in the UI. This edition collapses checks 01..15 into ONE SELECT
-- (UNION ALL), so the whole evidence grid can be copied in one go.
--
-- READ-ONLY: SELECT only. No CREATE / INSERT / UPDATE / DELETE / ALTER /
-- DROP / GRANT / REVOKE. Nothing is created or modified.
-- The logic of each original check is preserved unchanged; only the
-- output shape is unified.
--
-- Run as postgres in the Supabase SQL Editor and save the single grid.
-- Expected values are embedded per row so results verify against GREEN.
-- ============================================================================

SELECT
  '01_objects'                          AS check_name,
  '3'                                   AS expected,
  (SELECT count(*)::text
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('inventory_items','inventory_images','inventory_movements')
     AND c.relkind = 'r')               AS actual_value,
  CASE WHEN (SELECT count(*)
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relname IN ('inventory_items','inventory_images','inventory_movements')
               AND c.relkind = 'r') = 3 THEN 'PASS' ELSE 'FAIL' END AS status,
  'tables inventory_items / inventory_images / inventory_movements' AS detail

UNION ALL SELECT '02_view', '1',
  (SELECT count(*)::text
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'v_public_inventory' AND c.relkind = 'v'),
  CASE WHEN (SELECT count(*)
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'v_public_inventory' AND c.relkind = 'v') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'view v_public_inventory exists'

UNION ALL SELECT '03_rls_items', '1',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_items' AND rowsecurity = TRUE),
  CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_items' AND rowsecurity = TRUE) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'RLS enabled on inventory_items'

UNION ALL SELECT '04_rls_images', '1',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_images' AND rowsecurity = TRUE),
  CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_images' AND rowsecurity = TRUE) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'RLS enabled on inventory_images'

UNION ALL SELECT '05_rls_movements', '1',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND rowsecurity = TRUE),
  CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND rowsecurity = TRUE) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'RLS enabled on inventory_movements'

UNION ALL SELECT '06_triggers', '2',
  (SELECT count(*)::text FROM pg_trigger WHERE tgname IN ('trg_inventory_items_updated_at','trg_inventory_items_audit')),
  CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_inventory_items_updated_at','trg_inventory_items_audit')) = 2 THEN 'PASS' ELSE 'FAIL' END,
  'triggers trg_inventory_items_updated_at + trg_inventory_items_audit'

UNION ALL SELECT '07_rpcs', '14',
  (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%'),
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%') = 14 THEN 'PASS' ELSE 'FAIL' END,
  'EXACTLY 14 inventory_% functions'

UNION ALL SELECT '08_policies', '2',
  (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('Public read inventory images','Staff read inventory movements')),
  CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('Public read inventory images','Staff read inventory movements')) = 2 THEN 'PASS' ELSE 'FAIL' END,
  'RLS policies: Public read inventory images + Staff read inventory movements'

UNION ALL SELECT '09_bucket', '1',
  (SELECT count(*)::text FROM storage.buckets WHERE id = 'inventory-images'),
  CASE WHEN (SELECT count(*) FROM storage.buckets WHERE id = 'inventory-images') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'bucket inventory-images exists'

UNION ALL SELECT '10_no_inventory_central_pub', '0',
  (SELECT count(*)::text FROM pg_publication p WHERE p.pubname = 'inventory_central'),
  CASE WHEN (SELECT count(*) FROM pg_publication p WHERE p.pubname = 'inventory_central') = 0 THEN 'PASS' ELSE 'FAIL' END,
  'no publication named inventory_central (by design; expected 0 = success)'

UNION ALL SELECT '11_admin', '>= 1',
  (SELECT count(*)::text FROM public.users WHERE role IN ('admin','super_admin')),
  CASE WHEN (SELECT count(*) FROM public.users WHERE role IN ('admin','super_admin')) >= 1 THEN 'PASS' ELSE 'FAIL' END,
  'admin/super_admin baseline in public.users'

UNION ALL SELECT '12_public_empty', '0',
  (SELECT count(*)::text FROM public.v_public_inventory),
  CASE WHEN (SELECT count(*) FROM public.v_public_inventory) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'public view empty before data reconciliation (publish gating)'

UNION ALL SELECT '13_storage_policies', '4',
  (SELECT count(*)::text FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN (
       'Public read inventory-images',
       'Staff upload inventory-images',
       'Staff update inventory-images',
       'Staff delete inventory-images')),
  CASE WHEN (SELECT count(*) FROM pg_policies
             WHERE schemaname = 'storage' AND tablename = 'objects'
               AND policyname IN (
                 'Public read inventory-images',
                 'Staff upload inventory-images',
                 'Staff update inventory-images',
                 'Staff delete inventory-images')) = 4 THEN 'PASS' ELSE 'FAIL' END,
  'storage policies: read / upload / update / delete inventory-images'

UNION ALL SELECT '14_no_public_exec', '0',
  (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%'
     AND (p.proacl IS NULL OR EXISTS (
       SELECT 1 FROM unnest(p.proacl) AS a WHERE (a)::text LIKE '=X/%'))),
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%'
               AND (p.proacl IS NULL OR EXISTS (
                 SELECT 1 FROM unnest(p.proacl) AS a WHERE (a)::text LIKE '=X/%'))) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'no inventory_% function executable by PUBLIC'

UNION ALL SELECT '15_realtime_tables', '2',
  (SELECT count(*)::text FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('inventory_items','inventory_images')),
  CASE WHEN (SELECT count(*) FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
               AND tablename IN ('inventory_items','inventory_images')) = 2 THEN 'PASS' ELSE 'FAIL' END,
  'inventory_items + inventory_images members of supabase_realtime'

ORDER BY check_name;
