-- ============================================================================
-- FOCUS — ADS · DEVICE-LINKED ADS (BATCH 4A) — PRE-APPLY EVIDENCE (read-only)
--
-- Purpose: capture the read-only baseline BEFORE the owner executes
-- 01-ads-device-links-apply.sql. Confirms:
--   A) the ads table exists with its current columns (no device_id yet);
--   B) the 5 target constraint names are ABSENT (fresh apply, not a re-run);
--   C) current ads rows — the compliance baseline the owner uses to decide
--      when the later VALIDATE migration can run (NOT VALID in this cycle);
--   D) the device_id length contract, proven from the DOCUMENTED app id
--      generator (data-source.ts generateId) and NOT from any DB table —
--      the app inventory is localStorage-scoped, the live DB has no
--      inventory table (and none may be created), so DB-level resolvability
--      is impossible by architecture (existence stays in the Ads Manager via
--      InventoryService.getExchangeableDevices()).
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
                  'ads_device_id_format', 'ads_phone_link_matches_device',
                  'ads_device_requires_phone_link');

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
-- SECTION D · device_id length contract (DOCUMENTED code contract — no DB).
--   The app writes every inventory id through data-source.ts generateId():
--     primary : crypto.randomUUID()            = 36 chars (fixed)
--     fallback: `id_${Date.now()}_${rand36.slice(2,8)}`
--               id_        = 3 chars
--               Date.now() = decimal of ms epoch; upper bound is the max safe
--                            integer 9007199254740991 = 16 chars
--               _          = 1 char
--               base36     = Math.random().toString(36).slice(2, 8)
--                            → at most 6 chars
--               fallback upper bound            = 3 + 16 + 1 + 6 = 26 chars
--   device_id cap = 128  ≥ 36 and ≥ 26  ⇒  the contract holds (3.5× margin).
--   NOTE: this block must NEVER reference a table that may not exist — a
--   missing relation raises 42P01 at PLAN time even inside a guarded CASE
--   (this is exactly the failure the previous Section D produced).
-- ============================================================================
SELECT 128 AS device_id_cap,
       char_length('36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51') AS uuid_v4_length,
       3 + char_length('9007199254740991') + 1 + 6          AS fallback_id_max_length,
       (36 <= 128) AND (26 <= 128)                          AS cap_holds;

-- ============================================================================
-- Expected: A = current ads columns (no device_id); B = 0 rows; C = the 7 live
-- rows with the enabled+empty-link violation flagged for the VALIDATE decision;
-- D = uuid_v4_length = 36, fallback_id_max_length = 26, cap_holds = t.
-- If B is non-empty, STOP — the apply already ran or a previous attempt left
-- constraints behind.
-- ============================================================================
