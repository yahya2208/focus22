-- ============================================================================
-- FOCUS — PRE-APPLY EVIDENCE (PHASE 2C). Run BEFORE 01-inventory-apply.sql.
-- Capture current state so we can prove the migration is additive and
-- reversible. Run as postgres (SQL Editor) and save output.
--
-- PASS CRITERIA (all must hold before apply is authorized):
--   1) tables inventory_items / inventory_images / inventory_movements absent
--   2) view v_public_inventory absent
--   3) zero public.inventory_% functions
--   4) bucket 'inventory-images' absent + no storage policies referencing it
--   5) realtime: inventory_items / inventory_images NOT yet members of the EXISTING
--      supabase_realtime publication. The approved design adds tables to that publication
--      and NEVER creates a publication named 'inventory_central' (absence is by design,
--      confirmed again in 04 check 10 where expected value is 0).
--   6) public.users exists with >= 1 admin/super_admin
--   7) gen_random_uuid() available (used by the plan)
--   8) users.id is type uuid (matches the 00008 live baseline)
-- ============================================================================

SELECT current_database() AS db, current_user AS role, now() AS captured_at;

-- 1) Tables that must NOT already exist (would make this NON-additive).
SELECT 'inventory_items' AS table_name, to_regclass('public.inventory_items')::text AS state
UNION ALL
SELECT 'inventory_images', to_regclass('public.inventory_images')::text
UNION ALL
SELECT 'inventory_movements', to_regclass('public.inventory_movements')::text
UNION ALL
SELECT 'v_public_inventory', to_regclass('public.v_public_inventory')::text
ORDER BY table_name;

-- 2) Functions that must NOT already exist (RPC suite is CREATE OR REPLACE,
--    so absence is required to prove additivity of the whole migration).
SELECT p.oid::regprocedure::text AS function
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'inventory_%'
ORDER BY function;

-- 3) Storage bucket that must NOT already exist.
SELECT 'inventory-images' AS bucket, count(*) AS existing_count
FROM storage.buckets WHERE id = 'inventory-images';

-- 4) Storage object policies that must NOT reference the bucket yet.
SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (policyname LIKE '%inventory-images%' OR policyname LIKE 'Public read inventory images%')
ORDER BY policyname;

-- 5) Realtime pre-condition: neither central table may already be a member of the
--    existing supabase_realtime publication (would make the ALTER PUBLICATION a no-op
--    and break the additivity proof). 'inventory_central' publication is NEVER created
--    in this design, so it is not checked as a requirement here (04 check 10 confirms
--    its by-design absence, expected 0).
SELECT 'already_member' AS check_name, count(*) AS members
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('inventory_items','inventory_images');

-- 6) Baseline that MUST exist: users table with at least one admin/super_admin.
SELECT count(*) AS admin_count
FROM public.users WHERE role IN ('admin','super_admin');

-- 7) UUID generator availability (the plan uses gen_random_uuid()).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.proname = 'gen_random_uuid';

-- 8) users.id type must be uuid (matches the 00008 live baseline).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id';
