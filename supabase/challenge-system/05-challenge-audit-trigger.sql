-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P2 — AUDIT TRIGGER)
--
-- Type: Additive (CREATE TRIGGER only)
-- Status: P2 APPLY
--
-- PURPOSE
--   Automatically set `updated_at = now()` on UPDATE for the challenges table.
--   Reuses the existing update_updated_at() function from migration 00008.
--
-- HOW IT RUNS
--   Run as part of the combined transaction (see 01-challenge-schema.sql header):
--     BEGIN;
--     <01-schema>
--     <02-scoring>
--     <03-rpcs>
--     <this file>
--     COMMIT;
-- ============================================================================

CREATE TRIGGER trg_challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
