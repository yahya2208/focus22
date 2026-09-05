-- ============================================================================
-- HARDENING COMPANION — storage-policies
-- ----------------------------------------------------------------------------
-- Restores the storage.objects policies that a schema-only (public) baseline
-- cannot capture: policy objects live in the managed `storage` schema and are
-- excluded from `pg_dump --schema=public`.
--
-- Source of truth: the migration files that authored them on live.
--   ads-images        -> 00015_ads_tables.sql
--   inventory-images  -> 00019_inventory_central.sql
--   category-covers   -> 00050_categories_delivery.sql
--
-- Exactly 12 policies, byte-for-byte matching the authored bodies. No RLS is
-- weakened, no grant is broadened, no new policy is invented. Idempotent:
-- DROP IF EXISTS + CREATE (same pattern the authored files use).
--
-- Order of application (Option A): baseline -> THIS -> pre-pilot-seeds ->
-- 00065 -> 00066 -> 00067.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Buckets (deterministic ensures; identical to authored inserts)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads-images', 'ads-images', TRUE)
ON CONFLICT (id) DO NOTHING;

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

INSERT INTO storage.buckets (id, name, public)
VALUES ('category-covers', 'category-covers', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ads-images (00015) — public read; admin/super_admin write
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read ads-images" ON storage.objects;
CREATE POLICY "Public read ads-images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ads-images');

DROP POLICY IF EXISTS "Staff upload ads-images" ON storage.objects;
CREATE POLICY "Staff upload ads-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff update ads-images" ON storage.objects;
CREATE POLICY "Staff update ads-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff delete ads-images" ON storage.objects;
CREATE POLICY "Staff delete ads-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- ---------------------------------------------------------------------------
-- inventory-images (00019) — public read; admin/super_admin write with
-- object-path containment (no arbitrary paths)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- category-covers (00050) — public read; admin/super_admin write
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read category-covers" ON storage.objects;
CREATE POLICY "Public read category-covers"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'category-covers');

DROP POLICY IF EXISTS "Staff upload category-covers" ON storage.objects;
CREATE POLICY "Staff upload category-covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'category-covers'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff update category-covers" ON storage.objects;
CREATE POLICY "Staff update category-covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'category-covers'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "Staff delete category-covers" ON storage.objects;
CREATE POLICY "Staff delete category-covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'category-covers'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
  );

-- ---------------------------------------------------------------------------
-- Post-check — exactly the 12 observed production policies must exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'Public read ads-images',
    'Staff upload ads-images',
    'Staff update ads-images',
    'Staff delete ads-images',
    'Public read inventory-images',
    'Staff upload inventory-images',
    'Staff update inventory-images',
    'Staff delete inventory-images',
    'Public read category-covers',
    'Staff upload category-covers',
    'Staff update category-covers',
    'Staff delete category-covers'
  ];
  v_count int;
  v_missing int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects';

  SELECT COUNT(*) INTO v_missing
  FROM unnest(v_expected) e
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = e
  );

  IF v_count <> 12 OR v_missing <> 0 THEN
    RAISE EXCEPTION 'storage companion: expected 12 policies, found %, % missing', v_count, v_missing;
  END IF;
END;
$$;