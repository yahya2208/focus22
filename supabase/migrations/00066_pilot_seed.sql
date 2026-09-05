-- ============================================================================
-- 00066  NeighborhoodPilot — deterministic seed (Phase 1/2/4 + Phase 3 catalog)
-- ----------------------------------------------------------------------------
-- Type: Data (idempotent; guarded by `pilot-` markers; admin-resettable via
--        `pilot_reset()` from 00065).
--
-- Seeds for the Neighborhood Pilot Epic:
--   * 1 neighborhood  (slug: pilot-neighborhood-1)
--   * 1 store         (slug: pilot-store-1) — operator NULL (admins only)
--   * 5 family groups (slugs: pilot-family-1..5) — the five personas
--   * a small orderable catalog (source_key `pilot:` x5) linked to the store
--     AND to the first ACTIVE category, when one exists (canonical mapping).
--
-- Scale contract (Phase 14): a second neighborhood/store/family must be added
-- with a plain INSERT using a new `pilot-` slug — no schema or RPC change.
--
-- No fake data is fabricated: seeded items carry zero stock movement and are
-- the same shape as admin-created inventory (prices/stock set by the seed
-- author, publish flags TRUE). Product imagery is added later through the real
-- Admin inventory UI (storage is not fakeable from SQL) — see FINAL REPORT.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Prerequisite: the ON CONFLICT (model_id, variant, condition, color)
--    targets rely on a UNIQUE index on those exact columns. Migration 00035
--    dropped inventory_items_unique_sku, so the seed re-establishes the same
--    logical key idempotently before inserting.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_sku
  ON public.inventory_items (model_id, variant, condition, color);

-- ---------------------------------------------------------------------------
-- 1) Neighborhood
-- ---------------------------------------------------------------------------
INSERT INTO public.neighborhoods (name, name_ar, slug, status, description)
SELECT 'Pilot Neighborhood', 'الحي التجريبي', 'pilot-neighborhood-1', 'active',
       'Neighborhood Pilot integration environment'
WHERE NOT EXISTS (SELECT 1 FROM public.neighborhoods WHERE slug = 'pilot-neighborhood-1');

-- ---------------------------------------------------------------------------
-- 2) Store
-- ---------------------------------------------------------------------------
INSERT INTO public.stores (neighborhood_id, name, name_ar, slug, status, description, contact_phone)
SELECT n.id, 'Pilot Store', 'المتجر التجريبي', 'pilot-store-1', 'active',
       'Canonical FOCUS marketplace store (orderable via delivery_create_order)', ''
FROM public.neighborhoods n
WHERE n.slug = 'pilot-neighborhood-1'
  AND NOT EXISTS (SELECT 1 FROM public.stores WHERE slug = 'pilot-store-1');

-- ---------------------------------------------------------------------------
-- 3) Five families
-- ---------------------------------------------------------------------------
INSERT INTO public.family_groups (name, name_ar, slug, status, description)
SELECT u.name, u.name_ar, u.slug, 'active', u.description
FROM (
  SELECT 'Al-Haddad Family'::text AS name, 'عائلة الحداد'::text AS name_ar, 'pilot-family-1'::text AS slug, 'Shopping-driven household (phone accessories + repair)'::text AS description
  UNION ALL SELECT 'Al-Mansour Family', 'عائلة المنصور', 'pilot-family-2', 'Budget-conscious household (refurbished phones)'
  UNION ALL SELECT 'Al-Badr Family', 'عائلة بدر', 'pilot-family-3', 'Tech-heavy household (premium flagship purchases)'
  UNION ALL SELECT 'Al-Salem Family', 'عائلة سالم', 'pilot-family-4', 'Business household (bulk/home-office equipment)'
  UNION ALL SELECT 'Al-Rashid Family', 'عائلة الراشد', 'pilot-family-5', 'Legacy/intro household (first-time online buyers)'
) u
WHERE NOT EXISTS (SELECT 1 FROM public.family_groups fg WHERE fg.slug = u.slug);

-- ---------------------------------------------------------------------------
-- 4) Family membership in the pilot neighborhood
-- ---------------------------------------------------------------------------
INSERT INTO public.neighborhood_families (neighborhood_id, family_id)
SELECT n.id, fg.id
FROM public.neighborhoods n
JOIN public.family_groups fg ON fg.slug IN (
  'pilot-family-1','pilot-family-2','pilot-family-3','pilot-family-4','pilot-family-5'
)
WHERE n.slug = 'pilot-neighborhood-1'
ON CONFLICT (neighborhood_id, family_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) Seed catalog (canonical inventory_items; unique logical key = sku)
--    source_key `pilot:` isolates these rows for `pilot_reset()` cleanup.
-- ---------------------------------------------------------------------------
INSERT INTO public.inventory_items
  (model_id, brand, model, variant, ram, storage, condition, quantity, status,
   sell_price, code, warranty, city, description, is_published, source_key)
