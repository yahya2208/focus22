-- ============================================================================
-- 00115  ADMIN STORE LINK (per-row, additive-only).
-- ----------------------------------------------------------------------------
-- Adds inventory rows to a store WITHOUT touching existing links.
-- (The legacy pilot_admin_set_store_inventory is delete-first / full-replace
-- and must never be used to add a single product.)
--
-- Contract: admin-only (fn_admin_uid), per-row INSERT ... ON CONFLICT
-- DO NOTHING, validates store + item existence, returns linked count.
-- No DELETE, no UPDATE, no inventory mutation, no pricing/stock changes.
-- NOT applied to any DB by this file alone.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pilot_admin_link_store_inventory(
  p_store_id      uuid,
  p_inventory_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := public.fn_admin_uid();
  v_item  uuid;
  v_linked integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ARGUMENTS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_inventory_ids IS NULL THEN
    RETURN jsonb_build_object('store_id', p_store_id, 'linked', 0);
  END IF;

  FOR v_item IN SELECT unnest(p_inventory_ids) LOOP
    IF v_item IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.inventory_items ii WHERE ii.id = v_item) THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.store_inventory (store_id, inventory_id)
    VALUES (p_store_id, v_item)
    ON CONFLICT (store_id, inventory_id) DO NOTHING;
    IF FOUND THEN
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('store_id', p_store_id, 'linked', v_linked);
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_admin_link_store_inventory(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_admin_link_store_inventory(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_admin_link_store_inventory(uuid, uuid[]) TO authenticated;

-- ============================================================================
-- Post-checks (project guard style — fail loudly on drift).
-- ============================================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.pilot_admin_link_store_inventory(uuid, uuid[])'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%fn_admin_uid()%' THEN
    RAISE EXCEPTION '00115: admin gate missing';
  END IF;
  IF v_def LIKE '%DELETE FROM public.store_inventory%' THEN
    RAISE EXCEPTION '00115: destructive store-inventory write detected';
  END IF;
  IF v_def NOT LIKE '%ON CONFLICT (store_id, inventory_id) DO NOTHING%' THEN
    RAISE EXCEPTION '00115: idempotent link guard missing';
  END IF;
END;
$$;
