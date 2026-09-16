-- ============================================================================
-- 00064 — ADMIN CONTROL CENTER PASS 2 (FINAL FOR APPLY — owner-approved)
--
-- Status: Contract approved by the owner. Gate-0 on 00063 LIVE PASSED (33 rows,
-- app_settings_changes live, anon EXECUTE = false on set_setting). This file is
-- ready to apply AFTER review. Do not apply before reading the contract notes
-- and the retained-region proof at the bottom.
--
-- Type: Additive. Adds 5 business settings whose defaults are the EXACT current
-- hardcoded values (behavior-preserving), a read-only audit RPC, and the new
-- server-side branches those keys require inside set_setting. It does NOT touch
-- get_settings(), RBAC, telemetry, or any of the existing 33 setting contracts.
--
-- WHAT THIS ADDS
--   1) 5 settings (defaults = current hardcoded values, source-cited):
--        catalog.admin_page_size       integer 50  (src/screens/admin/CatalogSearchBar.tsx:15 PAGE_SIZE)
--        catalog.search_result_limit   integer 20  (src/services/catalog-service.ts:17 + alias-engine.ts:294)
--        inventory.max_images          integer 6   (src/components/inventory/AddInventoryModal.tsx:233)
--        ads.placements                enum    [home,phones,repair,results,exchange,phone-details,showroom]
--                                          (src/services/ads-service.ts:24-32 AD_PLACEMENTS)
--        ads.internal_allowlist        enum    [phone-details,showroom,phone-services,repair-home]
--                                          (src/services/ad-adapters/internal.ts:44 INTERNAL_AD_ALLOWLIST)
--   2) get_settings_audit(p_key text, p_limit integer DEFAULT 20) — READ-only
--      append-only change history. SECURITY DEFINER, admin/super_admin ONLY.
--   3) set_setting(text, jsonb) re-created ADDITIVELY.
--
-- OWNER-REVIEWED ADDITIONS vs the pure 00063 body (each independently tested):
--   A. Bounds branches for the 3 new integer keys + 2 enum allow-list branches
--      (bounds authored; defaults extracted).
--   B. STRICT INTEGRALITY for the 3 NEW integer keys only: a fractional number
--      such as 1.5 is rejected with INVALID_VALUE (v_num <> trunc(v_num)). The
--      33 existing numeric/percent keys intentionally keep their exact 00059/
--      00060/00063 contract — fractional in-bounds numerics remain accepted
--      there (NOT changed). Out-of-range values are still OUT_OF_RANGE (bounds
--      checked before integrality).
--   C. get_settings_audit RPC (admin/super_admin only).
--   Signature/definer/search_path/authorizer (admin/super_admin ONLY)/error
--   contract/audit write/ACL of set_setting are UNCHANGED.
--
-- LOCKED & NOT TOUCHED (owner-mandated + audit policies):
--   * get_settings()                              -> ZERO changes (not redefined).
--   * ROLE_PERMISSIONS / ROLE_CAPABILITY_MAP      -> never referenced executably.
--   * telemetry functions + telemetry_events      -> untouched (00057-00062).
--   * scientific / game scoring / challenge model -> untouched; no such keys.
--   * app_settings schema / app_settings_changes  -> NO schema change, RLS as-is
--     (RLS already enabled with ZERO client policies; both read/write RPCs are
--      SECURITY DEFINER so they bypass RLS by design).
--   * Existing 33 settings (values/bounds/pattern/allow-list) -> unchanged.
--
-- Why NOT more keys (drift protection, from the audit's extraction):
--   coach.* thresholds (analysis/fatigue/calibration) are MEASUREMENT SCIENCE
--   (same protected class as core/scientific) -> rejected.
--   gamification achievement/daily-challenge targets are multi-field structures
--   (no JSON type in the registry; 18+ shaped keys) -> deferred, not invented.
--   BI metric rating bands are presentation-only multi-field -> deferred.
--   image-service DEFAULT_MAX_DIMENSION/DEFAULT_QUALITY, USE_NEW_GALLERY, cart
--   clamps, search rate limit (60/hr) -> rejected (security/perf/feature flags).
--
-- Later migrations depending on 00064: NONE currently exist (00063 is the
-- latest applied contract; 003/004 are historical outliers).
--
-- RETENTION PROOF (direct, not a comment): run
--   node supabase/verify/compare_set_setting_00063_vs_00064.mjs
-- It extracts both set_setting bodies mechanically and asserts that every line
-- of the 00063 body appears in order inside the 00064 body (removed/rewritten
-- lines = 0) and lists exactly which lines are added.
--
-- Rollback (additive only, nothing destructive):
--   DROP FUNCTION public.get_settings_audit(text, integer);
--   (redefine set_setting back to its 00063 body — see 00063 source),
--   DELETE FROM public.app_settings WHERE key IN ('catalog.admin_page_size',
--     'catalog.search_result_limit','inventory.max_images','ads.placements',
--     'ads.internal_allowlist');
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Seed the 5 new keys. Defaults EXACTLY mirror current hardcoded values so
--    centralization never changes behavior. ON CONFLICT DO NOTHING keeps any
--    override created between Gate-0 and apply (unlikely, but harmless).
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, category, type, updated_at)
VALUES
  ('catalog.admin_page_size',    jsonb_build_object('value', 50),                                          'catalog',    'integer', now()),
  ('catalog.search_result_limit', jsonb_build_object('value', 20),                                          'catalog',    'integer', now()),
  ('inventory.max_images',       jsonb_build_object('value', 6),                                            'inventory',  'integer', now()),
  ('ads.placements',             jsonb_build_object('value', jsonb_build_array('home','phones','repair','results','exchange','phone-details','showroom')), 'ads', 'enum', now()),
  ('ads.internal_allowlist',     jsonb_build_object('value', jsonb_build_array('phone-details','showroom','phone-services','repair-home')),             'ads', 'enum', now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) get_settings_audit(p_key text, p_limit integer DEFAULT 20) — READ-only
