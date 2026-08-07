-- ============================================================================
-- FOCUS — LIVE DATABASE VERIFICATION (read-only, safe to run in SQL editor)
--
-- Purpose: verify the live Supabase schema before any Phase E work.
-- Answers whether the deferred contract migrations (00009-00012) can be
-- applied as-is, and re-establishes the baseline that migration 00008
-- documents as "cannot rebuild from scratch".
--
-- SAFETY: SELECT-only. No DML, no DDL. Safe to run on production.
--
-- Run the whole script in one go (Supabase SQL editor) and paste the output.
-- The final section prints a machine-readable VERDICT summary per gate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) EXISTING TABLES (baseline inventory)
--    Compare against: what migrations 00001-00013 expect to exist.
-- ----------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ----------------------------------------------------------------------------
-- Q1 — columns of the two tables the baseline is missing (00008 Q1)
-- ----------------------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'surveys')
ORDER BY table_name, ordinal_position;

-- ----------------------------------------------------------------------------
-- Q2 — constraints and foreign keys (every table) (00008 Q2)
-- ----------------------------------------------------------------------------
SELECT conrelid::regclass AS table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relkind = 'r' AND rel.relnamespace = 'public'::regnamespace
ORDER BY table_name, con.conname;

-- ----------------------------------------------------------------------------
-- Q3 — triggers (every table) (00008 Q3)
-- ----------------------------------------------------------------------------
SELECT event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ----------------------------------------------------------------------------
-- Q4 — sequences (00008 Q4)
-- ----------------------------------------------------------------------------
SELECT sequencename, data_type, start_value, increment_by, last_value
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;

-- ----------------------------------------------------------------------------
-- RLS policies (00008 baseline needs them in pg_policies)
-- ----------------------------------------------------------------------------
SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ----------------------------------------------------------------------------
-- Existing functions (RPC surface vs 00008 list)
-- ----------------------------------------------------------------------------
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
ORDER BY p.proname;

-- ----------------------------------------------------------------------------
-- GATE A — deferred 00012 columns (must EXIST on live DB for backfill)
--    campaigns.is_active | campaigns.version | sessions.metadata
-- ----------------------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'campaigns'   AND column_name IN ('is_active', 'version', 'status', 'created_at'))
   OR (table_name = 'sessions'    AND column_name IN ('metadata', 'campaign_id', 'plugin_id'))
ORDER BY table_name, column_name;

-- ----------------------------------------------------------------------------
-- GATE B — 00010 columns (added idempotently; only informational)
--    campaigns.abandon_timeout_minutes | campaigns.campaign_version
--    sessions.engine_name | sessions.engine_version | sessions.campaign_snapshot
--    sessions.trials | sessions.last_activity_at | sessions.ended_reason
--    analytics_events.schema_version | request_id | service | action | duration_ms | status | error_code
-- ----------------------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'campaigns'        AND column_name IN ('abandon_timeout_minutes', 'campaign_version'))
   OR (table_name = 'sessions'         AND column_name IN ('engine_name', 'engine_version', 'campaign_snapshot', 'trials', 'last_activity_at', 'ended_reason'))
   OR (table_name = 'analytics_events' AND column_name IN ('schema_version', 'request_id', 'service', 'action', 'duration_ms', 'status', 'error_code'))
ORDER BY table_name, column_name;

-- ----------------------------------------------------------------------------
-- GATE C — 00009 contract tables (should NOT exist yet if never applied)
-- ----------------------------------------------------------------------------
SELECT table_name, 'EXISTS' AS state
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('system_settings', 'audit_log', 'job_assignments');

-- ----------------------------------------------------------------------------
-- GATE D — lookup RPCs (app uses v1 today; v2 is Phase E)
-- ----------------------------------------------------------------------------
SELECT p.proname, p.provolatile,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('lookup_campaign_by_short_code', 'lookup_campaign_by_short_code_v2')
ORDER BY p.proname;

-- ----------------------------------------------------------------------------
-- GATE E — existing campaigns/sessions/events data volume (backfill blast radius)
-- ----------------------------------------------------------------------------
SELECT 'campaigns' AS entity, count(*) AS rows FROM public.campaigns
UNION ALL
SELECT 'sessions', count(*) FROM public.sessions
UNION ALL
SELECT 'analytics_events', count(*) FROM public.analytics_events;

-- ----------------------------------------------------------------------------
-- VERDICT (read-only summary — the gates above feed these)
--   A_OK  : deferred 00012 columns exist  -> backfill can run as-is
--   B_OK  : 00010 columns present         -> columns already applied
--   C_EMPTY: 00009 tables absent          -> contract tables never applied
--   D_V1  : lookup v1 exists (app-compatible); v2 optional
-- ----------------------------------------------------------------------------
SELECT
  'campaigns.is_active'  AS column_name,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='is_active') AS present
UNION ALL SELECT 'campaigns.version', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='version')
UNION ALL SELECT 'sessions.metadata', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='metadata')
ORDER BY column_name;

-- Quick consolidated verdict (single value): ALL_PRESENT => 00012 is safe.
SELECT CASE WHEN count(*) = 3 AND bool_and(present) THEN 'ALL_PRESENT — 00012 SAFE'
            ELSE 'SOME_MISSING — 00012 BLOCKED, reconcile names first'
       END AS gate_a_verdict
FROM (
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='is_active') AS present
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaigns' AND column_name='version')
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='metadata')
) g;

-- ----------------------------------------------------------------------------
-- GATE F — Contract v1.1 M1 (placements + attribution columns + scan RPC)
--   F_TABLES  : placements & placement_history exist
--   F_COLUMNS : qr_codes/sessions/analytics_events gained placement_id
--   F_RPC     : lookup_scan_context(TEXT, TEXT) exists for the scan path
-- ----------------------------------------------------------------------------
SELECT table_name, 'EXISTS' AS state
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('placements', 'placement_history');

SELECT
  'qr_codes.placement_id'        AS column_name,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='qr_codes' AND column_name='placement_id') AS present
UNION ALL SELECT 'sessions.placement_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='placement_id')
UNION ALL SELECT 'analytics_events.placement_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name='placement_id')
ORDER BY column_name;

SELECT p.proname, p.provolatile,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('lookup_scan_context')
ORDER BY p.proname;

SELECT CASE WHEN count(*) = 2 AND bool_and(present) THEN 'M1_ATTRIBUTION_READY'
            ELSE 'M1_INCOMPLETE — run 00016/00017/00018'
       END AS gate_f_verdict
FROM (
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='placement_id') AS present
  UNION ALL SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name='placement_id')
) g;


-- ============================================================================
-- NEXT STEPS AFTER THIS VERIFICATION
--   1) If Gate A = ALL_PRESENT  -> 00009, 00010, 00011, 00012 are safe to
--      apply additively (00013 is docs-only, no-op).
--   2) If Gate A = SOME_MISSING -> reconcile column names FIRST; do NOT run
--      00012 until the mapping is confirmed. Decide with the leader.
--   3) Baseline recovery (00008 TODO): after this run, paste output back into
--      a NEW idempotent migration file to close the "cannot rebuild" gap.
-- ============================================================================
