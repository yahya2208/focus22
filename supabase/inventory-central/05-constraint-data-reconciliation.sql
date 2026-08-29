-- ============================================================================
-- FOCUS — POST-APPLY VERIFY (PHASE 2C) — CONSTRAINT + DATA RECONCILIATION
-- UNIFIED READ-ONLY EDITION
--
-- PURPOSE: Verify the structural and data-level invariants required by
-- 00019_inventory_central.sql that 04-post-apply-verify.sql does not cover:
--   FK relationships (incl. ON DELETE CASCADE), CHECK constraints on
--   sensitive columns, PK / UNIQUE constraints, orphan rows, FK/PK type
--   compatibility, current row counts, publish gating consistency, and the
--   required indexes.
--
-- READ-ONLY: SELECT only. No CREATE / INSERT / UPDATE / DELETE / ALTER /
-- DROP / GRANT / REVOKE. Nothing is created or modified.
--
-- SINGLE RESULT SET: every check is one row (UNION ALL). Columns:
--   check_name | expected | actual_value | status | detail
--   status = PASS when actual_value matches expected, else FAIL.
--
-- Run as postgres in the Supabase SQL Editor and save the single grid.
-- ============================================================================

SELECT
  'fk_total' AS check_name,
  '5' AS expected,
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid IN (
     'public.inventory_items'::regclass,
     'public.inventory_images'::regclass,
     'public.inventory_movements'::regclass
   )) AS actual_value,
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid IN (
               'public.inventory_items'::regclass,
               'public.inventory_images'::regclass,
               'public.inventory_movements'::regclass
             )) = 5 THEN 'PASS' ELSE 'FAIL' END AS status,
  'total FK constraints across the 3 inventory tables (items: created_by, updated_by; images: inventory_id; movements: inventory_id, actor_user_id)' AS detail

UNION ALL SELECT 'fk_images_item', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_images'::regclass AND confrelid = 'public.inventory_items'::regclass),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_images'::regclass AND confrelid = 'public.inventory_items'::regclass) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'FK inventory_images.inventory_id -> inventory_items.id'

UNION ALL SELECT 'fk_images_cascade', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_images'::regclass AND confrelid = 'public.inventory_items'::regclass AND confdeltype = 'c'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_images'::regclass AND confrelid = 'public.inventory_items'::regclass AND confdeltype = 'c') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'images.inventory_id FK has ON DELETE CASCADE (confdeltype = c)'

UNION ALL SELECT 'fk_movements_item', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_movements'::regclass AND confrelid = 'public.inventory_items'::regclass),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_movements'::regclass AND confrelid = 'public.inventory_items'::regclass) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'FK inventory_movements.inventory_id -> inventory_items.id'

UNION ALL SELECT 'fk_movements_cascade', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_movements'::regclass AND confrelid = 'public.inventory_items'::regclass AND confdeltype = 'c'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_movements'::regclass AND confrelid = 'public.inventory_items'::regclass AND confdeltype = 'c') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'movements.inventory_id FK has ON DELETE CASCADE (confdeltype = c)'

UNION ALL SELECT 'fk_movements_actor', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_movements'::regclass AND confrelid = 'public.users'::regclass),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_movements'::regclass AND confrelid = 'public.users'::regclass) = 1 THEN 'PASS' ELSE 'FAIL' END,
  'FK inventory_movements.actor_user_id -> users.id'

UNION ALL SELECT 'fk_items_created_by', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_items'::regclass AND confrelid = 'public.users'::regclass AND conname LIKE 'inventory_items_created_by%'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_items'::regclass AND confrelid = 'public.users'::regclass AND conname LIKE 'inventory_items_created_by%') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'FK inventory_items.created_by -> users.id'

UNION ALL SELECT 'fk_items_updated_by', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE contype = 'f' AND conrelid = 'public.inventory_items'::regclass AND confrelid = 'public.users'::regclass AND conname LIKE 'inventory_items_updated_by%'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE contype = 'f' AND conrelid = 'public.inventory_items'::regclass AND confrelid = 'public.users'::regclass AND conname LIKE 'inventory_items_updated_by%') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'FK inventory_items.updated_by -> users.id'

UNION ALL SELECT 'chk_condition_enum', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_condition_enum'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_condition_enum') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK inventory_items_condition_enum (11 values) on condition'

UNION ALL SELECT 'chk_status_enum', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_status_enum'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_status_enum') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK inventory_items_status_enum (6 values) on status'

