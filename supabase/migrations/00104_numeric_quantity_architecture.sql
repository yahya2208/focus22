-- ============================================================================
-- 00104  GATE C1 — NUMERIC QUANTITY ARCHITECTURE (customer vegetables)
-- ----------------------------------------------------------------------------
-- VERDICT A (approved): numeric quantity with per-unit rules.
--   * kg            -> decimal quantity, scale <= 3       (e.g. 1.5 / 2.25 kg)
--   * piece/unit/…  -> integer quantity only              (e.g. phones: 1/2/10)
--
-- Type: Additive + widening. NO published financial function is redefined here
-- EXCEPT the canonical order-creation RPC (numeric casts + unit-aware
-- validation) and the integer-typed inventory helpers whose argument type
-- changes. Money semantics, family resolution, ledger, debts, settlement,
-- RBAC/RLS are UNTOUCHED.
--
-- Canonical selling unit decision (Gate C1 §5):
--   `inventory_items.unit` (00053) is the ONLY app-written unit column and the
--   source of truth. `inventory_items.sell_unit` (00101) is a redundant Gate A
--   display column with NO application writer; this migration makes it a
--   DERIVED projection of `unit` (kg -> 'kg', everything else -> 'unit') via a
--   one-time backfill + a BEFORE INSERT/UPDATE trigger. No third unit system.
--
-- What changes:
--   1) inventory_items.quantity          INTEGER -> numeric(12,3)
--   2) order_items.quantity              INTEGER -> numeric(12,3)
--   3) inventory_movements.delta         INTEGER -> numeric(12,3)
--   4) inventory_items.total_purchased   INTEGER -> numeric(12,3)
--   5) inventory_items.total_sold        INTEGER -> numeric(12,3)
--   6) inventory_calc_status(numeric)    (integer signature dropped, no overload)
--   7) inventory_add_stock / remove_stock / adjust_stock : p_quantity numeric
--   8) delivery_create_order             : numeric parse + unit-aware validation
--   9) inventory_items.sell_unit         : backfilled + synced from `unit`
--
-- Preflight (READ-ONLY, run before applying):
--   SELECT count(*) FILTER (WHERE quantity IS NULL)                       AS null_qty,
--          count(*) FILTER (WHERE quantity < 0)                           AS neg_qty,
--          count(*) FILTER (WHERE quantity <> round(quantity, 3))         AS frac_qty,
--          count(*) FILTER (WHERE quantity <> trunc(quantity))            AS nonint_qty
--     FROM public.inventory_items;
--   SELECT count(*) FILTER (WHERE quantity IS NULL)                       AS null_qty,
--          count(*) FILTER (WHERE quantity <= 0)                          AS nonpos_qty
--     FROM public.order_items;
--   -- Integer -> numeric(12,3) is LOSSLESS (no rounding) in every case above.
--
-- Rollback:
--   ALTER TABLE public.inventory_items
--     ALTER COLUMN quantity TYPE integer USING floor(quantity)::integer,
--     ALTER COLUMN total_purchased TYPE integer USING floor(total_purchased)::integer,
--     ALTER COLUMN total_sold TYPE integer USING floor(total_sold)::integer;
--   ALTER TABLE public.order_items
--     ALTER COLUMN quantity TYPE integer USING floor(quantity)::integer;
--   ALTER TABLE public.inventory_movements
--     ALTER COLUMN delta TYPE integer USING floor(delta)::integer;
--   DROP TRIGGER IF EXISTS trg_inventory_items_sell_unit ON public.inventory_items;
--   DROP FUNCTION IF EXISTS public.sync_inventory_sell_unit();
--   DROP FUNCTION IF EXISTS public.inventory_calc_status(numeric);
--   (then recreate the integer helpers from 00019/00075 and the 00102
--    delivery_create_order body)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) Widen the quantity columns (lossless integer -> numeric(12,3))
--    Public views read inventory_items.quantity, so their stored rules block
--    ALTER TYPE. Capture their exact live definitions, drop them, widen the
--    column, then recreate the views verbatim. This is environment-agnostic:
--    no view column order or reloption is assumed by this migration. Only
--    SELECT is (re)asserted; Supabase default privileges are preserved.
-- ============================================================================
SET LOCAL search_path = public;

