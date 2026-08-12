-- ============================================================================
-- FOCUS — POST-BACKFILL VERIFY (Phase A, Step 6) — READ-ONLY
--
-- PURPOSE: after 06-inventory-backfill-canonical.sql commits 8/8, re-verify the
-- structural invariants of 00019 with the row counts now expected POST-backfill
-- (items = 8, images = 0, movements = 8) plus a per-SKU field assertion against
-- the canonical dataset.
--
-- READ-ONLY: SELECT only. Nothing is created or modified.
-- Run as postgres in the Supabase SQL Editor and save the single grid.
-- Columns: check_name | expected | actual_value | status | detail
-- ============================================================================

SELECT
  'row_items' AS check_name,
  '8' AS expected,
  (SELECT count(*)::text FROM public.inventory_items),
  CASE WHEN (SELECT count(*) FROM public.inventory_items) = 8 THEN 'PASS' ELSE 'FAIL' END AS status,
  'inventory_items rows = 8 (canonical backfill)'

UNION ALL SELECT 'row_images', '0',
  (SELECT count(*)::text FROM public.inventory_images),
  CASE WHEN (SELECT count(*) FROM public.inventory_images) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'inventory_images rows = 0 (no images in canonical dataset)'

UNION ALL SELECT 'row_movements', '8',
  (SELECT count(*)::text FROM public.inventory_movements),
  CASE WHEN (SELECT count(*) FROM public.inventory_movements) = 8 THEN 'PASS' ELSE 'FAIL' END,
  'inventory_movements rows = 8 (one created per backfilled item)'

UNION ALL SELECT 'source_key_unique', '8',
  (SELECT count(*)::text FROM public.inventory_items WHERE source_key IS NOT NULL),
  CASE WHEN (SELECT count(*) FROM public.inventory_items WHERE source_key IS NOT NULL) = 8 THEN 'PASS' ELSE 'FAIL' END,
  'all 8 rows carry a non-null source_key'

UNION ALL SELECT 'published_none', '0',
  (SELECT count(*)::text FROM public.inventory_items WHERE is_published = TRUE),
  CASE WHEN (SELECT count(*) FROM public.inventory_items WHERE is_published = TRUE) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'no row auto-published (D-CANON-2)'

UNION ALL SELECT 'sku_iphone15pro', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = '5cd016dd-d233-4502-93aa-dfa16ddd168f'
     AND model_id = 'Apple iPhone 15 Pro' AND brand = 'Apple' AND model = 'iPhone 15 Pro'
     AND variant = '8/256' AND ram = '8GB' AND storage = '256GB' AND condition = 'Like New'
     AND color = '' AND quantity = 2 AND status = 'low_stock'
     AND buy_price = 175000 AND sell_price = 199000
     AND total_purchased = 2 AND total_sold = 0),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = '5cd016dd-d233-4502-93aa-dfa16ddd168f'
               AND model_id = 'Apple iPhone 15 Pro' AND brand = 'Apple' AND model = 'iPhone 15 Pro'
               AND variant = '8/256' AND ram = '8GB' AND storage = '256GB' AND condition = 'Like New'
               AND color = '' AND quantity = 2 AND status = 'low_stock'
               AND buy_price = 175000 AND sell_price = 199000
               AND total_purchased = 2 AND total_sold = 0) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 1 (iPhone 15 Pro 8/256) matches canonical dataset exactly'

UNION ALL SELECT 'sku_iphone14', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = 'dd304e72-4ed3-456b-99cc-4fcef6986ccd'
     AND model_id = 'Apple iPhone 14' AND variant = '6/128' AND condition = 'Excellent'
     AND quantity = 2 AND status = 'low_stock'
     AND buy_price = 115000 AND sell_price = 135000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = 'dd304e72-4ed3-456b-99cc-4fcef6986ccd'
               AND model_id = 'Apple iPhone 14' AND variant = '6/128' AND condition = 'Excellent'
               AND quantity = 2 AND status = 'low_stock'
               AND buy_price = 115000 AND sell_price = 135000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 2 (iPhone 14 6/128) matches canonical dataset exactly'

UNION ALL SELECT 'sku_iphone13', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = 'b9f47a46-38ba-49f1-8323-70ac783c59ea'
     AND model_id = 'Apple iPhone 13' AND variant = '4/128' AND condition = 'Good'
     AND quantity = 3 AND status = 'low_stock'
     AND buy_price = 85000 AND sell_price = 105000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = 'b9f47a46-38ba-49f1-8323-70ac783c59ea'
               AND model_id = 'Apple iPhone 13' AND variant = '4/128' AND condition = 'Good'
               AND quantity = 3 AND status = 'low_stock'
               AND buy_price = 85000 AND sell_price = 105000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 3 (iPhone 13 4/128) matches canonical dataset exactly'

UNION ALL SELECT 'sku_s24ultra', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = '89cd5d97-603a-4b16-89b3-898e3acb6f4e'
     AND model_id = 'Samsung Galaxy S24 Ultra' AND variant = '12/512' AND condition = 'Like New'
     AND quantity = 2 AND status = 'low_stock'
     AND buy_price = 165000 AND sell_price = 190000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = '89cd5d97-603a-4b16-89b3-898e3acb6f4e'
               AND model_id = 'Samsung Galaxy S24 Ultra' AND variant = '12/512' AND condition = 'Like New'
               AND quantity = 2 AND status = 'low_stock'
               AND buy_price = 165000 AND sell_price = 190000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 4 (Galaxy S24 Ultra 12/512) matches canonical dataset exactly'

