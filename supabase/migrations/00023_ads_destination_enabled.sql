-- ============================================================================
-- FOCUS — MIGRATION 00023 · ADS DESTINATION-AWARE ENABLED RULE (STEP 2)
--
-- Migration number: 00023.
-- Source of truth: supabase/ads-destination-enabled/01-ads-destination-enabled-apply.sql.
--   This file is the migration-format copy; keep the two in sync.
--   Same convention as 00019/00020/00021/00022 (FILE ONLY, NOT EXECUTED —
--   applied via the SQL Editor as postgres).
--
-- TYPE: Constraint REPLACE (DROP + ADD, same name). One-shot, guarded.
--
-- PURPOSE
--   Amend the meaning of `ads_enabled_requires_link` so the DB gate for
--   ENABLED ads matches the Generic Ads System (Step 1 contract):
--
--     enabled = FALSE                                   → PASS (disabled ad)
--     enabled = TRUE ∧ destination_type = 'phone'   ∧ btrim(link) <> '' → PASS
--     enabled = TRUE ∧ destination_type ∈ {external, internal, whatsapp} → PASS
--     enabled = TRUE ∧ destination_type = 'phone'   ∧ btrim(link)  = '' → FAIL
--
--   The destination for non-phone types lives in the `destination` JSONB
--   column; the DB no longer requires a non-empty `link` for them. There is
--   NO fallback from `destination` to `link` or vice-versa.
--
-- WHY SAME NAME
--   Keeping the constraint name `ads_enabled_requires_link` preserves every
--   existing reference unchanged (ads-service.ts Step-1 error, Batch 4A
--   evidence/verify/rollback, 00022 notes). Only the DEFINITION changes.
--
-- WHY NOT VALID (NO VALIDATE THIS CYCLE)
--   The 7 live rows (phone + enabled + link='') still violate the phone
--   branch. NOT VALID enforces new/updated rows immediately without scanning
--   existing rows; VALIDATE stays deferred until the owner repairs them.
--
-- SAFETY
--   * DROP CONSTRAINT IF EXISTS + guarded ADD — safe to run once or re-run.
--   * The other 4 phone CHECKs, ad_images, the mirror trigger, RLS policies,
--     storage policies, and ad RPCs are untouched.
--
-- Rollback: see supabase/ads-destination-enabled/02-*-rollback.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Drop the previous definition (Batch 4A phone-only rule), if present.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_enabled_requires_link;

-- ----------------------------------------------------------------------------
-- 2) Re-add the SAME constraint name with the destination-aware meaning.
--    NOT VALID: existing rows are not scanned; new/updated rows are enforced
--    immediately. See header for the exact truth table.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_enabled_requires_link') THEN
    ALTER TABLE public.ads ADD CONSTRAINT ads_enabled_requires_link
      CHECK (
        enabled = FALSE
        OR (destination_type = 'phone' AND btrim(link) <> '')
        OR destination_type IN ('external', 'internal', 'whatsapp')
      ) NOT VALID;
  END IF;
END $$;

-- ============================================================================
-- Done. Run supabase/ads-destination-enabled/04-post-apply-verify.sql next.
-- ============================================================================
