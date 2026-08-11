-- ============================================================================
-- FOCUS — CENTRAL INVENTORY ROLLBACK (PHASE 2C — REVERSED ORDER)
-- Exact reverse of 01-inventory-apply.sql (Phase 2C revised draft).
-- Idempotent. DROP ... IF EXISTS / guarded DO blocks.
-- Run only if the owner aborts the migration. ERASES central data; any data
-- created since the apply is LOST. localStorage backups are NOT affected.
-- ============================================================================

-- 1) Realtime publication (remove tables from supabase_realtime)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_items;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_images;
  END IF;
END $$;

-- 2) Storage bucket + objects + policies (objects first, then policies, then bucket)
DELETE FROM storage.objects WHERE bucket_id = 'inventory-images';
DROP POLICY IF EXISTS "Public read inventory-images" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload inventory-images" ON storage.objects;
DROP POLICY IF EXISTS "Staff update inventory-images" ON storage.objects;
DROP POLICY IF EXISTS "Staff delete inventory-images" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'inventory-images';

-- 3) RPCs (drop functions; grants/REVOKEs disappear with them)
DROP FUNCTION IF EXISTS public.inventory_remove_image(uuid);
DROP FUNCTION IF EXISTS public.inventory_add_image(uuid, text, integer, boolean);
DROP FUNCTION IF EXISTS public.inventory_set_published(uuid, boolean, text, text);
DROP FUNCTION IF EXISTS public.inventory_restore(uuid, text, text);
DROP FUNCTION IF EXISTS public.inventory_set_status(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.inventory_update_details(uuid, text, text, text, text, text, text, text, text, text, integer, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.inventory_update_prices(uuid, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.inventory_adjust_stock(uuid, integer, text, jsonb, text);
DROP FUNCTION IF EXISTS public.inventory_remove_stock(uuid, integer, text, jsonb, text);
DROP FUNCTION IF EXISTS public.inventory_add_stock(uuid, integer, text, jsonb, text);
DROP FUNCTION IF EXISTS public.inventory_add_item(text, text, text, text, text, text, text, text, integer, numeric, numeric, text, integer, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.inventory_management_list();
DROP FUNCTION IF EXISTS public.inventory_calc_status(integer);
DROP FUNCTION IF EXISTS public.inventory_is_admin();

-- 4) View
DROP VIEW IF EXISTS public.v_public_inventory;

-- 5) Policies (dropped with tables, but explicit for cleanliness)
DROP POLICY IF EXISTS "Staff read inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Public read inventory images" ON public.inventory_images;

-- 6) Triggers
DROP TRIGGER IF EXISTS trg_inventory_items_audit ON public.inventory_items;
DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
DROP FUNCTION IF EXISTS public.audit_inventory_change();
DROP FUNCTION IF EXISTS public.set_inventory_updated();

-- 7) Tables (movements → images → items)
DROP TABLE IF EXISTS public.inventory_movements;
DROP TABLE IF EXISTS public.inventory_images;
DROP TABLE IF EXISTS public.inventory_items;
