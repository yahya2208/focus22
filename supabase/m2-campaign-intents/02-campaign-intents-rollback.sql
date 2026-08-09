-- ============================================================================
-- FOCUS — M2 · CAMPAIGN INTENT COUNTERS — ROLLBACK (exact, one-shot)
--
-- Reverses 01-campaign-intents-apply.sql COMPLETELY. No "restore something
-- similar" — this drops exactly the two objects the apply script created and
-- nothing else. The frozen tables (analytics_events / qr_codes / placements /
-- placement_history / sessions / users / campaigns) are untouched.
--
-- SAFETY: runs standalone in the Supabase SQL editor. CASCADE covers the two
-- indexes (owned by the table). There are no dependent objects to cascade to.
--
-- ROLLBACK (owner executes only if a full reversal is required):
-- ============================================================================

DROP TABLE IF EXISTS public.campaign_intents CASCADE;

DROP FUNCTION IF EXISTS public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) CASCADE;

-- ============================================================================
-- Verify rollback: both objects must now be ABSENT:
--   select to_regclass('public.campaign_intents');                     -- NULL
--   select to_regproc('public.record_campaign_intent');                -- NULL
-- ============================================================================
