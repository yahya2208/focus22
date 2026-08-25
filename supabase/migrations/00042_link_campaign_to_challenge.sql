-- ============================================================================
-- FOCUS — Link Campaign to Challenge (P0 QR Safety)
--
-- Type: Additive
-- Status: FILE ONLY — owner applies in Supabase SQL Editor
--
-- SCOPE
--   * Add challenge_id column to campaigns (nullable FK → challenges)
--   * Update lookup_campaign_by_short_code v1 RPC to return challenge_id
--   * Index for efficient challenge_id lookups
--
-- RATIONALE
--   Campaign QR codes (/c/ABC123) currently bypass challenge detection entirely.
--   When a campaign is linked to a specific challenge via challenge_id, scanning
--   the QR routes deterministically to challenge-page — no RPC dependency.
--
-- SECURITY
--   challenge_id is nullable: regular campaigns (NULL) keep normal game flow.
--   Only campaigns explicitly linked to a challenge (UUID set) trigger the
--   challenge-page redirect. No new RPCs, no new table access patterns.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_campaigns_challenge_id;
--   ALTER TABLE public.campaigns DROP COLUMN IF EXISTS challenge_id;
--   (RPC reverts to original v1 signature via 00007 re-apply)
-- ============================================================================

-- 1) Add nullable challenge_id column to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS challenge_id uuid
  REFERENCES public.challenges(id) ON DELETE SET NULL;

-- 2) Partial index: only non-null challenge_id values need indexing
CREATE INDEX IF NOT EXISTS idx_campaigns_challenge_id
  ON public.campaigns (challenge_id)
  WHERE challenge_id IS NOT NULL;

-- 3) Update v1 lookup RPC to return challenge_id (additive contract extension)
--    Existing consumers that don't read challenge_id are unaffected.
CREATE OR REPLACE FUNCTION public.lookup_campaign_by_short_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  short_code TEXT,
  name TEXT,
  is_active BOOLEAN,
  challenge_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, short_code, name, is_active, challenge_id
  FROM public.campaigns
  WHERE short_code = TRIM(p_code)
    AND is_active = true;
$$;

-- Preserve existing grants (no change needed — same function signature, additive columns)
COMMENT ON FUNCTION public.lookup_campaign_by_short_code(TEXT) IS
  'Used by QR flow. Contract verified by behavior tests in data-service. Extended with challenge_id for challenge-linked campaigns.';
