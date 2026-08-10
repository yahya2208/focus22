-- ============================================================================
-- FOCUS — M2 · WHATSAPP_HANDOFF_STARTED KIND — PRE-APPLY EVIDENCE (read-only)
--
-- Purpose: capture the read-only baseline BEFORE the owner executes
-- 10-whatsapp-handoff-kind-apply.sql. Confirms:
--   A) the current RPC does NOT yet accept the `whatsapp_handoff_started`
--      kind (allowlist still view/click/whatsapp_intent only);
--   B) the current device_id cap (32 or 64) so the apply builds on the right
--      staged base (01 = 32; 06 = 64 — if 32 is shown, run 06 first);
--   C) EXECUTE grants (anon + authenticated) are intact;
--   D) frozen tables are untouched — row-count baseline to compare after apply
--      with 10-whatsapp-handoff-kind-post-apply-verify.sql (section D).
--
-- SAFETY: SELECT / catalog-reads ONLY. No DML, no DDL. Safe on production.
-- Run ONCE before applying.
-- ============================================================================

-- ============================================================================
-- SECTION A · current kind allowlist — EXPECT: whatsapp_handoff_started NOT
--             present in the RPC definition.
-- ============================================================================
SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%whatsapp_handoff_started%' AS rpc_accepts_handoff_kind;

SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%p_kind NOT IN (%''view''%''click''%''whatsapp_intent''%' AS rpc_kind_allowlist_original;

-- ============================================================================
-- SECTION B · current device_id cap (EXPECT: '> 64' if 06 applied, '> 32' if
--             only 01 applied — the 10-apply is written for the 64 base)
-- ============================================================================
SELECT pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%char_length(p_device_id) > 64%' AS rpc_cap_is_64,
       pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
       LIKE '%char_length(p_device_id) > 32%' AS rpc_cap_is_32;

-- ============================================================================
-- SECTION C · EXECUTE grants intact
-- ============================================================================
SELECT 'anon'          AS role_name,
       has_function_privilege('anon', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE') AS can_execute
UNION ALL
SELECT 'authenticated',
       has_function_privilege('authenticated', 'public.record_campaign_intent(text,text,text,uuid,text,text)', 'EXECUTE');

-- ============================================================================
-- SECTION D · frozen-telemetry baseline (row counts BEFORE apply)
--   Record these numbers; 10-whatsapp-handoff-kind-post-apply-verify.sql
--   section D must match.
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
-- Expected: A = rpc_accepts_handoff_kind false + rpc_kind_allowlist_original
-- true; B = rpc_cap_is_64 true (or rpc_cap_is_32 true → run 06 first);
-- C = EXECUTE true for both; D = the frozen baseline. If A differs, STOP and
-- confirm the live RPC state before proceeding.
-- ============================================================================
