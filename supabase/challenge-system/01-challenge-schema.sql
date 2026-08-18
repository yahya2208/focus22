-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P2 — SCHEMA APPLY)
--
-- Type: Additive (CREATE TABLE / INDEX / POLICY only)
-- Status: P2 APPLY
--
-- SCOPE
--   * Create: challenges, challenge_submissions, challenge_claims,
--     challenge_audit_log
--   * Indexes, RLS policies
--   * updated_at trigger for challenges
--
-- SECURITY
--   All writes go through SECURITY DEFINER RPCs (03-challenge-rpcs.sql).
--   No direct client writes to any table. RLS enforced.
--
-- HOW IT RUNS
--   Run as `postgres` in the Supabase SQL Editor inside a single transaction:
--     BEGIN;
--     <this file>
--     <02-challenge-scoring.sql>
--     <03-challenge-rpcs.sql>
--     <05-challenge-audit-trigger.sql>
--     COMMIT;
--   Roll back with 04-challenge-rollback.sql.
-- ============================================================================

-- ============================================================================
-- 0) EXTENSION — pgcrypto for digest() (SHA-256 claim hashing)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1) TABLES
-- ============================================================================

-- 1.1) challenges — challenge configuration
CREATE TABLE IF NOT EXISTS public.challenges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text,
  campaign_id         uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','paused','ended','archived')),
  starts_at           timestamptz,
  ends_at             timestamptz,
  qualification_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  prize_config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.challenges IS 'FOCUS Challenge System — challenge configuration and lifecycle';

COMMENT ON COLUMN public.challenges.qualification_rules IS
  'JSONB: {"min_score":80, "min_grade":"B", "challenge_limit":3, "require_authenticated":false}';
COMMENT ON COLUMN public.challenges.prize_config IS
  'JSONB: {"description":"...", "max_winners":10, "claim_ttl_hours":24, "tiers":[{"grade":"A","prize":"...","max_winners":3}]}';

-- 1.2) challenge_submissions — one row per game submission
CREATE TABLE IF NOT EXISTS public.challenge_submissions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id                uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id                     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_id            text,
  campaign_id                 uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,

  raw_rts                     integer[] NOT NULL,
  display_lag_ms              real NOT NULL,
  input_lag_ms                real NOT NULL,
  platform                    text NOT NULL DEFAULT 'unknown',

  computed_focus_score        integer NOT NULL,
  computed_grade              text NOT NULL,
  computed_rt_score           integer NOT NULL,
  computed_consistency_score  integer NOT NULL,
  computed_fatigue_score      integer NOT NULL,

  total_rounds                integer NOT NULL DEFAULT 7,
  valid_rounds                integer NOT NULL,
  submitted_at                timestamptz NOT NULL DEFAULT now(),

  nonce                       text NOT NULL UNIQUE,
  session_id                  text,

  is_qualified                boolean NOT NULL DEFAULT false,
  qualified_at                timestamptz,

  CONSTRAINT chk_round_count CHECK (array_length(raw_rts, 1) = 7),
  CONSTRAINT chk_score_range CHECK (computed_focus_score BETWEEN 0 AND 100),
  CONSTRAINT chk_grade CHECK (computed_grade IN ('A','B','C','D','F')),
  CONSTRAINT chk_identity CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

COMMENT ON TABLE public.challenge_submissions IS
  'FOCUS Challenge System — server-validated game submissions. Raw telemetry protected by RLS; leaderboard served via SECURITY DEFINER RPC only.';

