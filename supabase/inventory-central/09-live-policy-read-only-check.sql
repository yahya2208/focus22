-- ============================================================================
-- 09-live-policy-read-only-check.sql
-- Purpose: READ-ONLY verification of the LIVE storage policies + RPC body for
--          the inventory-images bucket, to decide whether an App-only path fix
--          can work or whether a SQL alignment is required.
-- Authorized context: owner runs this in the Production Supabase SQL Editor.
-- Safe: SELECT-only. No DDL, no DML, no writes. No side effects.
-- ============================================================================

-- 1. Storage policies currently applied to the inventory-images bucket
--    (shows the actual WITH CHECK / USING expressions, not just names).
SELECT
  p.policyname,
  p.cmd,
  pg_get_expr(p.polqual, p.polrelid)         AS using_qual,
  pg_get_expr(p.polwithcheck, p.polrelid)    AS with_check
FROM pg_policies p
WHERE p.schemaname = 'storage'
  AND p.tablename  = 'objects'
  AND p.policyname IN (
    'Public read inventory-images',
    'Staff upload inventory-images',
    'Staff update inventory-images',
    'Staff delete inventory-images'
  )
ORDER BY p.policyname;

-- 2. RPC inventory_add_image: current applied body (path-check line included).
SELECT p.oid::regprocedure AS signature, p.prosrc AS function_body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'inventory_add_image';

-- 3. Bucket settings for inventory-images.
SELECT id, public, file_size_limit, allowed_mime_types, created_at, updated_at
FROM storage.buckets
WHERE id = 'inventory-images';

-- 4. Existing objects in the bucket (reveals the naming convention actually
--    in use on the live server; 0 rows means no upload ever succeeded).
SELECT id, name, created_at
FROM storage.objects
WHERE bucket_id = 'inventory-images'
ORDER BY created_at
LIMIT 50;

-- 5. Rows attached in inventory_images (0 expected pre-fix; any rows reveal
--    whether the RPC was ever called successfully on live).
SELECT count(*) AS inventory_images_rows
FROM public.inventory_images;
