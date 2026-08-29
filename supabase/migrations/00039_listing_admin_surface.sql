-- ============================================================================
-- FOCUS — LISTING ADMIN SURFACE (MIGRATION 00039)
--
-- Migration number: 00039 (after 00038_listing_rpcs.sql — verified highest).
-- Type: PURELY ADDITIVE. Two NEW functions only. NO function from 00038 (or
--       any earlier migration) is redefined, dropped or altered — 00038 is
--       historical and stays byte-identical.
--
-- WHY THIS EXISTS (P8.4 scope gate decision)
--   The admin UI must manage car/property listings across their FULL
--   lifecycle, but 00038 only shipped:
--     - listing_search  → reads v_public_listings = PUBLISHED + ACTIVE only.
--                         A draft (unpublished) listing is INVISIBLE to it.
--     - no delete at all.
--   Without this surface an admin cannot discover a draft to publish it,
--   nor remove a listing. Both gaps were surfaced at the P8.4 STOP GATE and
--   approved as explicit scope expansion (option A) — not silent fixes.
--
-- FUNCTIONS
--   listing_my_listings(p_category) → jsonb {"total": n, "items": [...]}
--     Admin read of ALL non-deleted listings of ONE category, INCLUDING
--     drafts/unpublished and inactive-status rows. Row projection mirrors
--     v_public_listings plus an explicit "is_published" flag (the one bit
--     the public view can never carry). Nothing else is exposed: no buy_price,
--     no owner ids, no audit columns — the admin list needs none of it.
--     Category boundary matches the rest of the listing_* family:
--     'phone' is REJECTED (phones are managed through inventory_management_list
--     / inventory_* RPCs — this must never become a second phone read path);
--     unknown categories are rejected too.
--   listing_delete(p_listing_id) → void
--     SOFT delete ONLY: status := 'deleted'. No DELETE FROM anywhere.
--     The row physically remains (audit/movement history intact); every
--     read path already excludes status='deleted' (v_public_listings via its
--     active-status predicate; my_listings explicitly below). Idempotent by
--     UPDATE semantics — deleting an already-deleted id succeeds silently,
--     exactly like the SQL statement would.
--     'updated_at' is refreshed here explicitly for parity with 00038's
--     write style; the 00019 trigger would refresh it regardless.
--
-- SECURITY
--   - Both functions are SECURITY DEFINER gated by the SAME
--     inventory_is_admin() used by every legacy inventory_* RPC and every
--     00038 listing_* mutation (ERRCODE 42501 on failure).
--   - Grants follow the house model: REVOKE ... FROM PUBLIC then GRANT
--     EXECUTE ... TO authenticated. Neither is anonymous-readable.
--
-- Depends on: inventory_is_admin() (00019), category/price_period columns
--             (00035), car_details/property_details (00036), and the 00038
--             family (preflight below fails loudly without it).
-- Rollback: see ROLLBACK section at the bottom (commented).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0) Preflight — fail loudly if applied out of order
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'inventory_is_admin'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.inventory_is_admin() missing — apply migration 00019 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'listing_create'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'public.listing_create missing — apply migration 00038 first';
  END IF;
END $$;

