-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM — E2E COMPETITION VERIFICATION
--
-- Run each section SEPARATELY in Supabase SQL Editor.
-- Prerequisites:
--   - P2 RPCs deployed (03-challenge-rpcs.sql)
--   - final_winner_submission_id column exists (07-challenge-final-winner.sql)
--   - At least one admin user in public.users (role = 'admin')
--
-- Test uses DIRECT INSERT for submissions (bypasses RPCs) because
-- submit_challenge_score requires auth.uid() JWT context which
-- cannot be faked from SQL Editor. Ranking/leader logic is verified
-- at the database level.
--
-- Replace CHALLENGE_ID below with your actual test challenge ID.
-- If no challenge exists, run Section 0 first to create one.
-- ============================================================================


-- ============================================================================
-- SECTION 0: CREATE TEST CHALLENGE (skip if you have one)
-- ============================================================================

-- Option A: use existing active challenge
SELECT id, name, status, final_winner_submission_id
FROM public.challenges
WHERE status = 'active'
LIMIT 5;

-- Option B: create a fresh test challenge (admin required)
-- Uncomment and run this block:
/*
SELECT public.admin_create_challenge(
  'E2E Test Challenge',
  'Automated competition verification',
  NULL,                 -- campaign_id
  NULL,                 -- starts_at (null = active immediately)
  NULL,                 -- ends_at   (null = runs until manually ended)
  '{}'::jsonb,          -- qualification_rules
  '{"description": "E2E test prize", "claim_ttl_hours": 24}'::jsonb
);
*/

-- COPY THE CHALLENGE ID from above and paste it here:
-- (This variable is referenced by all sections below)
DO $$
DECLARE
  CHALLENGE_ID uuid := 'CHANGEME';
BEGIN
  RAISE NOTICE 'Test challenge: %', CHALLENGE_ID;
END $$;


-- ============================================================================
-- SECTION 1: PLAYER A SUBMITS QUALIFIED SCORE → BECOMES #1
-- ============================================================================

-- 1a. Get 3 test users (must exist in public.users with auth accounts)
SELECT id, display_name, role FROM public.users
WHERE id IN (
  SELECT DISTINCT user_id FROM public.challenge_submissions
  WHERE is_qualified = true
  LIMIT 3
);

-- OR use these placeholder UUIDs (replace with real user IDs from your DB):
-- Player A: 00000000-0000-0000-0000-0000000000AA
-- Player B: 00000000-0000-0000-0000-0000000000BB
-- Player C: 00000000-0000-0000-0000-0000000000CC

-- 1b. Insert Player A's submission (focus_score = 75, grade C)
INSERT INTO public.challenge_submissions (
  challenge_id, user_id, guest_session_id, campaign_id,
  raw_rts, display_lag_ms, input_lag_ms, platform,
  computed_focus_score, computed_grade, computed_rt_score,
  computed_consistency_score, computed_fatigue_score,
  total_rounds, valid_rounds, nonce, session_id,
  is_qualified, qualified_at
) VALUES (
  'CHANGEME',                             -- replace with CHALLENGE_ID
  '00000000-0000-0000-0000-0000000000AA', -- Player A
  NULL, NULL,
  ARRAY[350, 360, 340, 355, 365, 345, 358]::integer[],
  16.0, 12.0, 'test',
  75, 'C', 50, 80, 90,
  7, 7, 'e2e-nonce-a1', NULL,
  true, now()
)
RETURNING id, user_id, computed_focus_score, computed_grade, is_qualified;

-- 1c. Verify Player A is #1
SELECT
  cs.id,
  cs.user_id,
  cs.computed_focus_score,
  cs.computed_grade,
  cs.is_qualified,
  (SELECT count(*) + 1 FROM public.challenge_submissions cs2
   WHERE cs2.challenge_id = cs.challenge_id
     AND cs2.is_qualified = true
     AND (
       cs2.computed_focus_score > cs.computed_focus_score
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at < cs.submitted_at)
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at = cs.submitted_at AND cs2.id < cs.id)
     )
  ) AS rank
FROM public.challenge_submissions cs
WHERE cs.nonce = 'e2e-nonce-a1';

-- EXPECTED: rank = 1, is_qualified = true


