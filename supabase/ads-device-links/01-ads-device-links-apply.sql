-- ============================================================================
-- FOCUS — ADS · DEVICE-LINKED ADS (BATCH 4A) — APPLY
--
-- Type: Additive (ADD COLUMN + ADD CONSTRAINT, NOT VALID)
-- One-shot: safe to run once on the live DB. Constraint creation is guarded
-- by name so a partial/duplicate run does not stack constraints.
--
-- PURPOSE
--   Introduce `ads.device_id` as the STRUCTURED SOURCE OF TRUTH for
--   phone-linked ads (Marketplace Mediator model §10/§17):
--     * `device_id`   — the InventoryRecord.id the banner targets ('' = none).
--     * `link`        — the RUNTIME CARRIER derived at save time by the app
--                       (ads-service buildAdPhoneLink → #/phone-details?device=<id>).
--   The DB enforces FORMAT / CONSISTENCY / ENABLED-LINK / PHONE-LINK↔DEVICE
--   relationships ONLY. It does NOT (and cannot) check inventory existence —
--   that lives in the Ads Manager (InventoryService.getExchangeableDevices()).
--
-- Two-phase constraint activation (owner-approved):
--   * This script adds every constraint with NOT VALID: existing rows are NOT
--     scanned, new/updated rows ARE enforced immediately.
--   * VALIDATE is a SEPARATE, LATER migration (only after ALL existing rows
--     comply — the 7 live rows currently have link='' and violate the
--     enabled→link rule until the owner repairs them).
--
-- SECURITY / IMPACT
--   * Zero break to the 7 live ads rows (link='', device_id defaults ''):
--     NOT VALID constraints do not scan them.
--   * New saves: enabled ad without a destination link → rejected;
--     phone-format link without device_id → rejected;
--     device_id without phone-format link → rejected;
--     phone-format link ≠ derived(#/phone-details?device=<device_id>) → rejected.
--
-- Rollback: see 02-ads-device-links-rollback.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) device_id column — structured source of truth (NOT NULL, default '').
--    Safe on existing rows: the default fills all 7 live rows with ''.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------------------
-- 2) Constraints (all NOT VALID for this cycle — see header).
-- ----------------------------------------------------------------------------

-- 2.1) enabled → link must be non-whitespace.
--      Rationale: an enabled ad must always have a destination; a row that is
--      enabled but has no link would render an anchor with href="" (broken UI).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_enabled_requires_link') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_enabled_requires_link
      CHECK (enabled = FALSE OR btrim(link) <> '') NOT VALID;
  END IF;
END $$;

-- 2.2) phone-format link → device_id must be set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_phone_link_requires_device') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_phone_link_requires_device
      CHECK (link NOT LIKE '#/phone-details?device=%' OR btrim(device_id) <> '') NOT VALID;
  END IF;
END $$;

-- 2.3) device_id format: '' or a non-empty id up to 128 chars.
--      (Inventory ids are UUIDv4 = 36 chars or id_<ts>_<rand> ≈ 25 chars.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_device_id_format') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_device_id_format
      CHECK (device_id = '' OR char_length(device_id) BETWEEN 1 AND 128) NOT VALID;
  END IF;
END $$;

-- 2.4) CONSISTENCY: whenever link is phone-format, it MUST equal the derived
--      value (#/phone-details?device=<device_id>). Prevents divergence between
--      the structured device_id and the runtime carrier.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_phone_link_matches_device') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_phone_link_matches_device
      CHECK (link NOT LIKE '#/phone-details?device=%' OR link = '#/phone-details?device=' || device_id) NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- Done. Run 04-post-apply-verify.sql next (read-only). Do NOT run the
-- VALIDATE migration until every existing ads row complies.
-- ============================================================================
