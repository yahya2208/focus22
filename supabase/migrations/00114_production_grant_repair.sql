-- ============================================================================
-- 00114  PRODUCTION SECURITY REPAIR — client grants on pilot tables.
-- ----------------------------------------------------------------------------
-- Corrective, additive, idempotent. Grants ONLY — no RLS, no policies, no
-- functions, no data, no DEFAULT PRIVILEGES changes.
--
-- ROOT CAUSE: Supabase platform default privileges grant ALL to anon +
-- authenticated on newly created tables. Several tables never received a
-- matching REVOKE (family_groups, order_items, anon on orders), or received
-- a 3-privilege/partial revoke (orders/authenticated via 00080, movements).
-- No ALTER DEFAULT PRIVILEGES exists repo-wide, so nothing self-heals.
--
-- TARGET CONTRACT (anon/authenticated direct table privileges):
--   family_groups      anon SELECT · authenticated SELECT
--   inventory_movements anon NONE  · authenticated SELECT
--   orders             anon SELECT · authenticated SELECT+REFERENCES+TRIGGER+TRUNCATE (no I/U/D)
--   order_items        anon SELECT · authenticated SELECT
-- Untouched: family_members, ledger, debts, family_saved_items,
-- inventory_items, every other table/role (incl. PUBLIC, postgres,
-- service_role), all RLS/policies, all RPCs, all data.
-- Order: after 00113. NOT applied to any DB by this file alone.
-- Rollback: none required (REVOKE-only direction + re-GRANTs below);
--   to restore pre-state by hand, re-issue the GRANTs from 00050/00065.
-- ============================================================================

-- 1) family_groups — SELECT-only for both client roles.
REVOKE ALL ON public.family_groups FROM anon;
REVOKE ALL ON public.family_groups FROM authenticated;
GRANT SELECT ON public.family_groups TO anon, authenticated;

-- 2) inventory_movements — no anon access; SELECT-only for authenticated.
REVOKE ALL ON public.inventory_movements FROM anon;
REVOKE ALL ON public.inventory_movements FROM authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;

-- 3) orders — SELECT-only for anon; strip write (I/U/D) for authenticated,
--    preserving the documented SELECT+REFERENCES+TRIGGER+TRUNCATE set.
REVOKE ALL ON public.orders FROM anon;
GRANT SELECT ON public.orders TO anon;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
GRANT SELECT ON public.orders TO authenticated;

-- 4) order_items — SELECT-only for both client roles.
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.order_items FROM authenticated;
GRANT SELECT ON public.order_items TO anon, authenticated;

-- ============================================================================
-- 5) Post-checks (project guard style — fail loudly on drift).
-- ============================================================================
DO $$
DECLARE
  v_bad integer;
BEGIN
  -- family_groups: exactly SELECT for anon + authenticated.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'family_groups'
     AND grantee IN ('anon', 'authenticated') AND privilege_type <> 'SELECT';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00114: family_groups has non-SELECT client grant (%)', v_bad;
  END IF;

  -- inventory_movements: zero anon; exactly SELECT for authenticated.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'inventory_movements'
     AND grantee = 'anon';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00114: inventory_movements has anon grant (%)', v_bad;
  END IF;
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'inventory_movements'
     AND grantee = 'authenticated' AND privilege_type <> 'SELECT';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00114: inventory_movements has non-SELECT authenticated grant (%)', v_bad;
  END IF;

  -- orders: anon exactly SELECT; authenticated no I/U/D.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND grantee = 'anon' AND privilege_type <> 'SELECT';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00114: orders has non-SELECT anon grant (%)', v_bad;
  END IF;
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND grantee = 'authenticated'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00114: orders has authenticated write grant (%)', v_bad;
  END IF;

  -- order_items: exactly SELECT for anon + authenticated.
  SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'order_items'
     AND grantee IN ('anon', 'authenticated') AND privilege_type <> 'SELECT';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '00114: order_items has non-SELECT client grant (%)', v_bad;
  END IF;
END;
$$;
