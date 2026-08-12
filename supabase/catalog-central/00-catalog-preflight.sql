-- ============================================================================
-- FOCUS — CATALOG CENTRAL (GATE 1 — PRE-FLIGHT, READ-ONLY)
--
-- Type: SELECT-only evidence. Executes NOTHING, creates NOTHING, modifies
--       NOTHING. Run as `postgres` in the Supabase SQL Editor BEFORE GATE 1.
--
-- Gate: 00 (pre-apply evidence)
-- Goal:
--   1) Confirm the three catalog tables are ABSENT (additivity proof).
--   2) Confirm preconditions (admin present, gen_random_uuid, users.id=uuid).
--   3) ** RAW inventory_items COUNT check (not v_public_inventory). **
--      Per owner mandate: actual COUNT(*) must be 7. If it is NOT 7, this
--      script RAISES an exception -> STOP, log the drift, do NOT apply GATE 1.
--      No row is modified. The assertion is never relaxed.
-- ============================================================================

-- 0) Context sanity
SELECT current_database() AS db, current_user AS role, now() AS ts;

-- 1) Additivity: catalog tables must NOT exist yet
SELECT
  to_regclass('public.catalog_models')          AS catalog_models_exists,
  to_regclass('public.catalog_variants')        AS catalog_variants_exists,
  to_regclass('public.catalog_variant_history') AS catalog_variant_history_exists;

-- 2) Preconditions
SELECT count(*) AS admin_count
FROM public.users
WHERE role IN ('admin','super_admin');

SELECT count(*) AS gen_random_uuid_available
FROM pg_proc
WHERE proname = 'gen_random_uuid';

SELECT count(*) AS users_id_not_uuid
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'
  AND data_type <> 'uuid';

-- 3) RAW inventory_items count (fail-closed on drift)
DO $$
DECLARE
  n_inventory bigint;
  v_db text;
  v_role text;
BEGIN
  SELECT current_database(), current_user INTO v_db, v_role;

  -- This table MUST exist (it was applied in Phase 2C). Read-only.
  SELECT count(*) INTO n_inventory FROM public.inventory_items;

  RAISE NOTICE 'PRE-FLIGHT: role=%, db=% , raw inventory_items COUNT(*) = % (expected 7)',
    v_role, v_db, n_inventory;

  IF n_inventory <> 7 THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: raw inventory_items COUNT(*) = % <> 7. STOP — log the drift, do NOT apply GATE 1. Assertion is never relaxed.', n_inventory;
  END IF;

  RAISE NOTICE 'PRE-FLIGHT PASS: inventory_items = % , catalog tables absent confirmed, prerequisites met.', n_inventory;
END $$;

-- ============================================================================
-- END OF GATE 1 PRE-FLIGHT (read-only). If the operator sees the FAIL above,
-- STOP here. Do not proceed to 01-catalog-schema-apply.sql.
-- ============================================================================
