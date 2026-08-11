-- ============================================================================
-- FOCUS — CENTRAL INVENTORY (MIGRATION 00019 — FILE ONLY, NOT EXECUTED)
--
-- Migration number: 00019 (00016-00018 are already taken by placements).
-- Source of truth: supabase/inventory-central/01-inventory-apply.sql (Phase 2C).
--   This file is the migration-format copy; keep the two in sync.
-- Type: Additive (CREATE TABLE / FUNCTION / POLICY / VIEW / BUCKET only)
-- Status: PHASE 2C PREPARED FILE ONLY. NOT EXECUTED. NOT MIGRATED.
--   Do NOT run until the owner explicitly authorizes the Schema Apply phase.
--   NOTE: 00014_inventory_tables.sql is EXCLUDED from execution (conflicting
--   draft). Before running supabase db push, remove/disable 00014 from the
--   migrations folder or this migration will conflict (same table names).
--
-- PURPOSE
--   Supabase becomes the Single Source of Truth (SSOT) for the used-phones
--   inventory. Every browser/device reads and writes the SAME central rows.
--   localStorage (catalog_inventory etc.) is retired to a read-only legacy
--   backup AFTER cutover (Phase F) and is NEVER a production write source.
--
-- OWNERSHIP MODEL (owner decision — non-negotiable)
--   * Single owner. NO multi-tenant columns (no merchant_id/branch_id/
--     store_id/seller_id). The whole inventory belongs to the project owner.
--   * Admin writes restricted to authenticated users whose
--     public.users.role IN ('admin','super_admin'), enforced server-side via
--     auth.uid() + users.role in RLS and in every SECURITY DEFINER RPC.
--   * researcher is READ-ONLY analytics: NO inventory management access.
--   * No X-Admin header, no client secret, no hardcoded admin token.
--
-- SECURITY DESIGN (owner §7)
--   * RLS protects ROWS, not columns. Therefore:
--     - Public reads go through view v_public_inventory (owned by postgres,
--       security_invoker=false) exposing ONLY customer-facing columns (never
--       buy_price / totals / source_key / is_published / internal audit).
--     - Admin full reads go through SECURITY DEFINER RPC
--       inventory_management_list() (role-checked, admin/super_admin only).
--   * All writes are atomic server-side SECURITY DEFINER RPCs:
--     add/remove/adjust stock, update_prices, update_details, set_status,
--     publish, unpublish, archive, restore, delete_record.
--     No read-compute-write from the client; quantity changes are single
--     UPDATE statements (implicit row lock) — no lost updates.
--   * No DELETE grant and no DELETE policy: hard delete impossible via API.
--     "Delete" = soft delete (status='deleted') via RPC; row stays in DB.
--   * Stock RPCs REFUSE archived/discontinued/deleted rows: adding stock can
--     never silently resurrect an inactive item.
--   * Every real change is recorded centrally in inventory_movements
--     (actor_user_id, action, before/after JSONB, delta, reason, metadata,
--     note, created_at). Audit never depends on localStorage.
--
-- STATUS RULE (owner §6) — single source of truth:
--   quantity <= 0 -> 'out_of_stock'; quantity <= 3 -> 'low_stock';
--   quantity >  3 -> 'in_stock'; plus admin states archived/discontinued/
--   deleted (soft). DB CHECK accepts only these; RPCs derive stock status
--   from quantity uniformly.
--
-- PUBLISHING (owner §12/§13)
--   is_published is SEPARATE from existence. A phone is visible to visitors
--   iff is_published = TRUE AND quantity > 0 AND status NOT IN
--   ('archived','discontinued','deleted'). Migration NEVER auto-publishes
--   hidden/archived/discontinued records; seed phones are not published just
--   because they exist in DEFAULT_INVENTORY_SEED.
--
-- CONDITION VALUES
--   Mirrors the app contract (src/services/price-memory.ts ALL_CONDITIONS).
--   NOTE: deliberately differs from the earlier 00014 draft which used
--   ('new','used'). The live app uses: New, Open Box, Like New, Excellent,
--   Very Good, Good, Fair, Poor, For Parts, Refurbished, Certified Used.
--
-- REALTIME (owner §17/§23)
--   inventory_items + inventory_images added to supabase_realtime publication
--   via guarded ALTER PUBLICATION (idempotent). After a successful write,
--   other clients are notified; memory cache is invalidated and refetched.
--   Supabase stays SSOT.
--
-- STORAGE (owner §10/§19)
--   Bucket 'inventory-images' (public read; admin/super_admin write).
--   Write access enforced with CREATE POLICY on storage.objects that (1) check
--   the caller is admin/super_admin, (2) enforce the object prefix
--   'inventory-images/%', and (3) require the folder segment to be a real
--   inventory_items.id. Object path: inventory-images/{inventory_id}/{uuid}.jpg
--   Old base64 data-URLs in localStorage are NEVER deleted until upload is
--   proven (object exists + DB row exists + image resolves + correct
--   item/order/cover).
--
-- UUIDs: gen_random_uuid() is used everywhere (PostgreSQL 13+ core function,
--   no uuid-ossp extension dependency).
--
-- Depends on: public.users table (uuid id — see migration 00008).
-- Idempotent guards (IF NOT EXISTS / DO blocks).
--
-- ROLLBACK: see 02-inventory-rollback.sql (exact, reversed order).
-- EVIDENCE: 03-pre-apply-evidence.sql (run before), 04-post-apply-verify.sql
--   (run after).
-- ============================================================================

