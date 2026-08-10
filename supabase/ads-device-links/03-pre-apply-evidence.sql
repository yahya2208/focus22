-- ============================================================================
-- FOCUS — ADS · DEVICE-LINKED ADS (BATCH 4A) — PRE-APPLY EVIDENCE (read-only)
--
-- Purpose: capture the read-only baseline BEFORE the owner executes
-- 01-ads-device-links-apply.sql. Confirms:
--   A) the ads table exists with its current columns (no device_id yet);
--   B) the 4 target constraint names are ABSENT (fresh apply, not a re-run);
--   C) current ads rows — the compliance baseline the owner uses to decide
--      when the later VALIDATE migration can run (NOT VALID in this cycle);
--   D) inventory id length precedent — the longest InventoryRecord id the app
--      can write (drives the 128-char device_id cap).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL. Safe on production.
-- Run ONCE before applying.
-- ============================================================================

-- ============================================================================
-- SECTION A · ads table + current columns (expect NO device_id)
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads'
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION B · target constraint names ABSENT (expect 0 rows / all empty)
-- ============================================================================
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname IN ('ads_enabled_requires_link', 'ads_phone_link_requires_device',
                  'ads_device_id_format', 'ads_phone_link_matches_device');

-- ============================================================================
-- SECTION C · current ads rows — compliance baseline for the LATER VALIDATE.
--   Note: every row shown below with enabled=TRUE AND link='' currently
--   violates the future ads_enabled_requires_link rule; the NOT VALID apply
--   does not scan them, but VALIDATE must wait until they are repaired.
-- ============================================================================
SELECT placement, enabled, link, alt,
       btrim(link) <> '' AS has_non_blank_link
FROM public.ads
ORDER BY placement;

-- Compliance roll-up — the enabled→link rule (the only one evaluable before
-- the column exists). The device_id-related checks are evaluated AFTER apply
-- in 04-post-apply-verify.sql section E.
SELECT
  count(*) FILTER (WHERE enabled AND btrim(link) = '') AS violate_enabled_requires_link
FROM public.ads;

-- ============================================================================
-- SECTION D · inventory id length precedent (max device_id the app can write)
--   App-side writes: crypto.randomUUID() = 36 chars, or id_<ts>_<rand> ≈ 25
--   chars. The app's primary inventory is localStorage-scoped, so the DB table
--   may be empty or absent — the 128 cap holds regardless. This is evidence
--   only, so a missing/empty table must NOT error.
-- ============================================================================
SELECT CASE WHEN to_regclass('public.inventory_items') IS NULL
            THEN 0
            ELSE (SELECT max(length(id::text)) FROM public.inventory_items)
       END AS max_inventory_id_length;

-- ============================================================================
-- Expected: A = current ads columns (no device_id); B = 0 rows; C = the 7 live
-- rows with the enabled+empty-link violation flagged for the VALIDATE decision;
-- D = ≤ 128. If B is non-empty, STOP — the apply already ran or a previous
-- attempt left constraints behind.
-- ============================================================================