UNION ALL SELECT 'chk_quantity_nonneg', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_quantity_nonneg'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_quantity_nonneg') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK quantity >= 0'

UNION ALL SELECT 'chk_buy_price_nonneg', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_buy_price_nonneg'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_buy_price_nonneg') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK buy_price >= 0 (or NULL)'

UNION ALL SELECT 'chk_sell_price_nonneg', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_sell_price_nonneg'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_sell_price_nonneg') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK sell_price >= 0 (or NULL)'

UNION ALL SELECT 'chk_battery_range', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_battery_range'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'c' AND conname = 'inventory_items_battery_range') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK battery_health IS NULL OR 0..100'

UNION ALL SELECT 'chk_movements_action_enum', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_movements'::regclass AND contype = 'c' AND conname = 'inventory_movements_action_enum'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_movements'::regclass AND contype = 'c' AND conname = 'inventory_movements_action_enum') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'CHECK inventory_movements_action_enum on action'

UNION ALL SELECT 'pk_items', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'p'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'p') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'PK on inventory_items.id'

UNION ALL SELECT 'pk_images', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_images'::regclass AND contype = 'p'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_images'::regclass AND contype = 'p') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'PK on inventory_images.id'

UNION ALL SELECT 'pk_movements', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_movements'::regclass AND contype = 'p'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_movements'::regclass AND contype = 'p') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'PK on inventory_movements.id'

UNION ALL SELECT 'uq_sku_phone_scoped', 'PASS',
  (SELECT COALESCE(MAX(
     i.indisunique::text
     || '|partial=' || (i.indpred IS NOT NULL)::text
     || '|pred=' || lower(btrim(replace(pg_get_expr(i.indexpred, i.indrelid), '::text', '')))
     || '|cols=' || COALESCE(
       (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
          FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum), ''))
   ), 'MISSING')
   FROM pg_index i
   JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'uq_inventory_items_sku_phone'
    AND c.relnamespace = 'public'::regnamespace),
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'uq_inventory_items_sku_phone'
      AND c.relnamespace = 'public'::regnamespace
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND lower(btrim(replace(pg_get_expr(i.indexpred, i.indrelid), '::text', ''))) = '(category = ''phone'')'
      AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
             FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) = 'model_id,variant,condition,color'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'phone-only SKU uniqueness after 00035: partial UNIQUE(model_id, variant, condition, color) WHERE category = phone'

UNION ALL SELECT 'uq_images_path', '1',
  (SELECT count(*)::text FROM pg_constraint
   WHERE conrelid = 'public.inventory_images'::regclass AND contype = 'u' AND conname = 'inventory_images_unique_path'),
  CASE WHEN (SELECT count(*) FROM pg_constraint
             WHERE conrelid = 'public.inventory_images'::regclass AND contype = 'u' AND conname = 'inventory_images_unique_path') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'UNIQUE(inventory_id, path)'

UNION ALL SELECT 'uq_images_cover', '1',
  (SELECT count(*)::text FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uq_inventory_images_cover'),
  CASE WHEN (SELECT count(*) FROM pg_indexes
             WHERE schemaname = 'public' AND indexname = 'uq_inventory_images_cover') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'partial UNIQUE index: one cover image per item (is_cover = TRUE)'

UNION ALL SELECT 'uq_source_key', '1',
  (SELECT count(*)::text FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uq_inventory_items_source_key'),
  CASE WHEN (SELECT count(*) FROM pg_indexes
             WHERE schemaname = 'public' AND indexname = 'uq_inventory_items_source_key') = 1 THEN 'PASS' ELSE 'FAIL' END,
  'partial UNIQUE index on source_key (WHERE source_key IS NOT NULL)'

UNION ALL SELECT 'orphan_images', '0',
  (SELECT count(*)::text FROM public.inventory_images i
   WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items t WHERE t.id = i.inventory_id)),
  CASE WHEN (SELECT count(*) FROM public.inventory_images i
             WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items t WHERE t.id = i.inventory_id)) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'orphan inventory_images rows (inventory_id without matching item)'

UNION ALL SELECT 'orphan_movements', '0',
  (SELECT count(*)::text FROM public.inventory_movements m
   WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items t WHERE t.id = m.inventory_id)),
  CASE WHEN (SELECT count(*) FROM public.inventory_movements m
             WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items t WHERE t.id = m.inventory_id)) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'orphan inventory_movements rows (inventory_id without matching item)'