--    append-only change history for one setting. Admin/super_admin ONLY
--    (researcher is excluded: audit is a privileged view). SECURITY DEFINER so
--    RLS on app_settings_changes stays irrelevant (definer bypasses it) —
--    NO new policy is created anywhere.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_settings_audit(p_key text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_limit  integer;
  v_changes jsonb;
BEGIN
  -- Authorization — audit readers are admin / super_admin ONLY.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- Closed registry: the key must already be a registered setting.
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = p_key) THEN
    RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
  END IF;

  -- Clamp the row limit (default 20, hard cap 200) — prevents unbounded reads.
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));

  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO v_changes
  FROM (
    SELECT jsonb_build_object(
      'setting_key', setting_key,
      'old_value',   old_value,
      'new_value',   new_value,
      'updated_by',  updated_by,
      'updated_at',  updated_at
    ) AS row
    FROM public.app_settings_changes
    WHERE setting_key = p_key
    ORDER BY updated_at DESC, id DESC
    LIMIT v_limit
  ) s;

  RETURN jsonb_build_object('error', null, 'changes', v_changes);
END;
$$;

COMMENT ON FUNCTION public.get_settings_audit(text, integer) IS
  'Admin settings audit read. SECURITY DEFINER; READ requires role admin/'
  'super_admin only (researcher excluded). Returns the append-only change '
  'history for one setting (old/new/by/at, newest first, LIMIT clamped to 200).';