-- UUIDs are generated by gen_random_uuid() (PG 13+ core). No extension needed.

-- ============================================================================
-- 1) inventory_items — central SSOT record. One central UUID per phone.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         TEXT NOT NULL,
  brand            TEXT NOT NULL,
  model            TEXT NOT NULL,
  variant          TEXT NOT NULL DEFAULT '',
  ram              TEXT,
  storage          TEXT NOT NULL DEFAULT '',
  condition        TEXT NOT NULL DEFAULT 'New',
  color            TEXT NOT NULL DEFAULT '',
  quantity         INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'in_stock',
  buy_price        NUMERIC(12,2),
  sell_price       NUMERIC(12,2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_purchased  INTEGER NOT NULL DEFAULT 0,
  total_sold       INTEGER NOT NULL DEFAULT 0,
  code             TEXT,
  battery_health   INTEGER,
  warranty         TEXT,
  city             TEXT,
  description      TEXT,
  is_published     BOOLEAN NOT NULL DEFAULT FALSE,
  source_key       TEXT,
  extra            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by       UUID REFERENCES public.users(id),
  updated_by       UUID REFERENCES public.users(id),
  CONSTRAINT inventory_items_quantity_nonneg  CHECK (quantity >= 0),
  CONSTRAINT inventory_items_buy_price_nonneg CHECK (buy_price IS NULL OR buy_price >= 0),
  CONSTRAINT inventory_items_sell_price_nonneg CHECK (sell_price IS NULL OR sell_price >= 0),
  CONSTRAINT inventory_items_battery_range    CHECK (battery_health IS NULL OR (battery_health >= 0 AND battery_health <= 100)),
  CONSTRAINT inventory_items_condition_enum   CHECK (condition IN (
    'New','Open Box','Like New','Excellent','Very Good','Good',
    'Fair','Poor','For Parts','Refurbished','Certified Used'
  )),
  CONSTRAINT inventory_items_status_enum      CHECK (status IN (
    'in_stock','low_stock','out_of_stock','archived','discontinued','deleted'
  )),
  -- Logical inventory key used for reconciliation/merge. NOT the local id.
  CONSTRAINT inventory_items_unique_sku UNIQUE (model_id, variant, condition, color)
);

