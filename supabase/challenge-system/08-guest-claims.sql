-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P8 — Guest Claims + Winner Info)
--
-- Type: Additive (new table + new RPCs + modified RPCs)
-- Status: P8 APPLY
--
-- This migration adds:
--   1. challenge_guest_claims table (for guest final winners)
--   2. claim_guest_submission RPC (guest → authenticated ownership transfer)
--   3. create_guest_claim RPC (guest winner prize code generation)
--   4. admin_process_guest_claim RPC (admin redeem/revoke for guest claims)
--   5. Modified verify_claim_token (fallback to guest claims)
--   6. Modified admin_get_challenge_details (winner info)
--   7. Modified get_challenge_public_info (finalization status)
--
-- IMPORTANT: Does NOT touch submit_challenge_score, create_challenge_claim,
-- finalize_challenge, get_challenge_leaderboard, recover_current_leader_state,
-- or any existing P2/P3 winner model behavior.
-- ============================================================================


-- ============================================================================
-- 1) challenge_guest_claims — prize claims for guest final winners
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.challenge_guest_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES public.challenge_submissions(id) ON DELETE CASCADE,
  challenge_id    uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  code_hash       text NOT NULL UNIQUE,
  token_hash      text NOT NULL UNIQUE,
  guest_session_id text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','claimed','expired','revoked')),
  expires_at      timestamptz NOT NULL,
  claimed_at      timestamptz,
  claimed_by      uuid REFERENCES auth.users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cgc_code_hash  ON public.challenge_guest_claims(code_hash);
CREATE INDEX IF NOT EXISTS idx_cgc_token_hash ON public.challenge_guest_claims(token_hash);
CREATE INDEX IF NOT EXISTS idx_cgc_submission ON public.challenge_guest_claims(submission_id);
CREATE INDEX IF NOT EXISTS idx_cgc_status     ON public.challenge_guest_claims(status);

COMMENT ON TABLE public.challenge_guest_claims IS
  'Prize claims for guest final winners. Separate from challenge_claims (which requires auth.users).';

ALTER TABLE public.challenge_guest_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY cgc_admin_all ON public.challenge_guest_claims
  FOR ALL USING (public.catalog_is_admin());

COMMENT ON COLUMN public.challenge_guest_claims.guest_session_id IS
  'The guest_session_id from the original submission. Used for ownership verification.';