-- ---------------------------------------------------------------------------
-- 3) set_setting(text, jsonb) — ADDITIVE re-creation. Every body line of the
--    00063 function (all 33 keys: 31 numeric + comm.whatsapp_phone text +
--    commerce.currencies enum — including the original comments) is retained
--    VERBATIM. The only changes are strictly-added lines:
--      * 3 numeric bounds WHEN branches  (catalog.admin_page_size,
--        catalog.search_result_limit, inventory.max_images) + comment,
--      * the strict-integrality guard for exactly those 3 keys + comment,
--      * 2 enum allow-list WHEN branches (ads.placements, ads.internal_allowlist).
--    Proof (mechanical): compare_set_setting_00063_vs_00064.mjs.
--    Signature/definer/search_path/authorizer/error contract/audit write are
--    UNCHANGED. The final GRANTS block re-asserts the 00063 ACL (CREATE OR
--    REPLACE never resets ACLs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_category text;
  v_type     text;
  v_num      numeric;
  v_min      numeric;
  v_max      numeric;
  v_old      jsonb;
  v_new      jsonb;
  v_str      text;
  v_el       text;
  v_allowed  text[];
BEGIN
  -- Authorization — writers are admin / super_admin ONLY (unchanged).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- Closed registry: the key MUST already exist.
  SELECT category, type INTO v_category, v_type
  FROM public.app_settings WHERE key = p_key;
  IF v_category IS NULL OR v_type IS NULL THEN
    RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
  END IF;

  -- Enforce the value type the registry declares, then validate bounds/pattern/
  -- allow-list server-side. Older rows only ever hold integer/percent (the
  -- 00059/00060 set), so numeric handling is unchanged; text/enum are new.
  IF v_type IN ('integer', 'percent') THEN
    IF jsonb_typeof(p_value) <> 'number' THEN
      RETURN jsonb_build_object('error', 'INVALID_TYPE', 'key', p_key);
    END IF;

    v_num := (p_value)::numeric;
    IF v_num IS NULL OR v_num <> v_num THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE', 'key', p_key);
    END IF;

    CASE p_key
      WHEN 'game.rounds'                      THEN v_min := 1;   v_max := 50;
      WHEN 'game.min_delay_ms'                THEN v_min := 100; v_max := 10000;
      WHEN 'game.max_delay_ms'                THEN v_min := 200; v_max := 20000;
      WHEN 'game.min_position_distance_pct'   THEN v_min := 0;   v_max := 100;
      WHEN 'offers.default_discount_percent'  THEN v_min := 0;   v_max := 100;
      WHEN 'offers.default_max_usage'         THEN v_min := 1;   v_max := 1000000;
      WHEN 'offers.return_discount_percent'   THEN v_min := 0;   v_max := 100;
      WHEN 'offers.whatsapp_discount_percent' THEN v_min := 0;   v_max := 100;
      WHEN 'offers.whatsapp_max_usage'        THEN v_min := 1;   v_max := 1000000;
      WHEN 'inventory.overstock_multiplier'   THEN v_min := 1;   v_max := 20;
      WHEN 'rules.inventory_low_threshold'    THEN v_min := 1;   v_max := 1000000;
      WHEN 'rules.device_visitors_threshold'  THEN v_min := 1;   v_max := 1000000;
      WHEN 'rules.trade_conversion_threshold' THEN v_min := 1;   v_max := 100;
      WHEN 'rules.visitor_count_threshold'    THEN v_min := 1;   v_max := 1000000;
      WHEN 'rules.default_threshold'          THEN v_min := 1;   v_max := 1000000;
      WHEN 'rules.needs_discount_visit_count' THEN v_min := 1;   v_max := 1000000;
      WHEN 'cache.max_entries'                THEN v_min := 1;   v_max := 100000;
      WHEN 'telemetry.max_batch'              THEN v_min := 1;   v_max := 50;
      WHEN 'telemetry.flush_ms'               THEN v_min := 250; v_max := 60000;
      WHEN 'telemetry.max_buffer'             THEN v_min := 1;   v_max := 1000;
      -- Pass 1 numeric operational knobs (server-side bounds).
      WHEN 'comm.whatsapp_guard_timeout_ms'    THEN v_min := 200;   v_max := 30000;
      WHEN 'comm.whatsapp_min_digits'          THEN v_min := 6;     v_max := 15;
      WHEN 'comm.whatsapp_max_digits'          THEN v_min := 8;     v_max := 15;
      WHEN 'comm.whatsapp_message_max_length'  THEN v_min := 100;   v_max := 10000;
      WHEN 'comm.double_exit_window_ms'        THEN v_min := 500;   v_max := 30000;
      WHEN 'marketplace.listing_page_limit'    THEN v_min := 1;     v_max := 500;
      WHEN 'marketplace.similar_phones_limit'  THEN v_min := 1;     v_max := 50;
      WHEN 'ads.carousel_autoplay_ms'          THEN v_min := 500;   v_max := 30000;
      WHEN 'ads.carousel_swipe_threshold_px'   THEN v_min := 10;    v_max := 200;
      WHEN 'experience.results_auto_advance_ms' THEN v_min := 500;  v_max := 60000;
      WHEN 'experience.gallery_autoplay_ms'    THEN v_min := 500;   v_max := 60000;
      -- Pass 2 (00064): catalog/inventory Pass-2 numeric keys (bounds authored;
      -- strict integrality for these keys is enforced below -> INVALID_VALUE).
      WHEN 'catalog.admin_page_size'          THEN v_min := 1;     v_max := 200;
      WHEN 'catalog.search_result_limit'       THEN v_min := 1;     v_max := 100;
      WHEN 'inventory.max_images'              THEN v_min := 1;     v_max := 20;
      ELSE RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
    END CASE;

    IF v_num < v_min OR v_num > v_max THEN
      RETURN jsonb_build_object('error', 'OUT_OF_RANGE', 'key', p_key, 'min', v_min, 'max', v_max);
    END IF;

    -- Pass 2 (00064): STRICT integrality for the three NEW integer keys — a
    -- fractional number (e.g. 1.5) is rejected here with INVALID_VALUE. The 33
    -- existing numeric/percent keys keep their exact 00059/00060/00063 contract
    -- (fractional in-bounds numerics remain accepted there — NOT changed).
    IF p_key IN ('catalog.admin_page_size', 'catalog.search_result_limit', 'inventory.max_images')
       AND v_num <> trunc(v_num) THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE', 'key', p_key);
    END IF;

    v_new := jsonb_build_object('value', v_num);
  ELSIF v_type = 'text' THEN
    IF jsonb_typeof(p_value) <> 'string' THEN
      RETURN jsonb_build_object('error', 'INVALID_TYPE', 'key', p_key);
    END IF;
    v_str := btrim((p_value)::text);
    IF p_key = 'comm.whatsapp_phone' THEN
      IF v_str !~ '^\+\d{8,15}$' THEN
        RETURN jsonb_build_object('error', 'INVALID_PATTERN', 'key', p_key);
      END IF;
    ELSE
      RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
    END IF;
    v_new := jsonb_build_object('value', v_str);
  ELSIF v_type = 'enum' THEN
    -- STRICT enum validation: an enum accepts a NON-EMPTY JSON array in which
    -- EVERY element is a JSON string AND every string belongs to the closed
    -- allow-list AND no element is duplicated. Anything else is rejected with
    -- INVALID_ALLOWED — invalid elements are NEVER silently dropped and unknown
    -- values are NEVER filtered out. Order is the caller's; we do not reorder
    -- via DISTINCT (DISTINCT does not guarantee/keep caller order).
    IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) = 0 THEN
      RETURN jsonb_build_object('error', 'INVALID_ALLOWED', 'key', p_key);
    END IF;

    -- Closed per-key allow-list (server-side). Unknown enum key => INVALID_KEY.
    CASE p_key
      WHEN 'commerce.currencies' THEN
        v_allowed := ARRAY['USD','DA','SAR','EUR','TRY'];
      WHEN 'ads.placements' THEN
        v_allowed := ARRAY['home','phones','repair','results','exchange','phone-details','showroom'];
      WHEN 'ads.internal_allowlist' THEN
        v_allowed := ARRAY['phone-details','showroom','phone-services','repair-home'];
      ELSE
        RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
    END CASE;

    -- Every element must be a JSON string (reject ["USD",123] / ["USD",true]).
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_value) AS e(el)
      WHERE jsonb_typeof(e.el) <> 'string'
    ) THEN
      RETURN jsonb_build_object('error', 'INVALID_ALLOWED', 'key', p_key);
    END IF;

    -- Every supplied value must belong to the closed allow-list
    -- (reject ["USD","XXX"] / ["XXX"]).
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_value) AS e(el)
      WHERE NOT (e.el = ANY (v_allowed))
    ) THEN
      RETURN jsonb_build_object('error', 'INVALID_ALLOWED', 'key', p_key);
    END IF;

    -- No duplicates — deterministic and explicit (reject ["USD","USD"]).
    IF (
      SELECT count(*) FROM jsonb_array_elements_text(p_value) AS e(el)
    ) <> (
      SELECT count(DISTINCT e.el) FROM jsonb_array_elements_text(p_value) AS e(el)
    ) THEN
      RETURN jsonb_build_object('error', 'INVALID_ALLOWED', 'key', p_key);
    END IF;

    -- All checks passed: keep the caller's exact array (order + content).
    v_new := jsonb_build_object('value', p_value);
  ELSE
    RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
  END IF;

  -- Capture the current value (NULL on first write) for the audit history.
  SELECT as2.value INTO v_old FROM public.app_settings as2 WHERE as2.key = p_key;

  INSERT INTO public.app_settings (key, value, category, type, updated_by, updated_at)
  VALUES (p_key, v_new, v_category, v_type, v_uid, now())
  ON CONFLICT (key) DO UPDATE SET
    value      = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  -- Append-only audit: who/what/old/new/when, all derived server-side.
  INSERT INTO public.app_settings_changes (setting_key, old_value, new_value, updated_by, updated_at)
  VALUES (p_key, v_old, v_new, v_uid, now());

  RETURN jsonb_build_object(
    'error', null,
    'saved', jsonb_build_object('key', p_key, 'value', v_new->>'value', 'category', v_category, 'type', v_type)
  );
