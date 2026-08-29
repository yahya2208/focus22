-- ============================================================================
-- FOCUS — LISTING ADMIN RPCs + PUBLIC SEARCH (MIGRATION 00038)
--
-- Migration number: 00038 (after 00037_v_public_listings.sql)
-- Type: Additive (CREATE OR REPLACE FUNCTION + grants only). NO existing
--       function is redefined, dropped or altered. The legacy phone RPC
--       family (inventory_*) keeps its exact behavior byte-for-byte.
--
-- FUNCTIONS
--   Helpers (validation/normalization, no privilege):
--     listing_car_payload(jsonb)          → normalized snake-key car details
--     listing_property_payload(jsonb)     → normalized snake-key property details
--     listing_assert_publishable(...)     → publish-completeness gate
--   Admin writes (SECURITY DEFINER, gated by the SAME inventory_is_admin()
--   used by every legacy phone RPC):
--     listing_create(...)                 → uuid  (car|property only)
--     listing_update_core(uuid, ...)      → void  (brand/model/price/city/…)
--     listing_update_details(uuid, jsonb) → void  (merge-update child row)
--   Public read:
--     listing_search(category, query, filters, sort, limit, offset) → jsonb
--     reads v_public_listings ONLY (the published+active gate is the view's).
--
-- CATEGORY BOUNDARY (deliberate)
--   - listing_create / update_core / update_details accept ONLY 'car' and
--     'property'. category='phone' is rejected explicitly: phones keep ONE
--     write path (inventory_add_item / inventory_update_details) so phone
--     behavior can never drift through a second intake flow. Unknown
--     categories are rejected too.
--   - quantity is pinned to exactly 1 for car/property listings; any other
--     value raises. Stock-movement semantics remain a phone concept.
--   - variant stays '' for car/property (identity = inventory_items.id;
--     the phone partial-unique SKU index from 00035 never sees these rows).
--
-- PRICE RULES (separation of concerns)
--   - Money lives in sell_price only. price_period ∈ ('sale','monthly').
--   - car            → price_period must be 'sale'.
--   - property rent  → price_period must be 'monthly'.
--   - property sale  → price_period must be 'sale'.
--
-- CORE condition COLUMN COMPATIBILITY PROJECTION (documented decision)
--   inventory_items.condition carries the PHONE-grade enum CHECK
--   ('New','Open Box',…) from migration 00019 — untouched here. Car/property
--   rows store a compatibility projection in that column purely to satisfy
--   the legacy constraint:
--     new→'New'  used/good→'Good'  damaged→'For Parts'  needs_renovation→'Fair'
--   The AUTHORITATIVE condition value always lives in the child table
--   (car_details.condition_state / property_details.condition_state) and is
--   what v_public_listings exposes. Nothing reads the projection back for
--   these categories; phones are completely unaffected.
--
-- PUBLISH-COMPLETENESS GATE ("no incomplete listing goes live")
--   Publishing (at create time, or while a row is already published after a
--   core/details edit) requires:
--     common : sell_price NOT NULL AND city <> ''
--     car    : year, mileage_km, fuel, transmission NOT NULL
--     property: area_m2 NOT NULL AND bedrooms NOT NULL unless land
--   Un-publishing is always allowed.
--
-- Depends on: inventory_is_admin() + inventory_calc_status() (00019),
--             category/price_period columns (00035), detail tables (00036),
--             v_public_listings (00037).
-- Rollback: see ROLLBACK section at the bottom (commented).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'inventory_is_admin'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.inventory_is_admin() missing — apply migration 00019 first';
  END IF;
  IF to_regclass('public.car_details') IS NULL
     OR to_regclass('public.property_details') IS NULL THEN
    RAISE EXCEPTION 'car/property details missing — apply migration 00036 first';
  END IF;
  IF to_regclass('public.v_public_listings') IS NULL THEN
    RAISE EXCEPTION 'public.v_public_listings missing — apply migration 00037 first';
  END IF;
END $$;

-- ============================================================================
-- 1) listing_car_payload — validate + normalize car details jsonb
--    Input keys (camelCase or snake_case): trim year mileageKm fuel
--      transmission bodyType engineCc conditionState
--    Output: snake-key object with defaults applied. Unknown keys raise.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_car_payload(p_details jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v text;
  allowed text[] := ARRAY['trim','year','mileageKm','mileage_km','fuel',
                          'transmission','bodyType','body_type','engineCc',
                          'engine_cc','conditionState','condition_state'];
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_details) LOOP
    IF NOT k = ANY(allowed) THEN
      RAISE EXCEPTION 'listing details: unknown car key "%"', k USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v := p_details->>'conditionState';
  IF v IS NULL THEN v := p_details->>'condition_state'; END IF;
  IF v IS NOT NULL AND v NOT IN ('new','used','damaged') THEN
    RAISE EXCEPTION 'listing details: invalid car conditionState "%"', v USING ERRCODE = '22023';
  END IF;

  v := COALESCE(p_details->>'fuel', '');
  IF v <> '' AND v NOT IN ('benzin','diesel','hybrid','electric','lpg') THEN
    RAISE EXCEPTION 'listing details: invalid fuel "%"', v USING ERRCODE = '22023';
  END IF;

  v := COALESCE(p_details->>'transmission', '');
  IF v <> '' AND v NOT IN ('manual','automatic') THEN
    RAISE EXCEPTION 'listing details: invalid transmission "%"', v USING ERRCODE = '22023';
  END IF;

  v := COALESCE(p_details->>'bodyType', p_details->>'body_type', '');
  IF v <> '' AND v NOT IN ('sedan','suv','hatchback','pickup','coupe','van') THEN
    RAISE EXCEPTION 'listing details: invalid bodyType "%"', v USING ERRCODE = '22023';
  END IF;

  IF p_details->>'year' IS NOT NULL
     AND ((p_details->>'year')::int NOT BETWEEN 1900 AND 2100) THEN
    RAISE EXCEPTION 'listing details: year out of range' USING ERRCODE = '22023';
  END IF;

  IF p_details->>'mileageKm' IS NOT NULL
     AND (p_details->>'mileage_km') IS NOT NULL THEN
    RAISE EXCEPTION 'listing details: duplicate mileage key' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_details->>'mileageKm', p_details->>'mileage_km') IS NOT NULL
     AND ((COALESCE(p_details->>'mileageKm', p_details->>'mileage_km'))::int < 0) THEN
    RAISE EXCEPTION 'listing details: mileageKm must be >= 0' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_details->>'engineCc', p_details->>'engine_cc') IS NOT NULL
     AND ((COALESCE(p_details->>'engineCc', p_details->>'engine_cc'))::int <= 0) THEN
    RAISE EXCEPTION 'listing details: engineCc must be > 0' USING ERRCODE = '22023';
  END IF;

  -- An "empty" car payload (all defaults, no real detail given) is rejected:
  -- a car listing without meaningful car_details must not be creatable.
  IF COALESCE(btrim(p_details->>'trim'), '') = ''
     AND p_details->>'year' IS NULL
     AND COALESCE(p_details->>'mileageKm', p_details->>'mileage_km') IS NULL
     AND COALESCE(p_details->>'fuel', '') = ''
     AND COALESCE(p_details->>'transmission', '') = ''
     AND COALESCE(p_details->>'bodyType', p_details->>'body_type', '') = ''
     AND COALESCE(p_details->>'engineCc', p_details->>'engine_cc') IS NULL THEN
    RAISE EXCEPTION 'listing details: car payload is empty' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'trim',           COALESCE(btrim(p_details->>'trim'), ''),
    'year',           (NULLIF(btrim(COALESCE(p_details->>'year', '')), ''))::int,
    'mileage_km',     (NULLIF(btrim(COALESCE(p_details->>'mileageKm', p_details->>'mileage_km')), ''))::int,
    'fuel',           NULLIF(btrim(p_details->>'fuel'), ''),
    'transmission',   NULLIF(btrim(p_details->>'transmission'), ''),
    'body_type',      NULLIF(btrim(COALESCE(p_details->>'bodyType', p_details->>'body_type')), ''),
    'engine_cc',      (NULLIF(btrim(COALESCE(p_details->>'engineCc', p_details->>'engine_cc')), ''))::int,
    'condition_state', COALESCE(NULLIF(btrim(p_details->>'conditionState'), ''),
                               NULLIF(btrim(p_details->>'condition_state'), ''), 'used')
  );
