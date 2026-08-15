-- ============================================================================
-- FOCUS — ADS · DESTINATION-AWARE ENABLED RULE (STEP 2) — ROLLBACK (exact)
--
-- Reverses 01-ads-destination-enabled-apply.sql COMPLETELY: restores the
-- original Batch 4A meaning of `ads_enabled_requires_link` verbatim:
--
--     CHECK (enabled = FALSE OR btrim(link) <> '') NOT VALID
--
-- Same constraint name, original definition. Every external reference
-- (ads-service.ts, Batch 4A evidence/verify, 00022 notes) stays valid because
-- the name is unchanged.
--
-- SAFETY: runs standalone in the Supabase SQL editor. Only the constraint is
-- touched — ads table, RLS, storage, frozen tables all unchanged.
--
-- ROLLBACK (owner executes only if a full reversal is required):
-- ============================================================================

-- 1) Drop the destination-aware definition added by 01-apply.
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_enabled_requires_link;

-- 2) Restore the Batch 4A phone-only definition (same name).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_enabled_requires_link') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_enabled_requires_link
      CHECK (enabled = FALSE OR btrim(link) <> '') NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- Verify rollback — the constraint must be present with the original def:
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'ads_enabled_requires_link';
--   -- expect: CHECK (enabled = FALSE OR btrim(link) <> '')
-- ============================================================================
