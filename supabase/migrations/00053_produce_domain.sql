-- ============================================================================
-- FOCUS — PRODUCE DOMAIN + UNIT FOUNDATION (MIGRATION 00053)
--
-- Migration number: 00053 (after 00052_listing_order_authority.sql)
-- Type: PURELY ADDITIVE schema/domain foundation. Adds:
--   1) `inventory_items.unit`          — nullable pricing/sales unit column.
--      NULL for legacy domains (phone/car/property); NON-NULL for unit-based
--      produce/grocery goods. CONSTRAINT allows the unit vocabulary.
--   2) `produce_details`               — 1:1 child table (PK =
--      inventory_items.id, ON DELETE CASCADE), the sanctioned extra-attribute
--      store for the `produce` domain (origin, grade).
--   3) widen `inventory_items_category_check` to admit 'produce'.
--   4) `v_public_listings`             — REPLACE that adds `unit` +
--      `produce_origin` / `produce_grade` columns and the produce join.
--      Existing columns are left byte-identical (CREATE OR REPLACE VIEW
--      requires an unchanged column set; we only APPEND).
--
-- DESIGN (per the Generic Catalog architecture)
--   Domain  (inventory_items.category)  == the physical kind + its schema.
--   Product (a row)                     == a specific item (tomato, potato…).
--   Unit    (inventory_items.unit)      == the pricing/sales unit; it is a
--                                          CORE column so the public view and
--                                          server-authoritative order RPC can
--                                          read it without a child join.
--   Category (public.categories)        == the navigation hierarchy; ALREADY
--                                          DB-driven and domain-agnostic
--                                          (00050/00051), untouched here.
--
-- FRACTIONAL QUANTITY READINESS: `unit` is metadata only; `quantity` on
-- inventory_items and order_items.quantity remain INTEGER in this phase. The
-- schema is designed so a later migration can widen order_items.quantity to
-- numeric WITHOUT touching this file — no design choice here forecloses
-- fractional quantities (1.5 kg).
--
-- SECURITY (mirrors 00036 exactly — the car/property precedent):
--   produce_details keeps deny-all RLS + full revoke. Customers NEVER read
--   it directly; v_public_listings is the sanctioned window.
--   money stays in sell_price; price_period stays in the core.
--
-- Depends on: public.inventory_items + category/price_period (00035),
--             public.v_public_listings (00037).
-- Rollback: see ROLLBACK section at the bottom (commented).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE EXCEPTION 'inventory_items missing — apply migration 00019/00035 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
      AND column_name = 'category'
  ) THEN
    RAISE EXCEPTION 'inventory_items.category missing — apply migration 00035 first';
  END IF;
  IF to_regclass('public.v_public_listings') IS NULL THEN
    RAISE EXCEPTION 'public.v_public_listings missing — apply migration 00037 first';
  END IF;
END $$;

-- ============================================================================
-- 1) inventory_items.unit — nullable sales/pricing unit
--    NULL ⇒ not a unit-priced domain (phone/car/property scale by whole
--    items); non-NULL for produce/grocery (kg, liter, g, piece, dozen, bag).
-- ============================================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unit TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_items_unit_check'
      AND conrelid = 'public.inventory_items'::regclass
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT inventory_items_unit_check
      CHECK (unit IS NULL OR unit IN ('piece','kg','g','liter','dozen','bag'));
  END IF;
END $$;

COMMENT ON COLUMN public.inventory_items.unit IS
  'Sales/pricing unit for unit-based domains (produce/grocery). NULL for phone/car/property. Constrained by inventory_items_unit_check.';

CREATE INDEX IF NOT EXISTS idx_inventory_items_unit
  ON public.inventory_items (category, unit);

-- ============================================================================
-- 2) Widen the category discriminator — admit 'produce'
--    DROP + re-ADD the constraint so the CHECK set grows (semantically
--    additive: existing rows 'phone|car|property' all remain valid).
-- ============================================================================
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_category_check;

ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_category_check
  CHECK (category IN ('phone', 'car', 'property', 'produce'));

