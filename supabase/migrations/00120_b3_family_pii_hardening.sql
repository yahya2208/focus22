-- ============================================================================
-- 00120  B3 family PII hardening — store-operator least-privilege family labels
-- ----------------------------------------------------------------------------
-- Purpose: close the public read path on public.family_groups (B3) without
-- breaking the Store Operator order queue, which needs family display names.
--
--   1. New RPC public.pilot_store_order_families(p_store_id uuid):
--        SECURITY DEFINER, SET search_path = '', authenticated-only.
--        Authorizes exactly like pilot_orders_for_store: admin OR the
--        operator of THAT store (stores.operator_user_id = auth.uid()).
--        Family ids are derived SERVER-SIDE from that store's own orders —
--        the caller supplies NO family ids, so there is no enumeration oracle.
--        Returns ONLY (family_id, name, name_ar) for active families.
--        PII columns (contact_*, preferred_delivery_time, veg_notes) are
--        structurally unreturnable.
--   2. DROP POLICY "Public read active family groups" (the B3 exposure).
--   3. Narrow "Admin read all family groups" from
--      TO anon, authenticated down to TO authenticated (zero behavior change:
--      fn_admin_uid() is NULL for anon, so anon matched zero rows before and
--      after; this only removes the over-broad grantee).
--
-- Untouched: family_groups / family_members / ledger schema, RLS on all other
-- tables, neighborhood_families public policy (separate follow-up, out of B3),
-- pilot_my_family(), pilot_neighborhood_families(), pilot_admin_list_families(),
-- order/inventory/settlement RPCs, triggers, Auth, RBAC.
-- Rollback: re-creating the dropped public policy RE-OPENS B3 and must never
-- be done without a new security review.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Store-operator family-label RPC (Phase: B3 least privilege)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pilot_store_order_families(p_store_id uuid)
RETURNS TABLE (
  family_id   uuid,
  name        text,
  name_ar     text
)
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
  -- Same enforcement point as pilot_orders_for_store (00065): the store's
  -- operator_user_id OR an admin. Never trust browser-supplied role/store.
  IF NOT (
    public.fn_admin_uid() IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = p_store_id AND s.operator_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Family ids come from the store's OWN orders — never from the caller.
  -- Only the three display columns leave the database.
  RETURN QUERY
    SELECT DISTINCT fg.id, fg.name, fg.name_ar
    FROM public.orders o
    JOIN public.family_groups fg ON fg.id = o.family_id
    WHERE o.store_id = p_store_id
      AND o.family_id IS NOT NULL
      AND fg.status = 'active'
    ORDER BY fg.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_store_order_families(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pilot_store_order_families(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pilot_store_order_families(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Remove the public read path on family_groups (B3 exposure)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read active family groups" ON public.family_groups;

-- ----------------------------------------------------------------------------
-- 3) Narrow the admin policy grantee (anon matched zero rows before and after)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read all family groups" ON public.family_groups;
CREATE POLICY "Admin read all family groups"
  ON public.family_groups FOR SELECT TO authenticated
  USING (public.fn_admin_uid() IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 4) Self-check: fail loudly if any public SELECT path on family_groups
--    remains (applies at migration time, not at query time).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'family_groups'
      AND cmd = 'SELECT'
      AND (
        roles::text LIKE '%anon%'
        OR roles::text LIKE '%public%'
      )
  ) THEN
    RAISE EXCEPTION '00120: public SELECT path on family_groups still present';
  END IF;
END;
$$;
