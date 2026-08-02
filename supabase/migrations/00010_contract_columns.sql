-- ============================================================================
-- FOCUS Product Contract v1.0 — Phase B: additive columns + indexes
--
-- Type: Additive
-- Phase: B
-- Needs backfill: yes (values filled by 00012; engine_name/engine_version defaults apply)
-- Directly reversible: yes (DROP the new columns and indexes)
-- Depends on: 00008
-- Required by: 00011 (reads campaign_version/abandon_timeout_minutes); 00012 (writes the new columns)
--
-- Adds columns and indexes ONLY. Never changes existing column defaults,
-- types, or values, and never drops anything (forward-compatible).
--
-- Phase 1 rules honored: ADD ONLY. No DROP, no ALTER TYPE, no new CHECK, no
-- change to any default the current app relies on (campaigns.status default
-- stays 'active' until the app conversion — see 00013 for the Phase E plan).
--
-- Rollback (reverse order):
--   DROP INDEX  IF EXISTS idx_analytics_events_error_code;
--   ALTER TABLE public.analytics_events DROP COLUMN IF EXISTS schema_version,
--     DROP COLUMN IF EXISTS request_id, DROP COLUMN IF EXISTS service,
--     DROP COLUMN IF EXISTS action, DROP COLUMN IF EXISTS duration_ms,
--     DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS error_code;
--   DROP INDEX  IF EXISTS idx_sessions_last_activity;
--   ALTER TABLE public.sessions DROP COLUMN IF EXISTS engine_name,
--     DROP COLUMN IF EXISTS engine_version, DROP COLUMN IF EXISTS campaign_snapshot,
--     DROP COLUMN IF EXISTS trials, DROP COLUMN IF EXISTS last_activity_at,
--     DROP COLUMN IF EXISTS ended_reason;
--   DROP INDEX  IF EXISTS idx_campaigns_status;
--   ALTER TABLE public.campaigns DROP COLUMN IF EXISTS abandon_timeout_minutes,
--     DROP COLUMN IF EXISTS campaign_version;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- campaigns
-- ----------------------------------------------------------------------------
-- Per-campaign idle-abandon timeout (contract default: 5 minutes).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS abandon_timeout_minutes INTEGER NOT NULL DEFAULT 5;

-- Snapshot version so sessions can record exactly which campaign version ran.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS campaign_version TEXT;

-- status becomes the contract source of truth (backfilled in 00012).
-- NOTE: the column is left exactly as-is (default 'active', no CHECK). The
-- contract state machine (draft|scheduled|running|paused|ended|archived) is
-- enforced only in Phase E, in lockstep with the app conversion — see 00013.
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns (status);

-- ----------------------------------------------------------------------------
-- sessions
-- ----------------------------------------------------------------------------
-- Engine that produced this session (contract). engine_name lets multiple
-- engines coexist in the future; engine_version pins the exact version.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS engine_name TEXT NOT NULL DEFAULT 'focus-engine';
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS engine_version INTEGER NOT NULL DEFAULT 1;

-- Session snapshot (contract): research results stay stable even if the
-- campaign row changes later. Single JSONB bundle, extensible:
--   { id, name, version, plugin_id, plugin_version, start_date, end_date, status, created_at }
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS campaign_snapshot JSONB;

-- Per-press trial data (contract replay). Distinct from measurements so the
-- two evolve independently.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS trials JSONB;

-- Abandonment detection support (migration 003 added these but was never
-- applied to the live database — reconciled here idempotently).
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity
  ON public.sessions (last_activity_at) WHERE status = 'running';

-- ----------------------------------------------------------------------------
-- analytics_events
-- ----------------------------------------------------------------------------
-- Observability contract columns: every event identifies its source
-- (service/action), links to logs (request_id), and reports its outcome
-- (duration_ms/status/error_code) under a schema version.
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS schema_version TEXT;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS service TEXT;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS error_code TEXT;

-- Indexing error events for debugging (schema_version index is unnecessary
-- until version-based analytics is actually needed).
CREATE INDEX IF NOT EXISTS idx_analytics_events_error_code
  ON public.analytics_events (error_code);