-- ============================================================================
-- 1) listing_my_listings — admin read INCLUDING drafts/unpublished
--    Returns {"total": n, "items": [flat rows]} sorted by updated_at DESC.
--    Flat rows mirror the v_public_listings projection + "is_published".
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_my_listings(
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  -- Category boundary: phones keep exactly ONE admin read path
  -- (inventory_management_list). This surface is for the NEW categories.
  IF p_category = 'phone' THEN
    RAISE EXCEPTION 'phones are managed through inventory_management_list' USING ERRCODE = '22023';
  ELSIF p_category NOT IN ('car','property') THEN
    RAISE EXCEPTION 'unknown category "%": use car|property', p_category USING ERRCODE = '22023';
  END IF;

  WITH base AS (
    SELECT
      i.id,
      i.category,
      i.brand,
      i.model,
      i.color,
      i.quantity,
      i.status,
      i.is_published,
      i.sell_price          AS price,
      i.price_period,
      i.code,
      i.warranty,
      i.city,
      i.description,
      i.variant             AS phone_variant,
      i.ram                 AS phone_ram,
      i.storage             AS phone_storage,
      i.condition           AS phone_condition,
      i.battery_health      AS phone_battery_health,
      cd.trim               AS car_trim,
      cd.year               AS car_year,
      cd.mileage_km         AS car_mileage_km,
      cd.fuel               AS car_fuel,
      cd.transmission       AS car_transmission,
      cd.body_type          AS car_body_type,
      cd.engine_cc          AS car_engine_cc,
      cd.condition_state    AS car_condition_state,
      pd.property_type      AS property_type,
      pd.transaction_type   AS transaction_type,
      pd.district           AS property_district,
      pd.area_m2            AS property_area_m2,
      pd.bedrooms           AS property_bedrooms,
      pd.bathrooms          AS property_bathrooms,
      pd.floor              AS property_floor,
      pd.furnished          AS property_furnished,
      pd.condition_state    AS property_condition_state,
      COALESCE(
        (SELECT array_agg(im.path ORDER BY im.position, im.created_at)
         FROM public.inventory_images im WHERE im.inventory_id = i.id),
        ARRAY[]::text[]
      )                     AS images,
      i.created_at,
      i.updated_at
    FROM public.inventory_items i
    LEFT JOIN public.car_details      cd ON cd.id = i.id
    LEFT JOIN public.property_details pd ON pd.id = i.id
    WHERE i.category = p_category
      AND i.status <> 'deleted'
    ORDER BY i.updated_at DESC
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(base.*)) FROM base), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 2) listing_delete — SOFT delete (status := 'deleted'), never a table DELETE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listing_delete(
  p_listing_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.inventory_items%ROWTYPE;
BEGIN
  IF NOT public.inventory_is_admin() THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.inventory_items WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '22000';
  END IF;
  IF r.category NOT IN ('car','property') THEN
    RAISE EXCEPTION 'listing_delete targets car/property listings only' USING ERRCODE = '22023';
  END IF;

  -- Soft delete ONLY. The row physically remains; every reader excludes it:
  --   v_public_listings → active-status predicate (same as v_public_inventory)
  --   listing_my_listings → explicit status <> 'deleted' filter above
  UPDATE public.inventory_items SET
    status     = 'deleted',
    updated_at = now()
  WHERE id = p_listing_id;
END;
$$;

-- ============================================================================
-- 3) Grants — same authorization story as the legacy family + 00038 writes
-- ============================================================================
REVOKE ALL ON FUNCTION public.listing_my_listings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listing_my_listings(text) TO authenticated;

REVOKE ALL ON FUNCTION public.listing_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listing_delete(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- POST-APPLY VERIFICATION (run after apply)
-- ============================================================================
-- 1. Non-admin read/write must ERROR 42501:
--      SET ROLE authenticated; SELECT public.listing_my_listings('car'); RESET ROLE;
--      SET ROLE authenticated; SELECT public.listing_delete(gen_random_uuid()); RESET ROLE;
-- 2. Phone rejection (boundary — never a second phone path):
--      SELECT public.listing_my_listings('phone');
--      -- ERROR: phones are managed through inventory_management_list
-- 3. Draft visibility (THE gap this migration closes):
--      SELECT public.listing_create('car','Toyota','Corolla', NULL, 'sale',
--        '', '', NULL, NULL, NULL, 1, FALSE, '{"conditionState":"used"}') AS draft_id;
--      SELECT items->0->>'is_published' FROM public.listing_my_listings('car');
--      -- must include the draft with "is_published": false
-- 4. Soft delete keeps the row physically present:
--      SELECT public.listing_delete('<id>');
--      SELECT status FROM public.inventory_items WHERE id = '<id>';  -- 'deleted'
--      SELECT count(*) FROM public.inventory_items WHERE id = '<id>'; -- >= 1
--
-- ROLLBACK (reverse order):
--   DROP FUNCTION IF EXISTS public.listing_delete(uuid);
--   DROP FUNCTION IF EXISTS public.listing_my_listings(text);
-- ============================================================================
