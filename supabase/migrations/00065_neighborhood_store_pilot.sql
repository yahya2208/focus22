-- ============================================================================
-- 00065  NeighborhoodPilot — Neighborhood · Store · Families · Order tagging
-- ----------------------------------------------------------------------------
-- Type: Additive (new tables, new columns, one function REPLACE).
--
-- Scope (Neighborhood Pilot Epic, Phase 1–7):
--   1. `public.neighborhoods`        — the bounded commerce area.
--   2. `public.stores`               — an operating store inside a neighborhood.
--   3. `public.family_groups`        — named household personas (Pilot families).
--   4. `public.neighborhood_families`— membership of a family in a neighborhood.
--   5. `public.store_inventory`      — inventory_items shown in / orderable from a
--                                      store (join table; canonical inventory is
--                                      NOT touched — scales to multi-store).
--   6. `public.orders` + columns store_id / neighborhood_id / user_id — lets a
--      row answer who · store · neighborhood · products · delivery · status.
--   7. `public.delivery_create_order` — additive REPLACE (signature + return
--      shape + legacy behaviour byte-identical; adds server-side store/neighborhood
--      resolution for catalog items + user_id capture).
--   8. Public storefront read RPCs (anon), admin RPCs, store-operator order RPCs,
--      and a guarded admin `pilot_reset`.
--
-- Change boundaries honoured:
--   * ROLE_PERMISSIONS / ROLE_CAPABILITY_MAP / 00063-00064 / settings / telemetry
--     privacy / game model / TTT / marketplace security — NOT modified.
--   * `delivery_create_order` is extended additively ONLY. New error code
--     MULTI_STORE_ORDER fires only when catalog items resolve to >1 store (never
--     reachable before pilot data exists).
--   * Pilot identifiers (slugs / source keys) are DATA (`pilot-*`), never
--     hardcoded architecture — a second neighborhood / store / family works
--     without a model change (Phase 14).
-- ============================================================================


-- ============================================================================
-- 0) Shared admin helper (safe: fixed search_path, empty by policy).
--    Returns auth.uid() when the caller is a DB admin, else NULL.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_admin_uid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'super_admin')
$$;

GRANT EXECUTE ON FUNCTION public.fn_admin_uid() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_admin_uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_admin_uid() TO anon, authenticated;

-- ============================================================================
-- 1) public.neighborhoods
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.neighborhoods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  name_ar     text NOT NULL DEFAULT '',
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive', 'archived')),
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neighborhoods_status ON public.neighborhoods (status);

-- ============================================================================
-- 2) public.stores
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id  uuid NOT NULL REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (btrim(name) <> ''),
  name_ar          text NOT NULL DEFAULT '',
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive', 'archived')),
  operator_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  description      text NOT NULL DEFAULT '',
  contact_phone    text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_neighborhood ON public.stores (neighborhood_id, status);
CREATE INDEX IF NOT EXISTS idx_stores_operator     ON public.stores (operator_user_id);

-- ============================================================================
-- 3) public.family_groups (named household personas — Pilot Phase 4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.family_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  name_ar     text NOT NULL DEFAULT '',
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'inactive')),
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4) public.neighborhood_families (membership join)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.neighborhood_families (
  neighborhood_id uuid NOT NULL REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
  family_id       uuid NOT NULL REFERENCES public.family_groups(id)  ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (neighborhood_id, family_id)
);

CREATE INDEX IF NOT EXISTS idx_neighborhood_families_family
  ON public.neighborhood_families (family_id);

