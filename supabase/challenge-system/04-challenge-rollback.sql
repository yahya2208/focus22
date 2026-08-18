-- ============================================================================
-- FOCUS — CHALLENGE SYSTEM (P2 — ROLLBACK)
--
-- Type: Subtractive (DROP everything created by 01–03 + 05)
-- Status: P2 ROLLBACK
--
-- HOW IT RUNS
--   Run as `postgres` in the Supabase SQL Editor inside a single transaction:
--     BEGIN;
--     <this file>
--     COMMIT;
--
-- ORDER
--   Drop in reverse dependency order:
--     5) RPCs (03)
--     4) Scoring function (02)
--     3) Audit trigger (05)
--     2) RLS policies
--     1) Indexes
--     0) Tables
--     -) Extension (pgcrypto — shared, skip if other objects depend on it)
-- ============================================================================

-- ============================================================================
-- 1) DROP RPCs (from 03-challenge-rpcs.sql)
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_update_challenge(uuid, jsonb);
DROP FUNCTION IF EXISTS public.admin_create_challenge(text, text, uuid, timestamptz, timestamptz, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.admin_get_challenge_details(uuid);
DROP FUNCTION IF EXISTS public.admin_list_challenges(text, integer, integer);
DROP FUNCTION IF EXISTS public.get_personal_challenge_stats(uuid);
DROP FUNCTION IF EXISTS public.get_challenge_leaderboard(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_process_claim(uuid, text);
DROP FUNCTION IF EXISTS public.verify_claim_token(text);
DROP FUNCTION IF EXISTS public.create_challenge_claim(uuid);
DROP FUNCTION IF EXISTS public.submit_challenge_score(uuid, integer[], real, real, text, text, text, text);

-- ============================================================================
-- 2) DROP SCORING FUNCTION (from 02-challenge-scoring.sql)
-- ============================================================================

DROP FUNCTION IF EXISTS public.compute_challenge_score(integer[], double precision, double precision);

-- ============================================================================
-- 3) DROP RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "challenges_select_public" ON public.challenges;
DROP POLICY IF EXISTS "challenges_admin_all" ON public.challenges;

DROP POLICY IF EXISTS "cs_admin_read" ON public.challenge_submissions;
DROP POLICY IF EXISTS "cs_user_read_own" ON public.challenge_submissions;

DROP POLICY IF EXISTS "cc_user_read_own" ON public.challenge_claims;
DROP POLICY IF EXISTS "cc_admin_all" ON public.challenge_claims;

DROP POLICY IF EXISTS "cal_admin_read" ON public.challenge_audit_log;

-- ============================================================================
-- 4) DISABLE RLS
-- ============================================================================

ALTER TABLE IF EXISTS public.challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.challenge_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.challenge_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.challenge_audit_log DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5) DROP INDEXES
-- ============================================================================

-- challenges
DROP INDEX IF EXISTS public.idx_challenges_status;
DROP INDEX IF EXISTS public.idx_challenges_campaign;
DROP INDEX IF EXISTS public.idx_challenges_active;

-- challenge_submissions
DROP INDEX IF EXISTS public.idx_cs_challenge;
DROP INDEX IF EXISTS public.idx_cs_user;
DROP INDEX IF EXISTS public.idx_cs_score;
DROP INDEX IF EXISTS public.idx_cs_nonce;
DROP INDEX IF EXISTS public.idx_cs_submitted;
DROP INDEX IF EXISTS public.idx_cs_qualified;

-- challenge_claims
DROP INDEX IF EXISTS public.idx_cc_code_hash;
DROP INDEX IF EXISTS public.idx_cc_token_hash;
DROP INDEX IF EXISTS public.idx_cc_user;
DROP INDEX IF EXISTS public.idx_cc_status;

-- challenge_audit_log
DROP INDEX IF EXISTS public.idx_cal_challenge;
DROP INDEX IF EXISTS public.idx_cal_action;
DROP INDEX IF EXISTS public.idx_cal_created;

-- ============================================================================
-- 6) DROP TRIGGER (from 05-challenge-audit-trigger.sql)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_challenges_updated_at ON public.challenges;

-- ============================================================================
-- 7) DROP TABLES (reverse FK dependency order)
-- ============================================================================

DROP TABLE IF EXISTS public.challenge_audit_log;
DROP TABLE IF EXISTS public.challenge_claims;
DROP TABLE IF EXISTS public.challenge_submissions;
DROP TABLE IF EXISTS public.challenges;

-- NOTE: We do NOT drop the pgcrypto extension as other objects may depend on it.
-- NOTE: We do NOT drop update_updated_at() — it is shared across multiple
-- tables and was created by an earlier migration (00008).