-- ============================================================================
-- 2) claim_guest_submission — guest → authenticated ownership transfer
--    ACCESS: authenticated only
--    Transfers a guest submission to the authenticated user after signup.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_guest_submission(
  p_submission_id    uuid,
  p_guest_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_submission   public.challenge_submissions%ROWTYPE;
  v_rank         integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_submission.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Submission already has an owner';
  END IF;

  IF v_submission.guest_session_id IS DISTINCT FROM p_guest_session_id THEN
    RAISE EXCEPTION 'Guest session does not match';
  END IF;

  UPDATE public.challenge_submissions
    SET user_id = v_user_id
  WHERE id = p_submission_id;

  SELECT count(*) + 1 INTO v_rank FROM public.challenge_submissions
    WHERE challenge_id = v_submission.challenge_id
      AND is_qualified = true
      AND (
        computed_focus_score > v_submission.computed_focus_score
        OR (
          computed_focus_score = v_submission.computed_focus_score
          AND submitted_at < v_submission.submitted_at
        )
        OR (
          computed_focus_score = v_submission.computed_focus_score
          AND submitted_at = v_submission.submitted_at
          AND id < v_submission.id
        )
      );

  INSERT INTO public.challenge_audit_log (challenge_id, submission_id, user_id, action, detail)
  VALUES (v_submission.challenge_id, p_submission_id, v_user_id, 'guest_submission_claimed', jsonb_build_object(
    'guest_session_id', p_guest_session_id,
    'focus_score', v_submission.computed_focus_score,
    'grade', v_submission.computed_grade
  ));

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'focus_score',   v_submission.computed_focus_score,
    'grade',         v_submission.computed_grade,
    'rank',          v_rank
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guest_submission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_guest_submission(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_guest_submission(uuid, text) TO authenticated;


-- ============================================================================
-- 3) create_guest_claim — prize code for guest final winner
--    ACCESS: anon + authenticated (guest may not have session yet)
--    Generates a one-time claim code for a guest who is the final winner.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_guest_claim(
  p_submission_id    uuid,
  p_guest_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission    public.challenge_submissions%ROWTYPE;
  v_challenge     public.challenges%ROWTYPE;
  v_claim_id      uuid;
  v_code          text;
  v_token         text;
  v_code_hash     text;
  v_token_hash    text;
  v_ttl_hours     integer;
  v_claim_expires timestamptz;
BEGIN
  SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF v_submission.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Submission has an authenticated owner — use create_challenge_claim instead';
  END IF;

  IF v_submission.guest_session_id IS DISTINCT FROM p_guest_session_id THEN
    RAISE EXCEPTION 'Guest session does not match';
  END IF;

  IF NOT v_submission.is_qualified THEN
    RAISE EXCEPTION 'Submission is not qualified for a prize';
  END IF;

  SELECT * INTO v_challenge FROM public.challenges
    WHERE id = v_submission.challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF v_challenge.final_winner_submission_id IS NULL THEN
    RAISE EXCEPTION 'Challenge has not been finalized';
  END IF;

  IF v_challenge.final_winner_submission_id IS DISTINCT FROM p_submission_id THEN
    RAISE EXCEPTION 'Submission is not the final winner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.challenge_guest_claims
    WHERE submission_id = p_submission_id AND status != 'revoked'
  ) THEN
    RAISE EXCEPTION 'A claim already exists for this submission';
  END IF;

  v_code  := upper(encode(gen_random_bytes(4), 'hex'));
  v_token := encode(gen_random_bytes(24), 'base64url');

  v_code_hash  := encode(extensions.digest(v_code, 'sha256'), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  v_ttl_hours := COALESCE((v_challenge.prize_config->>'claim_ttl_hours')::integer, 168);
  v_claim_expires := now() + make_interval(hours => v_ttl_hours);

  INSERT INTO public.challenge_guest_claims (
    submission_id, challenge_id, code_hash, token_hash, guest_session_id, expires_at
  ) VALUES (
    p_submission_id, v_submission.challenge_id, v_code_hash, v_token_hash, p_guest_session_id, v_claim_expires
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.challenge_audit_log (challenge_id, submission_id, claim_id, action, detail)
  VALUES (v_submission.challenge_id, p_submission_id, v_claim_id, 'guest_claim_created', jsonb_build_object(
    'guest_session_id', p_guest_session_id,
    'grade', v_submission.computed_grade,
    'focus_score', v_submission.computed_focus_score
  ));

  RETURN jsonb_build_object(
    'claim_id',   v_claim_id,
    'code',       v_code,
    'token',      v_token,
    'expires_at', v_claim_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_claim(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_claim(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_guest_claim(uuid, text) TO authenticated;


-- ============================================================================
-- 4) admin_process_guest_claim — redeem / revoke for guest claims
--    ACCESS: authenticated + catalog_is_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_process_guest_claim(
  p_claim_id uuid,
  p_action   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.challenge_guest_claims%ROWTYPE;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_claim FROM public.challenge_guest_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest claim not found';
  END IF;

  IF p_action = 'redeem' THEN
    IF v_claim.status != 'pending' THEN
      RAISE EXCEPTION 'Claim is not in pending status';
    END IF;
    IF v_claim.expires_at < now() THEN
      UPDATE public.challenge_guest_claims SET status = 'expired' WHERE id = p_claim_id;
      INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
      VALUES (p_claim_id, auth.uid(), 'claim_expired');
      RAISE EXCEPTION 'Claim has expired';
    END IF;
    UPDATE public.challenge_guest_claims
      SET status = 'claimed', claimed_at = now(), claimed_by = auth.uid()
      WHERE id = p_claim_id;
    INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
    VALUES (p_claim_id, auth.uid(), 'guest_prize_redeemed');

  ELSIF p_action = 'revoke' THEN
    IF v_claim.status NOT IN ('pending', 'claimed') THEN
      RAISE EXCEPTION 'Claim cannot be revoked in current status';
    END IF;
    UPDATE public.challenge_guest_claims
      SET status = 'revoked', claimed_by = auth.uid()
      WHERE id = p_claim_id;
    INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
    VALUES (p_claim_id, auth.uid(), 'guest_claim_revoked');

  ELSE
    RAISE EXCEPTION 'Invalid action. Use ''redeem'' or ''revoke''';
  END IF;

  RETURN jsonb_build_object(
    'status', (SELECT status FROM public.challenge_guest_claims WHERE id = p_claim_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_guest_claim(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_process_guest_claim(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_process_guest_claim(uuid, text) TO authenticated;


-- ============================================================================
-- 5) Modified verify_claim_token — fallback to guest claims
--     Unchanged signature. Now searches challenge_guest_claims when
--     challenge_claims lookup fails.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_claim_token(
  p_identifier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash          text;
  v_claim         public.challenge_claims%ROWTYPE;
  v_guest_claim   public.challenge_guest_claims%ROWTYPE;
  v_submission    public.challenge_submissions%ROWTYPE;
  v_challenge     public.challenges%ROWTYPE;
  v_display_name  text;
  v_is_guest      boolean := false;
BEGIN
  v_hash := encode(extensions.digest(p_identifier, 'sha256'), 'hex');

  -- First: search authenticated claims
  SELECT * INTO v_claim FROM public.challenge_claims
    WHERE code_hash = v_hash OR token_hash = v_hash;

  IF FOUND THEN
    -- Auto-expire if past TTL
    IF v_claim.status = 'pending' AND v_claim.expires_at < now() THEN
      UPDATE public.challenge_claims SET status = 'expired' WHERE id = v_claim.id;
      v_claim.status := 'expired';
      INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
      VALUES (v_claim.id, v_claim.user_id, 'claim_expired');
    END IF;

    SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = v_claim.submission_id;
    SELECT * INTO v_challenge FROM public.challenges WHERE id = v_submission.challenge_id;
    SELECT display_name INTO v_display_name FROM public.users WHERE id = v_claim.user_id;

    INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
    VALUES (v_claim.id, auth.uid(), 'claim_verified');

    RETURN jsonb_build_object(
      'claim_id',      v_claim.id,
      'status',        v_claim.status,
      'challenge_name', v_challenge.name,
      'focus_score',   v_submission.computed_focus_score,
      'grade',         v_submission.computed_grade,
      'display_name',  COALESCE(v_display_name, 'Anonymous'),
      'expires_at',    v_claim.expires_at,
      'claimed_at',    v_claim.claimed_at,
      'is_guest_claim', false
    );
  END IF;

  -- Second: search guest claims
  SELECT * INTO v_guest_claim FROM public.challenge_guest_claims
    WHERE code_hash = v_hash OR token_hash = v_hash;

  IF FOUND THEN
    IF v_guest_claim.status = 'pending' AND v_guest_claim.expires_at < now() THEN
      UPDATE public.challenge_guest_claims SET status = 'expired' WHERE id = v_guest_claim.id;
      v_guest_claim.status := 'expired';
      INSERT INTO public.challenge_audit_log (claim_id, action)
      VALUES (v_guest_claim.id, 'claim_expired');
    END IF;

    SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = v_guest_claim.submission_id;
    SELECT * INTO v_challenge FROM public.challenges WHERE id = v_submission.challenge_id;

    INSERT INTO public.challenge_audit_log (claim_id, action)
    VALUES (v_guest_claim.id, 'claim_verified');

    RETURN jsonb_build_object(
      'claim_id',      v_guest_claim.id,
      'status',        v_guest_claim.status,
      'challenge_name', v_challenge.name,
      'focus_score',   v_submission.computed_focus_score,
      'grade',         v_submission.computed_grade,
      'display_name',  'Guest',
      'expires_at',    v_guest_claim.expires_at,
      'claimed_at',    v_guest_claim.claimed_at,
      'is_guest_claim', true
    );
  END IF;

  RETURN jsonb_build_object(
    'status',  'invalid',
    'message', 'Claim code not found'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_claim_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_claim_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_claim_token(text) TO authenticated;


-- ============================================================================
-- 6) Modified admin_get_challenge_details — includes winner info
--     Adds: final_winner_submission_id, winner_name, winner_is_guest,
--     winner_claim_status, winner_claim_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_challenge_details(
  p_challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge       public.challenges%ROWTYPE;
  v_result          jsonb;
  v_winner_id       uuid;
  v_winner_name     text;
  v_winner_is_guest boolean := false;
  v_winner_claim    text := null;
  v_winner_claim_id uuid := null;
  v_winner_score    integer := null;
  v_winner_grade    text := null;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  v_winner_id := v_challenge.final_winner_submission_id;

  IF v_winner_id IS NOT NULL THEN
    SELECT cs.computed_focus_score, cs.computed_grade,
           CASE WHEN cs.user_id IS NULL THEN 'Guest'
                ELSE COALESCE(u.display_name, 'Unknown')
           END,
           cs.user_id IS NULL
      INTO v_winner_score, v_winner_grade, v_winner_name, v_winner_is_guest
    FROM public.challenge_submissions cs
    LEFT JOIN public.users u ON u.id = cs.user_id
    WHERE cs.id = v_winner_id;

    -- Check for authenticated claim
    SELECT cc.id, cc.status INTO v_winner_claim_id, v_winner_claim
    FROM public.challenge_claims cc
    WHERE cc.submission_id = v_winner_id
    LIMIT 1;

    -- If no auth claim, check for guest claim
    IF v_winner_claim_id IS NULL THEN
      SELECT gc.id, gc.status INTO v_winner_claim_id, v_winner_claim
      FROM public.challenge_guest_claims gc
      WHERE gc.submission_id = v_winner_id
      LIMIT 1;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'challenge',        to_jsonb(v_challenge),
    'participant_count', (SELECT count(*) FROM public.challenge_submissions WHERE challenge_id = p_challenge_id),
    'qualified_count',  (SELECT count(*) FROM public.challenge_submissions WHERE challenge_id = p_challenge_id AND is_qualified),
    'claim_count',      (SELECT count(*) FROM public.challenge_claims cc
                           JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
                           WHERE cs.challenge_id = p_challenge_id),
    'pending_claims',   (SELECT count(*) FROM public.challenge_claims cc
                           JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
                           WHERE cs.challenge_id = p_challenge_id AND cc.status = 'pending'),
    'redeemed_claims',  (SELECT count(*) FROM public.challenge_claims cc
                           JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
                           WHERE cs.challenge_id = p_challenge_id AND cc.status = 'claimed'),
    'winner_submission_id', v_winner_id,
    'winner_name',      v_winner_name,
    'winner_score',     v_winner_score,
    'winner_grade',     v_winner_grade,
    'winner_is_guest',  v_winner_is_guest,
    'winner_claim_status', v_winner_claim,
    'winner_claim_id',  v_winner_claim_id
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_challenge_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_challenge_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_challenge_details(uuid) TO authenticated;


-- ============================================================================
-- 7) Modified get_challenge_public_info — includes finalization status
--     Adds: is_finalized, final_winner_name (public only, no private info)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_challenge_public_info(
  p_challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
  v_challenge      public.challenges%ROWTYPE;
  v_user_id        uuid := auth.uid();
  v_best_score     integer;
  v_best_grade     text;
  v_best_sub_id    uuid;
  v_total          integer;
  v_rank           bigint;
  v_top5           jsonb;
  v_is_finalized   boolean;
  v_winner_name    text;
  v_winner_sub_id  uuid;
BEGIN
  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  v_is_finalized := v_challenge.final_winner_submission_id IS NOT NULL;
  v_winner_sub_id := v_challenge.final_winner_submission_id;

  IF v_is_finalized THEN
    SELECT CASE WHEN cs.user_id IS NULL THEN 'Guest'
                ELSE COALESCE(u.display_name, 'Anonymous')
           END
      INTO v_winner_name
    FROM public.challenge_submissions cs
    LEFT JOIN public.users u ON u.id = cs.user_id
    WHERE cs.id = v_challenge.final_winner_submission_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'rank',         r.rk,
    'display_name', r.dn,
    'focus_score',  r.computed_focus_score,
    'grade',        r.computed_grade
  )) INTO v_top5
  FROM (
    SELECT
      cs.computed_focus_score,
      cs.computed_grade,
      COALESCE(u.display_name, 'Anonymous') AS dn,
      ROW_NUMBER() OVER (
        ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC
      ) AS rk
    FROM public.challenge_submissions cs
    LEFT JOIN public.users u ON u.id = cs.user_id
    WHERE cs.challenge_id = p_challenge_id AND cs.is_qualified = true
  ) r
  WHERE r.rk <= 5;

  IF v_user_id IS NOT NULL THEN
    SELECT computed_focus_score, computed_grade, id
      INTO v_best_score, v_best_grade, v_best_sub_id
    FROM public.challenge_submissions
    WHERE challenge_id = p_challenge_id AND user_id = v_user_id AND is_qualified = true
    ORDER BY computed_focus_score DESC, submitted_at ASC
    LIMIT 1;

    SELECT count(*) INTO v_total FROM public.challenge_submissions
      WHERE challenge_id = p_challenge_id AND user_id = v_user_id;

    WITH leaderboard AS (
      SELECT cs.id,
             ROW_NUMBER() OVER (
               ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC
             ) AS rk
      FROM public.challenge_submissions cs
      WHERE cs.challenge_id = p_challenge_id AND cs.is_qualified = true
    )
    SELECT lk.rk INTO v_rank FROM leaderboard lk
      JOIN public.challenge_submissions cs2 ON cs2.id = lk.id
      WHERE cs2.user_id = v_user_id AND cs2.is_qualified = true
    ORDER BY cs2.computed_focus_score DESC, cs2.submitted_at ASC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'challenge', jsonb_build_object(
      'id',                 v_challenge.id,
      'name',               v_challenge.name,
      'description',        v_challenge.description,
      'status',             v_challenge.status,
      'starts_at',          v_challenge.starts_at,
      'ends_at',            v_challenge.ends_at,
      'prize_description',  v_challenge.prize_config->>'description',
      'is_finalized',       v_is_finalized,
      'final_winner_name',  v_winner_name,
      'winner_submission_id', v_winner_sub_id
    ),
    'top_5', COALESCE(v_top5, '[]'::jsonb),
    'user', CASE WHEN v_user_id IS NOT NULL THEN jsonb_build_object(
      'best_score',        v_best_score,
      'best_grade',        v_best_grade,
      'best_submission_id', v_best_sub_id,
      'personal_rank',     COALESCE(v_rank, 0),
      'total_submissions',  COALESCE(v_total, 0)
    ) ELSE null END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_public_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_public_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_public_info(uuid) TO authenticated;