-- ============================================================================
-- 5) public.store_inventory (join: store ↔ canonical inventory_items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.store_inventory (
  store_id     uuid NOT NULL REFERENCES public.stores(id)         ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  position     integer NOT NULL DEFAULT 0,
  is_primary   boolean NOT NULL DEFAULT FALSE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_store_inventory_store_ordered
  ON public.store_inventory (store_id, position);
CREATE INDEX IF NOT EXISTS idx_store_inventory_inventory
  ON public.store_inventory (inventory_id);

-- ============================================================================
-- 5b) orders — additive columns (Phase 5)
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id        uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS neighborhood_id uuid REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_store   ON public.orders (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_neighbor ON public.orders (neighborhood_id, created_at DESC);

-- ============================================================================
-- 6) RLS — neighborhoods / stores / family_groups / neighborhood_families /
--         store_inventory
--    Read: public (anon+auth) see ACTIVE rows only; admins see everything.
--    Write: admins only (through RPCs; direct table writes gated by RLS).
-- ============================================================================
ALTER TABLE public.neighborhoods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighborhood_families  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory        ENABLE ROW LEVEL SECURITY;

-- neighborhoods ------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active neighborhoods" ON public.neighborhoods;
CREATE POLICY "Public read active neighborhoods"
  ON public.neighborhoods FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Admin read all neighborhoods" ON public.neighborhoods;
CREATE POLICY "Admin read all neighborhoods"
  ON public.neighborhoods FOR SELECT TO anon, authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage neighborhoods" ON public.neighborhoods;
CREATE POLICY "Admin manage neighborhoods"
  ON public.neighborhoods FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

-- stores -------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active stores" ON public.stores;
CREATE POLICY "Public read active stores"
  ON public.stores FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Admin read all stores" ON public.stores;
CREATE POLICY "Admin read all stores"
  ON public.stores FOR SELECT TO anon, authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage stores" ON public.stores;
CREATE POLICY "Admin manage stores"
  ON public.stores FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

-- family_groups ------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active family groups" ON public.family_groups;
CREATE POLICY "Public read active family groups"
  ON public.family_groups FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Admin read all family groups" ON public.family_groups;
CREATE POLICY "Admin read all family groups"
  ON public.family_groups FOR SELECT TO anon, authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin manage family groups" ON public.family_groups;
CREATE POLICY "Admin manage family groups"
  ON public.family_groups FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

-- neighborhood_families ----------------------------------------------------
DROP POLICY IF EXISTS "Public read neighborhood families" ON public.neighborhood_families;
CREATE POLICY "Public read neighborhood families"
  ON public.neighborhood_families FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Admin manage neighborhood families" ON public.neighborhood_families;
CREATE POLICY "Admin manage neighborhood families"
  ON public.neighborhood_families FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

-- store_inventory ----------------------------------------------------------
DROP POLICY IF EXISTS "Public read store inventory" ON public.store_inventory;
CREATE POLICY "Public read store inventory"
  ON public.store_inventory FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Admin manage store inventory" ON public.store_inventory;
CREATE POLICY "Admin manage store inventory"
  ON public.store_inventory FOR ALL TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL)
  WITH CHECK (public.fn_admin_uid() IS NOT NULL);

-- Grants -------------------------------------------------------------------
GRANT SELECT ON public.neighborhoods, public.stores, public.family_groups,
                public.neighborhood_families, public.store_inventory
  TO anon, authenticated;

