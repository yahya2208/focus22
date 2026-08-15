-- ============================================================================
-- FOCUS — ADS · DESTINATION-AWARE ENABLED RULE (STEP 2) — POST-APPLY VERIFY
-- (read-only)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 01-ads-destination-enabled-apply.sql. Verifies:
--   A) ads_enabled_requires_link now carries the destination-aware definition
--      and is NOT VALID (convalidated = f) — no VALIDATE this cycle;
--   B) enforcement probes (transaction-wrapped, ROLLED BACK — nothing
--      persists). Probes the FULL truth table:
--        B1) disabled                              → PASS
--        B2) enabled + phone + non-empty link      → PASS
--        B3) enabled + external (no link)          → PASS
--        B4) enabled + internal (no link)          → PASS
--        B5) enabled + whatsapp (no link)          → PASS
--        B6) enabled + phone + empty link          → REJECTED (check_violation)
--   C) live rows untouched (same rows as pre-apply evidence C);
--   D) the 4 other phone CHECKs + the 3 destination columns still present;
--   E) compliance status for the LATER VALIDATE migration — VALIDATE stays
--      blocked until rows_violate_new_enabled_rule = 0.
--
-- SAFETY: sections A, C, D, E are SELECT/catalog-only. Section B runs inside
-- a single BEGIN;ROLLBACK transaction — the probe rows are rolled back,
-- NOTHING is written to production.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · the constraint now carries the destination-aware definition
--   Expected definition (NOT VALID, convalidated = f):
--     CHECK (enabled = FALSE OR (destination_type = 'phone' AND btrim(link) <> '')
--            OR destination_type IN ('external', 'internal', 'whatsapp'))
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname = 'ads_enabled_requires_link';

-- ============================================================================
-- SECTION B · enforcement probes (transaction-wrapped, ROLLED BACK)
-- ============================================================================
BEGIN;

-- B1) disabled → PASS regardless of type/link.
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, destination_type, link, device_id)
  VALUES ('probe_disabled_phone_empty', FALSE, 'phone', '', '');
  RAISE NOTICE 'PASS: disabled ad accepted (any type/link)';
END $$;

-- B2) enabled + phone + non-empty link → PASS.
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, destination_type, link, device_id)
  VALUES ('probe_phone_with_link', TRUE, 'phone',
          '#/phone-details?device=36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51',
          '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51');
  RAISE NOTICE 'PASS: enabled phone ad with link accepted';
END $$;

-- B3) enabled + external (link empty) → PASS.
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, destination_type, link, destination)
  VALUES ('probe_external', TRUE, 'external', '',
          '{"url":"https://example.com","target":"blank"}'::jsonb);
  RAISE NOTICE 'PASS: enabled external ad accepted without link';
END $$;

-- B4) enabled + internal (link empty) → PASS.
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, destination_type, link, destination)
  VALUES ('probe_internal', TRUE, 'internal', '',
          '{"screen":"home"}'::jsonb);
  RAISE NOTICE 'PASS: enabled internal ad accepted without link';
END $$;

-- B5) enabled + whatsapp (link empty) → PASS.
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, destination_type, link, destination)
  VALUES ('probe_whatsapp', TRUE, 'whatsapp', '',
          '{"number":"201234567890","message":"مرحبا"}'::jsonb);
  RAISE NOTICE 'PASS: enabled whatsapp ad accepted without link';
END $$;

-- B6) enabled + phone + empty link → REJECTED.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ads (placement, enabled, destination_type, link, device_id)
    VALUES ('probe_phone_empty_link', TRUE, 'phone', '', '');
    RAISE EXCEPTION 'FAIL: enabled phone ad without link accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: enabled phone ad without link rejected (check_violation)';
  END;
END $$;

ROLLBACK;

-- ============================================================================
-- SECTION C · live rows untouched (expect same rows as pre-apply evidence C)
-- ============================================================================
SELECT placement, enabled, destination_type, link, device_id
FROM public.ads
ORDER BY placement;

-- ============================================================================
-- SECTION D · the 4 other phone CHECKs + the 3 destination columns still present
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname IN ('ads_phone_link_requires_device', 'ads_device_id_format',
                  'ads_phone_link_matches_device', 'ads_device_requires_phone_link')
ORDER BY conname;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads'
  AND column_name IN ('destination_type', 'destination', 'title')
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION E · compliance status for the LATER VALIDATE migration.
--   VALIDATE on ads_enabled_requires_link must wait until the count below is 0.
-- ============================================================================
SELECT
  count(*) FILTER (
    WHERE enabled
      AND destination_type = 'phone'
      AND btrim(link) = ''
  ) AS rows_violate_new_enabled_rule
FROM public.ads;

-- ============================================================================
-- Expected summary:
--   A = ads_enabled_requires_link with the destination-aware definition,
--       convalidated = f (NOT VALID — no VALIDATE this cycle);
--   B = PASS/PASS/PASS/PASS/PASS/PASS (all rolled back);
--   C = the same live rows as pre-apply evidence C;
--   D = the 4 phone CHECKs + the 3 destination columns present;
--   E = the phone+enabled+empty-link count; VALIDATE stays blocked while > 0.
-- ============================================================================
