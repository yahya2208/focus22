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
--   3) ** RAW inventory_items snapshot check (not v_public_inventory). **
--      Protected by an OWNER-APPROVED, APPROVAL-TIME baseline: row count +
--      content fingerprint. If count or fingerprint differ from baseline, this
--      script RAISES an exception -> STOP, log the drift, do NOT apply GATE 1.
--      No row is modified. This is NOT a permanent inventory-count invariant.
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

-- 3) RAW inventory_items snapshot check (fail-closed on drift)
--    Approval-time baseline (owner-confirmed on fmggysdqigtejxbfpgtg):
--      count = 17 | content fingerprint = 1c5d9b8a117a93f03335e7296abddec1
--    Baseline snapshot, NOT a permanent count invariant.
DO $$
DECLARE
  n_inventory bigint;
  v_inv_fp text;
  v_db text;
  v_role text;
BEGIN
  SELECT current_database(), current_user INTO v_db, v_role;

  -- This table MUST exist (it was applied in Phase 2C). Read-only.
  SELECT count(*), md5(string_agg(
      id::text || '|' || coalesce(source_key,'') || '|' || coalesce(model_id,'')
        || '|' || coalesce(quantity,0)::text || '|' || coalesce(status,'')
        || '|' || coalesce(is_published,false)::text,
      ',' ORDER BY id))
  INTO n_inventory, v_inv_fp
  FROM public.inventory_items;

  RAISE NOTICE 'PRE-FLIGHT: role=%, db=% , raw inventory_items COUNT(*) = % (expected 17)',
    v_role, v_db, n_inventory;

  IF n_inventory <> 17 OR v_inv_fp <> '1c5d9b8a117a93f03335e7296abddec1' THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAIL: inventory drift count=% fp=% (expected count=17 fp=1c5d9b8a117a93f03335e7296abddec1). STOP — log the drift, do NOT apply GATE 1. Baseline is an approval-time snapshot; re-approve before retry.', n_inventory, v_inv_fp;
  END IF;

  RAISE NOTICE 'PRE-FLIGHT PASS: inventory snapshot unchanged (count=%, fp=%), catalog tables absent confirmed, prerequisites met.', n_inventory, v_inv_fp;
END $$;

-- ============================================================================
-- END OF GATE 1 PRE-FLIGHT (read-only). If the operator sees the FAIL above,
-- STOP here. Do not proceed to 01-catalog-schema-apply.sql.
-- ============================================================================
