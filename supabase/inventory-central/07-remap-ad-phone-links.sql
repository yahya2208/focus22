-- ============================================================================
-- FOCUS — INVENTORY CENTRAL — REMAP ADS PHONE LINKS (Phase A, Step 7)
--
-- Type: DATA (SELECT + UPDATE). DRAFT FOR REVIEW — NOT EXECUTED.
-- Run as postgres in the Supabase SQL Editor, ONLY after Phase A Step 4-6 pass.
--
-- PURPOSE
--   ads.device_id and ads.link currently store the LOCAL inventory id
--   (see src/services/ads-service.ts buildAdPhoneLink). After the canonical
--   backfill (06) the same phones have central UUIDs. This maps local →
--   central via inventory_items.source_key so phone-linked ads keep resolving.
--
-- SAFETY
--   1) PRE-CHECK below must return ZERO rows before the UPDATE is run.
--   2) Save the pre-state snapshot first:
--        docs/release/production-bugs/evidence/ads-links-pre-remap.json
--      (SELECT * FROM public.ads ORDER BY placement) — rollback source.
--   3) Reversible: the UPDATE only touches device_id/link and only where the
--      local id is a real source_key.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PRE-CHECK — must return 0 rows.
-- Any row here means a device_id is set but does not resolve to exactly one
-- source_key (stale link, duplicated source_key, or unknown id) → STOP, do
-- not run the UPDATE, report to the owner.
-- ----------------------------------------------------------------------------
SELECT a.placement, a.device_id
FROM public.ads a
WHERE a.device_id <> ''
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.inventory_items i
      WHERE i.source_key = a.device_id
    )
    OR (
      SELECT count(*) FROM public.inventory_items i
      WHERE i.source_key = a.device_id
    ) > 1
  )
ORDER BY a.placement;

-- ----------------------------------------------------------------------------
-- REMAP (run only after the pre-check returned 0 rows).
-- ----------------------------------------------------------------------------
UPDATE public.ads a
SET device_id = i.id::text,
    link      = '#/phone-details?device=' || i.id::text
FROM public.inventory_items i
WHERE a.device_id = i.source_key
  AND a.device_id <> i.id::text;
