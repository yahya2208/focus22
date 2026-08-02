-- ============================================================================
-- 00004 — Analytics Events Performance Indexes (Correct Order Idempotent)
--
-- ############################################################################
-- # WHY THIS FILE EXISTS (AUDIT FIX):
-- #   Original migration "004_add_analytics_events_indexes.sql" uses 3-digit
-- #   naming which sorts AFTER 00013 alphabetically. Indexes should exist BEFORE
-- #   heavy queries land. This file runs in the correct slot between 00003/00005.
-- ############################################################################
-- Type: Additive + Idempotent safe. All CREATE INDEX IF NOT EXISTS → no-op on
-- live DB where 004 applied already.
-- Depends on: 00003 (sessions table)
-- Required by: 00005 and onward (funnel queries).
-- ============================================================================

-- ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
-- Reconciled copy of 004_add_analytics_events_indexes.sql (alphabetical fix)
-- ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type
  ON analytics_events (event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id
  ON analytics_events (session_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_campaign_id
  ON analytics_events (campaign_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON analytics_events (user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_device_id
  ON analytics_events (device_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events (created_at DESC);

-- Composite index for funnel queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_analytics_events_campaign_type_time
  ON analytics_events (campaign_id, event_type, created_at DESC);

-- Composite index for user journey reconstruction
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time
  ON analytics_events (user_id, created_at DESC);

-- Composite index for session journey reconstruction
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_type_time
  ON analytics_events (session_id, event_type, created_at ASC);