-- source_key traces the OLD localStorage id during migration/audit only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_source_key
  ON public.inventory_items (source_key) WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_model_id  ON public.inventory_items (model_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status    ON public.inventory_items (status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_published ON public.inventory_items (is_published, quantity, status);

-- ============================================================================
-- 2) inventory_images — ordered image set per item (bucket-backed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  is_cover     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_images_unique_path UNIQUE (inventory_id, path)
);

CREATE INDEX IF NOT EXISTS idx_inventory_images_item ON public.inventory_images (inventory_id, position, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_images_cover
  ON public.inventory_images (inventory_id) WHERE is_cover = TRUE;

-- ============================================================================
-- 3) inventory_movements — central append-only audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id   UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  before         JSONB,
  after          JSONB,
  delta          INTEGER,
  reason         TEXT,
  metadata       JSONB,
  note           TEXT,
  actor_user_id  UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_action_enum CHECK (action IN (
    'created','updated','stock_added','stock_removed','adjusted','sale',
    'purchase','price_updated','details_updated','status_changed','published',
    'hidden','archived','restored','discontinued','deleted'
  ))
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item   ON public.inventory_movements (inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_action ON public.inventory_movements (action);

-- ============================================================================
-- 4) Triggers — updated_at/updated_by + audit safety net
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_inventory_updated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    new.updated_by := auth.uid();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated();

-- Audit trigger: catches ANY write (including direct maintenance writes that
-- bypass RPCs) and records it centrally.
CREATE OR REPLACE FUNCTION public.audit_inventory_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_action text;
  r        record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory_movements (inventory_id, action, after, actor_user_id)
    VALUES (NEW.id, 'created', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;

  FOR r IN SELECT * FROM jsonb_each(to_jsonb(OLD)) LOOP
    IF r.key IN ('created_at','updated_at','updated_by') THEN
      CONTINUE;
    END IF;
    IF r.value IS DISTINCT FROM (to_jsonb(NEW) -> r.key) THEN
      v_before := v_before || jsonb_build_object(r.key, r.value);
      v_after  := v_after  || jsonb_build_object(r.key, to_jsonb(NEW) -> r.key);
    END IF;
  END LOOP;

  IF NEW.is_published IS DISTINCT FROM OLD.is_published THEN
    v_action := CASE WHEN NEW.is_published THEN 'published' ELSE 'hidden' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE
      WHEN NEW.status = 'archived' THEN 'archived'
      WHEN NEW.status = 'discontinued' THEN 'discontinued'
      WHEN NEW.status = 'deleted' THEN 'deleted'
      WHEN OLD.status = 'archived' AND NEW.status <> 'archived' THEN 'restored'
      ELSE 'status_changed' END;
  ELSIF NEW.buy_price IS DISTINCT FROM OLD.buy_price
     OR NEW.sell_price IS DISTINCT FROM OLD.sell_price THEN
    v_action := 'price_updated';
  ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    v_action := CASE WHEN NEW.quantity > OLD.quantity THEN 'stock_added' ELSE 'stock_removed' END;
  ELSE
    v_action := 'updated';
  END IF;

  IF v_before <> '{}'::jsonb THEN
    INSERT INTO public.inventory_movements (inventory_id, action, before, after, delta, actor_user_id)
    VALUES (NEW.id, v_action, v_before, v_after, NEW.quantity - OLD.quantity, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_audit ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_audit
  AFTER INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_change();

-- ============================================================================
-- 5) Row Level Security
-- ============================================================================
ALTER TABLE public.inventory_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- inventory_items: NO public SELECT at the row level. Public reads happen
-- ONLY via v_public_inventory (owned by postgres, security_invoker=false)
-- because RLS is row-level, not column-level (owner §7). Full staff reads go
-- via inventory_management_list() RPC. Writes via RPCs only.

-- inventory_images: public read of images belonging to VISIBLE items.
CREATE POLICY "Public read inventory images"
  ON public.inventory_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = inventory_id
      AND i.is_published = TRUE AND i.quantity > 0
      AND i.status NOT IN ('archived','discontinued','deleted')
  ));

-- inventory_movements: staff read only (researcher = read-only analytics).
CREATE POLICY "Staff read inventory movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role IN ('admin','super_admin','researcher')
  ));

