-- ============================================================================
-- ADMIN CONTROL CENTER — PASS 1 POST-APPLY VERIFICATION (00063)
-- Run in the Supabase SQL Editor (owner role) AFTER applying
--   00063_admin_control_center_pass1.sql
-- Expected: each query returns rows / the expected values (no errors).
-- This is the authoritative post-00063 record. (The Phase-7 verify script
-- `settings_control_center.sql` documents the 00059+00060 state only.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Pass-1 settings are seeded: registered count is now 33 (20 base+telemetry
--    unchanged + 13 A-class operational keys). Expected: 33.
-- ---------------------------------------------------------------------------
SELECT count(*) AS registered_settings
FROM public.app_settings;

-- ---------------------------------------------------------------------------
-- 2) The 20 prior settings are ALL still present (proves 00063 was additive and
--    never replaced/dropped anything). Expected: 20 rows.
-- ---------------------------------------------------------------------------
SELECT key, value->>'value' AS value
FROM public.app_settings
WHERE key IN (
  'game.rounds', 'game.min_delay_ms', 'game.max_delay_ms', 'game.min_position_distance_pct',
  'offers.default_discount_percent', 'offers.default_max_usage',
  'offers.return_discount_percent', 'offers.whatsapp_discount_percent', 'offers.whatsapp_max_usage',
  'inventory.overstock_multiplier',
  'rules.inventory_low_threshold', 'rules.device_visitors_threshold',
  'rules.trade_conversion_threshold', 'rules.visitor_count_threshold',
  'rules.default_threshold', 'rules.needs_discount_visit_count', 'cache.max_entries',
  'telemetry.max_batch', 'telemetry.flush_ms', 'telemetry.max_buffer'
)
ORDER BY key;

-- ---------------------------------------------------------------------------
-- 3) The 13 NEW Pass-1 settings exist with the expected default values.
--    Expected: 13 rows.
-- ---------------------------------------------------------------------------
SELECT key, value->>'value' AS value, category, type
FROM public.app_settings
WHERE key IN (
  'commerce.currencies',
  'comm.whatsapp_phone', 'comm.whatsapp_guard_timeout_ms',
  'comm.whatsapp_min_digits', 'comm.whatsapp_max_digits',
  'comm.whatsapp_message_max_length', 'comm.double_exit_window_ms',
  'marketplace.listing_page_limit', 'marketplace.similar_phones_limit',
  'ads.carousel_autoplay_ms', 'ads.carousel_swipe_threshold_px',
  'experience.results_auto_advance_ms', 'experience.gallery_autoplay_ms'
)
ORDER BY key;

-- ---------------------------------------------------------------------------
-- 4) game.* / scientific contract keys are UNTOUCHED (proves the scientific
--    measurement contract in core/scientific/constants.ts is not moved).
--    Expected: 4 rows, values 7 / 750 / 2890 / 25.
-- ---------------------------------------------------------------------------
SELECT key, value->>'value' AS value
FROM public.app_settings
WHERE key IN ('game.rounds', 'game.min_delay_ms', 'game.max_delay_ms', 'game.min_position_distance_pct')
ORDER BY key;

-- ---------------------------------------------------------------------------
-- 5) The lightweight append-only audit table exists with the exact schema.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_settings_changes'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 6) Audit table RLS is ENABLED and there are ZERO policies (append-only via
--    the set_setting SECURITY DEFINER RPC only). Expected: relrowsecurity = t,
--    then 0 rows in the pg_policies query.
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'app_settings_changes';

SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'app_settings_changes';

-- ---------------------------------------------------------------------------
-- 7) No direct table access to the audit table for anon / authenticated.
--    Expected: 0 rows from each REVOKE check (verified by absence of grants).
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'app_settings_changes'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public');

-- ---------------------------------------------------------------------------
-- 8) set_setting(text, jsonb) still SECURITY DEFINER, search_path-hardened,
--    VOLATILE. (Same signature, redefined to also write the audit row.)
-- ---------------------------------------------------------------------------
SELECT p.proname,
       oidvectortypes(p.proargtypes) AS arg_types,
       p.prosecdef,
       p.provolatile,
       p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'set_setting'
  AND p.pronargs = 2
  AND oidvectortypes(p.proargtypes) = 'text, jsonb';

