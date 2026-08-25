-- ============================================================================
-- FOCUS — B4: Admin challenge guest claim counts (MIGRATION 00043)
--
-- Purpose:
--   Both admin_list_challenges and admin_get_challenge_details currently count
--   claims ONLY from challenge_claims (authenticated). Guest claims from
--   challenge_guest_claims are invisible in admin stats.
--
-- Fix:
--   Add guest_claim_count / guest_pending / guest_redeemed alongside the
--   existing authenticated counts. No double-counting: authenticated and guest
--   counts are separate fields.
--
-- Migration type: Additive (CREATE OR REPLACE FUNCTION only)
-- ============================================================================

-- 1) admin_list_challenges — add guest_claim_count column
CREATE OR REPLACE FUNCTION public.admin_list_challenges(
  p_status text DEFAULT NULL,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id                uuid,
  name              text,
  description       text,
  campaign_id       uuid,
  status            text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  participant_count bigint,
  qualified_count   bigint,
  claim_count       bigint,
  guest_claim_count bigint,
  created_at        timestamptz
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
    (SELECT count(*) FROM public.challenge_guest_claims gc
       JOIN public.challenge_submissions cs3 ON cs3.id = gc.submission_id
       WHERE cs3.challenge_id = ch.id AND gc.status IN ('pending','claimed')) AS guest_claim_count,
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

-- 2) admin_get_challenge_details — add guest claim counts
CREATE OR REPLACE FUNCTION public.admin_get_challenge_details(
  p_challenge_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge            public.challenges%ROWTYPE;
  v_result               jsonb;
  v_winner_id            uuid;
  v_winner_name          text;
  v_winner_is_guest      boolean := false;
  v_winner_claim         text := null;
  v_winner_claim_id      uuid := null;
  v_winner_score         integer := null;
  v_winner_grade         text := null;
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
    'challenge',           to_jsonb(v_challenge),
    'participant_count',   (SELECT count(*) FROM public.challenge_submissions WHERE challenge_id = p_challenge_id),
    'qualified_count',     (SELECT count(*) FROM public.challenge_submissions WHERE challenge_id = p_challenge_id AND is_qualified),
    'claim_count',         (SELECT count(*) FROM public.challenge_claims cc
                              JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
                              WHERE cs.challenge_id = p_challenge_id),
    'pending_claims',      (SELECT count(*) FROM public.challenge_claims cc
                              JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
                              WHERE cs.challenge_id = p_challenge_id AND cc.status = 'pending'),
    'redeemed_claims',     (SELECT count(*) FROM public.challenge_claims cc
                              JOIN public.challenge_submissions cs ON cs.id = cc.submission_id
                              WHERE cs.challenge_id = p_challenge_id AND cc.status = 'claimed'),
    'guest_claim_count',   (SELECT count(*) FROM public.challenge_guest_claims gc
                              JOIN public.challenge_submissions cs ON cs.id = gc.submission_id
                              WHERE cs.challenge_id = p_challenge_id),
    'guest_pending_claims',(SELECT count(*) FROM public.challenge_guest_claims gc
                              JOIN public.challenge_submissions cs ON cs.id = gc.submission_id
                              WHERE cs.challenge_id = p_challenge_id AND gc.status = 'pending'),
    'guest_redeemed_claims',(SELECT count(*) FROM public.challenge_guest_claims gc
                              JOIN public.challenge_submissions cs ON cs.id = gc.submission_id
                              WHERE cs.challenge_id = p_challenge_id AND gc.status = 'claimed'),
    'winner_submission_id', v_winner_id,
    'winner_name',         v_winner_name,
    'winner_score',        v_winner_score,
    'winner_grade',        v_winner_grade,
    'winner_is_guest',     v_winner_is_guest,
    'winner_claim_status', v_winner_claim,
    'winner_claim_id',     v_winner_claim_id
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_challenge_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_challenge_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_challenge_details(uuid) TO authenticated;