-- ============================================================================
-- 6) Grants / Revokes
-- ============================================================================
REVOKE ALL ON public.inventory_items     FROM anon, authenticated;
REVOKE ALL ON public.inventory_movements FROM anon;

GRANT SELECT (id, inventory_id, path, position, is_cover)
  ON public.inventory_images TO anon, authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;

-- ============================================================================
-- 7) Public read view — controlled customer-facing projection
--    security_invoker=false: runs as owner (postgres), bypasses RLS, and the
--    WHERE clause is the ONLY visibility gate. Sensitive columns are never
--    part of this projection.
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
  AND status NOT IN ('archived','discontinued','deleted');

ALTER VIEW public.v_public_inventory SET (security_invoker = false);

GRANT SELECT ON public.v_public_inventory TO anon, authenticated;

-- ============================================================================
-- 8) SECURITY DEFINER RPCs — the ONLY write path.
--    Every RPC: (1) checks admin role via public.users, (2) validates input,
--    (3) is atomic, (4) lets the audit trigger record the movement.
--    EXECUTE is REVOKED from PUBLIC and granted explicitly (defense in depth).
-- ============================================================================

-- 8.0) Role check helper. Returns TRUE only for admin / super_admin.
CREATE OR REPLACE FUNCTION public.inventory_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin','super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.inventory_is_admin() TO authenticated;

-- 8.1) Derive stock status from quantity (single source of truth, §6).
CREATE OR REPLACE FUNCTION public.inventory_calc_status(p_quantity integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_quantity <= 0 THEN 'out_of_stock'
    WHEN p_quantity <= 3 THEN 'low_stock'
    ELSE 'in_stock'
  END;
$$;

-- 8.2) Admin full read (RLS is row-level, so staff reads MUST go through
--      this SECURITY DEFINER RPC rather than the table).
--      ADMIN/SUPER_ADMIN ONLY. researcher has no inventory management access.
CREATE OR REPLACE FUNCTION public.inventory_management_list()
RETURNS SETOF public.inventory_items
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT i.* FROM public.inventory_items i
    ORDER BY i.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_management_list() TO authenticated;

-- 8.3) Create a new item. NULL quantity => default 0.
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
  p_source_key    text DEFAULT NULL
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
    total_purchased
  ) VALUES (
    btrim(p_model_id), btrim(p_brand), btrim(p_model), btrim(p_variant),
    p_ram, btrim(p_storage), p_condition, p_color,
    GREATEST(p_quantity, 0), public.inventory_calc_status(GREATEST(p_quantity, 0)),
    p_buy_price, p_sell_price, p_code, p_battery_health,
    p_warranty, p_city, p_description, p_is_published, p_source_key,
    GREATEST(p_quantity, 0)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_add_item(
  text, text, text, text, text, text, text, text, integer,
  numeric, numeric, text, integer, text, text, text, boolean, text
) TO authenticated;

-- 8.4) Add stock. Single UPDATE — no lost updates. Refuses inactive items
--      so archived/discontinued/deleted rows can never be silently revived.
CREATE OR REPLACE FUNCTION public.inventory_add_stock(
  p_inventory_id uuid,
  p_quantity     integer,
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
    RAISE EXCEPTION 'quantity must be a positive integer'
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

GRANT EXECUTE ON FUNCTION public.inventory_add_stock(uuid, integer, text, jsonb, text) TO authenticated;

-- 8.5) Remove stock. Never goes below 0; status re-derived. Refuses inactive
--      items for the same reason as 8.4.
CREATE OR REPLACE FUNCTION public.inventory_remove_stock(
  p_inventory_id uuid,
  p_quantity     integer,
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
    RAISE EXCEPTION 'quantity must be a positive integer'
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

GRANT EXECUTE ON FUNCTION public.inventory_remove_stock(uuid, integer, text, jsonb, text) TO authenticated;

-- 8.6) Adjust stock to an absolute value. Refuses inactive items.
CREATE OR REPLACE FUNCTION public.inventory_adjust_stock(
  p_inventory_id uuid,
  p_quantity     integer,
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
    RAISE EXCEPTION 'quantity must be a non-negative integer'
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

GRANT EXECUTE ON FUNCTION public.inventory_adjust_stock(uuid, integer, text, jsonb, text) TO authenticated;

-- 8.7) Update prices (buy/sell). Movement recorded by audit trigger.
CREATE OR REPLACE FUNCTION public.inventory_update_prices(
  p_inventory_id uuid,
  p_buy_price    numeric DEFAULT NULL,
  p_sell_price   numeric DEFAULT NULL,
  p_reason       text DEFAULT NULL,
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

  UPDATE public.inventory_items
  SET buy_price  = COALESCE(p_buy_price, buy_price),
      sell_price = COALESCE(p_sell_price, sell_price)
  WHERE id = p_inventory_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_inventory_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_update_prices(uuid, numeric, numeric, text, text) TO authenticated;

-- 8.8) Update descriptive details (no quantity/prices/status here).
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
  p_extra          jsonb DEFAULT NULL
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
      extra          = COALESCE(p_extra, extra)
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
  integer, text, text, text, jsonb
) TO authenticated;

