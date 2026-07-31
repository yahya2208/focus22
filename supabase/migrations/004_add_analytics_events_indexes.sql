-- Migration: Add performance indexes for analytics_events
-- This ensures fast queries as the analytics_events table grows to millions of rows.

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
