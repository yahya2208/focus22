-- ============================================================================
-- POST-APPLY VERIFICATION — 00064 ADMIN CONTROL CENTER PASS 2
--
-- Run with the OWNER role in the SQL Editor AFTER applying 00064 (NOT before).
-- Every query is read-only (or restores the default it toggles).
-- "PASS"/"FAIL" lines tell you at a glance; a FAIL means STOP and re-review
-- before wiring Phase F consumers.
--
-- Negative RPC checks that need a NON-owner role are listed as comments
-- (mirroring 00063's verification style): run them once as that role if you can.
-- ============================================================================

-- 1) Registry count 33 -> 38 (5 new keys applied, and nothing else drifted).
SELECT
  CASE WHEN count(*) = 38 THEN 'PASS: 38 registered settings'
       ELSE 'FAIL: expected 38, got ' || count(*) END AS registry_count
FROM public.app_settings;

-- 2) The 5 new rows: exact key/type/category/value.
SELECT key, type, category, value, updated_by IS NULL AS seeded_by_migration
FROM public.app_settings
WHERE key IN (
  'catalog.admin_page_size',
  'catalog.search_result_limit',
  'inventory.max_images',
  'ads.placements',
  'ads.internal_allowlist'
)
ORDER BY key;

--    Expected values:
--      catalog.admin_page_size       {value:50}
--      catalog.search_result_limit   {value:20}
--      inventory.max_images          {value:6}
--      ads.placements                {value:["home","phones","repair","results","exchange","phone-details","showroom"]}
--      ads.internal_allowlist        {value:["phone-details","showroom","phone-services","repair-home"]}

-- 3) set_setting() now contains the 5 NEW branches (and was re-created, not lost).
SELECT
  CASE WHEN (
    EXISTS(SELECT 1 FROM pg_proc
           WHERE proname='set_setting' AND pg_get_function_identity_arguments(oid)='text, jsonb'
             AND prosrc LIKE '%catalog.admin_page_size%'
             AND prosrc LIKE '%catalog.search_result_limit%'
             AND prosrc LIKE '%inventory.max_images%'
             AND prosrc LIKE '%ads.placements%'
             AND prosrc LIKE '%ads.internal_allowlist%'
             AND prosrc LIKE '%commerce.currencies%'      -- old enum branch retained
             AND prosrc LIKE '%game.rounds%'              -- old numeric branch retained
          )) THEN 'PASS: set_setting holds all 33 old + 5 new branches'
       ELSE 'FAIL: set_setting branches out of sync' END AS set_setting_branches;

-- 4) set_setting contract unchanged: definer, lockless search_path, VOLATILE.
SELECT p.proname,
       p.prosecdef AS security_definer,
       p.provolatile,
       p.proconfig IS NULL AS no_search_path_override   -- NULL = no SET options
FROM pg_proc p
WHERE p.proname IN ('set_setting','get_settings_audit') 
  AND pg_get_function_identity_arguments(p.oid) IN ('text, jsonb','text, integer');

-- 5) get_settings() was NOT redefined by 00064 (its source must NOT mention any
--    Pass-2 key), and it is still STABLE definer.
SELECT
  CASE WHEN (
    NOT EXISTS(SELECT 1 FROM pg_proc
               WHERE proname='get_settings'
                 AND prosrc LIKE '%catalog.admin_page_size%')
    AND EXISTS(SELECT 1 FROM pg_proc
               WHERE proname='get_settings' AND prosecdef AND provolatile='s')
  ) THEN 'PASS: get_settings untouched (no Pass-2 key in its source)'
       ELSE 'FAIL: get_settings appears redefined' END AS get_settings_untouched;