-- ============================================================================
-- SECTION 2: PLAYER B SUBMITS HIGHER SCORE → BECOMES #1, A DROPS TO #2
-- ============================================================================

INSERT INTO public.challenge_submissions (
  challenge_id, user_id, guest_session_id, campaign_id,
  raw_rts, display_lag_ms, input_lag_ms, platform,
  computed_focus_score, computed_grade, computed_rt_score,
  computed_consistency_score, computed_fatigue_score,
  total_rounds, valid_rounds, nonce, session_id,
  is_qualified, qualified_at
) VALUES (
  'CHANGEME',
  '00000000-0000-0000-0000-0000000000BB', -- Player B
  NULL, NULL,
  ARRAY[200, 210, 195, 205, 215, 200, 210]::integer[],
  16.0, 12.0, 'test',
  92, 'A', 85, 95, 98,
  7, 7, 'e2e-nonce-b1', NULL,
  true, now()
)
RETURNING id, user_id, computed_focus_score, computed_grade, is_qualified;

-- Verify ranking: B should be #1, A should be #2
SELECT
  cs.id,
  cs.user_id,
  cs.computed_focus_score,
  cs.computed_grade,
  (SELECT count(*) + 1 FROM public.challenge_submissions cs2
   WHERE cs2.challenge_id = cs.challenge_id
     AND cs2.is_qualified = true
     AND (
       cs2.computed_focus_score > cs.computed_focus_score
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at < cs.submitted_at)
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at = cs.submitted_at AND cs2.id < cs.id)
     )
  ) AS rank
FROM public.challenge_submissions cs
WHERE cs.challenge_id = 'CHANGEME'
  AND cs.is_qualified = true
ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC;

-- EXPECTED: B = #1 (score 92), A = #2 (score 75)
-- VERIFY: No claim exists for either player
SELECT count(*) AS claims_count FROM public.challenge_claims cc
JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
WHERE cs.challenge_id = 'CHANGEME';

-- EXPECTED: claims_count = 0 (no intermediate claims!)


-- ============================================================================
-- SECTION 3: PLAYER C SUBMITS HIGHEST SCORE → BECOMES #1
-- ============================================================================

INSERT INTO public.challenge_submissions (
  challenge_id, user_id, guest_session_id, campaign_id,
  raw_rts, display_lag_ms, input_lag_ms, platform,
  computed_focus_score, computed_grade, computed_rt_score,
  computed_consistency_score, computed_fatigue_score,
  total_rounds, valid_rounds, nonce, session_id,
  is_qualified, qualified_at
) VALUES (
  'CHANGEME',
  '00000000-0000-0000-0000-0000000000CC', -- Player C
  NULL, NULL,
  ARRAY[150, 155, 148, 152, 158, 150, 153]::integer[],
  16.0, 12.0, 'test',
  98, 'A', 95, 98, 100,
  7, 7, 'e2e-nonce-c1', NULL,
  true, now()
)
RETURNING id, user_id, computed_focus_score, computed_grade, is_qualified;

-- Full ranking view
SELECT
  cs.id,
  cs.user_id,
  cs.computed_focus_score,
  cs.computed_grade,
  cs.submitted_at,
  (SELECT count(*) + 1 FROM public.challenge_submissions cs2
   WHERE cs2.challenge_id = cs.challenge_id
     AND cs2.is_qualified = true
     AND (
       cs2.computed_focus_score > cs.computed_focus_score
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at < cs.submitted_at)
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at = cs.submitted_at AND cs2.id < cs.id)
     )
  ) AS rank
FROM public.challenge_submissions cs
WHERE cs.challenge_id = 'CHANGEME'
  AND cs.is_qualified = true
ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC;

-- EXPECTED: C = #1 (98), B = #2 (92), A = #3 (75)
-- VERIFY: Still no claims
SELECT count(*) AS claims_count FROM public.challenge_claims cc
JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
WHERE cs.challenge_id = 'CHANGEME';

-- EXPECTED: 0


-- ============================================================================
-- SECTION 4: VERIFY CURRENT LEADER IS INFORMATIONAL ONLY
-- ============================================================================

-- Call get_challenge_public_info (public, no auth required)
-- Replace challenge ID:
SELECT public.get_challenge_public_info('CHANGEME');

-- EXPECTED: top_5 shows C at rank 1, user object has personal_rank
-- VERIFY: No claim_id, no claim_status, no has_active_claim anywhere in the response

