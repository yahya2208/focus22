-- ============================================================================
-- FOCUS — LISTING CATEGORY CORE (MIGRATION 00035)
--
-- Migration number: 00035 (after 00034_recover_my_challenge_state.sql)
-- Type: Additive core extension (2 nullable-free columns + constraint swap
--       + 2 indexes). NO table rewrites, NO data changes, NO RPC changes.
--
-- PURPOSE
--   Turns `inventory_items` into the unified Listing store for all three
--   approved categories (phone | car | property) while keeping every
--   existing phone behavior byte-compatible:
--     1) `category`      — discriminator, default 'phone' (all current rows
--                          ARE phones, so the default is semantically exact;
--                          Postgres fast-default means ZERO row rewrites).
--     2) `price_period`  — neutral pricing unit: 'sale' | 'monthly'.
--                          Money itself stays in the EXISTING sell_price
--                          column (never duplicated); phones implicitly
--                          use 'sale' and never read this column.
--     3) SKU uniqueness  — the table-level UNIQUE (model_id, variant,
--                          condition, color) is a PHONE-domain concept
--                          (fungible units collapse into quantity). It is
--                          replaced by a PARTIAL UNIQUE INDEX scoped to
--                          category='phone' so cars/properties keep their
--                          natural identity: inventory_items.id.
--
-- PHONE EQUIVALENCE PROOF (why the swap preserves behavior)
--   At apply time every existing row has category='phone' (column is brand
--   new with DEFAULT 'phone'), therefore the partial-index predicate is
--   TRUE for every row that existed when the old constraint was active.
--   Enforcement set before == enforcement set after, identical tuple
--   (model_id, variant, condition, color). Nothing else ever referenced the
--   dropped constraint (no ON CONFLICT, no 23505 handling — audited).
--
-- SECURITY DESIGN
--   - Columns are plain data; access unchanged (inventory_items remains
--     reachable only via v_public_inventory / SECURITY DEFINER RPCs).
--   - price_period/category never expose anything private.
--
-- Depends on: public.inventory_items (migration 00019).
-- Rollback: see ROLLBACK section at the bottom (commented).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) category — listing discriminator
-- ============================================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'phone';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_category_check'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_category_check
      CHECK (category IN ('phone', 'car', 'property'));
  END IF;
END $$;

COMMENT ON COLUMN public.inventory_items.category IS
  'Listing category discriminator. Default phone: all pre-00035 rows are phones. Constrained to phone|car|property by inventory_items_category_check.';

-- ============================================================================
-- 2) price_period — neutral pricing unit (sale | monthly)
--    Money stays in sell_price; this column carries ONLY the unit.
-- ============================================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS price_period TEXT NOT NULL DEFAULT 'sale';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_price_period_check'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_price_period_check
      CHECK (price_period IN ('sale', 'monthly'));
  END IF;
END $$;

COMMENT ON COLUMN public.inventory_items.price_period IS
  'Neutral pricing unit for listings: sale (one-off, incl. all phones) or monthly (property rent). Amount lives in sell_price — never a second money column.';

-- ============================================================================
-- 3) SKU uniqueness re-scoping (constraint -> partial unique index)
--    Atomic swap inside this transaction: identical tuple, phones-only.
-- ============================================================================
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_unique_sku;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_sku_phone
  ON public.inventory_items (model_id, variant, condition, color)
  WHERE category = 'phone';

-- ============================================================================
-- 4) Category-aware lookup indexes (customer surfaces filter by these)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_inventory_items_category_status
  ON public.inventory_items (category, status);

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_published
  ON public.inventory_items (category, is_published);

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply; all four must be true)
-- ============================================================================
-- 1. Every legacy row classified correctly (expect: count = total):
--      SELECT count(*) FROM public.inventory_items WHERE category = 'phone';
-- 2. Constraint registered:
--      SELECT conname FROM pg_constraint
--       WHERE conrelid = 'public.inventory_items'::regclass
--         AND conname IN ('inventory_items_category_check',
--                         'inventory_items_price_period_check');
-- 3. Partial index present:
--      SELECT indexname FROM pg_indexes
--       WHERE tablename = 'inventory_items'
--         AND indexname = 'uq_inventory_items_sku_phone';
-- 4. Duplicate-SKU guard still bites for phones (must ERROR):
--      INSERT INTO public.inventory_items
--        (model_id, brand, model, variant, condition, color, category)
--      VALUES
--        ((SELECT model_id FROM public.inventory_items LIMIT 1),
--         'x', 'x', '', 'New', '', 'phone');
--
-- ROLLBACK (reverse order; safe only after confirming no car/property rows):
--   DROP INDEX IF EXISTS public.uq_inventory_items_sku_phone;
--   ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_price_period_check;
--   ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_category_check;
--   DROP INDEX IF EXISTS public.idx_inventory_items_category_published;
--   DROP INDEX IF EXISTS public.idx_inventory_items_category_status;
--   ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS price_period;
--   ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS category;
--   ALTER TABLE public.inventory_items
--     ADD CONSTRAINT inventory_items_unique_sku UNIQUE (model_id, variant, condition, color);