-- ============================================================================
-- 3) produce_details — 1:1 child store for produce-specific attributes
--    PK = inventory_items.id, ON DELETE CASCADE (mirrors car/property 00036).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.produce_details (
  id           uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  origin       text NOT NULL DEFAULT '',
  grade        text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_produce_details_updated_at ON public.produce_details;
CREATE TRIGGER trg_produce_details_updated_at
  BEFORE UPDATE ON public.produce_details
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated();

ALTER TABLE public.produce_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.produce_details FROM anon, authenticated;

-- ============================================================================
-- 4) v_public_listings — REPLACE, appending unit + produce_* columns
--    Existing columns and their order are preserved; only the produce join
--    and new columns are appended. (CREATE OR REPLACE VIEW allows adding
--    columns at the tail.)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_public_listings AS
SELECT
  ii.id,
  ii.category,
  ii.unit,

  ii.brand,
  ii.model,
  ii.color,
  ii.quantity,
  ii.status,
  ii.sell_price AS price,
  ii.price_period,
  ii.code,
  ii.warranty,
  ii.city,
  ii.description,

  ii.variant        AS phone_variant,
  ii.ram            AS phone_ram,
  ii.storage        AS phone_storage,
  ii.condition      AS phone_condition,
  ii.battery_health AS phone_battery_health,

  cd.trim           AS car_trim,
  cd.year           AS car_year,
  cd.mileage_km     AS car_mileage_km,
  cd.fuel           AS car_fuel,
  cd.transmission   AS car_transmission,
  cd.body_type      AS car_body_type,
  cd.engine_cc      AS car_engine_cc,
  cd.condition_state AS car_condition_state,

  pd.property_type,
  pd.transaction_type,
  pd.district       AS property_district,
  pd.area_m2        AS property_area_m2,
  pd.bedrooms       AS property_bedrooms,
  pd.bathrooms      AS property_bathrooms,
  pd.floor          AS property_floor,
  pd.furnished      AS property_furnished,
  pd.condition_state AS property_condition_state,

  -- Produce details — prefixed, NULL unless category='produce'
  prd.origin        AS produce_origin,
  prd.grade         AS produce_grade,

  COALESCE(img.paths, ARRAY[]::text[]) AS images,

  ii.created_at,
  ii.updated_at

FROM public.inventory_items ii
LEFT JOIN public.car_details      cd  ON cd.id  = ii.id
LEFT JOIN public.property_details pd  ON pd.id  = ii.id
LEFT JOIN public.produce_details  prd ON prd.id = ii.id
LEFT JOIN LATERAL (
  SELECT array_agg(im.path ORDER BY im.position, im.created_at) AS paths
  FROM public.inventory_images im
  WHERE im.inventory_id = ii.id
) img ON TRUE
WHERE ii.is_published = TRUE
  AND ii.quantity > 0
  AND ii.status NOT IN ('archived','discontinued','deleted');

ALTER VIEW public.v_public_listings SET (security_invoker = false);

GRANT SELECT ON public.v_public_listings TO anon, authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- 1. Constraint widened + unit column present:
--      SELECT conname FROM pg_constraint
--       WHERE conrelid = 'public.inventory_items'::regclass
--         AND conname IN ('inventory_items_category_check','inventory_items_unit_check');
--      SELECT column_name FROM information_schema.columns
--       WHERE table_name='inventory_items' AND column_name='unit';
-- 2. produce rows survive category widening (no regression):
--      SELECT category, count(*) FROM public.inventory_items GROUP BY 1;
--      -- phone|car|property unchanged; no validation errors on apply.
-- 3. produce_details deny-all enforced (must ERROR for anon):
--      SET ROLE anon; SELECT * FROM public.produce_details LIMIT 1; RESET ROLE;
-- 4. v_public_listings exposes the new columns, legacy columns intact:
--      SELECT category, unit, produce_origin, produce_grade FROM public.v_public_listings LIMIT 1;
--      SELECT count(*) FROM public.v_public_inventory; -- phones subset unchanged
--
-- ROLLBACK (reverse order):
--   DROP VIEW IF EXISTS public.v_public_listings;  (then re-apply 00037)
--   DROP TABLE IF EXISTS public.produce_details;
--   ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_category_check;
--   ALTER TABLE public.inventory_items
--     ADD CONSTRAINT inventory_items_category_check
--     CHECK (category IN ('phone','car','property'));
--   ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_unit_check;
--   ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS unit;
-- ============================================================================