-- If you have an authenticated session, also test recovery:
-- SELECT public.recover_current_leader_state('CHANGEME');
-- EXPECTED: is_current_leader = true for C, NO claim_id/claim_status fields


-- ============================================================================
-- SECTION 5: END THE CHALLENGE
-- ============================================================================

-- Update challenge status to 'ended' (admin RPC required, or direct UPDATE)
-- Option A: via RPC (must be logged in as admin)
-- SELECT public.admin_update_challenge('CHANGEME', '{"status": "ended"}'::jsonb);

-- Option B: direct UPDATE (if RPC not available from SQL Editor)
UPDATE public.challenges
SET status = 'ended', updated_at = now()
WHERE id = 'CHANGEME'
RETURNING id, name, status, final_winner_submission_id;

-- Verify status = 'ended' and final_winner_submission_id IS NULL (not yet finalized)
SELECT id, status, final_winner_submission_id
FROM public.challenges WHERE id = 'CHANGEME';

-- EXPECTED: status = 'ended', final_winner_submission_id = NULL


-- ============================================================================
-- SECTION 6: RUN finalize_challenge()
-- ============================================================================

-- Must be logged in as admin in Supabase dashboard
SELECT public.finalize_challenge('CHANGEME');

-- EXPECTED: { winner_id: <C's submission id>, focus_score: 98, grade: 'A', ... }


-- ============================================================================
-- SECTION 7: VERIFY FINAL WINNER STORED
-- ============================================================================

SELECT id, status, final_winner_submission_id
FROM public.challenges WHERE id = 'CHANGEME';

-- EXPECTED: final_winner_submission_id IS NOT NULL

-- Verify it belongs to Player C (#1 at finalization)
SELECT
  cs.id AS submission_id,
  cs.user_id,
  cs.computed_focus_score,
  cs.computed_grade,
  (SELECT count(*) + 1 FROM public.challenge_submissions cs2
   WHERE cs2.challenge_id = cs.challenge_id
     AND cs2.is_qualified = true
     AND (
       cs2.computed_focus_score > cs.computed_focus_score
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at < cs.submitted_at)
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at = cs.submitted_at AND cs2.id < cs.id)
     )
  ) AS rank_at_finalization
FROM public.challenge_submissions cs
WHERE cs.id = (
  SELECT final_winner_submission_id FROM public.challenges WHERE id = 'CHANGEME'
);

-- EXPECTED: rank_at_finalization = 1, user = Player C


-- ============================================================================
-- SECTION 8: VERIFY ONLY FINAL WINNER CAN CLAIM
-- ============================================================================

-- Get all 3 submission IDs
SELECT cs.id, cs.user_id, cs.computed_focus_score,
  CASE
    WHEN cs.id = (SELECT final_winner_submission_id FROM public.challenges WHERE id = 'CHANGEME')
    THEN 'FINAL WINNER'
    ELSE 'not winner'
  END AS winner_status
FROM public.challenge_submissions cs
WHERE cs.challenge_id = 'CHANGEME' AND cs.is_qualified = true
ORDER BY cs.computed_focus_score DESC;

-- Try to claim with Player A (NOT the winner) — should FAIL
-- (Must be logged in as Player A in Supabase dashboard)
-- SELECT public.create_challenge_claim('A_submission_id_here');
-- EXPECTED: ERROR "Challenge has not been finalized" or "Submission is not the final winner"

-- Try to claim with Player B (NOT the winner) — should FAIL
-- SELECT public.create_challenge_claim('B_submission_id_here');
-- EXPECTED: ERROR "Submission is not the final winner"

-- Claim with Player C (THE FINAL WINNER) — should SUCCEED
-- (Must be logged in as Player C in Supabase dashboard)
-- SELECT public.create_challenge_claim('C_submission_id_here');
-- EXPECTED: { claim_id: ..., code: "XXXXXXXX", token: "...", expires_at: ... }

-- Verify exactly 1 claim exists
SELECT count(*) AS total_claims FROM public.challenge_claims cc
JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
WHERE cs.challenge_id = 'CHANGEME';

-- EXPECTED: 1 (or 0 if claim step was skipped)


-- ============================================================================
-- SECTION 9: VERIFY IDEMPOTENCY — finalize_challenge CANNOT CHANGE WINNER
-- ============================================================================