END;
$$;

-- ============================================================================
-- 2) listing_property_payload — validate + normalize property details jsonb
--    Input keys: propertyType transactionType district areaM2 bedrooms
--                bathrooms floor furnished conditionState (snake aliases ok)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_property_payload(p_details jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v text;
  allowed text[] := ARRAY['propertyType','property_type','transactionType',
                          'transaction_type','district','areaM2','area_m2',
                          'bedrooms','bathrooms','floor','furnished',
                          'conditionState','condition_state'];
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_details) LOOP
    IF NOT k = ANY(allowed) THEN
      RAISE EXCEPTION 'listing details: unknown property key "%"', k USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v := COALESCE(p_details->>'propertyType', p_details->>'property_type', '');
  IF v NOT IN ('apartment','villa','house','land','shop','office') THEN
    RAISE EXCEPTION 'listing details: propertyType is required and must be one of apartment|villa|house|land|shop|office' USING ERRCODE = '22023';
  END IF;

  v := COALESCE(p_details->>'transactionType', p_details->>'transaction_type', '');
  IF v NOT IN ('sale','rent') THEN
    RAISE EXCEPTION 'listing details: transactionType is required and must be sale|rent' USING ERRCODE = '22023';
  END IF;

  v := COALESCE(NULLIF(btrim(p_details->>'conditionState'), ''),
                NULLIF(btrim(p_details->>'condition_state'), ''));
  IF v IS NOT NULL AND v NOT IN ('new','good','needs_renovation') THEN
    RAISE EXCEPTION 'listing details: invalid property conditionState "%"', v USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_details->>'areaM2', p_details->>'area_m2') IS NOT NULL
     AND ((COALESCE(p_details->>'areaM2', p_details->>'area_m2'))::numeric <= 0) THEN
    RAISE EXCEPTION 'listing details: areaM2 must be > 0' USING ERRCODE = '22023';
  END IF;

  IF p_details->>'bedrooms' IS NOT NULL AND (p_details->>'bedrooms')::int < 0 THEN
    RAISE EXCEPTION 'listing details: bedrooms must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_details->>'bathrooms' IS NOT NULL AND (p_details->>'bathrooms')::int < 0 THEN
    RAISE EXCEPTION 'listing details: bathrooms must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_details->>'floor' IS NOT NULL
     AND ((p_details->>'floor')::int NOT BETWEEN -5 AND 200) THEN
    RAISE EXCEPTION 'listing details: floor out of range' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'property_type',    btrim(COALESCE(p_details->>'propertyType', p_details->>'property_type')),
    'transaction_type', btrim(COALESCE(p_details->>'transactionType', p_details->>'transaction_type')),
    'district',         COALESCE(btrim(p_details->>'district'), ''),
    'area_m2',          (NULLIF(btrim(COALESCE(p_details->>'areaM2', p_details->>'area_m2')), ''))::numeric,
    'bedrooms',         (NULLIF(btrim(p_details->>'bedrooms'), ''))::smallint,
    'bathrooms',        (NULLIF(btrim(p_details->>'bathrooms'), ''))::smallint,
    'floor',            (NULLIF(btrim(p_details->>'floor'), ''))::smallint,
    'furnished',        CASE
                          WHEN p_details->>'furnished' IS NULL THEN NULL
                          WHEN p_details->>'furnished' IN ('true','false') THEN (p_details->>'furnished')::boolean
                          ELSE NULL
                        END,
    'condition_state',  COALESCE(v, 'good')
  );
