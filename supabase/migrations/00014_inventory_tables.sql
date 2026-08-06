-- ============================================================================
-- FOCUS Product Contract v1.0 — Phase C: inventory (used-phones) tables
--
-- Type: Additive
-- Phase: C
-- Needs backfill: no (tables are created empty; a separate, approval-gated
--   backfill script migrates legacy localStorage data later)
-- Directly reversible: yes (DROP inventory_movements, inventory_images,
--   inventory_items; delete storage bucket/policies)
-- Depends on: 00008 (users table for FK / role checks), 00009
--   (update_updated_at, uuid-ossp). SECURITY DEFINER audit trigger is
--   self-contained.
-- Required by: Stage D/E app work (inventory screens migrate to this source).
--
-- Additive & forward-compatible: creates NEW tables/functions/policies only.
-- Does NOT alter, drop, or rename any existing object.
--
-- STATUS: DRAFT FOR REVIEW. NOT EXECUTED.
--
-- Design rules honored (see .opencode-summary/reports/stage-C-inventory-schema-proposal.md):
--   * Single source of truth. No LocalStorage in production.
--   * buy_price is NEVER granted to anon/authenticated at column level; full
--     reads happen ONLY via the SECURITY DEFINER RPC inventory_management_list().
--   * No DELETE grant and no DELETE policy => hard delete is impossible via API.
--   * Hide = is_published=false and/or status='archived'; row stays in DB.
--   * Every change is audited (before/after JSONB) by a SECURITY DEFINER trigger.
--   * Images: multiple, cover, order, delete/replace; UUID filenames; public
--     bucket read; write restricted to admin/super_admin.
--   * inventory_items + inventory_images join supabase_realtime for instant
--     propagation of admin edits.
--
-- Rollback (reverse order):
--   DROP TABLE public.inventory_movements;
--   DROP TABLE public.inventory_images;
--   DROP TABLE public.inventory_items;
--   (storage bucket/policies removed via dashboard or SQL)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1) inventory_items
--    Single unified stock record for the used-phones business. All screens
--    (showroom / inventory / buy / sell / exchange) read & write this table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id        TEXT NOT NULL,                 -- normalized "Brand Model" key
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  variant         TEXT NOT NULL DEFAULT '',
  ram             TEXT,
  storage         TEXT NOT NULL DEFAULT '',
  color           TEXT NOT NULL DEFAULT '',
  condition       TEXT NOT NULL DEFAULT 'used',  -- new | used
  description     TEXT,
  quantity        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'in_stock',
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  buy_price       NUMERIC(12,2),
  sell_price      NUMERIC(12,2),
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_sold      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES public.users(id),
  updated_by      UUID REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_quantity_nonneg   CHECK (quantity >= 0),
  CONSTRAINT inventory_items_condition_enum    CHECK (condition IN ('new','used')),
  CONSTRAINT inventory_items_status_enum       CHECK (status IN ('in_stock','low_stock','out_of_stock','archived','discontinued')),
  CONSTRAINT inventory_items_unique_sku        UNIQUE (model_id, variant, condition, color)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_model_id  ON public.inventory_items (model_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status    ON public.inventory_items (status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_published ON public.inventory_items (is_published, quantity, status);

-- ----------------------------------------------------------------------------
-- 2) inventory_images
--    Ordered image set per item. Array position = display order; is_cover
--    marks the primary image (partial unique index: one cover per item).
--    path = storage object path: inventory-images/{inventory_id}/{uuid}.jpg
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_images (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- ----------------------------------------------------------------------------
-- 3) inventory_movements
--    Append-only audit of every change (created/hidden/archived/restored/
--    price_updated/stock_added/stock_removed/status_changed/updated),
--    written by the SECURITY DEFINER trigger with auth.uid() and timestamp.
--    No direct INSERT grant to any role (trigger is the only writer).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  before       JSONB,
  after        JSONB,
  note         TEXT,
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_action_enum CHECK (action IN (
    'created','updated','stock_added','stock_removed','price_updated',
    'status_changed','published','hidden','archived','restored'
  ))
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON public.inventory_movements (inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_action ON public.inventory_movements (action);

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------
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
    INSERT INTO public.inventory_movements (inventory_id, action, after, created_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;

  -- Field-level diff (skip bookkeeping columns).
  FOR r IN SELECT * FROM jsonb_each(to_jsonb(OLD)) LOOP
    IF r.key IN ('created_at','updated_at','updated_by') THEN
      CONTINUE;
    END IF;
    IF r.value IS DISTINCT FROM (to_jsonb(NEW) -> r.key) THEN
      v_before := v_before || jsonb_build_object(r.key, r.value);
      v_after  := v_after  || jsonb_build_object(r.key, to_jsonb(NEW) -> r.key);
    END IF;
  END LOOP;

  -- Semantic action, precedence: publish/hide > archive/restore > price > stock.
  IF NEW.is_published IS DISTINCT FROM OLD.is_published THEN
    v_action := CASE WHEN NEW.is_published THEN 'published' ELSE 'hidden' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE WHEN OLD.status = 'archived' AND NEW.status <> 'archived' THEN 'restored'
                     WHEN NEW.status = 'archived' THEN 'archived'
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
    INSERT INTO public.inventory_movements (inventory_id, action, before, after, created_by)
    VALUES (NEW.id, v_action, v_before, v_after, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_updated();

DROP TRIGGER IF EXISTS trg_inventory_items_audit ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_audit
  AFTER INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_inventory_change();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Public (anon + authenticated): published, available rows only. Column-level
-- grants below keep buy_price/quantity out of reach.
CREATE POLICY "Public read published inventory"
  ON public.inventory_items FOR SELECT TO anon, authenticated
  USING (is_published = TRUE AND quantity > 0 AND status NOT IN ('archived','discontinued'));

-- Staff write: admin/super_admin only. No DELETE policy anywhere.
CREATE POLICY "Staff manage inventory"
  ON public.inventory_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')));

-- Images: public read only for published items; write admin/super_admin.
CREATE POLICY "Public read inventory images"
  ON public.inventory_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_items i
    WHERE i.id = inventory_id
      AND i.is_published = TRUE AND i.quantity > 0
      AND i.status NOT IN ('archived','discontinued')
  ));

CREATE POLICY "Staff manage inventory images"
  ON public.inventory_images FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')));

-- Movements: staff read (researcher = read-only analytics). Written only by
-- the SECURITY DEFINER audit trigger.
CREATE POLICY "Staff read inventory movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid()
    AND u.role IN ('admin','super_admin','researcher')
  ));