DO $wrap$
DECLARE
  v_def_inv text := pg_get_viewdef('public.v_public_inventory'::regclass, true);
  v_def_lst text := pg_get_viewdef('public.v_public_listings'::regclass, true);
  v_opt_lst text[];
  v_pol     record;
BEGIN
  SELECT reloptions INTO v_opt_lst
    FROM pg_class WHERE oid = 'public.v_public_listings'::regclass;

  -- The one RLS policy that reads inventory_items.quantity lives on another
  -- table (inventory_images); capture it so it is restored verbatim.
  SELECT policyname, permissive, cmd, roles, qual
    INTO v_pol
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'inventory_images'
     AND policyname = 'Public read inventory images';

  DROP VIEW public.v_public_inventory;
  DROP VIEW public.v_public_listings;
  IF v_pol.policyname IS NOT NULL THEN
    EXECUTE 'DROP POLICY ' || quote_ident(v_pol.policyname) || ' ON public.inventory_images';
  END IF;

  EXECUTE 'ALTER TABLE public.inventory_items '
       || 'ALTER COLUMN quantity TYPE numeric(12,3) USING quantity::numeric(12,3)';

  EXECUTE 'CREATE VIEW public.v_public_inventory AS ' || v_def_inv;
  EXECUTE 'CREATE VIEW public.v_public_listings AS ' || v_def_lst;

  IF v_opt_lst IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.v_public_listings SET ('
         || array_to_string(v_opt_lst, ', ') || ')';
  END IF;

  IF v_pol.policyname IS NOT NULL THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.inventory_images AS %s FOR %s TO %s USING (%s)',
      v_pol.policyname, v_pol.permissive, v_pol.cmd,
      array_to_string(v_pol.roles, ', '), v_pol.qual);
  END IF;
END;
$wrap$;

GRANT SELECT ON public.v_public_inventory TO anon, authenticated;
GRANT SELECT ON public.v_public_listings TO anon, authenticated;

ALTER TABLE public.inventory_items
  ALTER COLUMN total_purchased TYPE numeric(12,3) USING total_purchased::numeric(12,3),
  ALTER COLUMN total_sold      TYPE numeric(12,3) USING total_sold::numeric(12,3);

ALTER TABLE public.inventory_items ALTER COLUMN quantity SET DEFAULT 0;
ALTER TABLE public.inventory_items ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric(12,3) USING quantity::numeric(12,3);
ALTER TABLE public.order_items ALTER COLUMN quantity SET DEFAULT 1;
ALTER TABLE public.order_items ALTER COLUMN quantity SET NOT NULL;

ALTER TABLE public.inventory_movements
  ALTER COLUMN delta TYPE numeric(12,3) USING delta::numeric(12,3);

-- The non-negative / positive CHECKs survive the type change verbatim
-- (inventory_items_quantity_nonneg: quantity >= 0,
--  order_items_quantity_check: quantity > 0). Re-assert defensively in case a
-- runtime dropped them.
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_quantity_nonneg;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_quantity_nonneg CHECK (quantity >= 0);

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_quantity_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);

