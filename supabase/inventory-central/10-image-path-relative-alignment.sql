-- ============================================================================
-- 10-image-path-relative-alignment.sql
--
-- OWNER-EXECUTED SQL — do NOT run from the application; the owner runs this
-- file manually in the Production Supabase SQL Editor (as postgres).
--
-- PURPOSE
--   Align the LIVE inventory-images storage contract with the Supabase Storage
--   client semantics used by the app (@supabase/storage-js v2.110.x).
--
--   storage.from('inventory-images').upload(path) always builds the request
--   URL as  POST /storage/v1/object/inventory-images/{path}  (the client
--   prepends the bucket name). The app previously passed the bucket-prefixed
--   path 'inventory-images/{inventory_id}/{uuid}.jpg', which produced
--     POST /storage/v1/object/inventory-images/inventory-images/{id}/{uuid}.jpg
--   and the live storage server rejects that duplicated path with HTTP 400.
--
--   Correct object paths are therefore RELATIVE to the bucket:
--     {inventory_id}/{uuid}.jpg
--   The app (inventory-central-service.ts uploadRecordImage) now sends that
--   relative path. This file updates the DB contract so the stored object name
--   '{inventory_id}/{uuid}.jpg' satisfies the RPC validation and policies.
--
-- FORWARD (section 1)
--   1) public.inventory_add_image()         : relax p_path check to relative.
--   2) "Staff upload inventory-images"      : relative {id}/% folder match.
--   3) "Staff update inventory-images"      : relative {id}/% folder match.
--   NOT CHANGED (no name-prefix predicate today, verified against
--   01-inventory-apply.sql):
--     - "Public read inventory-images"   (SELECT: bucket_id only)
--     - "Staff delete inventory-images"  (DELETE: bucket_id + admin only)
--     - public.inventory_remove_image()  (matches storage.objects.name = p_path
--       directly — no prefix assumption)
--     - public.inventory_add_image() object-exists check (name = p_path)
--   Admin authorization model UNCHANGED: admin/super_admin via public.users.
--   No other schema/RLS/RPC behavior is touched.
--
-- ROLLBACK (section 2)
--   Explicit, executable, self-contained. Restores the EXACT previous
--   definitions (byte-for-byte predicates from 01-inventory-apply.sql):
--     - inventory_add_image prefixed path validation
--     - "Staff upload inventory-images" prefixed policies
--     - "Staff update inventory-images" prefixed policies
--   Rollback touches ONLY those three definitions and their policy names.
--   It does not touch any other policy, table, RPC, or permission.
--
-- SAFETY
--   Forward is idempotent (DROP POLICY IF EXISTS + CREATE POLICY;
--   CREATE OR REPLACE FUNCTION). Rollback is idempotent the same way.
--   No data loss; existing rows keep their stored object names (the bucket is
--   empty in production as verified by the post-deploy evidence).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- SECTION 1 — FORWARD: align to the relative object-name contract
--   Object name = {inventory_id}/{uuid}.jpg  (relative to 'inventory-images')
-- ----------------------------------------------------------------------------

-- 1.1) public.inventory_add_image — RELATIVE path validation
--   Old predicate: p_path LIKE 'inventory-images/' || p_inventory_id || '/%'
--   New predicate: p_path LIKE p_inventory_id::text || '/%'
--   Body otherwise identical to 01-inventory-apply.sql section 8.12.
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

  -- The path must live inside THIS item's folder, relative to the bucket:
  -- {id}/... (the storage-js client prepends the bucket name automatically,
  -- so the stored object name no longer carries the 'inventory-images/' prefix).
  -- This makes it impossible to attach a path owned by another item.
  IF NOT (p_path LIKE p_inventory_id::text || '/%') THEN
    RAISE EXCEPTION 'path must start with %/', p_inventory_id
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
REVOKE ALL ON FUNCTION public.inventory_add_image(uuid, text, integer, boolean) FROM PUBLIC;

-- 1.2) "Staff upload inventory-images" — RELATIVE folder match.
--   bucket-name prefix predicate removed; the folder-segment rule is preserved
--   in relative form ({id}/%) and the object name is explicitly qualified.
--   Admin authorization unchanged.
DROP POLICY IF EXISTS "Staff upload inventory-images" ON storage.objects;
CREATE POLICY "Staff upload inventory-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inventory-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
    AND EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE storage.objects.name LIKE i.id::text || '/%'
    )
  );

-- 1.3) "Staff update inventory-images" — RELATIVE folder match (same rule).
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
    AND EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE storage.objects.name LIKE i.id::text || '/%'
    )
  );


-- ----------------------------------------------------------------------------
-- SECTION 2 — ROLLBACK: restore the EXACT previous contract
--   Run this section ONLY to revert to the bucket-prefixed object names
--   ('inventory-images/{inventory_id}/{uuid}.jpg') that the old app sent.
--   Self-contained and idempotent. Restores byte-for-byte the definitions
--   from 01-inventory-apply.sql sections 8.12 and 9.
-- ----------------------------------------------------------------------------

-- 2.1) Restore inventory_add_image — PREFIXED path validation.
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
REVOKE ALL ON FUNCTION public.inventory_add_image(uuid, text, integer, boolean) FROM PUBLIC;

-- 2.2) Restore "Staff upload inventory-images" — PREFIXED policy.
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

-- 2.3) Restore "Staff update inventory-images" — PREFIXED policy.
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

-- ----------------------------------------------------------------------------
-- Rollback scope check — restore EXACTLY these three definitions and nothing
-- else. No other policy, table, RPC, or permission is modified in this file.
-- Verify after forward with 09-live-policy-read-only-check.sql and one real
-- admin image upload in the app. Verify after rollback with 09 the same way
-- (prefixed 'inventory-images/%' must be back in both policies).
-- ============================================================================