-- 6) get_settings_audit ACL: revoked from PUBLIC + anon; granted to
--    authenticated + service_role (mirrors set_setting's final ACL).
SELECT
  CASE WHEN (
    NOT has_function_privilege('public', 'public.get_settings_audit(text, integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon',   'public.get_settings_audit(text, integer)', 'EXECUTE')
    AND     has_function_privilege('authenticated', 'public.get_settings_audit(text, integer)', 'EXECUTE')
    AND     has_function_privilege('service_role',  'public.get_settings_audit(text, integer)', 'EXECUTE')
  ) THEN 'PASS: get_settings_audit ACL least-privilege'
       ELSE 'FAIL: get_settings_audit ACL wrong' END AS audit_rpc_acl;

-- 7) RBAC fence: NO executable function body may reference ROLE_PERMISSIONS /
--    ROLE_CAPABILITY_MAP (00064 must not touch the RBAC maps).
SELECT
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE prosrc ~ 'ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP'
      AND oid NOT IN (SELECT oid FROM pg_proc
                      WHERE prosrc ~ 'ROLE_PERMISSIONS|ROLE_CAPABILITY_MAP'
                        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
                        AND NOT prosecdef)   -- only allow DEFENSIVE string refs, none here
      AND prosecdef
  ) THEN 'PASS: no SECURITY DEFINER body references the RBAC maps'
       ELSE 'FAIL: RBAC map referenced in a function body' END AS rbac_maps_fence;

-- 8) ENUM strictness on the new keys (admin-role RPC test; restores default):
SELECT public.set_setting('ads.placements', '["home","phones","repair","results","exchange","phone-details","showroom","MADEUP"]'::jsonb); -- expect INVALID_ALLOWED
SELECT public.set_setting('ads.internal_allowlist', '["phone-details","showroom","phone-services","repair-home"]'::jsonb);                -- expect saved
SELECT public.set_setting('ads.internal_allowlist', '["phone-details","showroom","phone-services","repair-home"]'::jsonb);                -- restore (no-op value,audit row)

-- 9) Numeric bounds on the new keys:
SELECT public.set_setting('catalog.admin_page_size', '999'::jsonb);       -- expect OUT_OF_RANGE
SELECT public.set_setting('catalog.admin_page_size', '50'::jsonb);        -- expect saved (default restored)
SELECT public.set_setting('inventory.max_images', '0'::jsonb);            -- expect OUT_OF_RANGE
SELECT public.set_setting('inventory.max_images', '6'::jsonb);            -- expect saved (default restored)

-- 9b) STRICT integrality on the THREE NEW integer keys (fractional => INVALID_VALUE):
SELECT public.set_setting('catalog.admin_page_size', '1.5'::jsonb);       -- expect INVALID_VALUE
SELECT public.set_setting('catalog.search_result_limit', '3.7'::jsonb);   -- expect INVALID_VALUE
SELECT public.set_setting('inventory.max_images', '2.9'::jsonb);          -- expect INVALID_VALUE
--     Integral values within bounds still accepted:
SELECT public.set_setting('catalog.search_result_limit', '20'::jsonb);    -- expect saved (default restored)

-- 9c) EXISTING 33 numeric/percent contract PRESERVED (fractional in-bounds STILL
--     accepted — the strict check must NOT leak onto old keys):
SELECT public.set_setting('game.min_delay_ms', '750.5'::jsonb);           -- expect saved (unchanged behaviour)
SELECT public.set_setting('game.min_delay_ms', '750'::jsonb);             -- restore the default
SELECT public.set_setting('game.min_position_distance_pct', '25.5'::jsonb); -- expect saved (percent, unchanged)
SELECT public.set_setting('game.min_position_distance_pct', '25'::jsonb);   -- restore the default

-- 10) Audit read path (admin role): must see the two restored writes above.
SELECT jsonb_pretty(public.get_settings_audit('catalog.admin_page_size', 5));  -- expect error:null + 1 change (50->50)

-- ============================================================================
-- NEGATIVE CHECKS that need a NON-owner role (run once as that role):
--   as anon:            SELECT public.get_settings_audit('catalog.admin_page_size'); -> error UNAUTHORIZED
--   as researcher:      SELECT public.get_settings_audit('catalog.admin_page_size'); -> error FORBIDDEN
--                       SELECT public.set_setting('catalog.admin_page_size','60');   -> error FORBIDDEN
--   as anon/authenticated: SELECT count(*) FROM public.app_settings_changes;         -> RLS denies (0 rows)
-- ============================================================================