END;
$$;

-- ============================================================================
-- 3) listing_assert_publishable — the "no incomplete listing goes live" gate
--    p_details expects an ALREADY-NORMALIZED payload (snake keys) as returned
--    by the two payload helpers above.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_assert_publishable(
  p_category text,
  p_price    numeric,
  p_city     text,
  p_details  jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_price IS NULL THEN
    RAISE EXCEPTION 'cannot publish incomplete listing: sell_price is required' USING ERRCODE = '22023';
  END IF;
  IF btrim(COALESCE(p_city, '')) = '' THEN
    RAISE EXCEPTION 'cannot publish incomplete listing: city is required' USING ERRCODE = '22023';
  END IF;

  IF p_category = 'car' THEN
    IF p_details->>'year' IS NULL THEN
      RAISE EXCEPTION 'cannot publish incomplete listing: car year is required' USING ERRCODE = '22023';
    END IF;
    IF p_details->>'mileage_km' IS NULL THEN
      RAISE EXCEPTION 'cannot publish incomplete listing: car mileageKm is required' USING ERRCODE = '22023';
    END IF;
    IF p_details->>'fuel' IS NULL THEN
      RAISE EXCEPTION 'cannot publish incomplete listing: car fuel is required' USING ERRCODE = '22023';
    END IF;
    IF p_details->>'transmission' IS NULL THEN
      RAISE EXCEPTION 'cannot publish incomplete listing: car transmission is required' USING ERRCODE = '22023';
    END IF;
  ELSIF p_category = 'property' THEN
    IF p_details->>'area_m2' IS NULL THEN
      RAISE EXCEPTION 'cannot publish incomplete listing: property areaM2 is required' USING ERRCODE = '22023';
    END IF;
    IF p_details->>'bedrooms' IS NULL AND p_details->>'property_type' <> 'land' THEN
      RAISE EXCEPTION 'cannot publish incomplete listing: property bedrooms is required' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_car_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listing_property_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listing_assert_publishable(text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4) listing_create — single admin call that inserts core + child atomically
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_create(
  p_category     text,
  p_brand        text,
  p_model        text,
  p_price        numeric DEFAULT NULL,
  p_price_period text DEFAULT 'sale',
  p_color        text DEFAULT '',
  p_city         text DEFAULT '',
  p_description  text DEFAULT NULL,
  p_code         text DEFAULT NULL,
  p_warranty     text DEFAULT NULL,
  p_quantity     integer DEFAULT 1,
  p_is_published boolean DEFAULT FALSE,
  p_details      jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand   text := btrim(coalesce(p_brand, ''));
  v_model   text := btrim(coalesce(p_model, ''));
  v_color   text := coalesce(p_color, '');
  v_city    text := btrim(coalesce(p_city, ''));
  v_payload jsonb;
  v_core_condition text;
  v_id      uuid;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  -- ── Category boundary ────────────────────────────────────────────────────
  IF p_category = 'phone' THEN
    RAISE EXCEPTION 'phones must use the legacy inventory_add_item flow' USING ERRCODE = '22023';
  ELSIF p_category NOT IN ('car','property') THEN
    RAISE EXCEPTION 'unknown category "%": use car|property', p_category USING ERRCODE = '22023';
  END IF;

  -- Brand is the car Make (required); for property it is an optional
  -- developer/agency name. The model/title is always mandatory.
  IF p_category = 'car' THEN
    IF v_brand = '' OR v_model = '' THEN
      RAISE EXCEPTION 'car make and model are required' USING ERRCODE = '22023';
    END IF;
  ELSIF v_model = '' THEN
    RAISE EXCEPTION 'property listing title is required' USING ERRCODE = '22023';
  END IF;

  IF p_price_period NOT IN ('sale','monthly') THEN
    RAISE EXCEPTION 'invalid price_period "%" (sale|monthly)', p_price_period USING ERRCODE = '22023';
  END IF;

  -- Quantity is pinned: a car/property listing is exactly one unit.
  IF p_quantity IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'quantity must be exactly 1 for car/property listings' USING ERRCODE = '22023';
  END IF;

  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'p_details jsonb object is required' USING ERRCODE = '22023';
  END IF;

  -- ── Category-specific validation + normalization ────────────────────────
  IF p_category = 'car' THEN
    v_payload := public.listing_car_payload(p_details);
    IF p_price_period <> 'sale' THEN
      RAISE EXCEPTION 'car listings pair with price_period=sale' USING ERRCODE = '22023';
    END IF;
    v_core_condition := CASE (v_payload->>'condition_state')
      WHEN 'new'     THEN 'New'
      WHEN 'damaged' THEN 'For Parts'
      ELSE 'Good'
    END;
  ELSE
    v_payload := public.listing_property_payload(p_details);
    IF (v_payload->>'transaction_type') = 'rent' AND p_price_period <> 'monthly' THEN
      RAISE EXCEPTION 'rental property pairs with price_period=monthly' USING ERRCODE = '22023';
    END IF;
    IF (v_payload->>'transaction_type') = 'sale' AND p_price_period <> 'sale' THEN
      RAISE EXCEPTION 'for-sale property pairs with price_period=sale' USING ERRCODE = '22023';
    END IF;
    v_core_condition := CASE (v_payload->>'condition_state')
      WHEN 'new'              THEN 'New'
      WHEN 'needs_renovation' THEN 'Fair'
      ELSE 'Good'
    END;
  END IF;

  IF p_is_published THEN
    PERFORM public.listing_assert_publishable(p_category, p_price, v_city, v_payload);
  END IF;

  -- ── Core row (model_id mirrors the phone convention "Brand Model";
  --    identity stays id — the phone SKU index never sees this row) ────────
  INSERT INTO public.inventory_items
    (model_id, brand, model, variant, ram, storage, condition, color,
     quantity, status, buy_price, sell_price, code, battery_health, warranty,
     city, description, is_published, price_period, category,
     total_purchased, total_sold)
  VALUES
    (concat_ws(' ', NULLIF(v_brand, ''), NULLIF(v_model, '')),
     v_brand, v_model,
     '',                      -- variant stays empty outside the phone domain
     NULL, '',                -- ram/storage are phone columns
     v_core_condition,        -- compatibility projection (see header note)
     v_color,
     p_quantity,
     public.inventory_calc_status(p_quantity),
     NULL, p_price,
     NULLIF(btrim(coalesce(p_code, '')), ''),
     NULL,
     NULLIF(btrim(coalesce(p_warranty, '')), ''),
     NULLIF(v_city, ''), p_description,
     p_is_published, p_price_period, p_category,
     p_quantity, 0)
  RETURNING id INTO v_id;

  -- ── Child row (same transaction — all-or-nothing) ────────────────────────
  IF p_category = 'car' THEN
    INSERT INTO public.car_details
      (id, trim, year, mileage_km, fuel, transmission, body_type,
       engine_cc, condition_state)
    VALUES
      (v_id,
       v_payload->>'trim',
       (NULLIF(v_payload->>'year', ''))::int,
       (NULLIF(v_payload->>'mileage_km', ''))::int,
       v_payload->>'fuel',
       v_payload->>'transmission',
       v_payload->>'body_type',
       (NULLIF(v_payload->>'engine_cc', ''))::int,
       v_payload->>'condition_state');
  ELSE
    INSERT INTO public.property_details
      (id, property_type, transaction_type, district, area_m2,
       bedrooms, bathrooms, floor, furnished, condition_state)
    VALUES
      (v_id,
       v_payload->>'property_type',
       v_payload->>'transaction_type',
       v_payload->>'district',
       (NULLIF(v_payload->>'area_m2', ''))::numeric,
       (NULLIF(v_payload->>'bedrooms', ''))::smallint,
       (NULLIF(v_payload->>'bathrooms', ''))::smallint,
       (NULLIF(v_payload->>'floor', ''))::smallint,
       (v_payload->'furnished')::boolean,
       v_payload->>'condition_state');
  END IF;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- 5) listing_update_core — tri-state core edits for car/property listings
--    Every p_* field: NULL = keep current. Clearing fields is not supported
--    on purpose (un-publish instead). Re-validates completeness when the row
--    is currently published. Phones are rejected (legacy path owns them).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_update_core(
  p_listing_id   uuid,
  p_brand        text DEFAULT NULL,
  p_model        text DEFAULT NULL,
  p_price        numeric DEFAULT NULL,
  p_price_period text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_city         text DEFAULT NULL,
  p_description  text DEFAULT NULL,
  p_code         text DEFAULT NULL,
  p_warranty     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.inventory_items%ROWTYPE;
  v_payload jsonb := '{}'::jsonb;
  v_new_brand text;
  v_new_model text;
  v_new_price numeric;
  v_new_period text;
  v_new_city text;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.inventory_items WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '22000';
  END IF;
  IF r.category NOT IN ('car','property') THEN
    RAISE EXCEPTION 'listing_update_core targets car/property listings only' USING ERRCODE = '22023';
  END IF;

  v_new_brand   := COALESCE(NULLIF(btrim(p_brand), ''), r.brand);
  v_new_model   := COALESCE(NULLIF(btrim(p_model), ''), r.model);
  v_new_price   := COALESCE(p_price, r.sell_price);
  v_new_period  := COALESCE(p_price_period, r.price_period);
  v_new_city    := COALESCE(p_city, r.city);

  -- Brand is mandatory only for cars; property keeps its optional developer.
  IF r.category = 'car' THEN
    IF v_new_brand = '' OR v_new_model = '' THEN
      RAISE EXCEPTION 'car make and model are required' USING ERRCODE = '22023';
    END IF;
  ELSIF v_new_model = '' THEN
    RAISE EXCEPTION 'property listing title is required' USING ERRCODE = '22023';
  END IF;
  IF v_new_period NOT IN ('sale','monthly') THEN
    RAISE EXCEPTION 'invalid price_period' USING ERRCODE = '22023';
  END IF;

  IF r.category = 'car' THEN
    SELECT to_jsonb(cd) INTO v_payload FROM public.car_details cd WHERE cd.id = p_listing_id;
    IF v_new_period <> 'sale' THEN
      RAISE EXCEPTION 'car listings pair with price_period=sale' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT to_jsonb(pd) INTO v_payload FROM public.property_details pd WHERE pd.id = p_listing_id;
    IF (v_payload->>'transaction_type') = 'rent' AND v_new_period <> 'monthly' THEN
      RAISE EXCEPTION 'rental property pairs with price_period=monthly' USING ERRCODE = '22023';
    END IF;
    IF (v_payload->>'transaction_type') = 'sale' AND v_new_period <> 'sale' THEN
      RAISE EXCEPTION 'for-sale property pairs with price_period=sale' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.inventory_items SET
    model_id     = concat_ws(' ', NULLIF(v_new_brand, ''), NULLIF(v_new_model, '')),
    brand        = v_new_brand,
    model        = v_new_model,
    sell_price   = v_new_price,
    price_period = v_new_period,
    color        = COALESCE(p_color, color),
    city         = v_new_city,
    description  = COALESCE(p_description, description),
    code         = COALESCE(NULLIF(btrim(coalesce(p_code, '')), ''), code),
    warranty     = COALESCE(NULLIF(btrim(coalesce(p_warranty, '')), ''), warranty),
    updated_at   = now()
  WHERE id = p_listing_id;

  -- Publish gate re-check when live (details unchanged but price/city may
  -- have just broken completeness — never leave a broken listing public).
  IF r.is_published THEN
    PERFORM public.listing_assert_publishable(r.category, v_new_price, v_new_city, v_payload);
  END IF;
END;
$$;

-- ============================================================================
-- 6) listing_update_details — merge-update of the child details row
--    Provided keys override, omitted keys keep their stored values, unknown
--    keys are rejected (typo protection). Creates the child row if missing.
--    Re-validates completeness when the parent is currently published.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_update_details(
  p_listing_id uuid,
  p_details    jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.inventory_items%ROWTYPE;
  v_current jsonb := '{}'::jsonb;
  v_merged  jsonb;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.inventory_items WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '22000';
  END IF;
  IF r.category NOT IN ('car','property') THEN
    RAISE EXCEPTION 'listing_update_details targets car/property listings only' USING ERRCODE = '22023';
  END IF;
  IF p_details IS NULL OR jsonb_typeof(p_details) <> 'object' THEN
    RAISE EXCEPTION 'p_details jsonb object is required' USING ERRCODE = '22023';
  END IF;

  IF r.category = 'car' THEN
    SELECT to_jsonb(cd) INTO v_current FROM public.car_details cd WHERE cd.id = p_listing_id;
    v_merged := COALESCE(v_current, '{}'::jsonb) || p_details;
    v_merged := public.listing_car_payload(v_merged);

    INSERT INTO public.car_details AS cd
      (id, trim, year, mileage_km, fuel, transmission, body_type,
       engine_cc, condition_state)
    VALUES
      (p_listing_id,
       v_merged->>'trim',
       (NULLIF(v_merged->>'year', ''))::int,
       (NULLIF(v_merged->>'mileage_km', ''))::int,
       v_merged->>'fuel',
       v_merged->>'transmission',
       v_merged->>'body_type',
       (NULLIF(v_merged->>'engine_cc', ''))::int,
       v_merged->>'condition_state')
    ON CONFLICT (id) DO UPDATE SET
      trim            = EXCLUDED.trim,
      year            = EXCLUDED.year,
      mileage_km      = EXCLUDED.mileage_km,
      fuel            = EXCLUDED.fuel,
      transmission    = EXCLUDED.transmission,
      body_type       = EXCLUDED.body_type,
      engine_cc       = EXCLUDED.engine_cc,
      condition_state = EXCLUDED.condition_state;

    IF r.is_published THEN
      PERFORM public.listing_assert_publishable('car', r.sell_price, r.city, v_merged);
    END IF;
  ELSE
    SELECT to_jsonb(pd) INTO v_current FROM public.property_details pd WHERE pd.id = p_listing_id;
    v_merged := COALESCE(v_current, '{}'::jsonb) || p_details;
    v_merged := public.listing_property_payload(v_merged);

    INSERT INTO public.property_details AS pd
      (id, property_type, transaction_type, district, area_m2,
       bedrooms, bathrooms, floor, furnished, condition_state)
    VALUES
      (p_listing_id,
       v_merged->>'property_type',
       v_merged->>'transaction_type',
       v_merged->>'district',
       (NULLIF(v_merged->>'area_m2', ''))::numeric,
       (NULLIF(v_merged->>'bedrooms', ''))::smallint,
       (NULLIF(v_merged->>'bathrooms', ''))::smallint,
       (NULLIF(v_merged->>'floor', ''))::smallint,
       (v_merged->'furnished')::boolean,
       v_merged->>'condition_state')
    ON CONFLICT (id) DO UPDATE SET
      property_type    = EXCLUDED.property_type,
      transaction_type = EXCLUDED.transaction_type,
      district         = EXCLUDED.district,
      area_m2          = EXCLUDED.area_m2,
      bedrooms         = EXCLUDED.bedrooms,
      bathrooms        = EXCLUDED.bathrooms,
      floor            = EXCLUDED.floor,
      furnished        = EXCLUDED.furnished,
      condition_state  = EXCLUDED.condition_state;

    IF r.is_published THEN
      PERFORM public.listing_assert_publishable('property', r.sell_price, r.city, v_merged);
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- 7) listing_search — PUBLIC read over v_public_listings (never unpublished)
--    Returns {"total": n, "items": [view rows]}.
--    Filters are strictly whitelisted per category; unknown keys/values raise
--    (no silent misbehavior). Phone filters stay empty (schema P8.1).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_search(
  p_category text,
  p_query    text DEFAULT '',
  p_filters  jsonb DEFAULT '{}'::jsonb,
  p_sort     text DEFAULT 'latest',
  p_limit    integer DEFAULT 24,
  p_offset   integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q       text := btrim(coalesce(p_query, ''));
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit   integer;
  v_offset  integer;
  v_result  jsonb;
  k         text;
  v         text;
BEGIN
  IF p_category NOT IN ('phone','car','property') THEN
    RAISE EXCEPTION 'unknown category "%" (phone|car|property)', p_category USING ERRCODE = '22023';
  END IF;
  IF p_sort NOT IN ('latest','cheapest','expensive') THEN
    RAISE EXCEPTION 'invalid sort "%": use latest|cheapest|expensive', p_sort USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_filters) <> 'object' THEN
    RAISE EXCEPTION 'filters must be a jsonb object' USING ERRCODE = '22023';
  END IF;

  v_limit  := LEAST(GREATEST(coalesce(p_limit, 24), 1), 100);
  v_offset := GREATEST(coalesce(p_offset, 0), 0);

  -- ── Filter whitelist + enum validation (per category) ───────────────────
  IF p_category = 'car' THEN
    FOR k IN SELECT jsonb_object_keys(v_filters) LOOP
      IF NOT k = ANY(ARRAY['fuel','transmission','bodyType','yearMin','yearMax','mileageKmMax']) THEN
        RAISE EXCEPTION 'unknown car filter "%"', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['fuel','transmission','bodyType'] LOOP
      v := v_filters->>k;
      CONTINUE WHEN v IS NULL;
      IF k = 'fuel' AND v NOT IN ('benzin','diesel','hybrid','electric','lpg') THEN
        RAISE EXCEPTION 'invalid fuel filter "%"', v USING ERRCODE = '22023';
      END IF;
      IF k = 'transmission' AND v NOT IN ('manual','automatic') THEN
        RAISE EXCEPTION 'invalid transmission filter "%"', v USING ERRCODE = '22023';
      END IF;
      IF k = 'bodyType' AND v NOT IN ('sedan','suv','hatchback','pickup','coupe','van') THEN
        RAISE EXCEPTION 'invalid bodyType filter "%"', v USING ERRCODE = '22023';
      END IF;
    END LOOP;
  ELSIF p_category = 'property' THEN
    FOR k IN SELECT jsonb_object_keys(v_filters) LOOP
      IF NOT k = ANY(ARRAY['propertyType','transactionType','bedroomsMin','bathroomsMin','areaM2Min','areaM2Max','furnished']) THEN
        RAISE EXCEPTION 'unknown property filter "%"', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v := v_filters->>'propertyType';
    IF v IS NOT NULL AND v NOT IN ('apartment','villa','house','land','shop','office') THEN
      RAISE EXCEPTION 'invalid propertyType filter "%"', v USING ERRCODE = '22023';
    END IF;
    v := v_filters->>'transactionType';
    IF v IS NOT NULL AND v NOT IN ('sale','rent') THEN
      RAISE EXCEPTION 'invalid transactionType filter "%"', v USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Phone V1 filter schema is intentionally empty (P8.1): the legacy
    -- showroom controls own phone browsing.
    IF v_filters <> '{}'::jsonb THEN
      RAISE EXCEPTION 'phone search takes no filters' USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH base AS (
    SELECT v.*
    FROM public.v_public_listings v
    WHERE v.category = p_category
      AND (
        v_q = ''
        OR v.brand ILIKE '%' || v_q || '%'
        OR v.model ILIKE '%' || v_q || '%'
        OR COALESCE(v.city, '') ILIKE '%' || v_q || '%'
        OR COALESCE(v.code, '') ILIKE '%' || v_q || '%'
        OR COALESCE(v.car_trim, '') ILIKE '%' || v_q || '%'
        OR COALESCE(v.property_district, '') ILIKE '%' || v_q || '%'
      )
      AND (v_filters->>'fuel' IS NULL OR v.car_fuel = v_filters->>'fuel')
      AND (v_filters->>'transmission' IS NULL OR v.car_transmission = v_filters->>'transmission')
      AND (v_filters->>'bodyType' IS NULL OR v.car_body_type = v_filters->>'bodyType')
      AND (v_filters->>'yearMin' IS NULL OR v.car_year >= (v_filters->>'yearMin')::int)
      AND (v_filters->>'yearMax' IS NULL OR v.car_year <= (v_filters->>'yearMax')::int)
      AND (v_filters->>'mileageKmMax' IS NULL OR v.car_mileage_km <= (v_filters->>'mileageKmMax')::int)
      AND (v_filters->>'propertyType' IS NULL OR v.property_type = v_filters->>'propertyType')
      AND (v_filters->>'transactionType' IS NULL OR v.transaction_type = v_filters->>'transactionType')
      AND (v_filters->>'bedroomsMin' IS NULL OR v.property_bedrooms >= (v_filters->>'bedroomsMin')::int)
      AND (v_filters->>'bathroomsMin' IS NULL OR v.property_bathrooms >= (v_filters->>'bathroomsMin')::int)
      AND (v_filters->>'areaM2Min' IS NULL OR v.property_area_m2 >= (v_filters->>'areaM2Min')::numeric)
      AND (v_filters->>'areaM2Max' IS NULL OR v.property_area_m2 <= (v_filters->>'areaM2Max')::numeric)
      AND (v_filters->>'furnished' IS NULL OR v.property_furnished = (v_filters->>'furnished')::boolean)
  ),
  ordered AS (
    SELECT base.*
    FROM base
    ORDER BY
      CASE WHEN p_sort = 'cheapest'  THEN base.price END ASC,
      CASE WHEN p_sort = 'expensive' THEN base.price END DESC,
      base.updated_at DESC
  ),
  paged AS (
    SELECT * FROM ordered LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(paged.*)) FROM paged), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 8) Grants — same authorization story as the legacy family