-- ---------------------------------------------------------------------------
-- 9) EXECUTE grants — exact expected ACL (00063 tightened anon):
--      postgres      → EXECUTE  ✓ (owner always has it)
--      authenticated → EXECUTE  ✓
--      service_role  → EXECUTE  ✓
--      anon          → NO EXECUTE  ✗ (explicitly revoked in 00063)
--      PUBLIC        → NO EXECUTE  ✗
-- ---------------------------------------------------------------------------
SELECT r.routine_name, r.grantee, r.privilege_type
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'set_setting'
  AND r.privilege_type = 'EXECUTE'
ORDER BY r.grantee;

-- Expected result: exactly 3 rows (postgres, authenticated, service_role).
-- ZERO rows for anon or PUBLIC.

-- Double-check: anon must NOT have EXECUTE.
SELECT
  has_function_privilege('anon',
    'public.set_setting(text, jsonb)', 'EXECUTE')
  AS anon_must_be_false;

-- Double-check: service_role must HAVE EXECUTE.
SELECT
  has_function_privilege('service_role',
    'public.set_setting(text, jsonb)', 'EXECUTE')
  AS service_role_must_be_true;

SELECT r.routine_name, count(*) AS public_execute_grants
FROM information_schema.routine_privileges r
WHERE r.routine_name = 'set_setting'
  AND r.privilege_type = 'EXECUTE'
  AND (r.grantee = 'PUBLIC' OR r.grantee = 'public')
GROUP BY r.routine_name;

-- ---------------------------------------------------------------------------
-- 10) RPC SPOT CHECKS — RESTORE-TO-ORIGINAL OBLIGATORY (admin/super_admin only).
--
--     READ (idempotent) — reader role:
--       SELECT public.get_settings()->'settings'->'comm.whatsapp_phone';
--         -> {"value":"+213556254007","category":"marketplace","type":"text"}
--
--     WRITE + RESET (validate + restore the same key) — proves the AUDIT row is
--     written on every change:
--       -- capture current value first (marketplace.listing_page_limit = 48)
--       SELECT public.set_setting('marketplace.listing_page_limit', '60'::jsonb);
--         -> saved {key:marketplace.listing_page_limit, value:60, ...}
--       -- RESTORE the original value AFTER the test:
--       SELECT public.set_setting('marketplace.listing_page_limit', '48'::jsonb);
--         -> saved {key:marketplace.listing_page_limit, value:48, ...}
--       -- PROOF the audit captured both changes (expected: 2 rows, non-secret):
--       SELECT setting_key, old_value->>'value', new_value->>'value',
--              updated_by IS NOT NULL AS has_actor, updated_at IS NOT NULL AS has_ts
--       FROM public.app_settings_changes
--       WHERE setting_key = 'marketplace.listing_page_limit'
--       ORDER BY updated_at;
--
--     NEGATIVE RPC tests (MUST be rejected server-side — no state left behind):
--       SELECT public.set_setting('security.system_secret', '1'::jsonb);
--         -> {"error":"INVALID_KEY", ...}                  [unregistered denied]
--       SELECT public.set_setting('comm.whatsapp_phone', 'abc'::jsonb);
--         -> {"error":"INVALID_PATTERN", ...}              [bad phone denied]
--       SELECT public.set_setting('commerce.currencies', '["USD","BTC"]'::jsonb);
--         -> {"error":"INVALID_ALLOWED", ...}              [off allow-list denied]
--       SELECT public.set_setting('game.min_delay_ms', '999999'::jsonb);
--         -> {"error":"OUT_OF_RANGE", ...}                 [out-of-range denied]
--
--     Audit immutability proof (append-only — expect "permission denied" or
--     "new row violates RLS" for the following, run as a NON-owner role):
--       UPDATE public.app_settings_changes SET new_value = '{}'::jsonb;
--       DELETE FROM public.app_settings_changes;
--       -- The Admin Control Center UI offers NO audit editing control; audit
--       -- rows are created exclusively inside set_setting (server-side).
-- ============================================================================
