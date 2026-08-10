-- ============================================================================
-- FOCUS — ADS · DEVICE-LINKED ADS (BATCH 4A) — ROLLBACK (exact, one-shot)
--
-- Reverses 01-ads-device-links-apply.sql COMPLETELY: drops the 4 added
-- constraints and the device_id column. Nothing else is touched (ads table,
-- RLS, storage, frozen tables all unchanged).
--
-- SAFETY: runs standalone in the Supabase SQL editor. The column drop also
-- removes the 4 column-dependent constraints, so dropping constraints first is
-- for explicitness; either order is safe.
--
-- ROLLBACK (owner executes only if a full reversal is required):
-- ============================================================================

ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_phone_link_matches_device;
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_device_id_format;
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_phone_link_requires_device;
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_enabled_requires_link;

ALTER TABLE public.ads DROP COLUMN IF EXISTS device_id;

-- ============================================================================
-- Verify rollback: the column and all 4 constraints must now be ABSENT:
--   select column_name from information_schema.columns
--     where table_schema='public' and table_name='ads' and column_name='device_id'; -- 0 rows
--   select conname from pg_constraint where conname like 'ads_%';  -- only pre-existing
-- ============================================================================