-- ============================================================================
REVOKE ALL ON FUNCTION public.listing_create(text, text, text, numeric, text, text, text, text, text, text, integer, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_create(text, text, text, numeric, text, text, text, text, text, text, integer, boolean, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.listing_update_core(uuid, text, text, numeric, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_update_core(uuid, text, text, numeric, text, text, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.listing_update_details(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_update_details(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.listing_search(text, text, jsonb, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_search(text, text, jsonb, text, integer, integer) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- 1. Non-admin create must ERROR 42501:
--      SET ROLE authenticated; SELECT public.listing_create('car','x','y'); RESET ROLE;
-- 2. Phone rejection:
--      SELECT public.listing_create('phone','x','y');  -- ERROR: legacy flow
-- 3. Quantity pin:
--      SELECT public.listing_create('car','Toyota','Corolla', 10000, 'sale',
--        '', '', NULL, NULL, NULL, 2, FALSE, '{"conditionState":"used"}');
--      -- ERROR: quantity must be exactly 1
-- 4. Search is anonymous-readable and never leaks unpublished rows:
--      SET ROLE anon; SELECT public.listing_search('car'); RESET ROLE;
--
-- ROLLBACK (reverse order):
--   DROP FUNCTION IF EXISTS public.listing_search(text, text, jsonb, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.listing_update_details(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.listing_update_core(uuid, text, text, numeric, text, text, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.listing_create(text, text, text, numeric, text, text, text, text, text, text, integer, boolean, jsonb);
--   DROP FUNCTION IF EXISTS public.listing_assert_publishable(text, numeric, text, jsonb);
--   DROP FUNCTION IF EXISTS public.listing_property_payload(jsonb);
--   DROP FUNCTION IF EXISTS public.listing_car_payload(jsonb);
-- ============================================================================
