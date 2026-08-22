-- ============================================================================
-- Migration 00034: recover_my_challenge_state — server-side winner recovery
-- ============================================================================
-- PURPOSE
--   Winner Persistence & Recovery Fix. Lets a player rebuild their FULL
--   challenge state from SERVER TRUTH alone — no localStorage, no URL params,
--   no device state — as long as they hold the SAME auth identity
--   (authenticated account OR the same Supabase anonymous session).
--
-- OWNERSHIP MODEL (proof of ownership):
--   * Identity = auth.uid() ONLY. Never accepts a client-supplied
--     user_id / guest_session_id / submission_id as proof.
--   * The submission is matched strictly via user_id = auth.uid().
--     (All submissions created through the app carry user_id = the signing-in
--      identity — including anonymous sessions.)
--
-- NON-GOALS (untouched by design):
--   * submit_challenge_score, scoring, ranking rules
--   * finalize_challenge / challenges.final_winner_submission_id semantics
--   * claim creation rules — this function NEVER creates/mutates claims
--
-- SECURITY
--   SECURITY DEFINER (submissions RLS blocks cross-user reads by design);
--   executable by authenticated AND anonymous (guests must recover too).
--   Returns NO raw RTs, no nonce, no hashes, no other players' data.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recover_my_challenge_state(
  p_challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_best       public.challenge_submissions%ROWTYPE;
  v_total      integer;
  v_rank       bigint;
  v_winner_id  uuid;
  v_claim      public.challenge_claims%ROWTYPE;
  v_guest_claim public.challenge_guest_claims%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ── Own best qualified submission (mirrors get_challenge_public_info) ──
  SELECT * INTO v_best
  FROM public.challenge_submissions
  WHERE challenge_id = p_challenge_id
    AND user_id = v_uid
    AND is_qualified = true
  ORDER BY computed_focus_score DESC, submitted_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_submission', false,
      'total_submissions',
        (SELECT count(*) FROM public.challenge_submissions
          WHERE challenge_id = p_challenge_id AND user_id = v_uid)
    );
  END IF;

  SELECT count(*) INTO v_total
  FROM public.challenge_submissions
  WHERE challenge_id = p_challenge_id AND user_id = v_uid;

  -- ── Personal rank (same ordering as leaderboard/public info) ──────────
  WITH leaderboard AS (
    SELECT cs.id,
           ROW_NUMBER() OVER (
             ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC
           ) AS rk
    FROM public.challenge_submissions cs
    WHERE cs.challenge_id = p_challenge_id AND cs.is_qualified = true
  )
  SELECT lk.rk INTO v_rank
  FROM leaderboard lk
  WHERE lk.id = v_best.id;

  -- ── Winner flag: server truth only ────────────────────────────────────
  SELECT final_winner_submission_id INTO v_winner_id
  FROM public.challenges
  WHERE id = p_challenge_id;

  -- ── Existing claim (READ-ONLY): reuse state, never recreate ───────────
  SELECT * INTO v_claim
  FROM public.challenge_claims
  WHERE submission_id = v_best.id AND status != 'revoked'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_guest_claim
    FROM public.challenge_guest_claims
    WHERE submission_id = v_best.id AND status != 'revoked'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'has_submission',    true,
    'submission_id',     v_best.id,
    'focus_score',       v_best.computed_focus_score,
    'grade',             v_best.computed_grade,
    'is_qualified',      v_best.is_qualified,
    'personal_rank',     COALESCE(v_rank, 0),
    'total_submissions', COALESCE(v_total, 0),
    'submitted_at',      v_best.submitted_at,
    'is_final_winner',   (v_winner_id IS NOT NULL AND v_winner_id = v_best.id),
    'claim', CASE
      WHEN v_claim.id IS NOT NULL THEN jsonb_build_object(
        'claim_id',       v_claim.id,
        'status',         v_claim.status,
        'expires_at',     v_claim.expires_at,
        'claimed_at',     v_claim.claimed_at,
        'is_guest_claim', false
      )
      WHEN v_guest_claim.id IS NOT NULL THEN jsonb_build_object(
        'claim_id',       v_guest_claim.id,
        'status',         v_guest_claim.status,
        'expires_at',     v_guest_claim.expires_at,
        'claimed_at',     v_guest_claim.claimed_at,
        'is_guest_claim', true
      )
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_my_challenge_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_my_challenge_state(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.recover_my_challenge_state(uuid) TO authenticated;