SELECT u.model_id, u.brand, u.model, u.variant, u.ram, u.storage, u.condition,
       u.quantity, u.status, u.sell_price, u.code, u.warranty, u.city,
       u.description, u.is_published, u.source_key
FROM (
  SELECT 'galaxy-a15'::text AS model_id, 'Samsung'::text AS brand, 'Galaxy A15'::text AS model,
         '128GB'::text AS variant, '4GB'::text AS ram, '128GB'::text AS storage, 'New'::text AS condition,
         12::integer AS quantity, 'in_stock'::text AS status, 549.00::numeric(12,2) AS sell_price,
         'PLT-A15'::text AS code, '12 months'::text AS warranty, 'Riyadh'::text AS city,
         'Pilot store catalog item — Android 14, 6.5" AMOLED'::text AS description, TRUE::boolean AS is_published,
         'pilot:galaxy-a15'::text AS source_key
  UNION ALL SELECT 'iphone-13' ,'Apple'   ,'iPhone 13'        ,'128GB','6GB','128GB','Excellent',8,'in_stock',2349.00,'PLT-I13','12 months','Riyadh','Pilot store catalog item — A15 Bionic, 6.1" OLED',TRUE,'pilot:iphone-13'
  UNION ALL SELECT 'pixel-8'   ,'Google'  ,'Pixel 8'          ,'128GB','8GB','128GB','New',6,'in_stock',1999.00,'PLT-P8','12 months','Riyadh','Pilot store catalog item — Tensor G3, 6.2" OLED',TRUE,'pilot:pixel-8'
  UNION ALL SELECT 'a04s'      ,'Samsung' ,'Galaxy A04s'      ,'64GB' ,'4GB','64GB' ,'Refurbished',15,'in_stock',299.00,'PLT-A04S','6 months','Riyadh','Pilot store catalog item — budget category A',TRUE,'pilot:a04s'
  UNION ALL SELECT 'redmi-12'  ,'Xiaomi'  ,'Redmi 12'         ,'128GB','4GB','128GB','Excellent',10,'in_stock',459.00,'PLT-R12','6 months','Riyadh','Pilot store catalog item — budget category B',TRUE,'pilot:redmi-12'
) u
WHERE u.source_key NOT IN (SELECT COALESCE(source_key, '') FROM public.inventory_items)
ON CONFLICT (model_id, variant, condition, color) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6) Link the seed catalog to the pilot store (Phase 3)
-- ---------------------------------------------------------------------------
INSERT INTO public.store_inventory (store_id, inventory_id, position, is_primary)
SELECT s.id, ii.id, u.position, u.position = 0
FROM public.stores s
JOIN public.inventory_items ii ON ii.source_key IN (
  'pilot:galaxy-a15','pilot:iphone-13','pilot:pixel-8','pilot:a04s','pilot:redmi-12'
)
JOIN (
  SELECT 'pilot:galaxy-a15'::text AS sk, 0::integer AS position
  UNION ALL SELECT 'pilot:iphone-13' ,1
  UNION ALL SELECT 'pilot:pixel-8'   ,2
  UNION ALL SELECT 'pilot:a04s'      ,3
  UNION ALL SELECT 'pilot:redmi-12'  ,4
) u ON u.sk = ii.source_key
WHERE s.slug = 'pilot-store-1'
ON CONFLICT (store_id, inventory_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7) Link seed items to the FIRST ACTIVE category (canonical mapping) so the
--    pilot storefront is browsable by category when categories exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cat uuid;
  v_it  uuid;
BEGIN
  SELECT id INTO v_cat FROM public.categories WHERE is_active = TRUE ORDER BY sort_order, created_at LIMIT 1;
  IF v_cat IS NOT NULL THEN
    FOR v_it IN
      SELECT ii.id FROM public.inventory_items ii
      WHERE ii.source_key LIKE 'pilot:%'
    LOOP
      INSERT INTO public.category_products (category_id, product_id, is_active, is_featured)
      VALUES (v_cat, v_it, TRUE, FALSE)
      ON CONFLICT (category_id, product_id) DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

-- ============================================================================
-- Post-check — the five pilots must exist.
-- ============================================================================
DO $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.family_groups WHERE slug LIKE 'pilot-family-%'
  ) <> 5 THEN
    RAISE EXCEPTION '00066: expected 5 pilot families';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE slug = 'pilot-store-1') THEN
    RAISE EXCEPTION '00066: pilot store missing';
  END IF;
END;
$$;