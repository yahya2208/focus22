-- ============================================================================
-- 00060 — TELEMETRY ADMIN SETTINGS (Phase 4.2)
--
-- Migration number: 00060 (after 00059_settings_control_center.sql — verified
--                         highest by numeric sort).
-- Type: Additive. Extends the CLOSED settings registry from 00059 with three
--       `telemetry.*` keys. Does NOT touch privacy, event shape/names, the
--       record_telemetry_event RPC, 00057/00058, other tables, RBAC, or any
--       frozen contract. Reuses the house SECURITY DEFINER pattern.
--
-- WHAT THIS ADDS
--   Three business/operational telemetry knobs that were hardcoded in
--   src/core/telemetry/types.ts. They now become centralized, server-validated
--   Admin Control Center settings with the SAME defaults as the code fallback:
--     telemetry.max_batch  = 10   (events per batch)
--     telemetry.flush_ms   = 5000 (flush timer interval, ms)
--     telemetry.max_buffer = 50   (in-memory buffer cap)
--
-- SECURITY / SCOPE
--   * CLOSED registry: only the three telemetry keys are registered. Anything
--     else (a security/architectural/secret/invented key) is still rejected by
--     set_setting via the existing CASE ELSE -> INVALID_KEY.
--   * Authorization is unchanged: get_settings() read = admin/super_admin/
--     researcher; set_setting() write = admin/super_admin ONLY. The RPCs are
--     SECURITY DEFINER with SET search_path = '' and fully qualified refs.
--   * Server-side bounds are enforced in set_setting — the admin UI can never
--     be the only guard:
--       telemetry.max_batch  : 1 .. 50
--       telemetry.flush_ms   : 250 .. 60000
--       telemetry.max_buffer : 1 .. 1000
--   * get_settings() already returns ALL registered rows via jsonb_object_agg
--     (no key filter), so the new rows surface automatically; no change needed.
--
-- Rollback (logically reversible):
--   DELETE FROM public.app_settings WHERE key IN
--     ('telemetry.max_batch','telemetry.flush_ms','telemetry.max_buffer');
--   (then re-DROP/re-CREATE set_setting to strip the added CASE branches, or
--    retain them harmlessly — unknown keys still return INVALID_KEY).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Seed the three telemetry keys (defaults mirror the code fallbacks).
--    ON CONFLICT DO NOTHING: if an admin override already exists it is kept.
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, category, type, updated_at)
VALUES
  ('telemetry.max_batch',  jsonb_build_object('value', 10  ), 'telemetry', 'integer', now()),
  ('telemetry.flush_ms',   jsonb_build_object('value', 5000), 'telemetry', 'integer', now()),
  ('telemetry.max_buffer', jsonb_build_object('value', 50  ), 'telemetry', 'integer', now())
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Extend set_setting() with telemetry bounds. The function is recreated so
--    the closed CASE registry includes the three keys. Unregistered keys still
--    fall through to the ELSE -> INVALID_KEY branch (unchanged security model).
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
  v_meta     record;
  v_num      numeric;
  v_min      numeric;
  v_max      numeric;
BEGIN
  -- Authorization — writers are admin / super_admin ONLY (unchanged).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- Closed registry: the key MUST already exist (seeded above).
  SELECT key, category, type INTO v_meta
  FROM public.app_settings WHERE key = p_key;
  IF v_meta IS NULL OR v_meta.key IS NULL THEN
    RETURN jsonb_build_object('error', 'INVALID_KEY');
  END IF;

  IF jsonb_typeof(p_value) <> 'number' THEN
    RETURN jsonb_build_object('error', 'INVALID_TYPE', 'key', p_key);
  END IF;

  v_num := (p_value)::numeric;
  IF v_num IS NULL OR v_num <> v_num THEN
    RETURN jsonb_build_object('error', 'INVALID_VALUE', 'key', p_key);
  END IF;

  -- Range bounds per key (server-side, not client-supplied).
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
    -- Telemetry operational knobs (Phase 4.2).
    WHEN 'telemetry.max_batch'              THEN v_min := 1;   v_max := 50;
    WHEN 'telemetry.flush_ms'               THEN v_min := 250; v_max := 60000;
    WHEN 'telemetry.max_buffer'             THEN v_min := 1;   v_max := 1000;
    ELSE RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
  END CASE;

  IF v_num < v_min OR v_num > v_max THEN
    RETURN jsonb_build_object('error', 'OUT_OF_RANGE', 'key', p_key, 'min', v_min, 'max', v_max);
  END IF;

  INSERT INTO public.app_settings (key, value, category, type, updated_by, updated_at)
  VALUES (v_meta.key, jsonb_build_object('value', v_num), v_meta.category, v_meta.type, v_uid, now())
  ON CONFLICT (key) DO UPDATE SET
    value      = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object(
    'error', null,
    'saved', jsonb_build_object('key', v_meta.key, 'value', v_num, 'category', v_meta.category, 'type', v_meta.type)
  );
END;
$$;

COMMIT;
