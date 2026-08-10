-- ============================================================================
-- FOCUS — ADS · DEVICE-LINKED ADS (BATCH 4A) — POST-APPLY VERIFICATION
-- (read-only)
--
-- Purpose: close the evidence gaps AFTER the owner runs
-- 01-ads-device-links-apply.sql. Verifies:
--   A) device_id column exists (NOT NULL, default '');
--   B) the 5 constraints exist and are all NOT VALID (this cycle);
--   C) the 7 live rows are untouched (row count + sample) — zero break;
--   D) new-write enforcement probes (transaction-wrapped — nothing persists):
--        enabled-without-link rejected · phone-link-without-device rejected ·
--        device-without-phone-link rejected · mismatched derived link rejected ·
--        a VALID phone-linked save succeeds (rolls back with the probe);
--   E) compliance status for the LATER VALIDATE migration — how many rows
--        still violate each rule (owner repairs these, then VALIDATE runs).
--
-- SAFETY: sections A–C and E are SELECT/catalog-only. Section D runs inside a
-- single BEGIN;ROLLBACK transaction with SET LOCAL ROLE postgres — the probe
-- rows are rolled back, NOTHING is written to production.
--
-- HOW TO RUN: paste the WHOLE script into the SQL editor and run once.
-- ============================================================================

-- ============================================================================
-- SECTION A · device_id column present
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads' AND column_name = 'device_id';

-- ============================================================================
-- SECTION B · constraints present + NOT VALID (convalidated = f)
-- ============================================================================
SELECT conname,
       pg_get_constraintdef(oid) AS def,
       convalidated
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname IN ('ads_enabled_requires_link', 'ads_phone_link_requires_device',
                  'ads_device_id_format', 'ads_phone_link_matches_device',
                  'ads_device_requires_phone_link')
ORDER BY conname;

-- ============================================================================
-- SECTION C · live rows untouched (expect same rows as pre-apply evidence A)
-- ============================================================================
SELECT placement, enabled, link, alt, device_id
FROM public.ads
ORDER BY placement;

-- ============================================================================
-- SECTION D · new-write enforcement probes (transaction-wrapped, ROLLED BACK)
--   Postgres superuser (owner) runs these; the NOT VALID constraints DO apply
--   to new/updated rows, so each probe must behave exactly as expected.
-- ============================================================================
BEGIN;

-- D1) enabled + empty link → rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ads (placement, enabled, image_path, image_url, link, alt, device_id)
    VALUES ('probe1', TRUE, '', '', '', '', '');
    RAISE EXCEPTION 'FAIL: enabled ad without link accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: enabled ad without link rejected (check_violation)';
  END;
END $$;

-- D2) phone-format link + no device_id → rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ads (placement, enabled, image_path, image_url, link, alt, device_id)
    VALUES ('probe2', TRUE, '', '', '#/phone-details?device=abc', '', '');
    RAISE EXCEPTION 'FAIL: phone link without device_id accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: phone link without device_id rejected';
  END;
END $$;

-- D3) device_id set + external link → rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ads (placement, enabled, image_path, image_url, link, alt, device_id)
    VALUES ('probe3', TRUE, '', '', 'https://external.com', '', 'dev-x');
    RAISE EXCEPTION 'FAIL: device_id with external link accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: device_id with external link rejected';
  END;
END $$;

-- D4) phone-format link ≠ derived → rejected.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ads (placement, enabled, image_path, image_url, link, alt, device_id)
    VALUES ('probe4', TRUE, '', '', '#/phone-details?device=wrong', '', 'dev-x');
    RAISE EXCEPTION 'FAIL: mismatched derived link accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: mismatched derived link rejected';
  END;
END $$;

-- D5) VALID phone-linked save → accepted (then rolled back with the probe).
DO $$
BEGIN
  INSERT INTO public.ads (placement, enabled, image_path, image_url, link, alt, device_id)
  VALUES ('probe5', TRUE, '', '', '#/phone-details?device=36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51', '', '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51');
  RAISE NOTICE 'PASS: valid phone-linked save accepted';
END $$;

ROLLBACK;

-- ============================================================================
-- SECTION E · compliance status for the LATER VALIDATE migration.
--   A row violating a rule blocks VALIDATE on that rule. Expected in this
--   cycle: the 7 live rows (enabled + link='') show > 0 for
--   ads_enabled_requires_link until the owner repairs them. VALIDATE must wait
--   until ALL counts below are 0.
-- ============================================================================
SELECT
  count(*) FILTER (WHERE enabled AND btrim(link) = '')                                    AS rows_violate_enabled_requires_link,
  count(*) FILTER (WHERE link LIKE '#/phone-details?device=%' AND btrim(device_id) = '')  AS rows_violate_phone_link_requires_device,
  count(*) FILTER (WHERE device_id <> '' AND char_length(device_id) NOT BETWEEN 1 AND 128) AS rows_violate_device_id_format,
  count(*) FILTER (WHERE link LIKE '#/phone-details?device=%'
                        AND link <> '#/phone-details?device=' || device_id)                AS rows_violate_phone_link_matches_device,
  count(*) FILTER (WHERE device_id <> '' AND link <> '#/phone-details?device=' || device_id) AS rows_violate_device_requires_phone_link
FROM public.ads;

-- ============================================================================
-- Expected summary: A = device_id TEXT NOT NULL DEFAULT ''; B = 5 constraints,
-- each convalidated = f; C = the same 7 rows as pre-apply (device_id = '');
-- D = PASS/PASS/PASS/PASS/PASS (rolled back); E = >0 only for the enabled→link
-- rule until repaired — VALIDATE stays blocked while any count is > 0.
-- ============================================================================
