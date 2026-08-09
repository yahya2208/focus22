-- ============================================================================
-- FOCUS — M2 · CAMPAIGN INTENT COUNTERS — PRE-APPLY EVIDENCE (read-only)
--
-- Purpose: capture the read-only baseline required by CR-00007 / audit §30
-- BEFORE the owner executes 01-campaign-intents-apply.sql. Confirms:
--   A) the dependencies exist (is_research_role, campaigns, gen_random_uuid);
--   B) the M2 objects do NOT yet exist (fresh apply, not a re-run);
--   C) the frozen tables are untouched — row-count baseline to compare after
--      apply with 04-post-apply-verify.sql (section F).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL, no SET ROLE. Safe to
-- run on production in the Supabase SQL editor. Run ONCE before applying.
-- ============================================================================

-- ============================================================================
-- SECTION A · dependencies present
-- ============================================================================

-- A1) is_research_role() helper exists (phase1 item 2).
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_research_role';

-- A2) public.campaigns exists (FK target for campaign_id).
SELECT to_regclass('public.campaigns') AS campaigns_table;

-- A3) gen_random_uuid() available (used by the table PK default).
SELECT to_regproc('gen_random_uuid') AS gen_random_uuid_available;

-- ============================================================================
-- SECTION B · M2 objects ABSENT (expect NULL / 0 rows)
-- ============================================================================

SELECT to_regclass('public.campaign_intents')    AS campaign_intents_table;   -- expect NULL
SELECT to_regproc('public.record_campaign_intent') AS record_campaign_intent; -- expect NULL

-- ============================================================================
-- SECTION C · frozen-telemetry baseline (row counts BEFORE apply)
--   Record these numbers; 04-post-apply-verify.sql section F must match.
-- ============================================================================

SELECT 'analytics_events'   AS table_name, count(*) AS rows FROM public.analytics_events
UNION ALL SELECT 'qr_codes',         count(*) FROM public.qr_codes
UNION ALL SELECT 'placements',       count(*) FROM public.placements
UNION ALL SELECT 'placement_history',count(*) FROM public.placement_history
UNION ALL SELECT 'sessions',         count(*) FROM public.sessions
UNION ALL SELECT 'users',            count(*) FROM public.users
UNION ALL SELECT 'campaigns',        count(*) FROM public.campaigns
ORDER BY table_name;

-- ============================================================================
-- Expected: A rows present; B both NULL; C = the frozen baseline. If A is
-- missing (e.g. no is_research_role), STOP and apply phase1 item 2 first.
-- ============================================================================