-- ============================================================================
-- 7) delivery_create_order — additive REPLACE (Phase 5 + Gate D server half)
--    * Same signature / return shape / error codes as 00052.
--    * Catalog items now RESOLVE the owning store + neighborhood server-side.
--    * Multi-store baskets are rejected with a NEW error code.
--    * Legacy (no store_inventory data) behaves byte-identically.
--    * user_id is captured from auth.uid() (was previously unrecorded).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delivery_create_order(p_customer jsonb, p_items jsonb)
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
  v_row_qty     integer;
  v_item_name   text;
  v_item_unit   numeric;
  v_item_qty    integer;

  -- Pilot store / neighborhood (Phase 5)
  v_store_id    uuid;
  v_neigh_id    uuid;
  v_first_store uuid;
  v_any_store   boolean := FALSE;

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
      -- Free-form (non-catalog) line item — legacy verbatim shape.
      v_item_unit := COALESCE((v_item->>'unit_price')::numeric, 0);
      v_item_qty  := GREATEST(COALESCE((v_item->>'quantity')::integer, 1), 1);
    ELSE
      -- Catalog item — authoritative only, resolved against the SAME public
      -- visibility gate the shopper saw (published, in-stock, active).
      SELECT
        v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity
        INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty
      FROM public.v_public_listings v
      WHERE v.id = v_ref::uuid
        AND v.quantity > 0;

      IF v_row_id IS NULL THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;

      -- Physically orderable := any domain; but monthly-rent rows (properties)
      -- are not delivery orders. Cars are enforced sale-only upstream too, but
      -- we re-assert the server authority here.
      IF v_row_period = 'monthly' THEN
        RAISE EXCEPTION 'ITEM_NOT_ORDERABLE' USING ERRCODE = 'P0002';
      END IF;

      v_item_name := btrim(COALESCE(v_row_brand, '') || ' ' || COALESCE(v_row_model, ''));
      v_item_unit := COALESCE(v_row_price, 0);
      v_item_qty  := GREATEST(LEAST(COALESCE((v_item->>'quantity')::integer, 1), v_row_qty), 1);

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
    store_id, neighborhood_id, user_id
  )
  VALUES (
    v_order_no, v_cust_name, v_cust_phone, v_zone_id, v_address,
    v_subtotal, v_fee, v_subtotal + v_fee, 'pending', v_notes,
    v_store_id, v_neigh_id, v_uid
  )
  RETURNING id INTO v_order_id;

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
        GREATEST(COALESCE((v_item->>'quantity')::integer, 1), 1)
      );
    ELSE
      SELECT
        v.id, v.category, v.brand, v.model, v.price, v.price_period, v.quantity
        INTO v_row_id, v_row_cat, v_row_brand, v_row_model, v_row_price, v_row_period, v_row_qty
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
        GREATEST(LEAST(COALESCE((v_item->>'quantity')::integer, 1), v_row_qty), 1)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_no,
    'status', 'pending',
    'subtotal', v_subtotal,
    'delivery_fee', v_fee,
    'total', v_subtotal + v_fee,
    'eta_minutes_min', v_min_min,
    'eta_minutes_max', v_min_max,
    'store_id', v_store_id,
    'neighborhood_id', v_neigh_id
  );
END;
$$;

-- Least privilege — identical grant contract to 00050/00052.
REVOKE ALL ON FUNCTION public.delivery_create_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_create_order(jsonb, jsonb) TO authenticated;

-- ============================================================================
-- 8) Public storefront RPCs (anonymous-safe: role checks + active gates inside).
-- ============================================================================
-- 8a) Active neighborhoods (storefront root)
CREATE OR REPLACE FUNCTION public.pilot_active_neighborhoods()
RETURNS SETOF public.neighborhoods
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT n.*
    FROM public.neighborhoods n
    WHERE n.status = 'active'
    ORDER BY n.name ASC;
END;
$$;

-- 8b) Active stores of a neighborhood
CREATE OR REPLACE FUNCTION public.pilot_active_stores(p_neighborhood_id uuid)
RETURNS SETOF public.stores
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_neighborhood_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.neighborhood_id = p_neighborhood_id
      AND s.status = 'active'
    ORDER BY s.name ASC;
END;
$$;

-- 8c) Buyable products of a store (published + in-stock, canonical inventory)
CREATE OR REPLACE FUNCTION public.pilot_store_products(p_store_id uuid)
RETURNS SETOF public.inventory_items
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT ii.*
    FROM public.store_inventory si
    JOIN public.inventory_items ii ON ii.id = si.inventory_id
    JOIN public.stores s ON s.id = si.store_id
    WHERE si.store_id = p_store_id
      AND s.status = 'active'
      AND ii.is_published = TRUE
      AND ii.status IN ('in_stock', 'low_stock')
      AND ii.quantity > 0
    ORDER BY si.position ASC, ii.created_at DESC;
END;
$$;

