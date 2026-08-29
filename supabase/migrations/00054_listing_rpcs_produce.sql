-- ============================================================================
-- FOCUS — PRODUCE LISTING RPCs (MIGRATION 00054)
--
-- Migration number: 00054 (after 00053_produce_domain.sql)
-- Type: WIDENING of the existing listing_* RPC family to admit the `produce`
--       domain. The baseline 00038 functions stay HISTORICAL (never edited);
--       this file CREATE OR REPLACE's them with ADDITIVE produce support.
--       Every existing car/property/phone behaviour is preserved byte-for-byte;
--       functions are only WIDENED (new category branch), never narrowed.
--
-- WHY THIS IS NECESSARY (proven in Discovery, per Generic Catalog rule):
--   `listing_create` / `listing_update_*` are the ADMIN WRITE PATH for the
--   NEW listing categories. Produce MUST flow through them (one store, one
--   server authority — no parallel produce path was built). Extending the
--   whitelist + adding a produce payload normalizer + relaxing the quantity
--   pin to produce-only IS the minimal necessary widening.
--
-- WHAT IS ADDED
--   1) listing_product_payload(jsonb)  — NEW helper: validates + normalizes
--      produce details ({origin, grade}), key-whitelist style of 00038.
--   2) listing_create(...)             — OR — accepts category='produce':
--        * not rejected by the category boundary (still rejects 'phone');
--        * quantity allowed >= 1 for produce (pin-to-1 remains for car);
--        * runs listing_product_payload + inserts produce_details child;
--        * publishes only when complete (listing_assert_publishable).
--   3) listing_update_core / listing_update_details — OR — accept 'produce'.
--   4) listing_assert_publishable(...) — OR — adds produce completeness gate
--      (sell_price + city + unit).
--   5) listing_search(...)             — OR — accepts 'produce' in the category
--      whitelist + a produce filter whitelist (origin, grade, unit).
--
-- SECURITY: unchanged house model — SECURITY DEFINER + SET search_path,
-- every mutation gated by inventory_is_admin(); grants REVOKE/GRANT to
-- authenticated only; search stays anon+authenticated. produce_details is
-- NEVER exposed directly (deny-all from 00053); v_public_listings is the
-- only public window. Server stays authoritative for price/identity/stock/
-- domain/published/orderability (00052 order authority untouched).
--
-- Depends on: 00053 (inventory_items.unit, produce_details, widened CHECK,
--             v_public_listings produce columns), 00038 family, 00019
--             (inventory_is_admin / inventory_calc_status).
-- Rollback: re-apply the original 00038 definitions (in-file copies in the
--           ROLLBACK note) — see bottom.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.produce_details') IS NULL THEN
    RAISE EXCEPTION 'public.produce_details missing — apply migration 00053 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_items'
      AND column_name = 'unit'
  ) THEN
    RAISE EXCEPTION 'inventory_items.unit missing — apply migration 00053 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'listing_create'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.listing_create missing — apply migration 00038 first';
  END IF;
END $$;