-- ============================================================================
-- 2) inventory_calc_status — numeric-typed, single signature (no overload)
--    Dropping the integer signature is safe: every caller is a plpgsql body
--    that resolves at runtime, and integer arguments implicitly widen.
-- ============================================================================
DROP FUNCTION IF EXISTS public.inventory_calc_status(integer);
CREATE FUNCTION public.inventory_calc_status(p_quantity numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = ''
AS $function$
  SELECT CASE WHEN p_quantity<=0 THEN 'out_of_stock'
              WHEN p_quantity<=3 THEN 'low_stock'
              ELSE 'in_stock' END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_calc_status(numeric) FROM PUBLIC;

-- ============================================================================
-- 3) Stock RPCs — accept numeric quantities (same authz, same guards + scale)
--    Signatures change integer -> numeric, so the old functions are dropped
--    first (no ambiguous overload left behind).
-- ============================================================================
DROP FUNCTION IF EXISTS public.inventory_add_stock(uuid, integer, text, jsonb, text);
CREATE FUNCTION public.inventory_add_stock(
  p_inventory_id uuid,
  p_quantity     numeric,
  p_reason       text DEFAULT NULL,
  p_metadata     jsonb DEFAULT NULL,
  p_note         text DEFAULT NULL
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
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be a positive number'
      USING ERRCODE = '22023';
  END IF;
  IF p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'quantity scale must be <= 3'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.inventory_items
  SET quantity = quantity + p_quantity,
      total_purchased = total_purchased + p_quantity,
      status = public.inventory_calc_status(quantity + p_quantity)
  WHERE id = p_inventory_id
    AND status NOT IN ('archived','discontinued','deleted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.inventory_items WHERE id = p_inventory_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'item % not found', p_inventory_id
        USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'item % is archived/discontinued/deleted and cannot receive stock changes', p_inventory_id
      USING ERRCODE = '22023';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_add_stock(uuid, numeric, text, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.inventory_add_stock(uuid, numeric, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_add_stock(uuid, numeric, text, jsonb, text) FROM anon;

DROP FUNCTION IF EXISTS public.inventory_remove_stock(uuid, integer, text, jsonb, text);
CREATE FUNCTION public.inventory_remove_stock(
  p_inventory_id uuid,
  p_quantity     numeric,
  p_reason       text DEFAULT NULL,
  p_metadata     jsonb DEFAULT NULL,
  p_note         text DEFAULT NULL
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
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be a positive number'
      USING ERRCODE = '22023';
  END IF;
  IF p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'quantity scale must be <= 3'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.inventory_items
  SET quantity = GREATEST(quantity - p_quantity, 0),
      total_sold = total_sold + p_quantity,
      status = public.inventory_calc_status(GREATEST(quantity - p_quantity, 0))
  WHERE id = p_inventory_id
    AND status NOT IN ('archived','discontinued','deleted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.inventory_items WHERE id = p_inventory_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'item % not found', p_inventory_id
        USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'item % is archived/discontinued/deleted and cannot receive stock changes', p_inventory_id
      USING ERRCODE = '22023';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_remove_stock(uuid, numeric, text, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.inventory_remove_stock(uuid, numeric, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_remove_stock(uuid, numeric, text, jsonb, text) FROM anon;

DROP FUNCTION IF EXISTS public.inventory_adjust_stock(uuid, integer, text, jsonb, text);
CREATE FUNCTION public.inventory_adjust_stock(
  p_inventory_id uuid,
  p_quantity     numeric,
  p_reason       text DEFAULT NULL,
  p_metadata     jsonb DEFAULT NULL,
  p_note         text DEFAULT NULL
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
  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'quantity must be a non-negative number'
      USING ERRCODE = '22023';
  END IF;
  IF p_quantity <> round(p_quantity, 3) THEN
    RAISE EXCEPTION 'quantity scale must be <= 3'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.inventory_items
  SET quantity = p_quantity,
      status = public.inventory_calc_status(p_quantity)
  WHERE id = p_inventory_id
    AND status NOT IN ('archived','discontinued','deleted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.inventory_items WHERE id = p_inventory_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'item % not found', p_inventory_id
        USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'item % is archived/discontinued/deleted and cannot be adjusted', p_inventory_id
      USING ERRCODE = '22023';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_adjust_stock(uuid, numeric, text, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.inventory_adjust_stock(uuid, numeric, text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inventory_adjust_stock(uuid, numeric, text, jsonb, text) FROM anon;

-- ============================================================================
-- 4) sell_unit — derived projection of the canonical `unit` column
--    One-time backfill + sync trigger. `unit` is the source of truth.
-- ============================================================================
UPDATE public.inventory_items
   SET sell_unit = CASE WHEN unit = 'kg' THEN 'kg' ELSE 'unit' END
 WHERE sell_unit IS DISTINCT FROM CASE WHEN unit = 'kg' THEN 'kg' ELSE 'unit' END;

CREATE OR REPLACE FUNCTION public.sync_inventory_sell_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.sell_unit := CASE WHEN NEW.unit = 'kg' THEN 'kg' ELSE 'unit' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_sell_unit ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_sell_unit
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_sell_unit();

-- ============================================================================
-- 5) delivery_create_order — 00102 body with numeric quantity + unit rules
--    Exactly ONE canonical signature must remain: (jsonb, jsonb, boolean
--    DEFAULT false). The legacy 2-arg overload (00050..00079) is therefore
--    DROPPED — CREATE OR REPLACE alone would leave it in place and let callers
--    bypass the unit-aware quantity enforcement. All server authority is
--    preserved: auth.uid(), family resolution, pilot-store gate, catalog
--    resolution from v_public_listings, server-side pricing, retry window.
--    Only the quantity type + unit-aware validation change.
-- ============================================================================
DROP FUNCTION IF EXISTS public.delivery_create_order(jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.delivery_create_order(
  p_customer    jsonb,
  p_items       jsonb,
  p_intentional boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_zone_id     uuid;
  v_cust_name   text;
  v_cust_phone  text;
  v_address     text;
  v_notes       text;

  v_item        jsonb;

  -- Authoritative resolution per item (00052)
  v_ref         text;
  v_row_id      uuid;
  v_row_cat     text;
  v_row_brand   text;
  v_row_model   text;
  v_row_price   numeric;
  v_row_period  text;
  v_row_qty     numeric;
  v_row_unit    text;
  v_item_name   text;
  v_item_unit   numeric;
  v_item_qty    numeric;

  -- Pilot store / neighborhood (Phase 5)
  v_store_id    uuid;
  v_neigh_id    uuid;
  v_first_store uuid;
  v_any_store   boolean := FALSE;

  -- Gate A: family binding + duplicate window
  v_family_id   uuid;
  v_item_count  integer;
  v_dup_id      uuid;

  v_subtotal    numeric := 0;
  v_fee         numeric := 0;
  v_min_min     integer := 30;
  v_min_max     integer := 45;
  v_order_id    uuid;
  v_order_no    text;
  v_estimate    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Gate A: server-derived family binding — the client never supplies it.
  SELECT fm.family_id INTO v_family_id
    FROM public.family_members fm
   WHERE fm.user_id = v_uid AND fm.status = 'active'
   LIMIT 1;

  v_cust_name  := btrim(COALESCE(p_customer->>'name', ''));
  v_cust_phone := btrim(COALESCE(p_customer->>'phone', ''));
  v_zone_id    := (p_customer->>'zone_id')::uuid;
  v_address    := btrim(COALESCE(p_customer->>'address', ''));
  v_notes      := btrim(COALESCE(p_customer->>'notes', ''));

  IF v_cust_name = '' OR v_cust_phone = '' THEN
    RAISE EXCEPTION 'CUSTOMER_INFO_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_zone_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.delivery_zones z WHERE z.id = v_zone_id AND z.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'ZONE_NOT_ACTIVE' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Pass 1: validate + resolve + accumulate authoritative subtotal.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ref := COALESCE(btrim((v_item->>'catalog_ref')::text), '');

    IF v_ref = '' THEN
      -- Free-form (non-catalog) line item — legacy verbatim shape. NOT reachable
      -- from the pilot storefront (submitPilotOrder filters empty catalog_ref);
      -- retained for direct/legacy callers only. Client price stays trusted here
      -- by the pre-existing contract.
      v_item_unit := COALESCE((v_item->>'unit_price')::numeric, 0);
      -- Legacy clamp preserved verbatim (integer -> numeric only); no unit is
      -- known for free-form rows so no unit-aware rule is applied here.
      v_item_qty  := GREATEST(COALESCE((v_item->>'quantity')::numeric, 1), 1);
    ELSE
      -- Catalog item — authoritative only, resolved against the SAME public
      -- visibility gate the shopper saw (published, in-stock, active).
      SELECT
        v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity, v.unit
        INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty, v_row_unit
      FROM public.v_public_listings v
      WHERE v.id = v_ref::uuid
        AND v.quantity > 0;

      IF v_row_id IS NULL THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;

      -- Physically orderable := any domain; but monthly-rent rows (properties)
      -- are not delivery orders.
      IF v_row_period = 'monthly' THEN
        RAISE EXCEPTION 'ITEM_NOT_ORDERABLE' USING ERRCODE = 'P0002';
      END IF;

      v_item_name := btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, ''));
      v_item_unit := COALESCE(v_row_price, 0);
      v_item_qty  := COALESCE((v_item->>'quantity')::numeric, 1);

      -- Unit-aware server enforcement (Gate C1):
      --   kg            -> decimal allowed, scale <= 3
      --   everything else (piece/unit/NULL phones/…) -> integer only
      IF v_item_qty IS NULL OR v_item_qty <= 0 THEN
        RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
      IF v_row_unit = 'kg' THEN
        IF v_item_qty <> round(v_item_qty, 3) THEN
          RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
        END IF;
      ELSE
        IF v_item_qty <> trunc(v_item_qty) THEN
          RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE = '22023';
        END IF;
      END IF;
      -- Never exceed available stock; never silently become non-positive.
      v_item_qty := LEAST(v_item_qty, v_row_qty);
      IF v_item_qty <= 0 THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;

      -- Pilot Phase 5: resolve owning store/neighborhood for catalog items.
      SELECT s.id, s.neighborhood_id
        INTO v_store_id, v_neigh_id
      FROM public.store_inventory si
      JOIN public.stores s ON s.id = si.store_id AND s.status = 'active'
      WHERE si.inventory_id = v_row_id
      LIMIT 1;

      IF v_store_id IS NOT NULL THEN
        IF v_first_store IS NULL THEN
          v_first_store := v_store_id;
        ELSIF v_store_id IS DISTINCT FROM v_first_store THEN
          RAISE EXCEPTION 'MULTI_STORE_ORDER' USING ERRCODE = 'P0002';
        END IF;
        v_any_store := TRUE;
      END IF;
    END IF;

    v_subtotal := v_subtotal + v_item_unit * v_item_qty;
  END LOOP;

  -- A consistent basket (one store, or all free-form) resolved above: use the
  -- committed store id for the order header. Free-form-only orders stay NULL.
  IF NOT v_any_store THEN
    v_store_id := NULL;
    v_neigh_id := NULL;
  END IF;

  -- Gate A (D3/pilot topology): pilot-store orders require a family account.
  IF v_store_id IS NOT NULL AND v_family_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.stores s WHERE s.id = v_store_id AND s.slug LIKE 'pilot-%'
    ) THEN
      RAISE EXCEPTION 'FAMILY_ACCOUNT_REQUIRED' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Gate A (OQ4=B, server half): retry-window fingerprint for unintended
  -- retries. p_intentional bypasses ONLY this window.
  v_item_count := jsonb_array_length(p_items);
  IF NOT COALESCE(p_intentional, FALSE) THEN
    SELECT o.id INTO v_dup_id
      FROM public.orders o
     WHERE o.user_id = v_uid
       AND o.status <> 'cancelled'
       AND o.created_at >= now() - interval '60 seconds'
       AND o.subtotal = v_subtotal
       AND (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) = v_item_count
     LIMIT 1;
    IF v_dup_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_ORDER' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT * INTO v_estimate FROM public.delivery_estimate(v_zone_id, v_subtotal);
  IF COALESCE((v_estimate->>'available')::boolean, FALSE) THEN
    v_fee     := COALESCE((v_estimate->>'fee')::numeric, 0);
    v_min_min := COALESCE((v_estimate->>'minutes_min')::integer, 30);
    v_min_max := COALESCE((v_estimate->>'minutes_max')::integer, 45);
  END IF;

  v_order_no := 'FC-' || lpad((nextval('public.orders_id_seq')::bigint % 1000000)::text, 6, '0');

  INSERT INTO public.orders (
    order_number, customer_name, customer_phone, zone_id, address,
    subtotal, delivery_fee, total, status, notes,
    store_id, neighborhood_id, user_id, family_id
  )
  VALUES (
    v_order_no, v_cust_name, v_cust_phone, v_zone_id, v_address,
    v_subtotal, v_fee, v_subtotal + v_fee, 'confirmed', v_notes,
    v_store_id, v_neigh_id, v_uid, v_family_id
  )
  RETURNING id INTO v_order_id;

  -- GATE 3: record the canonical 'created' event atomically with the order.
  INSERT INTO public.order_status_history (
    order_id, previous_status, new_status, event_type,
    actor_user_id, actor_role, reason, metadata
  ) VALUES (
    v_order_id, '', 'confirmed', 'created',
    v_uid, 'customer', '', '{}'
  );

  -- Pass 2: persist each resolved/sanitised item with the authoritative values.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ref := COALESCE(btrim((v_item->>'catalog_ref')::text), '');

    IF v_ref = '' THEN
      INSERT INTO public.order_items (order_id, category_id, catalog_ref, name, name_ar, unit_price, quantity)
      VALUES (
        v_order_id,
        NULLIF(NULLIF(v_item->>'category_id', ''), 'null')::uuid,
        COALESCE(v_item->>'catalog_ref', ''),
        COALESCE(v_item->>'name', ''),
        COALESCE(v_item->>'name_ar', ''),
        COALESCE((v_item->>'unit_price')::numeric, 0),
        GREATEST(COALESCE((v_item->>'quantity')::numeric, 1), 1)
      );
    ELSE
      SELECT
        v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity, v.unit
        INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty, v_row_unit
      FROM public.v_public_listings v
      WHERE v.id = v_ref::uuid;

      INSERT INTO public.order_items (order_id, category_id, catalog_ref, name, name_ar, unit_price, quantity)
      VALUES (
        v_order_id,
        NULLIF(NULLIF(v_item->>'category_id', ''), 'null')::uuid,
        v_ref,
        btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, '')),
        btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, '')),
        COALESCE(v_row_price, 0),
        LEAST(COALESCE((v_item->>'quantity')::numeric, 1), v_row_qty)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_no,
    'status', 'confirmed',
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee,
    'eta_minutes_min', v_min_min,
    'eta_minutes_max', v_min_max,
    'store_id', v_store_id,
    'neighborhood_id', v_neigh_id,
    'family_id', v_family_id
  );
END;
$$;

-- Signature unchanged; re-assert the canonical grants (defense in depth).
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb, boolean) TO authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- 1. Types widened:
--      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
--        FROM information_schema.columns
--       WHERE (table_name, column_name) IN (
--         ('inventory_items','quantity'), ('order_items','quantity'),
--         ('inventory_movements','delta'),
--         ('inventory_items','total_purchased'), ('inventory_items','total_sold'))
--       ORDER BY 1,2;
--      -- expected: numeric / 12 / 3
-- 2. Constraints intact:
--      SELECT conname FROM pg_constraint
--       WHERE conrelid IN ('public.inventory_items'::regclass,'public.order_items'::regclass)
--         AND conname IN ('inventory_items_quantity_nonneg','order_items_quantity_check');
-- 3. Single calc_status signature (numeric only):
--      SELECT proname, pg_get_function_arguments(oid)
--        FROM pg_proc WHERE proname = 'inventory_calc_status';
-- 4. Integer helper signatures gone:
--      SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
--       WHERE proname IN ('inventory_add_stock','inventory_remove_stock','inventory_adjust_stock');
--      -- expected p_quantity numeric (no integer overloads)
-- 5. sell_unit derived:
--      SELECT unit, sell_unit, count(*) FROM public.inventory_items GROUP BY 1,2;
--      -- expected kg<->kg, everything else<->unit
-- 6. Existing integer data preserved:
--      SELECT count(*) FROM public.order_items WHERE quantity <> trunc(quantity); -- 0
-- 7. Exactly ONE delivery_create_order signature (legacy 2-arg removed):
--      SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc
--       WHERE proname = 'delivery_create_order';
--      -- expected: single row, (p_customer jsonb, p_items jsonb, p_intentional boolean)
-- ============================================================================
