-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P2 — RPCs + SECURITY)
--
-- Type: Additive (CREATE FUNCTION + REVOKE + GRANT)
-- Status: P2 APPLY
--
-- SECURITY PATTERN (canonical, from catalog-central/30-catalog-brands-schema.sql):
--   SECURITY DEFINER
--   SET search_path = public
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--   REVOKE EXECUTE ON FUNCTION ... FROM anon;   (when auth-only)
--   GRANT EXECUTE ON FUNCTION ... TO authenticated;
--   GRANT EXECUTE ON FUNCTION ... TO anon;       (when public-facing)
--
-- AUDIT ACTIONS
--   score_submitted, score_qualified, claim_created, claim_verified,
--   prize_redeemed, claim_expired, claim_revoked
-- ============================================================================

-- ============================================================================
-- 1) submit_challenge_score — post-game server submission
--    ACCESS: anon + authenticated (guests may submit, but claims require auth)
--    ANTI-CHEAT: server recomputes score from raw RTs, nonce uniqueness,
--                rate limit (10/hour), RT range validation, calibration bounds
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_challenge_score(
  p_challenge_id     uuid,
  p_raw_rts          integer[],
  p_display_lag_ms   real,
  p_input_lag_ms     real,
  p_platform         text,
  p_nonce            text,
  p_session_id       text DEFAULT NULL,
  p_guest_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_challenge       public.challenges%ROWTYPE;
  v_rules           jsonb;
  v_count           integer;
  v_submission_id   uuid;
  v_computed        jsonb;
  v_focus_score     integer;
  v_grade           text;
  v_is_qualified    boolean := false;
  v_rank            integer;
  v_challenge_limit integer;
  v_valid_rounds    integer;
  v_i               integer;
BEGIN
  -- ── Challenge validation ──────────────────────────────────────────────
  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;
  IF v_challenge.status != 'active' THEN
    RAISE EXCEPTION 'Challenge is not active';
  END IF;
  IF v_challenge.starts_at IS NOT NULL AND now() < v_challenge.starts_at THEN
    RAISE EXCEPTION 'Challenge has not started';
  END IF;
  IF v_challenge.ends_at IS NOT NULL AND now() > v_challenge.ends_at THEN
    RAISE EXCEPTION 'Challenge has ended';
  END IF;

  -- ── Nonce uniqueness (idempotency) ───────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.challenge_submissions WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate submission';
  END IF;

  -- ── Rate limit: 10/hour abuse protection ─────────────────────────────
  IF v_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.challenge_submissions
      WHERE user_id = v_user_id
        AND submitted_at > now() - interval '1 hour';
  ELSE
    SELECT count(*) INTO v_count FROM public.challenge_submissions
      WHERE guest_session_id = p_guest_session_id
        AND submitted_at > now() - interval '1 hour';
  END IF;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  -- ── Validate raw_rts: exactly 7, each 100–2000ms ─────────────────────
  IF array_length(p_raw_rts, 1) != 7 THEN
    RAISE EXCEPTION 'Expected exactly 7 reaction times';
  END IF;
  FOR v_i IN 1..7 LOOP
    IF p_raw_rts[v_i] < 100 OR p_raw_rts[v_i] > 2000 THEN
      RAISE EXCEPTION 'Reaction time out of valid range';
    END IF;
  END LOOP;

  -- ── Validate calibration bounds ──────────────────────────────────────
  IF p_display_lag_ms < 0 OR p_display_lag_ms > 100 THEN
    RAISE EXCEPTION 'Invalid display lag';
  END IF;
  IF p_input_lag_ms < 0 OR p_input_lag_ms > 50 THEN
    RAISE EXCEPTION 'Invalid input lag';
  END IF;

  -- ── Server recomputation (compute_challenge_score in 02-scoring.sql) ─
  v_computed := public.compute_challenge_score(
    p_raw_rts, p_display_lag_ms::double precision, p_input_lag_ms::double precision
  );
  v_focus_score := (v_computed->>'focus_score')::integer;
  v_grade := v_computed->>'grade';

  -- ── Valid rounds count ───────────────────────────────────────────────
  SELECT count(*) INTO v_valid_rounds FROM unnest(p_raw_rts) t(rt)
    WHERE (t.rt::double precision - p_display_lag_ms - p_input_lag_ms) > 0;

  -- ── Qualification check ──────────────────────────────────────────────
  v_rules := COALESCE(v_challenge.qualification_rules, '{}'::jsonb);
  v_is_qualified := true;

  -- require_authenticated gate
  IF (v_rules->>'require_authenticated')::boolean IS DISTINCT FROM true
     OR v_user_id IS NOT NULL THEN
    -- not required, OR user is authenticated — proceed
    NULL;
  ELSE
    v_is_qualified := false;
  END IF;

  -- min_score gate
  IF v_rules->>'min_score' IS NOT NULL THEN
    IF v_focus_score < (v_rules->>'min_score')::integer THEN
      v_is_qualified := false;
    END IF;
  END IF;

  -- min_grade gate
  IF v_rules->>'min_grade' IS NOT NULL THEN
    IF v_grade > (v_rules->>'min_grade')::text THEN
      v_is_qualified := false;
    END IF;
  END IF;

  -- challenge_limit gate (separate from rate limit — Point 8)
  v_challenge_limit := COALESCE((v_rules->>'challenge_limit')::integer, 999);
  IF v_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.challenge_submissions
      WHERE challenge_id = p_challenge_id AND user_id = v_user_id;
  ELSE
    SELECT count(*) INTO v_count FROM public.challenge_submissions
      WHERE challenge_id = p_challenge_id AND guest_session_id = p_guest_session_id;
  END IF;
  IF v_count >= v_challenge_limit THEN
    v_is_qualified := false;
  END IF;

  -- ── Insert submission (Point 2: v_submission_id uuid) ────────────────
  INSERT INTO public.challenge_submissions (
    challenge_id, user_id, guest_session_id, campaign_id,
    raw_rts, display_lag_ms, input_lag_ms, platform,
    computed_focus_score, computed_grade, computed_rt_score,
    computed_consistency_score, computed_fatigue_score,
    total_rounds, valid_rounds, nonce, session_id,
    is_qualified, qualified_at
  ) VALUES (
    p_challenge_id, v_user_id, p_guest_session_id, v_challenge.campaign_id,
    p_raw_rts, p_display_lag_ms, p_input_lag_ms, COALESCE(p_platform, 'unknown'),
    v_focus_score, v_grade,
    (v_computed->>'rt_score')::integer,
    (v_computed->>'consistency_score')::integer,
    (v_computed->>'fatigue_score')::integer,
    7, v_valid_rounds,
    p_nonce, p_session_id,
    v_is_qualified, CASE WHEN v_is_qualified THEN now() ELSE NULL END
  )
  RETURNING id INTO v_submission_id;

  -- ── Deterministic rank (Point 9: score DESC, submitted_at ASC, id ASC)
  SELECT count(*) + 1 INTO v_rank FROM public.challenge_submissions
    WHERE challenge_id = p_challenge_id
      AND (
        computed_focus_score > v_focus_score
        OR (
          computed_focus_score = v_focus_score
          AND submitted_at < (SELECT submitted_at FROM public.challenge_submissions WHERE id = v_submission_id)
        )
        OR (
          computed_focus_score = v_focus_score
          AND submitted_at = (SELECT submitted_at FROM public.challenge_submissions WHERE id = v_submission_id)
          AND id < v_submission_id
        )
      );

  -- ── Audit log ────────────────────────────────────────────────────────
  INSERT INTO public.challenge_audit_log (challenge_id, submission_id, user_id, action, detail)
  VALUES (p_challenge_id, v_submission_id, v_user_id, 'score_submitted', jsonb_build_object(
    'focus_score', v_focus_score, 'grade', v_grade, 'platform', p_platform,
    'guest_session_id', p_guest_session_id
  ));

  IF v_is_qualified THEN
    INSERT INTO public.challenge_audit_log (challenge_id, submission_id, user_id, action, detail)
    VALUES (p_challenge_id, v_submission_id, v_user_id, 'score_qualified', jsonb_build_object(
      'focus_score', v_focus_score, 'grade', v_grade
    ));
  END IF;

  -- ── Return (NO claim generation — Point 3) ──────────────────────────
  RETURN jsonb_build_object(
    'submission_id',  v_submission_id,
    'focus_score',    v_focus_score,
    'grade',          v_grade,
    'rank',           v_rank,
    'is_qualified',   v_is_qualified
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_challenge_score(uuid, integer[], real, real, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_challenge_score(uuid, integer[], real, real, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_challenge_score(uuid, integer[], real, real, text, text, text, text) TO authenticated;


-- ============================================================================
-- 2) create_challenge_claim — manual claim (Point 3)
--    ACCESS: authenticated only
--    ATOMICITY: FOR UPDATE on challenges row prevents race conditions (Point 5)
--    SECURITY: gen_random_bytes for credentials, SHA-256 hashed (Point 4)
-- ============================================================================

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
  v_prize_config   jsonb;
  v_max_winners    integer;
  v_current_winners integer;
  v_claim_id       uuid;
  v_code           text;
  v_token          text;
  v_code_hash      text;
  v_token_hash     text;
  v_ttl_hours      integer;
  v_claim_expires  timestamptz;
  v_tier           jsonb;
BEGIN
  -- ── Auth required ────────────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to claim a prize';
  END IF;

  -- ── Submission exists and belongs to user ────────────────────────────
  SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF v_submission.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Submission does not belong to you';
  END IF;

  -- ── Submission is qualified ──────────────────────────────────────────
  IF NOT v_submission.is_qualified THEN
    RAISE EXCEPTION 'Submission is not qualified for a prize';
  END IF;

  -- ── Lock challenge row (FOR UPDATE) to prevent race conditions ──────
  SELECT * INTO v_challenge FROM public.challenges
    WHERE id = v_submission.challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;
  IF v_challenge.status NOT IN ('active', 'ended') THEN
    RAISE EXCEPTION 'Challenge is not in a valid state for claiming';
  END IF;

  -- ── No existing claim for this submission ────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.challenge_claims
    WHERE submission_id = p_submission_id AND status != 'revoked'
  ) THEN
    RAISE EXCEPTION 'A claim already exists for this submission';
  END IF;

  -- ── Winner limits (atomic, under FOR UPDATE lock — Point 5) ─────────
  v_prize_config := COALESCE(v_challenge.prize_config, '{}'::jsonb);
  v_max_winners := COALESCE((v_prize_config->>'max_winners')::integer, 999999);

  SELECT count(*) INTO v_current_winners FROM public.challenge_claims cc
    JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
    WHERE cs.challenge_id = v_submission.challenge_id
      AND cc.status IN ('pending', 'claimed');

  IF v_current_winners >= v_max_winners THEN
    RAISE EXCEPTION 'Maximum number of winners has been reached';
  END IF;

  -- Tier-specific winner limits
  IF v_prize_config->'tiers' IS NOT NULL THEN
    FOR v_tier IN SELECT * FROM jsonb_array_elements(v_prize_config->'tiers')
    LOOP
      IF (v_tier->>'grade') = v_submission.computed_grade THEN
        IF (v_tier->>'max_winners') IS NOT NULL THEN
          SELECT count(*) INTO v_current_winners FROM public.challenge_claims cc
            JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
            WHERE cs.challenge_id = v_submission.challenge_id
              AND cs.computed_grade = v_submission.computed_grade
              AND cc.status IN ('pending', 'claimed');
          IF v_current_winners >= (v_tier->>'max_winners')::integer THEN
            RAISE EXCEPTION 'Maximum winners for this grade tier has been reached';
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ── Generate cryptographically secure credentials (Point 4) ──────────
  v_code  := upper(encode(gen_random_bytes(4), 'hex'));
  v_token := encode(gen_random_bytes(24), 'base64url');

  v_code_hash  := encode(extensions.digest(v_code, 'sha256'), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  v_ttl_hours := COALESCE((v_prize_config->>'claim_ttl_hours')::integer, 24);
  v_claim_expires := now() + make_interval(hours => v_ttl_hours);

  -- ── Atomic insert ────────────────────────────────────────────────────
  INSERT INTO public.challenge_claims (submission_id, user_id, code_hash, token_hash, expires_at)
  VALUES (p_submission_id, v_user_id, v_code_hash, v_token_hash, v_claim_expires)
  RETURNING id INTO v_claim_id;

  -- ── Audit ────────────────────────────────────────────────────────────
  INSERT INTO public.challenge_audit_log (challenge_id, submission_id, claim_id, user_id, action, detail)
  VALUES (v_submission.challenge_id, p_submission_id, v_claim_id, v_user_id, 'claim_created', jsonb_build_object(
    'grade', v_submission.computed_grade, 'focus_score', v_submission.computed_focus_score
  ));

  -- ── Return plaintext ONCE (never stored) ─────────────────────────────
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


-- ============================================================================
-- 3) verify_claim_token — QR scan / manual code entry
--    ACCESS: anon + authenticated (shop staff may not have accounts)
--    Accepts either claim_code or claim_token (hashes input, looks up by hash)
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
  v_submission    public.challenge_submissions%ROWTYPE;
  v_challenge     public.challenges%ROWTYPE;
  v_display_name  text;
BEGIN
  -- ── Hash the input and look up by code_hash or token_hash ────────────
  v_hash := encode(extensions.digest(p_identifier, 'sha256'), 'hex');

  SELECT * INTO v_claim FROM public.challenge_claims
    WHERE code_hash = v_hash OR token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status',  'invalid',
      'message', 'Claim code not found'
    );
  END IF;

  -- ── Auto-expire if past TTL ──────────────────────────────────────────
  IF v_claim.status = 'pending' AND v_claim.expires_at < now() THEN
    UPDATE public.challenge_claims SET status = 'expired' WHERE id = v_claim.id;
    v_claim.status := 'expired';
    INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
    VALUES (v_claim.id, v_claim.user_id, 'claim_expired');
  END IF;

  -- ── Get submission + challenge for display ───────────────────────────
  SELECT * INTO v_submission FROM public.challenge_submissions WHERE id = v_claim.submission_id;
  SELECT * INTO v_challenge FROM public.challenges WHERE id = v_submission.challenge_id;
  SELECT display_name INTO v_display_name FROM public.users WHERE id = v_claim.user_id;

  -- ── Audit ────────────────────────────────────────────────────────────
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
    'claimed_at',    v_claim.claimed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_claim_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_claim_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_claim_token(text) TO authenticated;


-- ============================================================================
-- 4) admin_process_claim — redeem / revoke
--    ACCESS: authenticated + catalog_is_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_process_claim(
  p_claim_id uuid,
  p_action   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.challenge_claims%ROWTYPE;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_claim FROM public.challenge_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF p_action = 'redeem' THEN
    IF v_claim.status != 'pending' THEN
      RAISE EXCEPTION 'Claim is not in pending status';
    END IF;
    IF v_claim.expires_at < now() THEN
      UPDATE public.challenge_claims SET status = 'expired' WHERE id = p_claim_id;
      INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
      VALUES (p_claim_id, auth.uid(), 'claim_expired');
      RAISE EXCEPTION 'Claim has expired';
    END IF;
    UPDATE public.challenge_claims
      SET status = 'claimed', claimed_at = now(), claimed_by = auth.uid()
      WHERE id = p_claim_id;
    INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
    VALUES (p_claim_id, auth.uid(), 'prize_redeemed');

  ELSIF p_action = 'revoke' THEN
    IF v_claim.status NOT IN ('pending', 'claimed') THEN
      RAISE EXCEPTION 'Claim cannot be revoked in current status';
    END IF;
    UPDATE public.challenge_claims
      SET status = 'revoked', claimed_by = auth.uid()
      WHERE id = p_claim_id;
    INSERT INTO public.challenge_audit_log (claim_id, user_id, action)
    VALUES (p_claim_id, auth.uid(), 'claim_revoked');

  ELSE
    RAISE EXCEPTION 'Invalid action. Use ''redeem'' or ''revoke''';
  END IF;

  RETURN jsonb_build_object(
    'status', (SELECT status FROM public.challenge_claims WHERE id = p_claim_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_claim(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_process_claim(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_process_claim(uuid, text) TO authenticated;


-- ============================================================================
-- 5) get_challenge_leaderboard — public leaderboard (Point 7)
--    ACCESS: anon + authenticated
--    Returns ONLY: rank, display_name, focus_score, grade, submitted_at
--    NEVER exposes: raw RTs, calibration, user IDs, session IDs
--    Deterministic ranking: score DESC, submitted_at ASC, id ASC (Point 9)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_challenge_leaderboard(
  p_challenge_id uuid,
  p_period       text DEFAULT 'all_time',
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE (
  rank         bigint,
  display_name text,
  focus_score  integer,
  grade        text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      cs.computed_focus_score,
      cs.computed_grade,
      cs.submitted_at,
      COALESCE(u.display_name, 'Anonymous') AS dn,
      cs.id AS cs_id,
      ROW_NUMBER() OVER (
        ORDER BY cs.computed_focus_score DESC, cs.submitted_at ASC, cs.id ASC
      ) AS rk
    FROM public.challenge_submissions cs
    LEFT JOIN public.users u ON u.id = cs.user_id
    WHERE cs.challenge_id = p_challenge_id
      AND cs.is_qualified = true
      AND (
        p_period = 'all_time'
        OR (p_period = 'weekly' AND cs.submitted_at >= now() - interval '7 days')
        OR (p_period = 'daily'  AND cs.submitted_at >= now() - interval '1 day')
      )
  )
  SELECT r.rk, r.dn, r.computed_focus_score, r.computed_grade, r.submitted_at
  FROM ranked r
  WHERE r.rk > p_offset AND r.rk <= p_offset + LEAST(p_limit, 100)
  ORDER BY r.rk;
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_leaderboard(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_leaderboard(uuid, text, integer, integer) TO authenticated;


-- ============================================================================
-- 6) get_personal_challenge_stats
--    ACCESS: authenticated only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_personal_challenge_stats(
  p_challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_best_score   integer;
  v_best_grade   text;
  v_total        integer;
  v_last_at      timestamptz;
  v_rank         bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT computed_focus_score, computed_grade
    INTO v_best_score, v_best_grade
  FROM public.challenge_submissions
  WHERE challenge_id = p_challenge_id
    AND user_id = v_user_id
    AND is_qualified = true
  ORDER BY computed_focus_score DESC, submitted_at ASC
  LIMIT 1;

  SELECT count(*), max(submitted_at)
    INTO v_total, v_last_at
  FROM public.challenge_submissions
  WHERE challenge_id = p_challenge_id
    AND user_id = v_user_id;

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

  RETURN jsonb_build_object(
    'best_score',       v_best_score,
    'best_grade',       v_best_grade,
    'total_submissions', COALESCE(v_total, 0),
    'last_submission_at', v_last_at,
    'personal_rank',    COALESCE(v_rank, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_personal_challenge_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_personal_challenge_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_personal_challenge_stats(uuid) TO authenticated;


-- ============================================================================
-- 7) admin_list_challenges — admin challenge list
--    ACCESS: authenticated + catalog_is_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_challenges(
  p_status text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id              uuid,
  name            text,
  description     text,
  campaign_id     uuid,
  status          text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  participant_count bigint,
  qualified_count bigint,
  claim_count     bigint,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    ch.id, ch.name, ch.description, ch.campaign_id, ch.status,
    ch.starts_at, ch.ends_at,
    (SELECT count(*) FROM public.challenge_submissions cs WHERE cs.challenge_id = ch.id) AS participant_count,
    (SELECT count(*) FROM public.challenge_submissions cs WHERE cs.challenge_id = ch.id AND cs.is_qualified) AS qualified_count,
    (SELECT count(*) FROM public.challenge_claims cc
       JOIN public.challenge_submissions cs2 ON cs2.id = cc.submission_id
       WHERE cs2.challenge_id = ch.id AND cc.status IN ('pending','claimed')) AS claim_count,
    ch.created_at
  FROM public.challenges ch
  WHERE (p_status IS NULL OR ch.status = p_status)
  ORDER BY ch.created_at DESC
  LIMIT LEAST(p_limit, 100)
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_challenges(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_challenges(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_challenges(text, integer, integer) TO authenticated;


-- ============================================================================
-- 8) admin_get_challenge_details — admin challenge detail
--    ACCESS: authenticated + catalog_is_admin()
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
  v_challenge public.challenges%ROWTYPE;
  v_result    jsonb;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
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
                           WHERE cs.challenge_id = p_challenge_id AND cc.status = 'claimed')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_challenge_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_challenge_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_challenge_details(uuid) TO authenticated;


-- ============================================================================
-- 9) admin_create_challenge
--    ACCESS: authenticated + catalog_is_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_challenge(
  p_name                text,
  p_description         text DEFAULT NULL,
  p_campaign_id         uuid DEFAULT NULL,
  p_starts_at           timestamptz DEFAULT NULL,
  p_ends_at             timestamptz DEFAULT NULL,
  p_qualification_rules jsonb DEFAULT '{}'::jsonb,
  p_prize_config        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge_id uuid;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  INSERT INTO public.challenges (
    name, description, campaign_id, starts_at, ends_at,
    qualification_rules, prize_config, created_by
  ) VALUES (
    p_name, p_description, p_campaign_id, p_starts_at, p_ends_at,
    p_qualification_rules, p_prize_config, auth.uid()
  )
  RETURNING id INTO v_challenge_id;

  INSERT INTO public.challenge_audit_log (challenge_id, user_id, action, detail)
  VALUES (v_challenge_id, auth.uid(), 'challenge_created', jsonb_build_object(
    'name', p_name, 'campaign_id', p_campaign_id
  ));

  RETURN (SELECT to_jsonb(ch) FROM public.challenges ch WHERE id = v_challenge_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_challenge(text, text, uuid, timestamptz, timestamptz, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_challenge(text, text, uuid, timestamptz, timestamptz, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_challenge(text, text, uuid, timestamptz, timestamptz, jsonb, jsonb) TO authenticated;


-- ============================================================================
-- 10) admin_update_challenge
--     ACCESS: authenticated + catalog_is_admin()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_challenge(
  p_challenge_id uuid,
  p_updates      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.challenges%ROWTYPE;
BEGIN
  IF NOT public.catalog_is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO v_challenge FROM public.challenges WHERE id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  UPDATE public.challenges SET
    name                = COALESCE(p_updates->>'name', name),
    description         = COALESCE(p_updates->>'description', description),
    status              = COALESCE(p_updates->>'status', status),
    starts_at           = COALESCE((p_updates->>'starts_at')::timestamptz, starts_at),
    ends_at             = COALESCE((p_updates->>'ends_at')::timestamptz, ends_at),
    qualification_rules = COALESCE(p_updates->'qualification_rules', qualification_rules),
    prize_config        = COALESCE(p_updates->'prize_config', prize_config),
    campaign_id         = COALESCE((p_updates->>'campaign_id')::uuid, campaign_id)
  WHERE id = p_challenge_id;

  INSERT INTO public.challenge_audit_log (challenge_id, user_id, action, detail)
  VALUES (p_challenge_id, auth.uid(), 'challenge_updated', p_updates);

  RETURN (SELECT to_jsonb(ch) FROM public.challenges ch WHERE id = p_challenge_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_challenge(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_challenge(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_challenge(uuid, jsonb) TO authenticated;
