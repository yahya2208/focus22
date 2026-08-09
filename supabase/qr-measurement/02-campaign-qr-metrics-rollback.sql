-- ============================================================================
-- FOCUS — ANONYMOUS CAMPAIGN QR MEASUREMENT — ROLLBACK (exact, one-shot)
--
-- Reverses 01-campaign-qr-metrics-apply.sql COMPLETELY. Drops exactly the
-- objects the apply script created and nothing else. The frozen tables
-- (analytics_events / qr_codes / placements / placement_history / sessions /
-- users / campaigns / campaign_intents) are untouched.
--
-- SAFETY: runs standalone in the Supabase SQL editor. CASCADE covers the
-- partial unique index and the three regular indexes (owned by the table).
-- No dependent objects exist to cascade to.
--
-- ROLLBACK (owner executes only if a full reversal is required):
-- ============================================================================

-- Drop order: functions before the table (no dependency issue either way, but
-- functions reference the table's name only at runtime; functions first keeps
-- the drop clean and explicit).

DROP FUNCTION IF EXISTS public.get_campaign_qr_metrics(UUID) CASCADE;

DROP FUNCTION IF EXISTS public.record_campaign_funnel(UUID, TEXT, TEXT) CASCADE;

DROP FUNCTION IF EXISTS public.record_campaign_qr_scan(TEXT, TEXT) CASCADE;

DROP TABLE IF EXISTS public.campaign_qr_events CASCADE;

-- ============================================================================
-- Verify rollback: all objects must now be ABSENT:
--   select to_regclass('public.campaign_qr_events');          -- NULL
--   select to_regproc('public.record_campaign_qr_scan');      -- NULL
--   select to_regproc('public.record_campaign_funnel');       -- NULL
--   select to_regproc('public.get_campaign_qr_metrics');      -- NULL
-- ============================================================================
