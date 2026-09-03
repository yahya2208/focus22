-- ============================================================================
-- 00063 — ADMIN CONTROL CENTER PASS 1: A-class operational settings + audit
--
-- Migration number: 00063 (after 00062_telemetry_analytics_anon_acl_fix.sql).
-- Type: Additive. EXTENDS the existing Settings Control Center (00059/00060) —
--        does NOT create a parallel settings system, does NOT rewrite
--        00059/00060, does NOT touch Phase 8/9 telemetry contracts (00061/
--        00062), RBAC, ROLE_PERMISSIONS, scientific/game scoring, or any frozen
--        migration. Reuses the house SECURITY DEFINER + closed-registry model.
--
-- WHAT THIS ADDS
--   1) A-class operational, non-security, non-scientific settings (see the
--      Admin Settings Inventory, classification A):
--        general.commerce.currencies          (enum: allowed currencies)
--        info.comm.whatsapp_phone             (text: business WhatsApp line)
--        info.comm.whatsapp_guard_timeout_ms  (integer)
--        info.comm.whatsapp_min_digits        (integer)
--        info.comm.whatsapp_max_digits        (integer)
--        info.comm.whatsapp_message_max_length(integer)
--        info.comm.double_exit_window_ms      (integer)
--        marketplace.listing_page_limit       (integer)
--        marketplace.similar_phones_limit     (integer)
--        ads.carousel_autoplay_ms             (integer)
--        ads.carousel_swipe_threshold_px      (integer)
--        experience.results_auto_advance_ms   (integer)
--        experience.gallery_autoplay_ms       (integer)
--   2) `set_setting` generalized to validate TEXT (string) and ENUM (string
--      array) values server-side in ADDITION to numeric — with the closed-key
--      registry, JSON type check, and safe per-key validation intact. ENUM
--      validation is STRICT: empty arrays, non-string elements, out-of-list
--      elements, and duplicates are all rejected (INVALID_ALLOWED) — invalid
--      values are never silently dropped or reordered.
--   3) A lightweight, APPEND-ONLY audit history: `app_settings_changes`
--      (setting_key, old_value, new_value, updated_by, updated_at). Written
--      ONLY inside set_setting (SECURITY DEFINER); admin can never edit it.
--      It records NO secrets beyond the setting value that was just written
--      (WhatsApp line is an operational number, not a credential).
--
-- GAME / SCIENTIFIC LOCKED — intentionally NOT touched:
--   game.* keys stay exactly as registered in 00059 (bounds unchanged).
--   scientific constants / scoring / challenge thresholds are NOT registered
--   here and remain ADMIN-LOCKED (cannot be named or edited via RPC).
--
-- SECURITY / SCOPE
--   * Closed registry: only the hardcoded keys below are added. Any other key
--     (a security/RBAC/secret/scientific/invented key) is still rejected by the
--     ELSE -> INVALID_KEY branch — unchanged security model.
--   * Authorization unchanged: get_settings() read = admin/super_admin/
--     researcher; set_setting() write = admin/super_admin ONLY. Both remain
--     SECURITY DEFINER with SET search_path = '' and fully qualified refs.
--   * Audit table RLS: enabled with ZERO client policies + REVOKE ALL from
--     anon/authenticated => the Admin UI / any client can NEVER read, mutate,
--     or delete audit rows; only set_setting (SECURITY DEFINER) writes them.
--   * updated_by/updated_at/old_value/new_value are ALWAYS derived server-side
--     from auth.uid() / now() / the pre-write row. Admin cannot supply them.
--
-- Rollback (logically reversible — additive only, nothing destructive).
-- 00063 NEVER redefines get_settings(), so it is NOT dropped here. It only:
--   * creates the audit table,
--   * redefines set_setting (extended validator + audit),
--   * seeds the 13 new rows.
-- To revert this migration specifically, run ONLY:
--   DROP TABLE IF EXISTS public.app_settings_changes;
--   (redefine set_setting back to its 00060 body — see 00060 source; DO NOT
--    drop get_settings, which 00063 did not create or modify),
--   DELETE FROM public.app_settings WHERE key IN (<the 13 new keys>);
-- OR keep the additive rows harmlessly (unknown keys still return INVALID_KEY).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Seed the new A-class keys (defaults mirror the current hardcoded values
--    so centralization never changes behavior). ON CONFLICT DO NOTHING keeps
--    any existing admin override.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, category, type, updated_at)
VALUES
  ('commerce.currencies',       jsonb_build_object('value', jsonb_build_array('USD','DA','SAR','EUR','TRY')), 'general',      'enum',     now()),
  ('comm.whatsapp_phone',       jsonb_build_object('value', '+213556254007'),                                  'marketplace',  'text',     now()),
  ('comm.whatsapp_guard_timeout_ms',   jsonb_build_object('value', 1500),                                     'marketplace',  'integer',  now()),
  ('comm.whatsapp_min_digits',        jsonb_build_object('value', 8),                                         'marketplace',  'integer',  now()),
  ('comm.whatsapp_max_digits',        jsonb_build_object('value', 15),                                        'marketplace',  'integer',  now()),
  ('comm.whatsapp_message_max_length', jsonb_build_object('value', 1000),                                     'marketplace',  'integer',  now()),
  ('comm.double_exit_window_ms',      jsonb_build_object('value', 3000),                                      'marketplace',  'integer',  now()),
  ('marketplace.listing_page_limit',  jsonb_build_object('value', 48),                                        'marketplace',  'integer',  now()),
  ('marketplace.similar_phones_limit', jsonb_build_object('value', 8),                                        'marketplace',  'integer',  now()),
  ('ads.carousel_autoplay_ms',        jsonb_build_object('value', 2000),                                      'ads',          'integer',  now()),
  ('ads.carousel_swipe_threshold_px', jsonb_build_object('value', 50),                                        'ads',          'integer',  now()),
  ('experience.results_auto_advance_ms', jsonb_build_object('value', 3000),                                   'experience',   'integer',  now()),
  ('experience.gallery_autoplay_ms',  jsonb_build_object('value', 3000),                                      'experience',   'integer',  now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) app_settings_changes — lightweight, APPEND-ONLY audit history.
