-- ============================================================================
-- FOCUS — ADS · DESTINATION-AWARE ENABLED RULE (STEP 2) — PRE-APPLY EVIDENCE
-- (read-only)
--
-- Purpose: capture the read-only baseline BEFORE the owner executes
-- 01-ads-destination-enabled-apply.sql. Confirms:
--   A) the current definition of ads_enabled_requires_link (expected: the
--      Batch 4A phone-only rule `CHECK (enabled = FALSE OR btrim(link) <> '')`);
--   B) the destination columns exist (destination_type / destination / title
--      from 00022) — the new rule depends on destination_type;
--   C) current ads rows — the compliance baseline that must survive the apply
--      unchanged (NOT VALID this cycle, so existing rows are not scanned);
--   D) compliance roll-up under the NEW rule — how many rows already violate
--      it (only the phone + enabled + empty-link combination can violate).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL. Safe on production.
-- Run ONCE before applying.
-- ============================================================================

-- ============================================================================
-- SECTION A · current ads_enabled_requires_link definition + validation state
-- ============================================================================
SELECT conname, convalidated, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ads'::regclass
  AND conname = 'ads_enabled_requires_link';

-- ============================================================================
-- SECTION B · destination columns present (00022 foundation, required by the
--   new rule — destination_type is the discriminator)
-- ============================================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ads'
  AND column_name IN ('destination_type', 'destination', 'title')
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION C · current ads rows — compatibility baseline for the apply.
--   Expected: the 7 live rows are phone + enabled + link='' and therefore
--   violate the NEW phone branch too — the apply stays NOT VALID and VALIDATE
--   waits until the owner repairs them (documented in the README + verify).
-- ============================================================================
SELECT placement, enabled, destination_type, link, device_id,
       btrim(link) <> '' AS has_non_blank_link
FROM public.ads
ORDER BY placement;

-- ============================================================================
-- SECTION D · compliance roll-up under the NEW rule.
--   rows_violate_new_enabled_rule: phone + enabled + empty-link → would FAIL.
--   enabled_non_phone_rows: external/internal/whatsapp enabled → PASS by the
--   new rule (no link required); expected 0 today (no non-phone rows yet).
-- ============================================================================
SELECT
  count(*) FILTER (
    WHERE enabled
      AND destination_type = 'phone'
      AND btrim(link) = ''
  ) AS rows_violate_new_enabled_rule,
  count(*) FILTER (
    WHERE enabled
      AND destination_type IN ('external', 'internal', 'whatsapp')
  ) AS enabled_non_phone_rows
FROM public.ads;

-- ============================================================================
-- Expected summary:
--   A = the Batch 4A definition, convalidated = f (NOT VALID);
--   B = 3 rows: destination_type TEXT default 'phone' / destination jsonb
--       default '{}' / title TEXT default '' — all NOT NULL;
--   C = the 7 live rows (phone, enabled, link='') — unchanged by the apply;
--   D = rows_violate_new_enabled_rule = 7 until repaired;
--       enabled_non_phone_rows = 0 (no non-phone rows exist yet).
-- If A shows a different definition (or is empty) or B is empty, STOP and
-- reconcile the live schema before applying.
-- ============================================================================