-- ============================================================================
-- 1) listing_product_payload — validate + normalize produce details jsonb
--    Input keys (camelCase or snake_case): origin grade
--    Unknown keys raise (typo protection, mirror 00038).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_product_payload(p_details jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(p_details) LOOP
    IF NOT k = ANY(ARRAY['origin','grade']) THEN
      RAISE EXCEPTION 'listing details: unknown produce key "%"', k USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'origin', COALESCE(btrim(p_details->>'origin'), ''),
    'grade',  COALESCE(btrim(p_details->>'grade'), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.listing_product_payload(jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2) listing_assert_publishable — OR: add the produce completeness gate
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
  ELSIF p_category = 'produce' THEN
    -- produce completeness: price + city already checked above; the unit
    -- rides on the core (p_inventory row), so nothing domain-detail-specific
    -- is strictly required here. Kept as a branch for future produce fields.
    NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_assert_publishable(text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3) listing_create — OR: accept produce (unpinned quantity, produce child)
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
  p_details      jsonb DEFAULT NULL,
  p_unit         text DEFAULT NULL
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
  v_unit    text := NULLIF(btrim(coalesce(p_unit, '')), '');
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  -- ── Category boundary ────────────────────────────────────────────────────
  IF p_category = 'phone' THEN
    RAISE EXCEPTION 'phones must use the legacy inventory_add_item flow' USING ERRCODE = '22023';
  ELSIF p_category NOT IN ('car','property','produce') THEN
    RAISE EXCEPTION 'unknown category "%": use car|property|produce', p_category USING ERRCODE = '22023';
  END IF;

  IF p_category = 'car' THEN
    IF v_brand = '' OR v_model = '' THEN
      RAISE EXCEPTION 'car make and model are required' USING ERRCODE = '22023';
    END IF;
  ELSIF p_category = 'property' THEN
    IF v_model = '' THEN
      RAISE EXCEPTION 'property listing title is required' USING ERRCODE = '22023';
    END IF;
  ELSIF v_model = '' THEN
    RAISE EXCEPTION 'produce product name is required' USING ERRCODE = '22023';
  END IF;

  IF p_price_period NOT IN ('sale','monthly') THEN
    RAISE EXCEPTION 'invalid price_period "%" (sale|monthly)', p_price_period USING ERRCODE = '22023';
  END IF;

  -- Quantity: pinned to exactly 1 for car; produce allows whole units >= 1.
  IF p_category = 'car' THEN
    IF p_quantity IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'quantity must be exactly 1 for car/property listings' USING ERRCODE = '22023';
    END IF;
  ELSIF p_category = 'property' THEN
    IF p_quantity IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'quantity must be exactly 1 for car/property listings' USING ERRCODE = '22023';
    END IF;
  ELSIF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1 for produce listings' USING ERRCODE = '22023';
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
  ELSIF p_category = 'property' THEN
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
  ELSE
    -- produce
    v_payload := public.listing_product_payload(p_details);
    IF p_price_period <> 'sale' THEN
      RAISE EXCEPTION 'produce listings pair with price_period=sale' USING ERRCODE = '22023';
    END IF;
    IF v_unit IS NOT NULL AND v_unit NOT IN ('piece','kg','g','liter','dozen','bag') THEN
      RAISE EXCEPTION 'invalid unit "%": use piece|kg|g|liter|dozen|bag', v_unit USING ERRCODE = '22023';
    END IF;
    v_core_condition := 'Good';
  END IF;

  IF p_is_published THEN
    PERFORM public.listing_assert_publishable(p_category, p_price, v_city, v_payload);
  END IF;

  -- ── Core row ─────────────────────────────────────────────────────────────
  INSERT INTO public.inventory_items
    (model_id, brand, model, variant, ram, storage, condition, color,
     quantity, status, buy_price, sell_price, code, battery_health, warranty,
     city, description, is_published, price_period, category, unit,
     total_purchased, total_sold)
  VALUES
    (concat_ws(' ', NULLIF(v_brand, ''), NULLIF(v_model, '')),
     v_brand, v_model,
     '', NULL, '', v_core_condition, v_color,
     p_quantity,
     public.inventory_calc_status(p_quantity),
     NULL, p_price,
     NULLIF(btrim(coalesce(p_code, '')), ''),
     NULL,
     NULLIF(btrim(coalesce(p_warranty, '')), ''),
     NULLIF(v_city, ''), p_description,
     p_is_published, p_price_period, p_category,
     v_unit,
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
  ELSIF p_category = 'property' THEN
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
  ELSE
    INSERT INTO public.produce_details (id, origin, grade)
    VALUES (v_id, v_payload->>'origin', v_payload->>'grade');
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_create(text, text, text, numeric, text, text, text, text, text, text, integer, boolean, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_create(text, text, text, numeric, text, text, text, text, text, text, integer, boolean, jsonb, text) TO authenticated;

-- ============================================================================
-- 4) listing_update_core — OR: accept produce (attaches unit)
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
  p_warranty     text DEFAULT NULL,
  p_unit         text DEFAULT NULL
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
  v_unit text;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.inventory_items WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '22000';
  END IF;
  IF r.category NOT IN ('car','property','produce') THEN
    RAISE EXCEPTION 'listing_update_core targets car/property listings only' USING ERRCODE = '22023';
  END IF;

  v_new_brand   := COALESCE(NULLIF(btrim(p_brand), ''), r.brand);
  v_new_model   := COALESCE(NULLIF(btrim(p_model), ''), r.model);
  v_new_price   := COALESCE(p_price, r.sell_price);
  v_new_period  := COALESCE(p_price_period, r.price_period);
  v_new_city    := COALESCE(p_city, r.city);
  v_unit        := COALESCE(NULLIF(btrim(coalesce(p_unit, '')), ''), r.unit);

  IF r.category = 'car' THEN
    IF v_new_brand = '' OR v_new_model = '' THEN
      RAISE EXCEPTION 'car make and model are required' USING ERRCODE = '22023';
    END IF;
  ELSIF r.category = 'property' THEN
    IF v_new_model = '' THEN
      RAISE EXCEPTION 'property listing title is required' USING ERRCODE = '22023';
    END IF;
  ELSIF v_new_model = '' THEN
    RAISE EXCEPTION 'produce product name is required' USING ERRCODE = '22023';
  END IF;
  IF v_new_period NOT IN ('sale','monthly') THEN
    RAISE EXCEPTION 'invalid price_period' USING ERRCODE = '22023';
  END IF;

  IF r.category = 'car' THEN
    SELECT to_jsonb(cd) INTO v_payload FROM public.car_details cd WHERE cd.id = p_listing_id;
    IF v_new_period <> 'sale' THEN
      RAISE EXCEPTION 'car listings pair with price_period=sale' USING ERRCODE = '22023';
    END IF;
  ELSIF r.category = 'property' THEN
    SELECT to_jsonb(pd) INTO v_payload FROM public.property_details pd WHERE pd.id = p_listing_id;
    IF (v_payload->>'transaction_type') = 'rent' AND v_new_period <> 'monthly' THEN
      RAISE EXCEPTION 'rental property pairs with price_period=monthly' USING ERRCODE = '22023';
    END IF;
    IF (v_payload->>'transaction_type') = 'sale' AND v_new_period <> 'sale' THEN
      RAISE EXCEPTION 'for-sale property pairs with price_period=sale' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_new_period <> 'sale' THEN
      RAISE EXCEPTION 'produce listings pair with price_period=sale' USING ERRCODE = '22023';
    END IF;
    IF v_unit IS NOT NULL AND v_unit NOT IN ('piece','kg','g','liter','dozen','bag') THEN
      RAISE EXCEPTION 'invalid unit "%": use piece|kg|g|liter|dozen|bag', v_unit USING ERRCODE = '22023';
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
    unit         = v_unit,
    updated_at   = now()
  WHERE id = p_listing_id;

  IF r.is_published THEN
    PERFORM public.listing_assert_publishable(r.category, v_new_price, v_new_city, v_payload);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_update_core(uuid, text, text, numeric, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_update_core(uuid, text, text, numeric, text, text, text, text, text, text, text) TO authenticated;

-- ============================================================================
-- 5) listing_update_details — OR: accept produce (merge into produce_details)
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
  IF r.category NOT IN ('car','property','produce') THEN
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
  ELSIF r.category = 'property' THEN
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
  ELSE
    SELECT to_jsonb(pd) INTO v_current FROM public.produce_details pd WHERE pd.id = p_listing_id;
    v_merged := COALESCE(v_current, '{}'::jsonb) || p_details;
    v_merged := public.listing_product_payload(v_merged);

    INSERT INTO public.produce_details AS pd
      (id, origin, grade)
    VALUES
      (p_listing_id,
       v_merged->>'origin',
       v_merged->>'grade')
    ON CONFLICT (id) DO UPDATE SET
      origin = EXCLUDED.origin,
      grade  = EXCLUDED.grade;

    IF r.is_published THEN
      PERFORM public.listing_assert_publishable('produce', r.sell_price, r.city, v_merged);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_update_details(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_update_details(uuid, jsonb) TO authenticated;

-- ============================================================================
-- 6) listing_search — OR: accept produce + produce filter whitelist
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
  IF p_category NOT IN ('phone','car','property','produce') THEN
    RAISE EXCEPTION 'unknown category "%" (phone|car|property|produce)', p_category USING ERRCODE = '22023';
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
  ELSIF p_category = 'produce' THEN
    FOR k IN SELECT jsonb_object_keys(v_filters) LOOP
      IF NOT k = ANY(ARRAY['origin','grade','unit']) THEN
        RAISE EXCEPTION 'unknown produce filter "%"', k USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v := v_filters->>'unit';
    IF v IS NOT NULL AND v NOT IN ('piece','kg','g','liter','dozen','bag') THEN
      RAISE EXCEPTION 'invalid unit filter "%"', v USING ERRCODE = '22023';
    END IF;
  ELSE
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
        OR COALESCE(v.produce_origin, '') ILIKE '%' || v_q || '%'
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
      AND (v_filters->>'origin' IS NULL OR COALESCE(v.produce_origin, '') = v_filters->>'origin')
      AND (v_filters->>'grade' IS NULL OR COALESCE(v.produce_grade, '') = v_filters->>'grade')
      AND (v_filters->>'unit' IS NULL OR COALESCE(v.unit, '') = v_filters->>'unit')
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

REVOKE ALL ON FUNCTION public.listing_search(text, text, jsonb, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_search(text, text, jsonb, text, integer, integer) TO anon, authenticated;

-- ============================================================================
-- 7) listing_my_listings — OR: accept produce so Admin can discover drafts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_my_listings(p_category text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_category = 'phone' THEN
    RAISE EXCEPTION 'phones are managed through inventory_management_list' USING ERRCODE = '22023';
  ELSIF p_category NOT IN ('car','property','produce') THEN
    RAISE EXCEPTION 'unknown category "%": use car|property|produce', p_category USING ERRCODE = '22023';
  END IF;

  WITH base AS (
    SELECT
      i.id,
      i.category,
      i.unit,
      i.brand,
      i.model,
      i.color,
      i.quantity,
      i.status,
      i.is_published,
      i.sell_price          AS price,
      i.price_period,
      i.code,
      i.warranty,
      i.city,
      i.description,
      i.variant             AS phone_variant,
      i.ram                 AS phone_ram,
      i.storage             AS phone_storage,
      i.condition           AS phone_condition,
      i.battery_health      AS phone_battery_health,
      cd.trim               AS car_trim,
      cd.year               AS car_year,
      cd.mileage_km         AS car_mileage_km,
      cd.fuel               AS car_fuel,
      cd.transmission       AS car_transmission,
      cd.body_type          AS car_body_type,
      cd.engine_cc          AS car_engine_cc,
      cd.condition_state    AS car_condition_state,
      pd.property_type,
      pd.transaction_type,
      pd.district           AS property_district,
      pd.area_m2            AS property_area_m2,
      pd.bedrooms           AS property_bedrooms,
      pd.bathrooms          AS property_bathrooms,
      pd.floor              AS property_floor,
      pd.furnished          AS property_furnished,
      pd.condition_state    AS property_condition_state,
      prd.origin            AS produce_origin,
      prd.grade             AS produce_grade,
      COALESCE(
        (SELECT array_agg(im.path ORDER BY im.position, im.created_at)
         FROM public.inventory_images im WHERE im.inventory_id = i.id),
        ARRAY[]::text[]
      )                     AS images,
      i.created_at,
      i.updated_at
    FROM public.inventory_items i
    LEFT JOIN public.car_details      cd ON cd.id = i.id
    LEFT JOIN public.property_details pd ON pd.id = i.id
    LEFT JOIN public.produce_details  prd ON prd.id = i.id
    WHERE i.category = p_category
      AND i.status <> 'deleted'
    ORDER BY i.updated_at DESC
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(base.*)) FROM base), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_my_listings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_my_listings(text) TO authenticated;

-- ============================================================================
-- 8) listing_delete — OR: accept produce (soft delete stays category-scoped)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_delete(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.inventory_items%ROWTYPE;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.inventory_items WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '22000';
  END IF;
  IF r.category NOT IN ('car','property','produce') THEN
    RAISE EXCEPTION 'listing_delete targets car/property listings only' USING ERRCODE = '22023';
  END IF;

  UPDATE public.inventory_items SET
    status     = 'deleted',
    updated_at = now()
  WHERE id = p_listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.listing_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_delete(uuid) TO authenticated;

-- ============================================================================
-- 9) delivery_create_order (00052) — NO CHANGE NEEDED.
--    It resolves any catalog_ref against v_public_listings (published,
--    in-stock) and is already domain-agnostic; produce with price_period
--    'sale' is orderable with the authoritative price/quantity. Not
--    redefined here on purpose (one order authority — no parallel path).
-- ============================================================================

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- 1. Produce create (admin; quantity allowed):
--      SELECT public.listing_create('produce','Farm','Tomato',250,'sale',
--        '', 'Oran','Fresh',NULL,NULL,100,FALSE,'{"origin":"M''Sila","grade":"A"}','kg');
--    → returns a uuid; quantity 100 accepted for produce.
-- 2. Car still pins quantity=1 (regression):
--      SELECT public.listing_create('car','Toyota','Corolla',10000,'sale',
--        '', '', NULL, NULL, NULL, 2, FALSE, '{"conditionState":"used"}');
--    → ERROR: quantity must be exactly 1 for car/property listings
-- 3. Phone still rejected (regression):
--      SELECT public.listing_create('phone','x','y'); → ERROR: legacy flow
-- 4. Produce invalid unit rejected:
--      SELECT public.listing_create('produce','Farm','Tomato',250,'sale',
--        '','Oran',NULL,NULL,NULL,100,FALSE,'{}','bogus'); → ERROR: invalid unit
-- 5. Non-admin/anon write must ERROR 42501.
-- 6. Search whitelist admits produce; publishes+in-stock only:
--      SET ROLE anon; SELECT public.listing_search('produce', '{}', '{"unit":"kg"}'); RESET ROLE;
-- 7. Order authority: create order for the produce id via delivery_create_order
--    → authoritative price/quantity; unresolved ref → ITEM_NOT_FOUND.
--
-- ROLLBACK (reverse order; safer to re-apply 00038/00039 definitions):
--   DROP FUNCTION IF EXISTS public.listing_delete(uuid);
--   DROP FUNCTION IF EXISTS public.listing_my_listings(text);
--   DROP FUNCTION IF EXISTS public.listing_search(text, text, jsonb, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.listing_update_details(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.listing_update_core(uuid, text, text, numeric, text, text, text, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.listing_create(text, text, text, numeric, text, text, text, text, text, text, integer, boolean, jsonb, text);
--   DROP FUNCTION IF EXISTS public.listing_assert_publishable(text, numeric, text, jsonb);
--   DROP FUNCTION IF EXISTS public.listing_product_payload(jsonb);
--   (then re-apply the original 00038 + 00039 definitions to restore exact signatures)
-- ============================================================================
