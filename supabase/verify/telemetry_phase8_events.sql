-- ============================================================================
-- TELEMETRY PHASE 8 EVENTS — post-apply verification (00061)
-- Run in the Supabase SQL Editor (owner role) AFTER applying
--   00061_telemetry_phase8_events.sql
-- Expected: each query returns the expected rows / values (no errors).
-- ============================================================================

-- 1) record_telemetry_event accepts the NEW Phase 8 event names + domains.
--    Expected: NO error; the batch is inserted (idempotent).
--    (Requires an authenticated session: SELECT auth.uid() is null outside a
--     client session, so run via the app or SET ROLE authenticated with a
--     signed-in user. This is a smoke-check counterpart to the unit tests.)
SELECT public.record_telemetry_event(jsonb_build_array(
  jsonb_build_object(
    'event_id', md5(random()::text),
    'event_name', 'game_round_complete',
    'event_version', 1,
    'domain', 'game',
    'occurred_at', now(),
    'session_id', 's_test',
    'anonymous_id', NULL,
    'properties', jsonb_build_object('game','reaction-light','round_index',1,'hit',true)
  )
));

-- 2) The RPC STILL rejects an unknown event (contract intact — negative test).
--    Expected: raises UNKNOWN_EVENT_OR_DOMAIN (this block is intentionally
--    commented out so it does not abort the verification run; uncomment to test).
-- DO $$\BEGIN
--   PERFORM public.record_telemetry_event(jsonb_build_array(
--     jsonb_build_object('event_id', md5(random()::text), 'event_name','definitely_not_real',
--       'event_version',1,'domain','system','occurred_at',now(),'session_id','s_test',
--       'properties','{}'::jsonb)));
-- END$$;

-- 3) get_telemetry_analytics accepts the 'auth' domain (no INVALID_FILTER).
--    Requires an admin/super_admin/researcher auth session.
-- SELECT length(public.get_telemetry_analytics(NULL,NULL,'auth',NULL,NULL,NULL)::text) > 0 AS auth_domain_ok;

-- 4) New event names are visible in the function source (allowlist extended).
--    Expected: both rows present.
SELECT proname, pg_get_functiondef(oid) LIKE '%game_round_complete%' AS has_round,
       pg_get_functiondef(oid) LIKE '%auth_guest_upgrade_cta%'      AS has_auth
FROM pg_proc
WHERE proname IN ('record_telemetry_event', 'get_telemetry_analytics');
