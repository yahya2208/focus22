-- ============================================================================
-- FOCUS — PUBLIC CATEGORY-AWARE LISTINGS VIEW (MIGRATION 00037)
--
-- Migration number: 00037 (after 00036_car_property_details.sql)
-- Type: Additive (one VIEW + grants). No RPCs, no table changes, no policy
--       changes, no storage changes. `v_public_inventory` is NOT touched.
--
-- PURPOSE
--   Unified public read surface for ALL three categories:
--     phone | car | property
--   One flat row per PUBLISHED listing with the category-specific detail
--   columns flattened and PREFIXED, so a single consumer query can render any
--   showroom card / details page:
--     phone_*    → verbatim passthrough of the legacy phone columns
--                  (phones keep reading v_public_inventory today; these
--                  columns exist so ONE neutral service can map every row).
--     car_*      → car_details columns (NULL for non-car rows)
--     property_* → property_details columns (NULL for non-property rows)
--   Money is exposed as `price` — an alias of inventory_items.sell_price.
--   There is NO second money column; `price_period` carries the unit
--   ('sale' | 'monthly').
--
-- VISIBILITY GATE (byte-identical to v_public_inventory, migration 00019):
--     is_published = TRUE
--     AND quantity > 0
--     AND status NOT IN ('archived','discontinued','deleted')
--   The view is owned by postgres with security_invoker=false: it bypasses
--   RLS and this WHERE clause is the ONLY visibility gate. Unpublished,
--   archived, discontinued, deleted and zero-quantity rows are invisible.
--
-- SECURITY DESIGN
--   - car_details / property_details keep their deny-all RLS + full revoke
--     (migration 00036); customers NEVER read them directly. This view is
--     the sanctioned public window into their columns.
--   - inventory_images paths are aggregated per listing (ordered by
--     position) as `images`; no direct table grant is added.
--   - Only SELECT is granted; anon + authenticated. No writes anywhere.
--
-- Depends on: public.inventory_items (+ category/price_period from 00035),
--             public.car_details / public.property_details (00036),
--             public.inventory_images (00019).
-- Rollback: DROP VIEW IF EXISTS public.v_public_listings;
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE EXCEPTION 'inventory_items missing — apply migration 00019 first';
  END IF;
  IF to_regclass('public.car_details') IS NULL
     OR to_regclass('public.property_details') IS NULL THEN
    RAISE EXCEPTION 'car/property details missing — apply migration 00036 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
      AND column_name = 'category'
  ) THEN
    RAISE EXCEPTION 'inventory_items.category missing — apply migration 00035 first';
  END IF;
END $$;

-- ============================================================================
-- 1) v_public_listings — one published listing = one flat public row
-- ============================================================================
CREATE OR REPLACE VIEW public.v_public_listings AS
SELECT
  ii.id,
  ii.category,

  -- Core commercial fields (shared by every category)
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

  -- Phone columns — verbatim passthrough, NULL for car/property rows
  ii.variant        AS phone_variant,
  ii.ram            AS phone_ram,
  ii.storage        AS phone_storage,
  ii.condition      AS phone_condition,
  ii.battery_health AS phone_battery_health,

  -- Car details — prefixed, NULL unless category='car'
  cd.trim           AS car_trim,
  cd.year           AS car_year,
  cd.mileage_km     AS car_mileage_km,
  cd.fuel           AS car_fuel,
  cd.transmission   AS car_transmission,
  cd.body_type      AS car_body_type,
  cd.engine_cc      AS car_engine_cc,
  cd.condition_state AS car_condition_state,

  -- Property details — prefixed, NULL unless category='property'
  pd.property_type,
  pd.transaction_type,
  pd.district       AS property_district,
  pd.area_m2        AS property_area_m2,
  pd.bedrooms       AS property_bedrooms,
  pd.bathrooms      AS property_bathrooms,
  pd.floor          AS property_floor,
  pd.furnished      AS property_furnished,
  pd.condition_state AS property_condition_state,

  -- Ordered image paths (bucket-relative); first entry = cover intent
  COALESCE(img.paths, ARRAY[]::text[]) AS images,

  ii.created_at,
  ii.updated_at

FROM public.inventory_items ii
LEFT JOIN public.car_details      cd ON cd.id = ii.id
LEFT JOIN public.property_details pd ON pd.id = ii.id
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
-- 1. View exists and is readable by anon:
--      SET ROLE anon; SELECT count(*) FROM public.v_public_listings; RESET ROLE;
-- 2. Visibility gate matches v_public_inventory counts per category:
--      SELECT category, count(*) FROM public.v_public_listings GROUP BY 1;
--      SELECT count(*) FROM public.v_public_inventory;  -- phones subset equal
-- 3. No direct access to detail tables as anon (must ERROR):
--      SET ROLE anon; SELECT * FROM public.car_details LIMIT 1; RESET ROLE;
--
-- ROLLBACK:
--   DROP VIEW IF EXISTS public.v_public_listings;
-- ============================================================================