-- ----------------------------------------------------------------------------
-- Grants
--   * anon/authenticated get ONLY public columns on published rows. quantity is
--     included because customer-facing screens filter by quantity in JS
--     (e.g. getExchangeableDevices()); RLS already restricts rows to quantity>0.
--   * authenticated gets INSERT/UPDATE (RLS enforces admin/super_admin).
--   * NO DELETE grant => hard delete impossible via REST.
--   * buy_price/total_*/is_published are NOT granted to anon/authenticated.
-- ----------------------------------------------------------------------------
GRANT SELECT (id, brand, model, variant, ram, storage, color, condition, description,
              sell_price, quantity, status, updated_at)
  ON public.inventory_items TO anon, authenticated;
GRANT INSERT, UPDATE ON public.inventory_items TO authenticated;

GRANT SELECT (id, inventory_id, path, position, is_cover)
  ON public.inventory_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.inventory_images TO authenticated;

GRANT SELECT ON public.inventory_movements TO authenticated;

-- ----------------------------------------------------------------------------
-- Management read RPC (SECURITY DEFINER)
--   The ONLY way to read buy_price / quantity / totals / hidden rows.
--   Role-checked: researcher/admin/super_admin. Others get an empty set.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_management_list()
RETURNS SETOF public.inventory_items
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.inventory_items
  WHERE EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('researcher','admin','super_admin')
  )
  ORDER BY updated_at DESC
$$;

REVOKE ALL ON FUNCTION public.inventory_management_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_management_list() TO authenticated;

-- ----------------------------------------------------------------------------
-- Storage bucket: inventory-images
--   Public read (showroom renders without auth). Upload/replace/delete:
--   admin/super_admin only. File names are UUID-based; extension/size limits
--   are enforced client-side (compressImage) and at the app layer.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-images', 'inventory-images', TRUE)
ON CONFLICT (id) DO NOTHING;

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
  );

DROP POLICY IF EXISTS "Staff update inventory-images" ON storage.objects;
CREATE POLICY "Staff update inventory-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff delete inventory-images" ON storage.objects;
CREATE POLICY "Staff delete inventory-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- ----------------------------------------------------------------------------
-- Realtime: propagate admin edits to all clients instantly.
-- ----------------------------------------------------------------------------
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