-- Run finalize_challenge again (must be logged in as admin)
-- SELECT public.finalize_challenge('CHANGEME');

-- EXPECTED: { winner_id: <same C submission>, already_finalized: true }

-- Verify final_winner_submission_id is unchanged
SELECT id, final_winner_submission_id
FROM public.challenges WHERE id = 'CHANGEME';

-- EXPECTED: same submission ID as before


-- ============================================================================
-- SECTION 10: VERIFY TIMESTAMPS TIEBREAKER
-- ============================================================================

-- Insert two submissions with identical scores (tiebreaker = submitted_at ASC)
-- First player gets earlier timestamp → should win the tie

INSERT INTO public.challenge_submissions (
  challenge_id, user_id, guest_session_id, campaign_id,
  raw_rts, display_lag_ms, input_lag_ms, platform,
  computed_focus_score, computed_grade, computed_rt_score,
  computed_consistency_score, computed_fatigue_score,
  total_rounds, valid_rounds, nonce, session_id,
  is_qualified, qualified_at
) VALUES (
  'CHANGEME',
  '00000000-0000-0000-0000-0000000000AA', -- Player A again
  NULL, NULL,
  ARRAY[200, 200, 200, 200, 200, 200, 200]::integer[],
  16.0, 12.0, 'test',
  92, 'A', 85, 95, 98,  -- same score as B
  7, 7, 'e2e-nonce-tie1-early', NULL,
  true, now() - interval '10 minutes'  -- EARLIER timestamp
);

INSERT INTO public.challenge_submissions (
  challenge_id, user_id, guest_session_id, campaign_id,
  raw_rts, display_lag_ms, input_lag_ms, platform,
  computed_focus_score, computed_grade, computed_rt_score,
  computed_consistency_score, computed_fatigue_score,
  total_rounds, valid_rounds, nonce, session_id,
  is_qualified, qualified_at
) VALUES (
  'CHANGEME',
  '00000000-0000-0000-0000-0000000000BB', -- Player B again
  NULL, NULL,
  ARRAY[200, 200, 200, 200, 200, 200, 200]::integer[],
  16.0, 12.0, 'test',
  92, 'A', 85, 95, 98,  -- same score
  7, 7, 'e2e-nonce-tie2-late', NULL,
  true, now()  -- LATER timestamp
);

-- Verify ranking of the two tied submissions
SELECT
  cs.id,
  cs.user_id,
  cs.nonce,
  cs.computed_focus_score,
  cs.submitted_at,
  (SELECT count(*) + 1 FROM public.challenge_submissions cs2
   WHERE cs2.challenge_id = cs.challenge_id
     AND cs2.is_qualified = true
     AND (
       cs2.computed_focus_score > cs.computed_focus_score
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at < cs.submitted_at)
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at = cs.submitted_at AND cs2.id < cs.id)
     )
  ) AS rank
FROM public.challenge_submissions cs
WHERE cs.nonce IN ('e2e-nonce-tie1-early', 'e2e-nonce-tie2-late')
ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC;

-- EXPECTED: early timestamp = higher rank (lower number)


-- ============================================================================
-- SECTION 11: VERIFY UNQUALIFIED SUBMISSIONS EXCLUDED FROM RANKING
-- ============================================================================

INSERT INTO public.challenge_submissions (
  challenge_id, user_id, guest_session_id, campaign_id,
  raw_rts, display_lag_ms, input_lag_ms, platform,
  computed_focus_score, computed_grade, computed_rt_score,
  computed_consistency_score, computed_fatigue_score,
  total_rounds, valid_rounds, nonce, session_id,
  is_qualified, qualified_at
) VALUES (
  'CHANGEME',
  '00000000-0000-0000-0000-0000000000CC', -- Player C
  NULL, NULL,
  ARRAY[100, 100, 100, 100, 100, 100, 100]::integer[],
  16.0, 12.0, 'test',
  20, 'F', 10, 30, 50,  -- LOW score but is_qualified = false
  7, 7, 'e2e-nonce-unqualified', NULL,
  false, NULL            -- NOT qualified
);

