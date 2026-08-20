-- ============================================================================
-- Migration 00027: Fix gen_random_bytes schema qualification
--
-- pgcrypto is installed in the `extensions` schema, but both claim RPCs use
-- `SET search_path = public`, so bare `gen_random_bytes()` is not found.
-- `extensions.digest()` already works because it is schema-qualified.
--
-- Fix: qualify gen_random_bytes → extensions.gen_random_bytes (4 occurrences)
-- ============================================================================

-- ── 1) create_challenge_claim ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_challenge_claim(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_submission     public.challenge_submissions%ROWTYPE;
  v_challenge      public.challenges%ROWTYPE;
  v_claim_id       uuid;
  v_code           text;
  v_token          text;
  v_code_hash      text;
  v_token_hash     text;
  v_ttl_hours      integer;
  v_claim_expires  timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to claim a prize';
  END IF;

  SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF v_submission.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Submission does not belong to you';
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
    SELECT 1 FROM public.challenge_claims
    WHERE submission_id = p_submission_id AND status != 'revoked'
  ) THEN
    RAISE EXCEPTION 'A claim already exists for this submission';
  END IF;

  v_code  := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');

  v_code_hash  := encode(extensions.digest(v_code, 'sha256'), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  v_ttl_hours := COALESCE((v_challenge.prize_config->>'claim_ttl_hours')::integer, 24);
  v_claim_expires := now() + make_interval(hours => v_ttl_hours);

  INSERT INTO public.challenge_claims (submission_id, user_id, code_hash, token_hash, expires_at)
  VALUES (p_submission_id, v_user_id, v_code_hash, v_token_hash, v_claim_expires)
  RETURNING id INTO v_claim_id;

  INSERT INTO public.challenge_audit_log (challenge_id, submission_id, claim_id, user_id, action, detail)
  VALUES (v_submission.challenge_id, p_submission_id, v_claim_id, v_user_id, 'claim_created', jsonb_build_object(
    'grade', v_submission.computed_grade, 'focus_score', v_submission.computed_focus_score
  ));

  RETURN jsonb_build_object(
    'claim_id',    v_claim_id,
    'code',        v_code,
    'token',       v_token,
    'expires_at',  v_claim_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_challenge_claim(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_challenge_claim(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_challenge_claim(uuid) TO authenticated;


-- ── 2) create_guest_claim ───────────────────────────────────────────────
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

  v_code  := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  v_token := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');

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