-- 1.3) challenge_claims — prize claim tokens
CREATE TABLE IF NOT EXISTS public.challenge_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.challenge_submissions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  code_hash     text NOT NULL UNIQUE,
  token_hash    text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','claimed','expired','revoked')),
  expires_at    timestamptz NOT NULL,
  claimed_at    timestamptz,
  claimed_by    uuid REFERENCES auth.users(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.challenge_claims IS
  'FOCUS Challenge System — SHA-256 hashed claim codes/tokens. Plaintext returned once to user, never stored.';

-- 1.4) challenge_audit_log — immutable audit trail
CREATE TABLE IF NOT EXISTS public.challenge_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid REFERENCES public.challenges(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.challenge_submissions(id) ON DELETE SET NULL,
  claim_id      uuid REFERENCES public.challenge_claims(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  detail        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.challenge_audit_log IS
  'FOCUS Challenge System — immutable audit trail for challenge lifecycle events.';

-- ============================================================================
-- 2) INDEXES
-- ============================================================================

-- challenges
CREATE INDEX IF NOT EXISTS idx_challenges_status ON public.challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_campaign ON public.challenges(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_challenges_active ON public.challenges(status, starts_at, ends_at);

-- challenge_submissions
CREATE INDEX IF NOT EXISTS idx_cs_challenge ON public.challenge_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_cs_user ON public.challenge_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_score ON public.challenge_submissions(challenge_id, computed_focus_score DESC, submitted_at ASC);
CREATE INDEX IF NOT EXISTS idx_cs_nonce ON public.challenge_submissions(nonce);
CREATE INDEX IF NOT EXISTS idx_cs_submitted ON public.challenge_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_qualified ON public.challenge_submissions(challenge_id, is_qualified) WHERE is_qualified = true;

-- challenge_claims
CREATE INDEX IF NOT EXISTS idx_cc_code_hash ON public.challenge_claims(code_hash);
CREATE INDEX IF NOT EXISTS idx_cc_token_hash ON public.challenge_claims(token_hash);
CREATE INDEX IF NOT EXISTS idx_cc_user ON public.challenge_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_status ON public.challenge_claims(status);

-- challenge_audit_log
CREATE INDEX IF NOT EXISTS idx_cal_challenge ON public.challenge_audit_log(challenge_id);
CREATE INDEX IF NOT EXISTS idx_cal_action ON public.challenge_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_cal_created ON public.challenge_audit_log(created_at DESC);

-- ============================================================================
-- 3) ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_audit_log ENABLE ROW LEVEL SECURITY;

-- 3.1) challenges — public read for active/ended, admin write
DROP POLICY IF EXISTS "challenges_select_public" ON public.challenges;
CREATE POLICY "challenges_select_public" ON public.challenges
  FOR SELECT USING (status IN ('active','paused','ended'));

DROP POLICY IF EXISTS "challenges_admin_all" ON public.challenges;
CREATE POLICY "challenges_admin_all" ON public.challenges
  FOR ALL USING (public.catalog_is_admin());

-- 3.2) challenge_submissions — NO public read (raw telemetry protection)
--     All access via SECURITY DEFINER RPCs only.
--     Users can read their own rows (for personal stats).
DROP POLICY IF EXISTS "cs_admin_read" ON public.challenge_submissions;
CREATE POLICY "cs_admin_read" ON public.challenge_submissions
  FOR SELECT USING (public.catalog_is_admin());

DROP POLICY IF EXISTS "cs_user_read_own" ON public.challenge_submissions;
CREATE POLICY "cs_user_read_own" ON public.challenge_submissions
  FOR SELECT USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies — all writes via SECURITY DEFINER RPCs.

-- 3.3) challenge_claims — user read own, admin all
DROP POLICY IF EXISTS "cc_user_read_own" ON public.challenge_claims;
CREATE POLICY "cc_user_read_own" ON public.challenge_claims
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cc_admin_all" ON public.challenge_claims;
CREATE POLICY "cc_admin_all" ON public.challenge_claims
  FOR ALL USING (public.catalog_is_admin());

-- 3.4) challenge_audit_log — admin read only
DROP POLICY IF EXISTS "cal_admin_read" ON public.challenge_audit_log;
CREATE POLICY "cal_admin_read" ON public.challenge_audit_log
  FOR SELECT USING (public.catalog_is_admin());