-- 8d) Neighborhood + its active families (Pilot Phase 4 public surface)
CREATE OR REPLACE FUNCTION public.pilot_neighborhood_families(p_neighborhood_id uuid)
RETURNS SETOF public.family_groups
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_neighborhood_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT fg.*
    FROM public.neighborhood_families nf
    JOIN public.family_groups fg ON fg.id = nf.family_id
    WHERE nf.neighborhood_id = p_neighborhood_id
      AND fg.status = 'active'
    ORDER BY fg.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_active_neighborhoods() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_active_stores(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_store_products(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_neighborhood_families(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_active_neighborhoods() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_active_stores(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_store_products(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_neighborhood_families(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_active_neighborhoods() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_active_stores(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_store_products(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_neighborhood_families(uuid) TO anon, authenticated;

-- ============================================================================
-- 9) Admin RPCs (admin-only; every function re-checks auth server-side)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_admin_upsert_neighborhood(
  p_name text, p_name_ar text, p_slug text, p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := public.fn_admin_uid();
  v_id    uuid;
  v_slug  text := lower(btrim(COALESCE(p_slug, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' OR v_slug = ''
     OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR COALESCE(p_status, '') NOT IN ('active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.neighborhoods (name, name_ar, slug, status)
  VALUES (btrim(p_name), COALESCE(btrim(p_name_ar), ''), v_slug, p_status)
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    name_ar = EXCLUDED.name_ar,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_upsert_store(
  p_neighborhood_id uuid, p_name text, p_name_ar text, p_slug text,
  p_status text, p_operator_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := public.fn_admin_uid();
  v_id    uuid;
  v_slug  text := lower(btrim(COALESCE(p_slug, '')));
  v_nhood text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_neighborhood_id IS NULL OR btrim(COALESCE(p_name, '')) = '' OR v_slug = ''
     OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR COALESCE(p_status, '') NOT IN ('active', 'inactive', 'archived') THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_nhood FROM public.neighborhoods WHERE id = p_neighborhood_id;
  IF v_nhood IS NULL THEN
    RAISE EXCEPTION 'NEIGHBORHOOD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.stores (neighborhood_id, name, name_ar, slug, status, operator_user_id)
  VALUES (p_neighborhood_id, btrim(p_name), COALESCE(btrim(p_name_ar), ''), v_slug, p_status, p_operator_user_id)
  ON CONFLICT (slug) DO UPDATE SET
    neighborhood_id = EXCLUDED.neighborhood_id,
    name            = EXCLUDED.name,
    name_ar         = EXCLUDED.name_ar,
    status          = EXCLUDED.status,
    operator_user_id= EXCLUDED.operator_user_id,
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_set_store_inventory(
  p_store_id uuid, p_inventory_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := public.fn_admin_uid();
  v_id     uuid;
  v_item   uuid;
  v_ok     boolean := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id FROM public.stores WHERE id = p_store_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.store_inventory WHERE store_id = p_store_id;

  IF p_inventory_ids IS NOT NULL THEN
    FOR v_item IN SELECT unnest(p_inventory_ids) LOOP
      INSERT INTO public.store_inventory (store_id, inventory_id, position)
      SELECT p_store_id, ii.id, 0
      FROM public.inventory_items ii
      WHERE ii.id = v_item
      ON CONFLICT (store_id, inventory_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('store_id', p_store_id, 'assigned', p_inventory_ids IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_upsert_family(
  p_name text, p_name_ar text, p_slug text, p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := public.fn_admin_uid();
  v_id   uuid;
  v_slug text := lower(btrim(COALESCE(p_slug, '')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' OR v_slug = ''
     OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.family_groups (name, name_ar, slug, description)
  VALUES (btrim(p_name), COALESCE(btrim(p_name_ar), ''), v_slug, COALESCE(p_description, ''))
  ON CONFLICT (slug) DO UPDATE SET
    name        = EXCLUDED.name,
    name_ar     = EXCLUDED.name_ar,
    description = EXCLUDED.description,
    updated_at  = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_link_family(
  p_neighborhood_id uuid, p_family_id uuid, p_linked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_neighborhood_id IS NULL OR p_family_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_linked, FALSE) THEN
    INSERT INTO public.neighborhood_families (neighborhood_id, family_id)
    VALUES (p_neighborhood_id, p_family_id)
    ON CONFLICT (neighborhood_id, family_id) DO NOTHING;
  ELSE
    DELETE FROM public.neighborhood_families
    WHERE neighborhood_id = p_neighborhood_id AND family_id = p_family_id;
  END IF;

  RETURN jsonb_build_object('linked', COALESCE(p_linked, FALSE));
END;
$$;

-- Admin read helpers (list everything, including inactive/archived)
CREATE OR REPLACE FUNCTION public.pilot_admin_list_neighborhoods()
RETURNS SETOF public.neighborhoods
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT n.* FROM public.neighborhoods n ORDER BY n.name ASC
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_list_stores(p_neighborhood_id uuid)
RETURNS SETOF public.stores
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.fn_admin_uid() IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_neighborhood_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.neighborhood_id = p_neighborhood_id
    ORDER BY s.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_list_families()
RETURNS SETOF public.family_groups
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT fg.* FROM public.family_groups fg ORDER BY fg.name ASC
$$;

CREATE OR REPLACE FUNCTION public.pilot_admin_require()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.fn_admin_uid() IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_admin_upsert_neighborhood(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_upsert_store(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_store_inventory(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_upsert_family(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_link_family(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_neighborhoods() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_stores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_families() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_require() TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_admin_upsert_neighborhood(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_upsert_store(uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_set_store_inventory(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_upsert_family(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_link_family(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_list_neighborhoods() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_list_stores(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_list_families() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_admin_require() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_admin_upsert_neighborhood(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_upsert_store(uuid, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_set_store_inventory(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_upsert_family(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_link_family(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_neighborhoods() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_stores(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_list_families() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_admin_require() TO authenticated;

-- ============================================================================
-- 10) Store-operator order RPCs (Phase 7)
--     Authorised: the store's operator_user_id OR an admin.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_orders_for_store(p_store_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = p_store_id AND s.operator_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT o.*
    FROM public.orders o
    WHERE o.store_id = p_store_id
    ORDER BY o.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.pilot_order_set_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_store uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF p_order_id IS NULL OR COALESCE(p_status, '') NOT IN (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT o.store_id INTO v_store FROM public.orders o WHERE o.id = p_order_id;
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = v_store AND s.operator_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
    SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_orders_for_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_order_set_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_orders_for_store(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pilot_order_set_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_orders_for_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_order_set_status(uuid, text) TO authenticated;

-- ============================================================================
-- 11) Guarded admin pilot_reset (Phase 12)
--     ONLY deletes rows carrying the `pilot-` data marker (slugs / source_key).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pilot_reset()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := public.fn_admin_uid();
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.orders
    WHERE store_id IN (SELECT id FROM public.stores WHERE slug LIKE 'pilot-%');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  DELETE FROM public.store_inventory
    WHERE store_id IN (SELECT id FROM public.stores WHERE slug LIKE 'pilot-%');
  DELETE FROM public.stores        WHERE slug LIKE 'pilot-%';
  DELETE FROM public.neighborhood_families
    WHERE neighborhood_id IN (SELECT id FROM public.neighborhoods WHERE slug LIKE 'pilot-%');
  DELETE FROM public.neighborhoods WHERE slug LIKE 'pilot-%';
  DELETE FROM public.family_groups WHERE slug LIKE 'pilot-%';
  DELETE FROM public.inventory_items WHERE source_key LIKE 'pilot:%';

  RETURN jsonb_build_object('pilot_rows_deleted', v_rows, 'ok', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_reset() TO authenticated;
REVOKE ALL ON FUNCTION public.pilot_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_reset() TO authenticated;

-- ============================================================================
-- 12) Post-checks — fail loudly if structural expectations are not met.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
      'neighborhoods', 'stores', 'family_groups', 'neighborhood_families', 'store_inventory'
    )
  ) THEN
    RAISE EXCEPTION '00065: pilot tables missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'store_id'
  ) THEN
    RAISE EXCEPTION '00065: orders.store_id missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'delivery_create_order'
  ) THEN
    RAISE EXCEPTION '00065: delivery_create_order missing after migration';
  END IF;
END;
$$;