-- ============================================================================
-- 00059 — FOCUS SETTINGS CONTROL CENTER (Phase 7)
--
-- Migration number: 00059 (after 00058_telemetry_analytics.sql — verified highest).
-- Type: Additive (CREATE TABLE + CREATE FUNCTION + GRANT only). Does NOT touch
--        00057, 00058, record_telemetry_event, get_telemetry_analytics, RLS on
--        other tables, ROLE_PERMISSIONS, ROLE_CAPABILITY_MAP, or any frozen
--        migration. Reuses the house SECURITY DEFINER pattern from
--        00057/00058/get_phone_intelligence.
--
-- PURPOSE
--   A minimal, secure, central store for the ADMIN-CONTROLLABLE business
--   settings that Phase 6 classified 🟢 SAFE. Not a general-purpose key-value
--   store: only a CLOSED set of registered keys may be read/written. The
--   settings are business rules (game, offers, inventory, rules, cache) that
--   live now in hardcoded constants; this table becomes the optional override,
--   with fast, safe runtime fallback to the existing defaults if the RPC is
--   unreachable.
--
-- SECURITY MODEL (the ONLY reader/writer is the RPC layer)
--   * SECURITY DEFINER — the functions read/write app_settings as their OWNER,
--     bypassing RLS *only* inside the function body. RLS is enabled on the
--     table with ZERO client policies => anon/authenticated can never touch it.
--   * Authorization is enforced INSIDE PostgreSQL against public.users.role:
--       - get_settings():  reader: admin / super_admin / researcher
--       - set_setting():   writer: admin / super_admin ONLY
--     A `user`/`guest`/plain `researcher`-as-writer is rejected server-side,
--     even if they call the RPC directly.
--   * CLOSED registry: only the keys declared in SETTINGS_REGISTRY below may be
--     read/written. `set_setting` validates key existence, the expected JSON
--     type, and numeric min/max bounds server-side. It rejects security /
--     architectural / secret / DECISION settings that are NOT registered (they
--     cannot even be named) and can never be exposed or mutated.
--   * `updated_by` / `updated_at` are always derived server-side from
--     auth.uid() / now(); the client can never supply them.
--   * `SET search_path = ''` with fully schema-qualified references (defeats
--     search_path hijacking), mirroring 00057/00058.
--   * Grant model follows the house pattern: REVOKE ALL ... FROM PUBLIC then
--     GRANT EXECUTE ... TO authenticated (never anon).
--
-- CONTRACT
--   All values are stored as jsonb. get_settings() returns the full registered
--   set as { key: value } (only registered keys), never raw rows / audit.
--   set_setting(p_key, p_value) upserts one validated setting.
--
-- Rollback (logically reversible — nothing destructive was touched):
--   DROP FUNCTION IF EXISTS public.get_settings();
--   DROP FUNCTION IF EXISTS public.set_setting(text, jsonb);
--   DROP TABLE IF EXISTS public.app_settings;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) app_settings — the single, minimal central-settings store
--    category/type stored for admin-UI grouping & rendering; NOT user data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,                 -- registered key (closed registry)
  value      jsonb NOT NULL,                   -- typed, server-validated value
  category   text NOT NULL,                    -- 'game'|'offers'|'inventory'|'rules'|'cache'
  type       text NOT NULL,                    -- 'integer'|'percent' (scalar numeric)
  updated_by uuid,                             -- auth.uid() ONLY, server-side
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No client policy: RLS enabled with zero anon/authenticated policies => denied.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_settings FROM PUBLIC;
REVOKE ALL ON public.app_settings FROM anon;
REVOKE ALL ON public.app_settings FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2) CLOSED SETTINGS REGISTRY + validation bounds (single source of truth).
--    Defaults seed the table so the registry and the table never diverge, and
--    the admin UI can always show current + default on a fresh DB.
--    Keys NOT listed here are unreadable/unwritable by design.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_defaults  jsonb := jsonb_build_object(
    'game.rounds'                     , jsonb_build_object('value', 7   , 'category', 'game', 'type', 'integer'),
    'game.min_delay_ms'               , jsonb_build_object('value', 750 , 'category', 'game', 'type', 'integer'),
    'game.max_delay_ms'               , jsonb_build_object('value', 2890, 'category', 'game', 'type', 'integer'),
    'game.min_position_distance_pct'  , jsonb_build_object('value', 25  , 'category', 'game', 'type', 'percent'),
    'offers.default_discount_percent' , jsonb_build_object('value', 5   , 'category', 'offers', 'type', 'percent'),
    'offers.default_max_usage'        , jsonb_build_object('value', 50  , 'category', 'offers', 'type', 'integer'),
    'offers.return_discount_percent'  , jsonb_build_object('value', 5   , 'category', 'offers', 'type', 'percent'),
    'offers.whatsapp_discount_percent', jsonb_build_object('value', 8   , 'category', 'offers', 'type', 'percent'),
    'offers.whatsapp_max_usage'       , jsonb_build_object('value', 30  , 'category', 'offers', 'type', 'integer'),
    'inventory.overstock_multiplier'  , jsonb_build_object('value', 3   , 'category', 'inventory', 'type', 'integer'),
    'rules.inventory_low_threshold'   , jsonb_build_object('value', 5   , 'category', 'rules', 'type', 'integer'),
    'rules.device_visitors_threshold' , jsonb_build_object('value', 30  , 'category', 'rules', 'type', 'integer'),
    'rules.trade_conversion_threshold', jsonb_build_object('value', 10  , 'category', 'rules', 'type', 'integer'),
    'rules.visitor_count_threshold'   , jsonb_build_object('value', 90  , 'category', 'rules', 'type', 'integer'),
    'rules.default_threshold'         , jsonb_build_object('value', 3   , 'category', 'rules', 'type', 'integer'),
    'rules.needs_discount_visit_count', jsonb_build_object('value', 3   , 'category', 'rules', 'type', 'integer'),
    'cache.max_entries'               , jsonb_build_object('value', 500 , 'category', 'cache', 'type', 'integer')
  );
  v_key   text;
  v_meta  jsonb;
