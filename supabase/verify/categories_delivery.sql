-- ============================================================================
-- CATEGORIES + DELIVERY — post-apply verification (00050)
-- Run in the Supabase SQL Editor (owner role) after applying 00050.
-- Expected: each query returns rows / the expected values (no errors).
-- ============================================================================

-- 1) Tables exist
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('categories', 'delivery_zones', 'delivery_fees', 'orders', 'order_items');

-- 2) RPCs exist
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'categories_is_admin', 'categories_admin_create', 'categories_admin_update',
    'categories_admin_delete', 'categories_admin_set_status', 'categories_admin_reorder',
    'delivery_estimate', 'delivery_create_order'
  )
ORDER BY proname;

-- 3) RLS enabled (defense-in-depth)
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('categories', 'delivery_zones', 'delivery_fees', 'orders', 'order_items');

-- 4) Public read is restricted to ACTIVE categories only (policy must exist)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'categories'
ORDER BY policyname;

-- 5) Execution revoked from PUBLIC and granted to anon + authenticated
SELECT p.proname, r.grantee, r.privilege_type
FROM pg_proc p
JOIN information_schema.routine_privileges r
  ON r.routine_name = p.proname
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'categories_admin_create', 'categories_admin_update', 'categories_admin_delete',
    'categories_admin_set_status', 'categories_admin_reorder', 'delivery_estimate',
    'delivery_create_order'
  )
  AND r.privilege_type = 'EXECUTE'
ORDER BY p.proname, r.grantee;

-- 6) Seed baseline present (top-level navigation categories)
SELECT slug, name, name_ar, is_active, sort_order, display_mode, theme, delivery_available
FROM public.categories
WHERE parent_id IS NULL
ORDER BY sort_order;

-- 7) UNIQUE slug constraint enforced
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.categories'::regclass AND contype = 'u';

-- 8) Order-number sequence exists (delivery_create_order depends on it)
SELECT sequencename
FROM pg_sequences
WHERE schemaname = 'public' AND sequencename = 'orders_id_seq';
