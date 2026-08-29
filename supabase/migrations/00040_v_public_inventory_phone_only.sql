-- ============================================================================
-- 00040 — v_public_inventory: PHONES ONLY
-- ============================================================================
-- Owner decision: P8.6 / D3. FILE ONLY — must NOT be executed by the app
-- developer. It ships in the repository and is applied later, by Yahya, in
-- the Supabase SQL Editor AFTER migrations 00035–00039 (it depends on the
-- `category` column those add to inventory_items).
--
-- WHY THIS EXISTS (P8.5/P8.6 discovery finding):
--   Since 00035, car and property listings live in the SAME inventory_items
--   table. The public view from 00019 predates that column and has no
--   category predicate, so once a car/property listing is published it would
--   ALSO surface inside the legacy phone showroom grid (v_public_inventory),
--   rendered as malformed phone cards by InventoryService.
--
-- FIX:
--   Byte-identical projection + visibility gate as 00019, plus exactly one
--   new predicate: AND category = 'phone'. Car/property public reads keep
--   flowing exclusively through v_public_listings / listing_search (00037/
--   00038), which are already category-scoped.
--
-- CONTRACT PRESERVED:
--   * Same columns, same order, same types as 00019 (CREATE OR REPLACE VIEW
--     requires an unchanged column list).
--   * security_invoker = false (view owner = postgres) so anon visitors can
--     read it without RLS on the base table.
--   * Visibility gate unchanged: is_published = TRUE AND quantity > 0 AND
--     status NOT IN ('archived','discontinued','deleted').
--   * Phones-only scope ADDED: category = 'phone'.
--
-- APPLY ORDER (Yahya, SQL Editor): 00035 → 00036 → 00037 → 00038 → 00039
--   → 00040. Then run the verification block at the bottom of this file.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_public_inventory AS
SELECT
  id,
  model_id,
  brand,
  model,
  variant,
  ram,
  storage,
  condition,
  color,
  quantity,
  status,
  sell_price,
  code,
  battery_health,
  warranty,
  city,
  description,
  updated_at
FROM public.inventory_items
WHERE is_published = TRUE
  AND quantity > 0
  AND status NOT IN ('archived','discontinued','deleted')
  AND category = 'phone';

-- ----------------------------------------------------------------------------
-- POST-APPLY VERIFICATION (run manually after applying; every query must hold)
-- ----------------------------------------------------------------------------
-- 1. The view still returns phones only:
--      SELECT DISTINCT category FROM public.v_public_inventory;
--    Expected: exactly one row: 'phone'.
--
-- 2. A published car/property listing never leaks into the phone grid:
--      SELECT count(*) FROM public.v_public_inventory vi
--      JOIN public.v_public_listings vl ON vl.id = vi.id;
--    Expected: 0.
--
-- 3. Phone showroom parity with the pre-00035 semantics for phones:
--      SELECT count(*) FROM public.v_public_inventory;
--    Expected: equal to the number of PUBLISHED phones with quantity > 0 and
--    active status — identical to the count before this migration.
--
-- 4. Car/property public surface unaffected:
--      SELECT category, count(*) FROM public.v_public_listings GROUP BY category;
--    Expected: rows only for 'car' and 'property' (never 'phone').
--
-- ROLLBACK (only if ever needed):
--      CREATE OR REPLACE VIEW public.v_public_inventory AS
--      SELECT id, model_id, brand, model, variant, ram, storage, condition,
--             color, quantity, status, sell_price, code, battery_health,
--             warranty, city, description, updated_at
--      FROM public.inventory_items
--      WHERE is_published = TRUE
--        AND quantity > 0
--        AND status NOT IN ('archived','discontinued','deleted');
--    (This restores the pre-00040 leak; do not keep it applied long.)
-- ----------------------------------------------------------------------------