BEGIN
  FOR v_key, v_meta IN SELECT key, value FROM jsonb_each(v_defaults) LOOP
    INSERT INTO public.app_settings (key, value, category, type, updated_at)
    VALUES (
      v_key,
      jsonb_build_object('value', (v_meta->>'value')::numeric),
      v_meta->>'category',
      v_meta->>'type',
      now()
    )
    ON CONFLICT (key) DO NOTHING;   -- preserve any existing admin override
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) get_settings() — SECURITY DEFINER read RPC (admin / super_admin / researcher)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
BEGIN
  -- Authorization — server-side, tolerant of anonymous callers.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'researcher') THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  -- Aggregate ONLY registered settings as { key: { value, category, type } }.
  RETURN jsonb_build_object(
    'error', null,
    'settings', COALESCE((
      SELECT jsonb_object_agg(as2.key,
        jsonb_build_object(
          'value', as2.value->>'value',
          'category', as2.category,
          'type', as2.type
        )
      )
      FROM public.app_settings as2
    ), '{}'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) set_setting(p_key text, p_value jsonb) — SECURITY DEFINER write RPC
--    (admin / super_admin ONLY). Validates key + type + numeric bounds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_setting(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
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
  -- Authorization — writers are admin / super_admin ONLY.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;

  -- Closed registry: the key MUST already exist (seeded above). A key that is
  -- not registered (e.g. a security/architectural/secret or an invented key)
  -- is rejected — it can never be introduced via RPC.
  SELECT key, category, type INTO v_meta
  FROM public.app_settings WHERE key = p_key;
  IF v_meta IS NULL OR v_meta.key IS NULL THEN
    RETURN jsonb_build_object('error', 'INVALID_KEY');
  END IF;

  -- Type check: value must be a JSON number (integer/percent are numeric).
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
    WHEN 'cache.max_entries'                THEN v_min := 1;   v_max := 100000;  -- bound runtime memory
    ELSE RETURN jsonb_build_object('error', 'INVALID_KEY', 'key', p_key);
  END CASE;

  IF v_num < v_min OR v_num > v_max THEN
    RETURN jsonb_build_object('error', 'OUT_OF_RANGE', 'key', p_key, 'min', v_min, 'max', v_max);
  END IF;

  -- UPSERT the validated value. updated_by/updated_at derived server-side.
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

COMMENT ON FUNCTION public.get_settings() IS
  'Admin settings read. SECURITY DEFINER; authorizes via public.users.role '
  '(admin/super_admin/researcher). Returns ONLY the closed registered settings '
  'as {key:{value,category,type}}. Direct table access stays RLS-denied.';

COMMENT ON FUNCTION public.set_setting(text, jsonb) IS
  'Admin settings write. SECURITY DEFINER; WRITE requires role admin/super_admin. '
  'Validates against a closed key registry + JSON number type + numeric bounds '
  'server-side. updated_by/updated_at are set server-side.';

-- ============================================================================
-- GRANTS — least privilege (house model: revoke PUBLIC, grant authenticated)
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC;

-- get_settings: readers = staff/research (admin, super_admin, researcher).
GRANT EXECUTE ON FUNCTION public.get_settings() TO authenticated;
-- set_setting: WRITERS gated INSIDE the function (admin/super_admin only); the
-- grant is still limited to authenticated so anon can never even invoke it.
GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated;

-- ============================================================================
-- DONE — settings control center table + safe read/write RPCs (migration 00059)
--
-- POST-APPLY VERIFICATION (run in a SQL client):
--   1. Admin/super_admin/researcher:
--        SELECT public.get_settings();  -> {error:null, settings:{...}}
--   2. super_admin sets a value:
--        SELECT public.set_setting('cache.max_entries', '600'::jsonb);  -> saved
--        (reset: SELECT public.set_setting('cache.max_entries','500'::jsonb);)
--   3. researcher WRITE is denied:
--        (SET ROLE researcher-as-authenticated) -> {error:'FORBIDDEN'}
--   4. Invalid key rejected:
--        SELECT public.set_setting('security.xxx', '1'::jsonb); -> INVALID_KEY
--   5. Out-of-range rejected:
--        SELECT public.set_setting('game.rounds','999'::jsonb); -> OUT_OF_RANGE
--   6. Direct table read is still blocked for non-owner:
--        SELECT count(*) FROM public.app_settings; -> RLS denies (0 rows).
-- ============================================================================

COMMIT;
