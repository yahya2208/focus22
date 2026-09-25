-- ============================================================================
-- GATE V1.5 — PILOT PRODUCE SEED (Vegetables family store catalog).
-- Data ONLY: 8 produce items (category='produce', unit='kg', published) +
-- store_inventory links to pilot-store-1 with display positions.
-- Idempotent: re-runnable via source_key exclusion + ON CONFLICT DO NOTHING.
-- Scoped: touches ONLY pilot:veg-* rows and their pilot-store-1 links.
-- No schema/RLS/RPC/ledger/pricing changes. No Production targeting in-file
-- (apply to Staging only, by hand, per the handoff pack).
-- Legal values verified: category ('produce' ∈ 00053 CHECK), unit ('kg' ∈
-- unit_check), status ('in_stock' ∈ 00019 enum), quantity numeric(12,3).
-- Order: after 00104 (numeric quantities). NOT applied to any DB by this file.
-- ============================================================================

-- 1) Eight published produce items (decimal-kg stocks where approved).
INSERT INTO public.inventory_items
  (model_id, brand, model, quantity, status, sell_price,
   category, unit, city, description, is_published, source_key)
SELECT u.model_id, u.brand, u.model, u.quantity, u.status, u.sell_price,
       u.category, u.unit, u.city, u.description, u.is_published, u.source_key
FROM (VALUES
  ('veg-tomato'  ,'','طماطم' ,'2.5','in_stock',120,'produce','kg',NULL,'Tomato',TRUE,'pilot:veg-tomato'),
  ('veg-potato'  ,'','بطاطا' ,'6'  ,'in_stock', 90,'produce','kg',NULL,'Potato',TRUE,'pilot:veg-potato'),
  ('veg-onion'   ,'','بصل'   ,'4'  ,'in_stock',100,'produce','kg',NULL,'Onion',TRUE,'pilot:veg-onion'),
  ('veg-carrot'  ,'','جزر'   ,'3'  ,'in_stock',110,'produce','kg',NULL,'Carrot',TRUE,'pilot:veg-carrot'),
  ('veg-cucumber','','خيار'  ,'2.5','in_stock',130,'produce','kg',NULL,'Cucumber',TRUE,'pilot:veg-cucumber'),
  ('veg-pepper'  ,'','فلفل'  ,'1.5','in_stock',250,'produce','kg',NULL,'Pepper',TRUE,'pilot:veg-pepper'),
  ('veg-zucchini','','كوسا'  ,'2'  ,'in_stock',140,'produce','kg',NULL,'Zucchini',TRUE,'pilot:veg-zucchini'),
  ('veg-eggplant','','باذنجان','3' ,'in_stock',160,'produce','kg',NULL,'Eggplant',TRUE,'pilot:veg-eggplant')
) AS u(model_id,brand,model,quantity,status,sell_price,category,unit,city,description,is_published,source_key)
WHERE u.source_key NOT IN (SELECT COALESCE(source_key, '') FROM public.inventory_items)
ON CONFLICT (model_id, variant, condition, color) DO NOTHING;

-- 2) Link the eight items to pilot-store-1 with display positions 1..8.
INSERT INTO public.store_inventory (store_id, inventory_id, position, is_primary)
SELECT s.id, ii.id, u.position, u.position = 1
FROM public.stores s
JOIN public.inventory_items ii ON ii.source_key IN (
  'pilot:veg-tomato','pilot:veg-potato','pilot:veg-onion','pilot:veg-carrot',
  'pilot:veg-cucumber','pilot:veg-pepper','pilot:veg-zucchini','pilot:veg-eggplant'
)
JOIN (
  SELECT 'pilot:veg-tomato'::text   AS sk, 1::integer AS position
  UNION ALL SELECT 'pilot:veg-potato'  ,2
  UNION ALL SELECT 'pilot:veg-onion'   ,3
  UNION ALL SELECT 'pilot:veg-carrot'  ,4
  UNION ALL SELECT 'pilot:veg-cucumber',5
  UNION ALL SELECT 'pilot:veg-pepper'  ,6
  UNION ALL SELECT 'pilot:veg-zucchini',7
  UNION ALL SELECT 'pilot:veg-eggplant',8
) u ON u.sk = ii.source_key
WHERE s.slug = 'pilot-store-1'
ON CONFLICT (store_id, inventory_id) DO NOTHING;