UNION ALL SELECT 'fk_type_images_item', '0',
  (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_images'::regclass AND a.attname = 'inventory_id') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END),
  CASE WHEN (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_images'::regclass AND a.attname = 'inventory_id') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END) = '0' THEN 'PASS' ELSE 'FAIL' END,
  'images.inventory_id type matches items.id type'

UNION ALL SELECT 'fk_type_movements_item', '0',
  (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_movements'::regclass AND a.attname = 'inventory_id') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END),
  CASE WHEN (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_movements'::regclass AND a.attname = 'inventory_id') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END) = '0' THEN 'PASS' ELSE 'FAIL' END,
  'movements.inventory_id type matches items.id type'

UNION ALL SELECT 'fk_type_movements_actor', '0',
  (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_movements'::regclass AND a.attname = 'actor_user_id') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END),
  CASE WHEN (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_movements'::regclass AND a.attname = 'actor_user_id') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END) = '0' THEN 'PASS' ELSE 'FAIL' END,
  'movements.actor_user_id type matches users.id type'

UNION ALL SELECT 'fk_type_items_created_by', '0',
  (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'created_by') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END),
  CASE WHEN (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'created_by') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END) = '0' THEN 'PASS' ELSE 'FAIL' END,
  'items.created_by type matches users.id type'

UNION ALL SELECT 'fk_type_items_updated_by', '0',
  (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'updated_by') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END),
  CASE WHEN (SELECT CASE WHEN
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.inventory_items'::regclass AND a.attname = 'updated_by') =
      (SELECT t.typname FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
       WHERE a.attrelid = 'public.users'::regclass AND a.attname = 'id')
    THEN '0' ELSE '1' END) = '0' THEN 'PASS' ELSE 'FAIL' END,
  'items.updated_by type matches users.id type'

UNION ALL SELECT 'row_items', '0',
  (SELECT count(*)::text FROM public.inventory_items),
  CASE WHEN (SELECT count(*) FROM public.inventory_items) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'current inventory_items rows (0 expected pre-reconciliation)'

UNION ALL SELECT 'row_images', '0',
  (SELECT count(*)::text FROM public.inventory_images),
  CASE WHEN (SELECT count(*) FROM public.inventory_images) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'current inventory_images rows (0 expected pre-reconciliation)'

UNION ALL SELECT 'row_movements', '0',
  (SELECT count(*)::text FROM public.inventory_movements),
  CASE WHEN (SELECT count(*) FROM public.inventory_movements) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'current inventory_movements rows (0 expected pre-reconciliation)'

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
  'v_public_inventory exposes exactly the rows matching the visibility gate (published AND qty>0 AND active); any extra row = unauthorized exposure'

UNION ALL SELECT 'pub_published_not_inactive', '0',
  (SELECT count(*)::text FROM public.inventory_items
   WHERE is_published = TRUE AND status IN ('archived','discontinued','deleted')),
  CASE WHEN (SELECT count(*) FROM public.inventory_items
             WHERE is_published = TRUE AND status IN ('archived','discontinued','deleted')) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'no item is simultaneously is_published = TRUE and archived/discontinued/deleted'

UNION ALL SELECT 'idx_required_6', '6',
  (SELECT count(*)::text FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'idx_inventory_items_model_id',
     'idx_inventory_items_status',
     'idx_inventory_items_published',
     'idx_inventory_images_item',
     'idx_inventory_movements_item',
     'idx_inventory_movements_action'
   )),
  CASE WHEN (SELECT count(*) FROM pg_indexes
             WHERE schemaname = 'public' AND indexname IN (
               'idx_inventory_items_model_id',
               'idx_inventory_items_status',
               'idx_inventory_items_published',
               'idx_inventory_images_item',
               'idx_inventory_movements_item',
               'idx_inventory_movements_action'
             )) = 6 THEN 'PASS' ELSE 'FAIL' END,
  'the 6 required non-unique indexes created by 00019'

UNION ALL SELECT 'idx_unique_2', '2',
  (SELECT count(*)::text FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN (
     'uq_inventory_items_source_key',
     'uq_inventory_images_cover'
   )),
  CASE WHEN (SELECT count(*) FROM pg_indexes
             WHERE schemaname = 'public' AND indexname IN (
               'uq_inventory_items_source_key',
               'uq_inventory_images_cover'
             )) = 2 THEN 'PASS' ELSE 'FAIL' END,
  'the 2 partial UNIQUE indexes created by 00019'

ORDER BY check_name;