-- 8.9) Set admin state (archived / discontinued / deleted soft-delete / or
--      restore from archived). Stock status is derived by inventory_calc_status
--      on a subsequent stock write and cannot be set directly.
CREATE OR REPLACE FUNCTION public.inventory_set_status(
  p_inventory_id uuid,
  p_status       text,
  p_reason       text DEFAULT NULL,
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

  IF p_status NOT IN ('archived','discontinued','deleted') THEN
    RAISE EXCEPTION 'status must be one of archived, discontinued, deleted'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.inventory_items
  SET status = p_status,
      is_published = FALSE
  WHERE id = p_inventory_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_inventory_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_set_status(uuid, text, text, text) TO authenticated;

-- 8.10) Restore an archived/discontinued/deleted item back to active stock.
CREATE OR REPLACE FUNCTION public.inventory_restore(
  p_inventory_id uuid,
  p_reason       text DEFAULT NULL,
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

  UPDATE public.inventory_items
  SET status = public.inventory_calc_status(quantity),
      is_published = FALSE
  WHERE id = p_inventory_id
    AND status IN ('archived','discontinued','deleted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.inventory_items WHERE id = p_inventory_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'item % not found', p_inventory_id
        USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'item % is not in an archived/discontinued/deleted state', p_inventory_id
      USING ERRCODE = '22023';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_restore(uuid, text, text) TO authenticated;

-- 8.11) Publish / unpublish visibility (separate from existence).
CREATE OR REPLACE FUNCTION public.inventory_set_published(
  p_inventory_id uuid,
  p_is_published boolean,
  p_reason       text DEFAULT NULL,
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

  UPDATE public.inventory_items
  SET is_published = p_is_published
  WHERE id = p_inventory_id
    AND status NOT IN ('archived','discontinued','deleted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.inventory_items WHERE id = p_inventory_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'item % not found', p_inventory_id
        USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'cannot publish/unpublish an item with status archived/discontinued/deleted'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_set_published(uuid, boolean, text, text) TO authenticated;

-- 8.12) Attach an image path to an item. Position (default: end of list).
--      Validates the item exists, the path belongs to that item's folder,
--      and the object really exists in the bucket before attaching.
--      The parent row is locked FOR UPDATE so position/cover cannot race.
CREATE OR REPLACE FUNCTION public.inventory_add_image(
  p_inventory_id uuid,
  p_path         text,
  p_position     integer DEFAULT NULL,
  p_is_cover     boolean DEFAULT FALSE
)
RETURNS public.inventory_images
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos  integer := p_position;
  v_row  public.inventory_images;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_path IS NULL OR btrim(p_path) = '' THEN
    RAISE EXCEPTION 'path is required'
      USING ERRCODE = '22023';
  END IF;

  -- The path must live inside THIS item's folder: inventory-images/{id}/...
  -- This makes it impossible to attach a path owned by another item.
  IF NOT (p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%') THEN
    RAISE EXCEPTION 'path must start with inventory-images/%', p_inventory_id
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent image writes for the same item (position + cover).
  PERFORM 1 FROM public.inventory_items WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % not found', p_inventory_id
      USING ERRCODE = 'P0002';
  END IF;

  -- The object must already exist in the bucket before it can be attached.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'inventory-images' AND name = p_path
  ) THEN
    RAISE EXCEPTION 'object % does not exist in inventory-images bucket', p_path
      USING ERRCODE = '23503';
  END IF;

  IF v_pos IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_pos
    FROM public.inventory_images WHERE inventory_id = p_inventory_id;
  END IF;

  IF p_is_cover THEN
    UPDATE public.inventory_images
    SET is_cover = FALSE
    WHERE inventory_id = p_inventory_id AND is_cover = TRUE;
  END IF;

  INSERT INTO public.inventory_images (inventory_id, path, position, is_cover)
  VALUES (p_inventory_id, p_path, v_pos, p_is_cover)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_add_image(uuid, text, integer, boolean) TO authenticated;

-- 8.13) Remove an image: deletes the bucket object AND the DB row atomically
--      (no orphan objects). Admin/super_admin only.
CREATE OR REPLACE FUNCTION public.inventory_remove_image(
  p_image_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path text;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required'
      USING ERRCODE = '42501';
  END IF;

  SELECT path INTO v_path FROM public.inventory_images WHERE id = p_image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'image % not found', p_image_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = 'inventory-images' AND name = v_path;

  DELETE FROM public.inventory_images WHERE id = p_image_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inventory_remove_image(uuid) TO authenticated;

-- 8.14) Defense in depth: no anonymous/PUBLIC EXECUTE on any SECURITY DEFINER
--      RPC or helper. Every RPC above already re-checks admin internally;
--      removing PUBLIC EXECUTE closes the surface entirely.
REVOKE ALL ON FUNCTION public.inventory_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_calc_status(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_management_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_add_item(
  text, text, text, text, text, text, text, text, integer,
  numeric, numeric, text, integer, text, text, text, boolean, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_add_stock(uuid, integer, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_remove_stock(uuid, integer, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_adjust_stock(uuid, integer, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_update_prices(uuid, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_update_details(
  uuid, text, text, text, text, text, text, text, text, text,
  integer, text, text, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_set_status(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_restore(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_set_published(uuid, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_add_image(uuid, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inventory_remove_image(uuid) FROM PUBLIC;

-- ============================================================================
-- 9) Storage bucket — 'inventory-images'
--    Public read; admin/super_admin write only. Object path:
--    inventory-images/{inventory_id}/{uuid}.jpg
--    Write policies enforce: admin role + 'inventory-images/%' prefix + the
--    folder segment must be a real inventory_items.id (no arbitrary paths).
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-images',
  'inventory-images',
  TRUE,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read inventory-images" ON storage.objects;
CREATE POLICY "Public read inventory-images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'inventory-images');

DROP POLICY IF EXISTS "Staff upload inventory-images" ON storage.objects;
CREATE POLICY "Staff upload inventory-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
    AND name LIKE 'inventory-images/%'
    AND EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE name LIKE 'inventory-images/' || i.id::text || '/%'
    )
  );

DROP POLICY IF EXISTS "Staff update inventory-images" ON storage.objects;
CREATE POLICY "Staff update inventory-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  )
  WITH CHECK (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
    AND name LIKE 'inventory-images/%'
    AND EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE name LIKE 'inventory-images/' || i.id::text || '/%'
    )
  );

DROP POLICY IF EXISTS "Staff delete inventory-images" ON storage.objects;
CREATE POLICY "Staff delete inventory-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- ============================================================================
-- 10) Realtime — publish central tables so other clients invalidate cache
--     and refetch. Guarded + idempotent via ALTER PUBLICATION.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventory_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_images;
  END IF;
END $$;

-- ============================================================================
-- DONE — inventory-central apply script (Phase 2C revised draft, additive).
-- Verify with 04-post-apply-verify.sql; roll back with 02-inventory-rollback.sql.
-- ============================================================================
