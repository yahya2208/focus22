-- 00026_inventory_source_label.sql
-- Adds a private source_label column to inventory_items.
-- This is operational admin-only data (phone source / owner tracking).
-- It is NEVER exposed via v_public_inventory (customer-facing view).
--
-- Option A: simple nullable TEXT column. No backfill (existing rows → NULL).
-- No reuse of source_key (which has a UNIQUE WHERE NOT NULL constraint).

BEGIN;

-- 1) Add the column
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS source_label TEXT NULL;

-- 2) Replace inventory_add_item — DROP old signature (18 args) then CREATE new (19 args).
DROP FUNCTION IF EXISTS public.inventory_add_item(
  text, text, text, text, text, text, text, text, integer,
  numeric, numeric, text, integer, text, text, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.inventory_add_item(
  p_model_id      text,
  p_brand         text,
  p_model         text,
  p_variant       text DEFAULT '',
  p_ram           text DEFAULT NULL,
  p_storage       text DEFAULT '',
  p_condition     text DEFAULT 'New',
  p_color         text DEFAULT '',
  p_quantity      integer DEFAULT 0,
  p_buy_price     numeric DEFAULT NULL,
  p_sell_price    numeric DEFAULT NULL,
  p_code          text DEFAULT NULL,
  p_battery_health integer DEFAULT NULL,
  p_warranty      text DEFAULT NULL,
  p_city          text DEFAULT NULL,
  p_description   text DEFAULT NULL,
  p_is_published  boolean DEFAULT FALSE,
  p_source_key    text DEFAULT NULL,
  p_source_label  text DEFAULT NULL
)
RETURNS public.inventory_items
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventory_items;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_model_id IS NULL OR btrim(p_model_id) = ''
     OR p_brand IS NULL OR btrim(p_brand) = ''
     OR p_model IS NULL OR btrim(p_model) = '' THEN
    RAISE EXCEPTION 'brand, model and model_id are required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.inventory_items (
    model_id, brand, model, variant, ram, storage, condition, color,
    quantity, status, buy_price, sell_price, code, battery_health,
    warranty, city, description, is_published, source_key,
    source_label, total_purchased
  ) VALUES (
    btrim(p_model_id), btrim(p_brand), btrim(p_model), btrim(p_variant),
    p_ram, btrim(p_storage), p_condition, p_color,
    GREATEST(p_quantity, 0), public.inventory_calc_status(GREATEST(p_quantity, 0)),
    p_buy_price, p_sell_price, p_code, p_battery_health,
    p_warranty, p_city, p_description, p_is_published, p_source_key,
    NULLIF(btrim(p_source_label), ''), GREATEST(p_quantity, 0)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_add_item(
  text, text, text, text, text, text, text, text, integer,
  numeric, numeric, text, integer, text, text, text, boolean, text, text
) TO authenticated;

-- 3) Replace inventory_update_details — DROP old signature (15 args) then CREATE new (16 args).
DROP FUNCTION IF EXISTS public.inventory_update_details(
  uuid, text, text, text, text, text, text, text, text, text,
  integer, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.inventory_update_details(
  p_inventory_id   uuid,
  p_model_id       text DEFAULT NULL,
  p_brand          text DEFAULT NULL,
  p_model          text DEFAULT NULL,
  p_variant        text DEFAULT NULL,
  p_ram            text DEFAULT NULL,
  p_storage        text DEFAULT NULL,
  p_condition      text DEFAULT NULL,
  p_color          text DEFAULT NULL,
  p_code           text DEFAULT NULL,
  p_battery_health integer DEFAULT NULL,
  p_warranty       text DEFAULT NULL,
  p_city           text DEFAULT NULL,
  p_description    text DEFAULT NULL,
  p_extra          jsonb DEFAULT NULL,
  p_source_label   text DEFAULT NULL
)
RETURNS public.inventory_items
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inventory_items;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_items
  SET model_id       = COALESCE(btrim(NULLIF(p_model_id, '')), model_id),
      brand          = COALESCE(btrim(NULLIF(p_brand, '')), brand),
      model          = COALESCE(btrim(NULLIF(p_model, '')), model),
      variant        = COALESCE(btrim(NULLIF(p_variant, '')), variant),
      ram            = COALESCE(NULLIF(p_ram, ''), ram),
      storage        = COALESCE(btrim(NULLIF(p_storage, '')), storage),
      condition      = COALESCE(NULLIF(p_condition, ''), condition),
      color          = COALESCE(NULLIF(p_color, ''), color),
      code           = COALESCE(NULLIF(p_code, ''), code),
      battery_health = COALESCE(p_battery_health, battery_health),
      warranty       = COALESCE(NULLIF(p_warranty, ''), warranty),
      city           = COALESCE(NULLIF(p_city, ''), city),
      description    = COALESCE(NULLIF(p_description, ''), description),
      extra          = COALESCE(p_extra, extra),
      source_label   = CASE
        WHEN p_source_label IS NULL THEN source_label
        WHEN btrim(p_source_label) = '' THEN NULL
        ELSE btrim(p_source_label)
      END
  WHERE id = p_inventory_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_inventory_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_update_details(
  uuid, text, text, text, text, text, text, text, text, text,
  integer, text, text, text, jsonb, text
) TO authenticated;

COMMIT;
