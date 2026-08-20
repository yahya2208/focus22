-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P3 — FINAL WINNER)
--
-- Type: Additive (ALTER TABLE ADD COLUMN)
-- Status: P3 APPLY
--
-- SCOPE
--   Add final_winner_submission_id to challenges table.
--   This column is written ONLY by finalize_challenge() RPC.
--
-- SECURITY
--   See 03-challenge-rpcs.sql for RPC-level authorization.
--
-- HOW IT RUNS
--   Run as `postgres` in the Supabase SQL Editor:
--     BEGIN;
--     <this file>
--     COMMIT;
--
-- ROLLBACK
--   ALTER TABLE public.challenges DROP COLUMN IF EXISTS final_winner_submission_id;
-- ============================================================================

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS final_winner_submission_id uuid
  REFERENCES public.challenge_submissions(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.challenges.final_winner_submission_id IS
  'FOCUS P3: Set ONLY by finalize_challenge() after challenge ends. NULL = not yet finalized.';
