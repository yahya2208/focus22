-- ============================================================================
-- FOCUS — CAR + PROPERTY CATEGORY DETAILS (MIGRATION 00036)
--
-- Migration number: 00036 (after 00035_listing_category_core.sql)
-- Type: Additive (CREATE TABLE / INDEX / TRIGGER only). No RPCs, no view,
--       no storage, no publication changes.
--
-- PURPOSE
--   Category-specific detail tables (1:1) for the two new listing
--   categories, per the approved architecture:
--     Listing (inventory_items) ──1:1── car_details      (category='car')
--                               ──1:1── property_details (category='property')
--
-- IDENTITY MODEL
--   - id IS the listing id: UUID PK referencing inventory_items(id)
--     ON DELETE CASCADE. A car/property's identity is inventory_items.id —
--     NOT a SKU tuple. The `variant` column of the core table stays empty
--     for these categories by design.
--
-- VOCABULARY CONTRACT
--   CHECK value sets below mirror src/domains/listings exactly:
--     fuel/transmission/bodyType  → CarDetails unions
--     propertyType/transaction    → PropertyDetails unions
--     condition_state             → per-category condition unions
--   (Coherence pinned by src/__tests__/listings/migration-gate.test.ts.)
--
-- SECURITY DESIGN (defense-in-depth parity with parent table)
--   - RLS enabled, ZERO policies => deny-all.
--   - REVOKE ALL from anon + authenticated.
--   - Writes arrive later via SECURITY DEFINER admin RPCs (00038);
--     customer reads via v_public_listings (00037).
--   - updated_at maintained by REUSING the existing
--     public.set_inventory_updated() trigger function from migration
--     00019 — no duplicate trigger logic.
--   - Deliberately NOT added to supabase_realtime (no direct client reads).
--
-- Depends on: public.inventory_items + public.set_inventory_updated()
--             (both from migration 00019), category column (00035).
-- Rollback: DROP TABLE public.property_details; DROP TABLE public.car_details;
--           (child-first; CASCADE removes nothing else).
-- ============================================================================

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.inventory_items') IS NULL THEN
    RAISE EXCEPTION 'inventory_items missing — apply migration 00019 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_inventory_updated'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.set_inventory_updated() missing — apply migration 00019 first';
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
-- 1) car_details — V1 free-text make/model in core; specifics here
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.car_details (
  id              uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  trim            TEXT NOT NULL DEFAULT '',
  year            INTEGER CHECK (year IS NULL OR year BETWEEN 1900 AND 2100),
  mileage_km      INTEGER CHECK (mileage_km IS NULL OR mileage_km >= 0),
  fuel            TEXT CHECK (fuel IS NULL OR fuel IN ('benzin', 'diesel', 'hybrid', 'electric', 'lpg')),
  transmission    TEXT CHECK (transmission IS NULL OR transmission IN ('manual', 'automatic')),
  body_type       TEXT CHECK (body_type IS NULL OR body_type IN ('sedan', 'suv', 'hatchback', 'pickup', 'coupe', 'van')),
  engine_cc       INTEGER CHECK (engine_cc IS NULL OR engine_cc > 0),
  condition_state TEXT NOT NULL DEFAULT 'used'
                  CHECK (condition_state IN ('new', 'used', 'damaged')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.car_details         IS 'Category details for car listings. 1:1 with inventory_items(id); row lifecycle follows the parent via CASCADE.';
COMMENT ON COLUMN public.car_details.trim            IS 'Trim/grade free text (e.g. GLX). Identity stays inventory_items.id — never part of a SKU.';
COMMENT ON COLUMN public.car_details.year            IS 'Model year.';
COMMENT ON COLUMN public.car_details.mileage_km      IS 'Odometer in kilometers.';
COMMENT ON COLUMN public.car_details.fuel            IS 'benzin|diesel|hybrid|electric|lpg.';
COMMENT ON COLUMN public.car_details.transmission    IS 'manual|automatic.';
COMMENT ON COLUMN public.car_details.body_type       IS 'sedan|suv|hatchback|pickup|coupe|van.';
COMMENT ON COLUMN public.car_details.engine_cc       IS 'Engine displacement; null when unknown/electric.';
COMMENT ON COLUMN public.car_details.condition_state IS 'new|used|damaged (car vocabulary, not the phone grade enum).';

-- ============================================================================
-- 2) property_details — V1 text location (city lives in core), no PostGIS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.property_details (
  id               uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  property_type    TEXT NOT NULL
                   CHECK (property_type IN ('apartment', 'villa', 'house', 'land', 'shop', 'office')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'rent')),
  district         TEXT NOT NULL DEFAULT '',
  area_m2          NUMERIC(10, 2) CHECK (area_m2 IS NULL OR area_m2 > 0),
  bedrooms         SMALLINT CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms        SMALLINT CHECK (bathrooms IS NULL OR bathrooms >= 0),
  floor            SMALLINT CHECK (floor IS NULL OR floor BETWEEN -5 AND 200),
  furnished        BOOLEAN,
  condition_state  TEXT NOT NULL DEFAULT 'good'
                   CHECK (condition_state IN ('new', 'good', 'needs_renovation')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.property_details                IS 'Category details for property listings. 1:1 with inventory_items(id).';
COMMENT ON COLUMN public.property_details.property_type  IS 'apartment|villa|house|land|shop|office.';
COMMENT ON COLUMN public.property_details.transaction_type IS 'sale|rent. rent pairs with price_period=monthly on the parent.';
COMMENT ON COLUMN public.property_details.district        IS 'Free-text district/neighborhood (V1: no coordinates by decision).';
COMMENT ON COLUMN public.property_details.area_m2         IS 'Surface area in square meters.';
COMMENT ON COLUMN public.property_details.floor           IS 'Floor number; negative = basement level.';
COMMENT ON COLUMN public.property_details.furnished       IS 'NULL when unknown/not applicable (e.g. land).';

-- ============================================================================
-- 3) Filter-support indexes (mirror LISTING_FILTER_SCHEMAS keys)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_car_details_year
  ON public.car_details (year);

CREATE INDEX IF NOT EXISTS idx_car_details_fuel_transmission
  ON public.car_details (fuel, transmission);

CREATE INDEX IF NOT EXISTS idx_property_details_type_transaction
  ON public.property_details (property_type, transaction_type);

CREATE INDEX IF NOT EXISTS idx_property_details_bedrooms
  ON public.property_details (bedrooms);

CREATE INDEX IF NOT EXISTS idx_property_details_area
  ON public.property_details (area_m2);

-- ============================================================================
-- 4) updated_at maintenance — reuse the existing 00019 trigger function
-- ============================================================================
CREATE TRIGGER set_car_details_updated
  BEFORE UPDATE ON public.car_details
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated();

CREATE TRIGGER set_property_details_updated
  BEFORE UPDATE ON public.property_details
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated();

-- ============================================================================
-- 5) Security parity with the parent: deny-all until RPC/view phases land
-- ============================================================================
ALTER TABLE public.car_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.car_details FROM anon, authenticated;
REVOKE ALL ON public.property_details FROM anon, authenticated;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- SELECT to_regclass('public.car_details'), to_regclass('public.property_details');
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid IN ('public.car_details'::regclass,
--                    'public.property_details'::regclass);
-- SELECT relrowsecurity FROM pg_class
--  WHERE oid IN ('public.car_details'::regclass,
--                'public.property_details'::regclass);  -- both must be true
