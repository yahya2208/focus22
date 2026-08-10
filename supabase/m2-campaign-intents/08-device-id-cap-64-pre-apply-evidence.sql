-- ============================================================================
-- FOCUS — M2 · DEVICE_ID CAP 32 → 64 (BATCH 4A) — PRE-APPLY EVIDENCE
-- (read-only)
--
-- Purpose: capture the read-only baseline BEFORE the owner executes
-- 06-device-id-cap-64-apply.sql. Confirms:
--   A) the current CHECK on campaign_intents.device_id is the 32-char cap;
--   B) the current RPC validates with max 32 (and grants are intact);
--   C) no existing row exceeds 32 chars (the widening is purely permissive);
--   D) the frozen tables are untouched — row-count baseline to compare after
--      apply with 09-device-id-cap-64-post-apply-verify.sql (section F).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL. Safe on production.
-- Run ONCE before applying.
-- ============================================================================

-- ============================================================================
-- SECTION A · current CHECK constraint on campaign_intents.device_id
--   EXPECT: char_length(device_id) BETWEEN 1 AND 32.
-- ============================================================================
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.campaign_intents'::regclass
  AND contype = 'c'
  AND pg_get_constraintdef(oid) ~* 'device_id';

-- ============================================================================
-- SECTION B · current RPC cap + grants (EXPECT: '> 32' present, anon/authenticated
--             EXECUTE = true)
-- ============================================================================
SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%char_length(p_device_id) > 32%' AS rpc_cap_is_32;

SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE');

-- ============================================================================
-- SECTION C · existing rows: max device_id length (EXPECT: ≤ 32) + count
-- ============================================================================
SELECT count(*)                                   AS total_rows,
       count(device_id)                           AS rows_with_device_id,
       coalesce(max(char_length(device_id)), 0)   AS max_device_id_length
FROM public.campaign_intents;

-- 36-char UUIDv4 shape that the widened cap must accept (informational).
SELECT length('36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51') AS uuidv4_length; -- 36

-- ============================================================================
-- SECTION D · frozen-telemetry baseline (row counts BEFORE apply)
--   Record these numbers; 09-post-apply-verify.sql section F must match.
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
-- Expected: A = BETWEEN 1 AND 32; B = rpc_cap_is_32 true + EXECUTE true for
-- both; C = max ≤ 32; D = the frozen baseline. If A/B differ, STOP and confirm
-- the live DB matches 01-campaign-intents-apply.sql before proceeding.
-- ============================================================================
