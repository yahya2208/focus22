-- ============================================================================
-- FOCUS — POST-APPLY VERIFY (PHASE 2C). Run AFTER 01-inventory-apply.sql.
-- Every check should return the expected result. Save output as evidence.
-- ============================================================================

SELECT '01_objects' AS check, count(*) AS ok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('inventory_items','inventory_images','inventory_movements')
  AND c.relkind = 'r';

SELECT '02_view' AS check, count(*) AS ok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'v_public_inventory' AND c.relkind = 'v';

SELECT '03_rls_items' AS check, count(*) AS ok
FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_items' AND rowsecurity = TRUE;

SELECT '04_rls_images' AS check, count(*) AS ok
FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_images' AND rowsecurity = TRUE;

SELECT '05_rls_movements' AS check, count(*) AS ok
FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND rowsecurity = TRUE;

SELECT '06_triggers' AS check, count(*) AS ok
FROM pg_trigger WHERE tgname IN ('trg_inventory_items_updated_at','trg_inventory_items_audit');

-- Expect EXACTLY 14 functions with the inventory_% prefix.
SELECT '07_rpcs' AS check, count(*) AS ok
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%';

-- Row-level policies on public tables.
SELECT '08_policies' AS check, count(*) AS ok
FROM pg_policies WHERE schemaname = 'public'
  AND policyname IN ('Public read inventory images','Staff read inventory movements');

SELECT '09_bucket' AS check, count(*) AS ok
FROM storage.buckets WHERE id = 'inventory-images';

-- 10) By design NO publication named 'inventory_central' is created: the migration adds
--     the central tables to the EXISTING 'supabase_realtime' publication (guarded ALTER
--     PUBLICATION). Expected 0 here is a SUCCESS (by-design absence), NOT a failure.
--     The authoritative realtime verification is check #15 (both tables members of
--     supabase_realtime, expected 2).
SELECT '10_no_inventory_central_pub' AS check, count(*) AS ok
FROM pg_publication p WHERE p.pubname = 'inventory_central';

-- Admin baseline must still hold (>= 1 admin/super_admin in users).
SELECT '11_admin' AS check, count(*) AS ok
FROM public.users WHERE role IN ('admin','super_admin');

-- Public view must be empty before any data migration (publish gating).
SELECT '12_public_empty' AS check, count(*) AS rows FROM public.v_public_inventory;

-- Storage object policies for the bucket (expect 4: read/upload/update/delete).
SELECT '13_storage_policies' AS check, count(*) AS ok
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'Public read inventory-images',
    'Staff upload inventory-images',
    'Staff update inventory-images',
    'Staff delete inventory-images'
  );

-- Defense in depth: NO inventory_% function may be executable by PUBLIC
-- (proacl is NULL => default PUBLIC execute => leak). Expect 0 leaks.
SELECT '14_no_public_exec' AS check, count(*) AS leaked
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%'
  AND (p.proacl IS NULL OR EXISTS (
    SELECT 1 FROM unnest(p.proacl) AS a WHERE (a)::text LIKE '=X/%'
  ));

-- Realtime: both tables must be members of supabase_realtime. Expect 2.
SELECT '15_realtime_tables' AS check, count(*) AS ok
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('inventory_items','inventory_images');
