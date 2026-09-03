-- ============================================================================
-- 00061 — FOCUS TELEMETRY PHASE 8 EVENTS (additive, owner-approved 2026-09-02)
--
-- Phase 8 adds genuinely-NEW event names that the server allowlist in 00057
-- does not yet accept: per-round Reaction Light progress and the results-view,
-- plus the auth funnel. The DB REQUIRED a change because record_telemetry_event
-- hard-rejects any event name / property key not in its hardcoded CASE allowlist
-- (raises UNKNOWN_EVENT_OR_DOMAIN / UNALLOWED_FIELD). This migration is STRICTLY
-- ADDITIVE:
--   * re-creates record_telemetry_event with additional event->domain and
--     event->property-allowlist branches, all existing branches untouched;
--   * extends the closed domain dictionary consumed by get_telemetry_analytics
--     (00058) to include the new 'auth' domain;
--   * NO DROP, NO table-schema change, NO index change, NO RBAC change;
--   * does NOT modify any existing event name/property contract.
--
-- Rollback: CREATE OR REPLACE the functions back from 00057/00058 (no data
-- migration is needed — new events are additive and never destructive).
-- Post-apply verification: supabase/verify/telemetry_phase8_events.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) record_telemetry_event(p_events jsonb) — extended allowlist (additive)
--    Identical to 00057 EXCEPT for the ADDED CASE branches (new events) marked
--    below. All other logic is byte-for-byte the 00057 body.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_telemetry_event(p_events jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_ev        jsonb;
  v_name      text;
  v_ver       integer;
  v_domain    text;
  v_occ       text;
  v_sess      text;
  v_anon      text;
  v_screen    text;
  v_etype     text;
  v_eid       text;
  v_props     jsonb;
  v_ctx       jsonb;
  v_dedup     text;
  v_key       text;
  v_val       jsonb;
  v_prop_types text;
  v_ok_domain boolean;
  v_allowed   text[];
  v_forbidden text[];
  v_i         integer;
  v_n         integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- bounded batch to bound request body / validation cost
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 50 THEN
    RAISE EXCEPTION 'INVALID_BATCH';
  END IF;

  v_n := jsonb_array_length(p_events);
  FOR v_i IN 0 .. v_n - 1 LOOP
    v_ev  := p_events->v_i;
    v_name := v_ev->>'event_name';
    v_ver  := COALESCE((v_ev->>'event_version')::int, 1);
    v_domain := v_ev->>'domain';
    v_occ  := v_ev->>'occurred_at';
    v_sess := v_ev->>'session_id';
    v_anon := v_ev->>'anonymous_id';
    v_screen := v_ev->>'screen';
    v_etype := v_ev->>'entity_type';
    v_eid   := v_ev->>'entity_id';
    v_props := COALESCE(v_ev->'properties', '{}'::jsonb);
    v_ctx   := v_ev->'context';
    v_dedup := v_ev->>'dedupe_key';

    -- 1) known event name + its known domain
    v_ok_domain := false;
    CASE v_name
      WHEN 'app_open' THEN v_ok_domain := (v_domain = 'app');
      WHEN 'app_ready' THEN v_ok_domain := (v_domain = 'app');
      WHEN 'app_background' THEN v_ok_domain := (v_domain = 'app');
      WHEN 'app_foreground' THEN v_ok_domain := (v_domain = 'app');
      WHEN 'app_update_detected' THEN v_ok_domain := (v_domain = 'app');
      WHEN 'app_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'screen_view' THEN v_ok_domain := (v_domain = 'navigation');
      WHEN 'navigation_back' THEN v_ok_domain := (v_domain = 'navigation');
      WHEN 'navigation_exit' THEN v_ok_domain := (v_domain = 'navigation');
      WHEN 'deep_link_open' THEN v_ok_domain := (v_domain = 'navigation');
      WHEN 'category_view' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'subcategory_view' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'category_product_list_view' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'category_product_click' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'category_search' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'category_filter' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'category_sort' THEN v_ok_domain := (v_domain = 'category');
      WHEN 'product_impression' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_view' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_image_view' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_variant_select' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_details_expand' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_share' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_favorite' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_contact' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'product_back' THEN v_ok_domain := (v_domain = 'product');
      WHEN 'listing_create_start' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_create_submit' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_create_success' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_create_failed' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_view_detail' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_share' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_contact' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_add_to_cart' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_edit_start' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_edit_success' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_delete' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'listing_publish' THEN v_ok_domain := (v_domain = 'listing');
      WHEN 'cart_add' THEN v_ok_domain := (v_domain = 'cart');
      WHEN 'cart_remove' THEN v_ok_domain := (v_domain = 'cart');
      WHEN 'cart_quantity_change' THEN v_ok_domain := (v_domain = 'cart');
      WHEN 'cart_clear' THEN v_ok_domain := (v_domain = 'cart');
      WHEN 'cart_view' THEN v_ok_domain := (v_domain = 'cart');
      WHEN 'request_start' THEN v_ok_domain := (v_domain = 'request');
      WHEN 'request_submit' THEN v_ok_domain := (v_domain = 'request');
      WHEN 'request_success' THEN v_ok_domain := (v_domain = 'request');
      WHEN 'request_failed' THEN v_ok_domain := (v_domain = 'request');
      WHEN 'whatsapp_open' THEN v_ok_domain := (v_domain = 'request');
      WHEN 'ad_impression' THEN v_ok_domain := (v_domain = 'ad');
      WHEN 'ad_click' THEN v_ok_domain := (v_domain = 'ad');
      WHEN 'ad_contact' THEN v_ok_domain := (v_domain = 'ad');
      WHEN 'game_intro_view' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_start' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_exit' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_pause' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_resume' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_complete' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_round_complete' THEN v_ok_domain := (v_domain = 'game');          -- NEW (Phase 8)
      WHEN 'game_result_view' THEN v_ok_domain := (v_domain = 'game');             -- NEW (Phase 8)
      WHEN 'game_abandon' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'ttt_lobby_view' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_game_create' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_invite_generate' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_invite_share' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_invite_open' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_join_attempt' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_join_success' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_join_failed' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_game_ready' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_move_submit' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_move_accepted' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_move_rejected' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_game_win' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_game_draw' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_game_exit' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'ttt_game_abandon' THEN v_ok_domain := (v_domain = 'ttt');
      WHEN 'auth_login_success' THEN v_ok_domain := (v_domain = 'auth');           -- NEW (Phase 8)
      WHEN 'auth_login_failed' THEN v_ok_domain := (v_domain = 'auth');            -- NEW (Phase 8)
      WHEN 'auth_register_success' THEN v_ok_domain := (v_domain = 'auth');        -- NEW (Phase 8)
      WHEN 'auth_register_failed' THEN v_ok_domain := (v_domain = 'auth');         -- NEW (Phase 8)
      WHEN 'auth_guest_gate_seen' THEN v_ok_domain := (v_domain = 'auth');         -- NEW (Phase 8)
      WHEN 'auth_guest_upgrade_cta' THEN v_ok_domain := (v_domain = 'auth');       -- NEW (Phase 8)
      WHEN 'rpc_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'network_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'validation_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'ui_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'unhandled_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'permission_denied' THEN v_ok_domain := (v_domain = 'system');
      ELSE
        v_ok_domain := false;
    END CASE;

    IF NOT v_ok_domain THEN
      RAISE EXCEPTION 'UNKNOWN_EVENT_OR_DOMAIN';
    END IF;

    -- 2) required core fields
    IF v_sess IS NULL OR v_sess = '' THEN
      RAISE EXCEPTION 'MISSING_SESSION';
    END IF;

    -- 2b) anonymous_id, when present, MUST be the 32 lowercase-hex focus_vid_v1
    --     visitor hash. Never accept an arbitrary value (client-independent guard).
    IF v_anon IS NOT NULL AND (
      length(v_anon) <> 32
      OR v_anon !~ '^[0-9a-f]{32}$'
    ) THEN
      RAISE EXCEPTION 'INVALID_ANONYMOUS_ID';
    END IF;
    v_forbidden := ARRAY[
      'phone','phone_number','phone1','phone2','mobile','email','email_address',
      'address','address1','address2','city','state','zip','postal_code','notes',
      'message','body','body_text','text','content','free_text','comment','feedback',
      'reply','name','full_name','first_name','last_name','username','display_name',
      'source_label','location','passphrase','token','auth_token','access_token',
      'refresh_token','id_token','code','auth_code','verification_code','challenge_id',
      'secret','password','pin','otp','security_answer','query','search_query',
      'search_term','url','redirect','callback','next','state','s','nonce','fingerprint',
      'device_id','ip','ip_address','description','title','serial','stack','imei','mac',
      'fingerprint_raw'
    ];

    -- per-event allowed keys ('' = none)
    v_allowed := '{}'::text[];
    CASE v_name
      WHEN 'app_update_detected' THEN v_allowed := ARRAY['from','to'];
      WHEN 'app_error' THEN v_allowed := ARRAY['error_code','count'];
      WHEN 'screen_view' THEN v_allowed := ARRAY['from','is_initial'];
      WHEN 'navigation_back' THEN v_allowed := ARRAY['to'];
      WHEN 'deep_link_open' THEN v_allowed := ARRAY['mode','has_code'];
      WHEN 'category_product_list_view' THEN v_allowed := ARRAY['count'];
      WHEN 'category_product_click' THEN v_allowed := ARRAY['position'];
      WHEN 'category_search' THEN v_allowed := ARRAY['has_result'];
      WHEN 'category_filter' THEN v_allowed := ARRAY['filter','active'];
      WHEN 'category_sort' THEN v_allowed := ARRAY['sort','direction'];
      WHEN 'product_impression' THEN v_allowed := ARRAY['position'];
      WHEN 'product_image_view' THEN v_allowed := ARRAY['index'];
      WHEN 'product_variant_select' THEN v_allowed := ARRAY['variant'];
      WHEN 'product_details_expand' THEN v_allowed := ARRAY['section'];
      WHEN 'product_share' THEN v_allowed := ARRAY['method'];
      WHEN 'product_favorite' THEN v_allowed := ARRAY['active'];
      WHEN 'product_contact' THEN v_allowed := ARRAY['method'];
      WHEN 'listing_create_start' THEN v_allowed := ARRAY['step'];
      WHEN 'listing_create_failed' THEN v_allowed := ARRAY['error_code'];
      WHEN 'listing_share' THEN v_allowed := ARRAY['method'];
      WHEN 'listing_contact' THEN v_allowed := ARRAY['method'];
      WHEN 'listing_add_to_cart' THEN v_allowed := ARRAY['qty'];
      WHEN 'cart_add' THEN v_allowed := ARRAY['qty'];
      WHEN 'cart_quantity_change' THEN v_allowed := ARRAY['qty'];
      WHEN 'cart_clear' THEN v_allowed := ARRAY['count'];
      WHEN 'cart_view' THEN v_allowed := ARRAY['count'];
      WHEN 'request_failed' THEN v_allowed := ARRAY['error_code'];
      WHEN 'whatsapp_open' THEN v_allowed := ARRAY['method'];
      WHEN 'ad_impression' THEN v_allowed := ARRAY['position'];
      WHEN 'ad_click' THEN v_allowed := ARRAY['position'];
      WHEN 'ad_contact' THEN v_allowed := ARRAY['method'];
      WHEN 'game_intro_view' THEN v_allowed := ARRAY['game'];
      WHEN 'game_start' THEN v_allowed := ARRAY['game','size'];
      WHEN 'game_exit' THEN v_allowed := ARRAY['game'];
      WHEN 'game_pause' THEN v_allowed := ARRAY['game'];
      WHEN 'game_resume' THEN v_allowed := ARRAY['game'];
      WHEN 'game_complete' THEN v_allowed := ARRAY['game','outcome'];
      WHEN 'game_round_complete' THEN v_allowed := ARRAY['game','round_index','hit']; -- NEW (Phase 8)
      WHEN 'game_result_view' THEN v_allowed := ARRAY['game'];                       -- NEW (Phase 8)
      WHEN 'game_abandon' THEN v_allowed := ARRAY['game','turns'];
      WHEN 'ttt_game_create' THEN v_allowed := ARRAY['mode','size'];
      WHEN 'ttt_invite_share' THEN v_allowed := ARRAY['method'];
      WHEN 'ttt_join_success' THEN v_allowed := ARRAY['side'];
      WHEN 'ttt_join_failed' THEN v_allowed := ARRAY['error_code'];
      WHEN 'ttt_game_ready' THEN v_allowed := ARRAY['side'];
      WHEN 'ttt_move_submit' THEN v_allowed := ARRAY['index'];
      WHEN 'ttt_move_accepted' THEN v_allowed := ARRAY['index'];
      WHEN 'ttt_move_rejected' THEN v_allowed := ARRAY['index','error_code'];
      WHEN 'ttt_game_win' THEN v_allowed := ARRAY['side','turns'];
      WHEN 'ttt_game_draw' THEN v_allowed := ARRAY['turns'];
      WHEN 'ttt_game_abandon' THEN v_allowed := ARRAY['turns'];
      WHEN 'auth_login_failed' THEN v_allowed := ARRAY['error_code'];                -- NEW (Phase 8)
      WHEN 'auth_register_failed' THEN v_allowed := ARRAY['error_code'];             -- NEW (Phase 8)
      WHEN 'rpc_error' THEN v_allowed := ARRAY['rpc','error_code'];
      WHEN 'network_error' THEN v_allowed := ARRAY['error_code'];
      WHEN 'validation_error' THEN v_allowed := ARRAY['error_code'];
      WHEN 'ui_error' THEN v_allowed := ARRAY['error_code'];
      WHEN 'unhandled_error' THEN v_allowed := ARRAY['error_code','count'];
      WHEN 'permission_denied' THEN v_allowed := ARRAY['error_code'];
      -- events with a closed EMPTY allowlist (no properties permitted)
      WHEN 'app_open' THEN v_allowed := ARRAY[]::text[];
      WHEN 'app_ready' THEN v_allowed := ARRAY[]::text[];
      WHEN 'app_background' THEN v_allowed := ARRAY[]::text[];
      WHEN 'app_foreground' THEN v_allowed := ARRAY[]::text[];
      WHEN 'navigation_exit' THEN v_allowed := ARRAY[]::text[];
      WHEN 'category_view' THEN v_allowed := ARRAY[]::text[];
      WHEN 'subcategory_view' THEN v_allowed := ARRAY[]::text[];
      WHEN 'product_view' THEN v_allowed := ARRAY[]::text[];
      WHEN 'product_back' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_create_submit' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_create_success' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_view_detail' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_edit_start' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_edit_success' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_delete' THEN v_allowed := ARRAY[]::text[];
      WHEN 'listing_publish' THEN v_allowed := ARRAY[]::text[];
      WHEN 'cart_remove' THEN v_allowed := ARRAY[]::text[];
      WHEN 'request_start' THEN v_allowed := ARRAY[]::text[];
      WHEN 'request_submit' THEN v_allowed := ARRAY[]::text[];
      WHEN 'request_success' THEN v_allowed := ARRAY[]::text[];
      WHEN 'ttt_lobby_view' THEN v_allowed := ARRAY[]::text[];
      WHEN 'ttt_invite_generate' THEN v_allowed := ARRAY[]::text[];
      WHEN 'ttt_invite_open' THEN v_allowed := ARRAY[]::text[];
      WHEN 'ttt_join_attempt' THEN v_allowed := ARRAY[]::text[];
      WHEN 'ttt_game_exit' THEN v_allowed := ARRAY[]::text[];
      WHEN 'auth_login_success' THEN v_allowed := ARRAY[]::text[];                  -- NEW (Phase 8)
      WHEN 'auth_register_success' THEN v_allowed := ARRAY[]::text[];               -- NEW (Phase 8)
      WHEN 'auth_guest_gate_seen' THEN v_allowed := ARRAY[]::text[];                -- NEW (Phase 8)
      WHEN 'auth_guest_upgrade_cta' THEN v_allowed := ARRAY[]::text[];              -- NEW (Phase 8)
      ELSE v_allowed := '{}'::text[];
    END CASE;

    -- validate property object shape: object, keys within allowlist & not forbidden, scalar values
    IF jsonb_typeof(v_props) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_PROPERTIES';
    END IF;

    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_props) LOOP
      -- forbidden field (PII / free text / sensitive) — hard reject
      IF v_key = ANY (v_forbidden) THEN
        RAISE EXCEPTION 'FORBIDDEN_FIELD';
      END IF;
      -- must be in the allowlist
      IF NOT (v_key = ANY (v_allowed)) THEN
        RAISE EXCEPTION 'UNALLOWED_FIELD';
      END IF;
      -- scalar-only (no nested objects/arrays / free text size guard)
      v_prop_types := jsonb_typeof(v_val);
      IF v_prop_types NOT IN ('string','number','boolean','null') THEN
        RAISE EXCEPTION 'INVALID_PROPERTY_VALUE';
      END IF;
      IF v_prop_types = 'string' AND length(v_val #>> '{}') > 120 THEN
        RAISE EXCEPTION 'PROPERTY_TOO_LONG';
      END IF;
    END LOOP;

    -- context: non-PII sparse, object with scalar values only
    IF v_ctx IS NOT NULL AND v_ctx <> 'null'::jsonb THEN
      IF jsonb_typeof(v_ctx) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_CONTEXT';
      END IF;
      FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_ctx) LOOP
        IF v_key = ANY (v_forbidden) THEN
          RAISE EXCEPTION 'FORBIDDEN_FIELD';
        END IF;
        v_prop_types := jsonb_typeof(v_val);
        IF v_prop_types NOT IN ('string','number','boolean','null') THEN
          RAISE EXCEPTION 'INVALID_CONTEXT_VALUE';
        END IF;
      END LOOP;
    END IF;

    -- insert (event_id unique guards replay; dedupe_key partial-unique collapses repeats)
    BEGIN
      INSERT INTO public.telemetry_events
        (event_id, event_name, event_version, domain, occurred_at,
         session_id, anonymous_id, user_id, screen, entity_type, entity_id,
         properties, context, dedupe_key)
      VALUES
        (v_ev->>'event_id', v_name, v_ver, v_domain,
         to_timestamp(v_occ, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
         v_sess, v_anon, v_uid, v_screen, v_etype, v_eid,
         v_props, v_ctx, v_dedup);
    EXCEPTION WHEN unique_violation THEN
      -- event_id or dedupe_key already present: idempotent drop (replay-safe)
      NULL;
    END;
  END LOOP;
END;
$$;

-- Revoke/grant unchanged (least privilege, matches 00057).
REVOKE ALL ON FUNCTION public.record_telemetry_event(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2) get_telemetry_analytics(…) — extend the CLOSED registries (00058)
--    with the new 'auth' domain + the new Phase 8 event names. This is the
--    EXACT 00058 function body with ONLY two additive changes:
--      a) 'auth' added to the `v_dom_ok` domain dictionary;
--      b) the 6 new Phase 8 event names added to the `v_ev_ok` event allowlist.
--    All other logic (authorization, output shape, funnels) is unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_telemetry_analytics(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL,
  p_domain    text        DEFAULT NULL,
  p_event     text        DEFAULT NULL,
  p_game      text        DEFAULT NULL,
  p_entity_id text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_from     timestamptz;
  v_to       timestamptz;
  v_domain   text;
  v_event    text;
  v_game     text;
  v_entity   text;
  v_dom_ok   boolean;
  v_ev_ok    boolean;
BEGIN
  -- 1) Authorization — server-side, tolerant of anonymous callers.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'researcher') THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  -- 2) Normalize filters (NULL == no filter; empty text -> NULL).
  v_from   := p_date_from;
  v_to     := p_date_to;
  v_domain := NULLIF(btrim(p_domain), '');
  v_event  := NULLIF(btrim(p_event), '');
  v_game   := NULLIF(btrim(p_game), '');
  v_entity := NULLIF(btrim(p_entity_id), '');

  -- Range sanity: reject inverted windows.
  IF v_from IS NOT NULL AND v_to IS NOT NULL AND v_to < v_from THEN
    RETURN jsonb_build_object('error', 'INVALID_DATE_RANGE');
  END IF;

  -- 3) Validate domain / event against the CLOSED registries (00057 contract).
  --    'auth' and the Phase 8 event names are NEW (00061); all existing values unchanged.
  v_dom_ok := (v_domain IS NULL OR v_domain IN (
    'app','navigation','category','product','listing','cart','request','ad','game','ttt','auth','system'));
  v_ev_ok  := (v_event IS NULL OR v_event IN (
    'app_open','app_ready','app_background','app_foreground','app_update_detected','app_error',
    'screen_view','navigation_back','navigation_exit','deep_link_open',
    'category_view','subcategory_view','category_product_list_view','category_product_click',
    'category_search','category_filter','category_sort',
    'product_impression','product_view','product_image_view','product_variant_select',
    'product_details_expand','product_share','product_favorite','product_contact','product_back',
    'listing_create_start','listing_create_submit','listing_create_success','listing_create_failed',
    'listing_view_detail','listing_share','listing_contact','listing_add_to_cart',
    'listing_edit_start','listing_edit_success','listing_delete','listing_publish',
    'cart_add','cart_remove','cart_quantity_change','cart_clear','cart_view',
    'request_start','request_submit','request_success','request_failed','whatsapp_open',
    'ad_impression','ad_click','ad_contact',
    'game_intro_view','game_start','game_round_complete','game_exit','game_pause','game_resume',
    'game_complete','game_result_view','game_abandon',
    'ttt_lobby_view','ttt_game_create','ttt_invite_generate','ttt_invite_share','ttt_invite_open',
    'ttt_join_attempt','ttt_join_success','ttt_join_failed','ttt_game_ready','ttt_move_submit',
    'ttt_move_accepted','ttt_move_rejected','ttt_game_win','ttt_game_draw','ttt_game_exit','ttt_game_abandon',
    'auth_login_success','auth_login_failed','auth_register_success','auth_register_failed',
    'auth_guest_gate_seen','auth_guest_upgrade_cta',
    'rpc_error','network_error','validation_error','ui_error','unhandled_error','permission_denied'));

  IF NOT v_dom_ok OR NOT v_ev_ok THEN
    RETURN jsonb_build_object('error', 'INVALID_FILTER');
  END IF;

  -- 4) Aggregated analytics (counts + top-N business entity ids ONLY).
  RETURN jsonb_build_object(
    'error', null,
    'applied', jsonb_build_object(
      'date_from',   v_from,
      'date_to',     v_to,
      'domain',      v_domain,
      'event',       v_event,
      'game',        v_game,
      'entity_id',   v_entity
    ),

    'totals', (
      SELECT jsonb_build_object(
        'total_events',
          COUNT(*),
        'unique_sessions',
          COUNT(DISTINCT session_id),
        'unique_visitors',
          COUNT(DISTINCT anonymous_id),
        'unique_users',
          COUNT(DISTINCT user_id)
      )
      FROM public.telemetry_events te
      WHERE (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_domain   IS NULL OR te.domain = v_domain)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'events_by_event', (
      SELECT COALESCE(jsonb_agg(row ORDER BY row->>'count' DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object('event', event_name, 'count', COUNT(*)) AS row
        FROM public.telemetry_events te
        WHERE (v_from     IS NULL OR te.occurred_at >= v_from)
          AND (v_to       IS NULL OR te.occurred_at <= v_to)
          AND (v_domain   IS NULL OR te.domain = v_domain)
          AND (v_event    IS NULL OR te.event_name = v_event)
          AND (v_entity   IS NULL OR te.entity_id = v_entity)
          AND (v_game     IS NULL OR te.properties->>'game' = v_game)
        GROUP BY event_name
      ) s
    ),

    'events_by_domain', (
      SELECT COALESCE(jsonb_agg(row ORDER BY row->>'count' DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object('domain', domain, 'count', COUNT(*)) AS row
        FROM public.telemetry_events te
        WHERE (v_from     IS NULL OR te.occurred_at >= v_from)
          AND (v_to       IS NULL OR te.occurred_at <= v_to)
          AND (v_domain   IS NULL OR te.domain = v_domain)
          AND (v_event    IS NULL OR te.event_name = v_event)
          AND (v_entity   IS NULL OR te.entity_id = v_entity)
          AND (v_game     IS NULL OR te.properties->>'game' = v_game)
        GROUP BY domain
      ) s
    ),

    'daily', (
      SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'date',  to_char((te.occurred_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD'),
          'count', COUNT(*)
        ) AS row
        FROM public.telemetry_events te
        WHERE (v_from     IS NULL OR te.occurred_at >= v_from)
          AND (v_to       IS NULL OR te.occurred_at <= v_to)
          AND (v_domain   IS NULL OR te.domain = v_domain)
          AND (v_event    IS NULL OR te.event_name = v_event)
          AND (v_entity   IS NULL OR te.entity_id = v_entity)
          AND (v_game     IS NULL OR te.properties->>'game' = v_game)
        GROUP BY to_char((te.occurred_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
      ) s
    ),

    'top_entities', (
      SELECT COALESCE(jsonb_agg(row ORDER BY row->>'count' DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'entity_type', entity_type,
          'entity_id',   entity_id,
          'count',       COUNT(*)
        ) AS row
        FROM public.telemetry_events te
        WHERE te.entity_id IS NOT NULL AND te.entity_id <> ''
          AND (v_from     IS NULL OR te.occurred_at >= v_from)
          AND (v_to       IS NULL OR te.occurred_at <= v_to)
          AND (v_domain   IS NULL OR te.domain = v_domain)
          AND (v_event    IS NULL OR te.event_name = v_event)
          AND (v_entity   IS NULL OR te.entity_id = v_entity)
          AND (v_game     IS NULL OR te.properties->>'game' = v_game)
        GROUP BY entity_type, entity_id
        ORDER BY COUNT(*) DESC
        LIMIT 50
      ) s
    ),

    'category', (
      SELECT jsonb_build_object(
        'view',            COUNT(*) FILTER (WHERE event_name = 'category_view'),
        'subcategory_view',COUNT(*) FILTER (WHERE event_name = 'subcategory_view'),
        'product_list_view',COUNT(*) FILTER (WHERE event_name = 'category_product_list_view'),
        'product_click',   COUNT(*) FILTER (WHERE event_name = 'category_product_click'),
        'search',          COUNT(*) FILTER (WHERE event_name = 'category_search'),
        'filter',          COUNT(*) FILTER (WHERE event_name = 'category_filter'),
        'sort',            COUNT(*) FILTER (WHERE event_name = 'category_sort')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'category'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'product', (
      SELECT jsonb_build_object(
        'impression',       COUNT(*) FILTER (WHERE event_name = 'product_impression'),
        'view',             COUNT(*) FILTER (WHERE event_name = 'product_view'),
        'image_view',       COUNT(*) FILTER (WHERE event_name = 'product_image_view'),
        'variant_select',   COUNT(*) FILTER (WHERE event_name = 'product_variant_select'),
        'details_expand',   COUNT(*) FILTER (WHERE event_name = 'product_details_expand'),
        'share',            COUNT(*) FILTER (WHERE event_name = 'product_share'),
        'favorite',         COUNT(*) FILTER (WHERE event_name = 'product_favorite'),
        'contact',          COUNT(*) FILTER (WHERE event_name = 'product_contact'),
        'back',             COUNT(*) FILTER (WHERE event_name = 'product_back')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'product'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'listing', (
      SELECT jsonb_build_object(
        'create_start',      COUNT(*) FILTER (WHERE event_name = 'listing_create_start'),
        'create_submit',     COUNT(*) FILTER (WHERE event_name = 'listing_create_submit'),
        'create_success',    COUNT(*) FILTER (WHERE event_name = 'listing_create_success'),
        'create_failed',     COUNT(*) FILTER (WHERE event_name = 'listing_create_failed'),
        'view_detail',       COUNT(*) FILTER (WHERE event_name = 'listing_view_detail'),
        'share',             COUNT(*) FILTER (WHERE event_name = 'listing_share'),
        'contact',           COUNT(*) FILTER (WHERE event_name = 'listing_contact'),
        'add_to_cart',       COUNT(*) FILTER (WHERE event_name = 'listing_add_to_cart'),
        'edit_start',        COUNT(*) FILTER (WHERE event_name = 'listing_edit_start'),
        'edit_success',      COUNT(*) FILTER (WHERE event_name = 'listing_edit_success'),
        'delete',            COUNT(*) FILTER (WHERE event_name = 'listing_delete'),
        'publish',           COUNT(*) FILTER (WHERE event_name = 'listing_publish')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'listing'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'cart', (
      SELECT jsonb_build_object(
        'view',            COUNT(*) FILTER (WHERE event_name = 'cart_view'),
        'add',             COUNT(*) FILTER (WHERE event_name = 'cart_add'),
        'remove',          COUNT(*) FILTER (WHERE event_name = 'cart_remove'),
        'quantity_change', COUNT(*) FILTER (WHERE event_name = 'cart_quantity_change'),
        'clear',           COUNT(*) FILTER (WHERE event_name = 'cart_clear')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'cart'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'request', (
      SELECT jsonb_build_object(
        'start',          COUNT(*) FILTER (WHERE event_name = 'request_start'),
        'submit',         COUNT(*) FILTER (WHERE event_name = 'request_submit'),
        'success',        COUNT(*) FILTER (WHERE event_name = 'request_success'),
        'failed',         COUNT(*) FILTER (WHERE event_name = 'request_failed'),
        'whatsapp_open',  COUNT(*) FILTER (WHERE event_name = 'whatsapp_open')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'request'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'game', (
      SELECT jsonb_build_object(
        'intro_view',  COUNT(*) FILTER (WHERE event_name = 'game_intro_view'),
        'start',       COUNT(*) FILTER (WHERE event_name = 'game_start'),
        'complete',    COUNT(*) FILTER (WHERE event_name = 'game_complete'),
        'exit',        COUNT(*) FILTER (WHERE event_name = 'game_exit'),
        'abandon',     COUNT(*) FILTER (WHERE event_name = 'game_abandon'),
        'pause',       COUNT(*) FILTER (WHERE event_name = 'game_pause'),
        'resume',      COUNT(*) FILTER (WHERE event_name = 'game_resume'),
        'wins',        COUNT(*) FILTER (WHERE event_name = 'game_complete' AND te.properties->>'outcome' = 'win'),
        'draws',       COUNT(*) FILTER (WHERE event_name = 'game_complete' AND te.properties->>'outcome' = 'draw'),
        'losses',      COUNT(*) FILTER (WHERE event_name = 'game_complete' AND te.properties->>'outcome' = 'loss')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'game'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'ad', (
      SELECT jsonb_build_object(
        'impression',  COUNT(*) FILTER (WHERE event_name = 'ad_impression'),
        'click',       COUNT(*) FILTER (WHERE event_name = 'ad_click'),
        'contact',     COUNT(*) FILTER (WHERE event_name = 'ad_contact')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'ad'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    ),

    'system', (
      SELECT jsonb_build_object(
        'rpc_error',          COUNT(*) FILTER (WHERE event_name = 'rpc_error'),
        'network_error',      COUNT(*) FILTER (WHERE event_name = 'network_error'),
        'validation_error',   COUNT(*) FILTER (WHERE event_name = 'validation_error'),
        'ui_error',           COUNT(*) FILTER (WHERE event_name = 'ui_error'),
        'unhandled_error',    COUNT(*) FILTER (WHERE event_name = 'unhandled_error'),
        'permission_denied',  COUNT(*) FILTER (WHERE event_name = 'permission_denied')
      )
      FROM public.telemetry_events te
      WHERE te.domain = 'system'
        AND (v_from     IS NULL OR te.occurred_at >= v_from)
        AND (v_to       IS NULL OR te.occurred_at <= v_to)
        AND (v_event    IS NULL OR te.event_name = v_event)
        AND (v_entity   IS NULL OR te.entity_id = v_entity)
        AND (v_game     IS NULL OR te.properties->>'game' = v_game)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_telemetry_analytics(timestamptz, timestamptz, text, text, text, text) IS
  'Admin/researcher analytics read over telemetry_events. SECURITY DEFINER; authorizes the '
  'caller via public.users.role (admin/super_admin/researcher). Returns AGGREGATED counts and '
  'top-N business entity ids ONLY — never raw rows, user ids, session ids, anonymous ids, or raw '
  'properties. Direct table access stays RLS-denied.';

-- Grants unchanged (matches 00058).
REVOKE ALL ON FUNCTION public.get_telemetry_analytics(timestamptz, timestamptz, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telemetry_analytics(timestamptz, timestamptz, text, text, text, text) TO authenticated;

COMMIT;