END;
$$;

-- get_settings() is unchanged (it already aggregates registered rows generically
-- via value->>'value'); it needs no redefinition and is NOT touched here.

COMMENT ON FUNCTION public.set_setting(text, jsonb) IS
  'Admin settings write. SECURITY DEFINER; WRITE requires role admin/super_admin. '
  'Validates against a closed key registry + declared JSON type (number/text/array) '
  '+ per-key bounds/pattern/allow-list server-side. Appends to app_settings_changes '
  '(append-only audit; old/new/by/at all server-side derived). 00064 added the '
  'catalog.*/inventory.max_images/ads.* Pass-2 branches (with STRICT integrality '
  'for the three new integer keys); every 00059/00060/00063 branch is retained '
  'unchanged.';

-- ============================================================================
-- GRANTS — least privilege (same pattern as 00063/00062). Final ACL:
--   set_setting:         postgres ✓, authenticated ✓, service_role ✓, anon ✗, PUBLIC ✗
--   get_settings_audit:  postgres ✓, authenticated ✓, service_role ✓, anon ✗, PUBLIC ✗
-- get_settings ACL is NOT modified (kept exactly as live).
-- ============================================================================
REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_setting(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.get_settings_audit(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_settings_audit(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_settings_audit(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settings_audit(text, integer) TO service_role;

-- ============================================================================
-- DONE — FINAL 00064 (owner-approved): 5 Pass-2 settings + audit-read RPC +
-- strict integrality for the 3 new integer keys.
--
-- PRE-APPLY proof:     node supabase/verify/compare_set_setting_00063_vs_00064.mjs
-- POST-APPLY checks:   supabase/verify/settings_control_center_pass2.sql
-- ============================================================================

COMMIT;