-- Verify unqualified submission is excluded from ranking
SELECT
  cs.nonce,
  cs.computed_focus_score,
  cs.is_qualified,
  (SELECT count(*) + 1 FROM public.challenge_submissions cs2
   WHERE cs2.challenge_id = cs.challenge_id
     AND cs2.is_qualified = true
     AND (
       cs2.computed_focus_score > cs.computed_focus_score
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at < cs.submitted_at)
       OR (cs2.computed_focus_score = cs.computed_focus_score AND cs2.submitted_at = cs.submitted_at AND cs2.id < cs.id)
     )
  ) AS rank_among_qualified
FROM public.challenge_submissions cs
WHERE cs.challenge_id = 'CHANGEME'
  AND cs.nonce = 'e2e-nonce-unqualified';

-- EXPECTED: rank_among_qualified = 6 (counted against 5 qualified submissions, not excluded)
-- VERIFY: The get_challenge_leaderboard RPC excludes it
SELECT * FROM public.get_challenge_leaderboard('CHANGEME');

-- EXPECTED: Unqualified submission NOT in the results


-- ============================================================================
-- SECTION 12: VERIFY AUDIT LOG
-- ============================================================================

SELECT
  action,
  count(*) AS occurrences,
  min(created_at) AS first_at,
  max(created_at) AS last_at
FROM public.challenge_audit_log
WHERE challenge_id = 'CHANGEME'
GROUP BY action
ORDER BY action;

-- EXPECTED actions (at minimum):
--   challenge_created    (1x)
--   challenge_updated    (1x, from status change)
--   challenge_finalized  (1x)


-- ============================================================================
-- SECTION 13: FINAL STATE VERIFICATION
-- ============================================================================

-- 13a. Challenge state
SELECT
  id, name, status,
  final_winner_submission_id,
  created_at, updated_at
FROM public.challenges WHERE id = 'CHANGEME';

-- 13b. All submissions ranked
SELECT
  row_number() OVER (ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC) AS rank,
  cs.id,
  cs.user_id,
  cs.computed_focus_score,
  cs.computed_grade,
  cs.is_qualified,
  cs.submitted_at,
  CASE
    WHEN cs.id = (SELECT final_winner_submission_id FROM public.challenges WHERE id = 'CHANGEME')
    THEN 'FINAL WINNER'
    ELSE '-'
  END AS winner_status
FROM public.challenge_submissions cs
WHERE cs.challenge_id = 'CHANGEME'
ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC;

-- 13c. Claims
SELECT
  cc.id AS claim_id,
  cc.submission_id,
  cc.user_id,
  cc.status,
  cc.expires_at
FROM public.challenge_claims cc
JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
WHERE cs.challenge_id = 'CHANGEME';


-- ============================================================================
-- CLEANUP (uncomment to remove test data)
-- ============================================================================

/*
DELETE FROM public.challenge_audit_log WHERE challenge_id = 'CHANGEME';
DELETE FROM public.challenge_claims WHERE submission_id IN (
  SELECT id FROM public.challenge_submissions WHERE challenge_id = 'CHANGEME'
);
DELETE FROM public.challenge_submissions WHERE challenge_id = 'CHANGEME';
DELETE FROM public.challenges WHERE id = 'CHANGEME';
*/


-- ============================================================================
-- EXPECTED RESULTS SUMMARY
-- ============================================================================
--
-- Section  | Check                                      | Expected
-- -------- | ------------------------------------------ | --------
-- 1c       | Player A rank after submission             | #1
-- 2        | Player B rank after submission             | #1, A → #2
-- 2        | Claims count after B submits               | 0
-- 3        | Player C rank after submission             | #1, B #2, A #3
-- 3        | Claims count after C submits               | 0
-- 4        | get_challenge_public_info response         | No has_active_claim
-- 5        | Challenge status after end                 | 'ended'
-- 6        | finalize_challenge return                  | C is winner
-- 7        | final_winner_submission_id                 = C's submission
-- 7        | Rank of final winner                       | 1
-- 8        | A/B create_challenge_claim                 | REJECTED
-- 8        | C create_challenge_claim                   | ACCEPTED
-- 9        | finalize_challenge (2nd call)              | already_finalized: true
-- 10       | Tiebreaker: earlier timestamp wins         | early < late
-- 11       | Unqualified in leaderboard                 | NOT present
-- 12       | Audit log has all expected actions         | All present
-- ============================================================================