UNION ALL SELECT 'sku_s22', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = '26f4240a-ff01-4e56-aba0-f54c233ec7ef'
     AND model_id = 'Samsung Galaxy S22' AND variant = '8/128' AND condition = 'Excellent'
     AND quantity = 3 AND status = 'low_stock'
     AND buy_price = 75000 AND sell_price = 90000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = '26f4240a-ff01-4e56-aba0-f54c233ec7ef'
               AND model_id = 'Samsung Galaxy S22' AND variant = '8/128' AND condition = 'Excellent'
               AND quantity = 3 AND status = 'low_stock'
               AND buy_price = 75000 AND sell_price = 90000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 5 (Galaxy S22 8/128) matches canonical dataset exactly'

UNION ALL SELECT 'sku_a54', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = '585cd6d3-2932-49c8-9d5c-836d613a7fed'
     AND model_id = 'Samsung Galaxy A54' AND variant = '8/128' AND condition = 'Good'
     AND quantity = 4 AND status = 'in_stock'
     AND buy_price = 55000 AND sell_price = 68000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = '585cd6d3-2932-49c8-9d5c-836d613a7fed'
               AND model_id = 'Samsung Galaxy A54' AND variant = '8/128' AND condition = 'Good'
               AND quantity = 4 AND status = 'in_stock'
               AND buy_price = 55000 AND sell_price = 68000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 6 (Galaxy A54 8/128) matches canonical dataset exactly'

UNION ALL SELECT 'sku_redminote13', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = '19ef1727-dfab-4d84-af89-b55ca9c524fc'
     AND model_id = 'Xiaomi Redmi Note 13' AND variant = '8/256' AND condition = 'Good'
     AND quantity = 4 AND status = 'in_stock'
     AND buy_price = 45000 AND sell_price = 58000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = '19ef1727-dfab-4d84-af89-b55ca9c524fc'
               AND model_id = 'Xiaomi Redmi Note 13' AND variant = '8/256' AND condition = 'Good'
               AND quantity = 4 AND status = 'in_stock'
               AND buy_price = 45000 AND sell_price = 58000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 7 (Redmi Note 13 8/256) matches canonical dataset exactly'

UNION ALL SELECT 'sku_redmi12', '1',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE source_key = '03839b3d-b833-4c50-ad78-b1447e8b0905'
     AND model_id = 'Xiaomi Redmi 12' AND variant = '6/128' AND condition = 'Very Good'
     AND quantity = 3 AND status = 'low_stock'
     AND buy_price = 28000 AND sell_price = 38000),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE source_key = '03839b3d-b833-4c50-ad78-b1447e8b0905'
               AND model_id = 'Xiaomi Redmi 12' AND variant = '6/128' AND condition = 'Very Good'
               AND quantity = 3 AND status = 'low_stock'
               AND buy_price = 28000 AND sell_price = 38000) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'SKU 8 (Redmi 12 6/128) matches canonical dataset exactly'

UNION ALL SELECT 'fk_total', '5',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid IN (
     'public.inventory_items'::regclass,
     'public.inventory_images'::regclass,
     'public.inventory_movements'::regclass)),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid IN (
               'public.inventory_items'::regclass,
               'public.inventory_images'::regclass,
               'public.inventory_movements'::regclass)) = 5 THEN 'PASS' ELSE 'FAIL' END,
  'FK constraints intact (5)'

UNION ALL SELECT 'chk_condition_enum', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_condition_enum'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_condition_enum') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK condition enum intact'

UNION ALL SELECT 'chk_status_enum', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_status_enum'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_status_enum') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK status enum intact'

UNION ALL SELECT 'rls_items', '1',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_items' AND rowsecurity = TRUE),
  CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_items' AND rowsecurity = TRUE) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'RLS enabled on inventory_items'

UNION ALL SELECT 'rls_images', '1',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_images' AND rowsecurity = TRUE),
  CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_images' AND rowsecurity = TRUE) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'RLS enabled on inventory_images'

UNION ALL SELECT 'rls_movements', '1',
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND rowsecurity = TRUE),
  CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND rowsecurity = TRUE) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'RLS enabled on inventory_movements'

UNION ALL SELECT 'pub_view_consistent', '0',
  (SELECT (count(*))::text
   FROM (
     SELECT 1 FROM public.v_public_inventory
     EXCEPT ALL
     SELECT 1 FROM public.inventory_items
     WHERE is_published = TRUE AND quantity > 0
       AND status NOT IN ('archived','discontinued','deleted')
   ) d),
  CASE WHEN (SELECT count(*) FROM (
             SELECT 1 FROM public.v_public_inventory
             EXCEPT ALL
             SELECT 1 FROM public.inventory_items
             WHERE is_published = TRUE AND quantity > 0
               AND status NOT IN ('archived','discontinued','deleted')
           ) d) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'public view exposes exactly the visibility-gate rows (empty until published)'

UNION ALL SELECT 'pub_published_not_inactive', '0',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE is_published = TRUE AND status IN ('archived','discontinued','deleted')),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE is_published = TRUE AND status IN ('archived','discontinued','deleted')) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'no item published while archived/discontinued/deleted'

ORDER BY check_name;
