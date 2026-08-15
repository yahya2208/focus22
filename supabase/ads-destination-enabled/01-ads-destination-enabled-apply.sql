-- ============================================================================
-- FOCUS — ADS · DESTINATION-AWARE ENABLED RULE (STEP 2) — APPLY
--
-- Type: Constraint REPLACE (DROP + ADD, same name). One-shot, guarded.
-- Mirrors: supabase/migrations/00023_ads_destination_enabled.sql
-- Executed by: OWNER in the Supabase SQL editor (project workflow).
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
--   NO fallback from `destination` to `link` or vice-versa — each type is
--   judged strictly by its own branch.
--
-- WHY SAME NAME
--   Keeping the constraint name `ads_enabled_requires_link` preserves every
--   existing reference unchanged: the ads-service.ts Step-1 error message,
--   Batch 4A evidence/verify/rollback, the 00022 "NOT touched" notes. Only the
--   DEFINITION changes, nothing else.
--
-- WHY NOT VALID (NO VALIDATE THIS CYCLE)
--   The live rows (7, phone + enabled + link='') still violate the phone
--   branch of the new rule. NOT VALID enforces new/updated rows immediately
--   without scanning existing rows; VALIDATE stays deferred until the owner
--   repairs every existing row (same policy as Batch 4A).
--
-- SAFETY
--   * DROP CONSTRAINT IF EXISTS + guarded ADD — safe to run once or re-run.
--   * The other 4 phone CHECKs, ad_images, the mirror trigger, RLS policies,
--     storage policies, and ad RPCs are untouched.
--
-- Rollback: see 02-ads-destination-enabled-rollback.sql.
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
-- Done. Run 04-post-apply-verify.sql next (read-only). Do NOT run the
-- VALIDATE migration until every existing ads row complies (Section E of the
-- verify script must show 0 for rows_violate_new_enabled_rule).
-- ============================================================================
