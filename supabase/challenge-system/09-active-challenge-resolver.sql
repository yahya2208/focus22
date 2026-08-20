-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P9 — Global Active Challenge Override)
--
-- Type: Additive (new RPC)
-- Status: P9 APPLY
--
-- This migration adds:
--   1. get_active_challenge() RPC — returns the currently playable challenge
--
-- BEHAVIOR:
--   Normal game entry checks for an active playable challenge. If one exists,
--   the Start Game button and deep links (#/game, #/game-intro, #/countdown)
--   redirect to the challenge page instead of the normal game flow.
--
-- SELECTION RULE:
--   Only ONE challenge should be playable at a time. If multiple active
--   challenges exist with valid time windows, the RPC returns the one with
--   the earliest created_at (oldest active challenge wins). This is
--   deterministic and documented.
--
-- SECURITY:
--   Public RPC — accessible by anon + authenticated.
--   Exposes only: id, name, description.
--   Does NOT expose: prize_config, qualification_rules, campaign_id,
--   created_by, starts_at, ends_at, or any admin/internal data.
--
-- IMPORTANT: Does NOT modify any existing P2/P8 RPCs.
-- ============================================================================

-- ============================================================================
-- 1) get_active_challenge — returns the currently playable challenge
--    ACCESS: anon + authenticated (public discovery)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_active_challenge()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          uuid;
  v_name        text;
  v_description text;
BEGIN
  -- Find the first playable challenge (oldest active wins — deterministic).
  -- Only reads the 3 columns needed for the client response.
  SELECT c.id, c.name, c.description
  INTO v_id, v_name, v_description
  FROM public.challenges c
  WHERE c.status = 'active'
    AND (c.starts_at IS NULL OR now() >= c.starts_at)
    AND (c.ends_at IS NULL OR now() < c.ends_at)
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',          v_id,
    'name',        v_name,
    'description', v_description
  );
END;
$$;

-- Public access — anon can discover that the game is currently a challenge
REVOKE ALL ON FUNCTION public.get_active_challenge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_challenge() TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_challenge() TO authenticated;