--    Only set_setting (SECURITY DEFINER) ever inserts. No client policy =>
--    RLS denies anon/authenticated; admin can never read/mutate/delete it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings_changes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  setting_key text NOT NULL,
  old_value   jsonb,            -- previous value jsonb (NULL on first write)
  new_value   jsonb NOT NULL,   -- the value just written (the audit subject)
  updated_by  uuid NOT NULL,    -- auth.uid() — server-side, never client-supplied
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_settings_changes_key_idx
  ON public.app_settings_changes (setting_key, updated_at);

ALTER TABLE public.app_settings_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_settings_changes FROM PUBLIC;
REVOKE ALL ON public.app_settings_changes FROM anon;
REVOKE ALL ON public.app_settings_changes FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3) set_setting(text, jsonb) — extended closed-registry validator.
--    Numeric keys use the exact 00059/00060 bounds. TEXT keys accept a JSON
--    string validated against a pattern. ENUM keys accept a JSON array of
--    strings each validated against the closed allow-list. Every successful
--    write also appends an audit row (old/new/by/at, server-side derived).
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
      ELSE RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
    END CASE;

    IF v_num < v_min OR v_num > v_max THEN
      RETURN jsonb_build_object('error', 'OUT_OF_RANGE', 'key', p_key, 'min', v_min, 'max', v_max);
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
-- via value->>'value'); it needs no redefinition for the new rows.

COMMENT ON FUNCTION public.set_setting(text, jsonb) IS
  'Admin settings write. SECURITY DEFINER; WRITE requires role admin/super_admin. '
  'Validates against a closed key registry + declared JSON type (number/text/array) '
  '+ per-key bounds/pattern/allow-list server-side. Appends to app_settings_changes '
  '(append-only audit; old/new/by/at all server-side derived).';

COMMENT ON TABLE public.app_settings_changes IS
  'Append-only audit history for Admin Control Center settings. Written ONLY by '
  'set_setting (SECURITY DEFINER). RLS denies anon/authenticated entirely - admin '
  'cannot read, modify, or delete audit rows.';

-- ============================================================================
-- GRANTS — least privilege. Revoke from anon explicitly (Supabase default
-- grants gave anon EXECUTE when the function was first created in 00059;
-- CREATE OR REPLACE never resets ACLs, so a targeted REVOKE is required).
-- See: 00062_telemetry_analytics_anon_acl_fix.sql (same pattern).
-- Final ACL: postgres ✓, authenticated ✓, service_role ✓, anon ✗, PUBLIC ✗.
-- ============================================================================
REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_setting(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO service_role;

-- ============================================================================
-- DONE — Admin Control Center Pass 1: A-class settings + lightweight audit (00063)
--
-- POST-APPLY VERIFICATION (run in a SQL client):
--   1. super_admin sets a numeric:
--        SELECT public.set_setting('marketplace.listing_page_limit','60'::jsonb); -> saved
--        SELECT public.set_setting('marketplace.listing_page_limit','48'::jsonb);
--   2. super_admin sets the WhatsApp line:
--        SELECT public.set_setting('comm.whatsapp_phone','"+213550000000"'::jsonb); -> saved
--        SELECT public.set_setting('comm.whatsapp_phone','"+213556254007"'::jsonb);
--   3. String rejected (bad phone):
--        SELECT public.set_setting('comm.whatsapp_phone','"nope"'::jsonb); -> INVALID_PATTERN
--   4. Enum rejected (strict — invalid/duplicate/non-string/empty NEVER dropped):
--        SELECT public.set_setting('commerce.currencies','["USD","XXX"]'::jsonb); -> INVALID_ALLOWED
--        SELECT public.set_setting('commerce.currencies','["XXX"]'::jsonb);      -> INVALID_ALLOWED
--        SELECT public.set_setting('commerce.currencies','["USD",123]'::jsonb);  -> INVALID_ALLOWED
--        SELECT public.set_setting('commerce.currencies','["USD",true]'::jsonb); -> INVALID_ALLOWED
--        SELECT public.set_setting('commerce.currencies','[]'::jsonb);            -> INVALID_ALLOWED
--        SELECT public.set_setting('commerce.currencies','["USD","USD"]'::jsonb); -> INVALID_ALLOWED
--        SELECT public.set_setting('commerce.currencies','"USD"'::jsonb);         -> INVALID_ALLOWED (not an array)
--   5. Enum accepted (caller order preserved, no silent reorder):
--        SELECT public.set_setting('commerce.currencies','["USD","DA"]'::jsonb); -> saved
--        SELECT public.set_setting('commerce.currencies','["USD","DA","SAR","EUR","TRY"]'::jsonb);
--   6. Audit append-only & RLS-denied:
--        SELECT count(*) FROM public.app_settings_changes; -- as anon/authenticated -> RLS denies (0)
--        (as owner/postgres) SELECT setting_key, old_value, new_value, updated_by, updated_at FROM public.app_settings_changes ORDER BY id;
--   7. Invalid key still rejected:
--        SELECT public.set_setting('security.xxx','1'::jsonb); -> INVALID_KEY
--   8. game.* untouched (still registered, same bounds):
--        SELECT public.set_setting('game.rounds','7'::jsonb); -> saved (bounds 1..50 unchanged)
-- ============================================================================

COMMIT;
