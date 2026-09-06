-- ============================================================================
-- 00076 — FOCUS TELEMETRY CONTRACT HARDENING (Wave A, owner-approved 2026-09-06)
--
-- Wave A hardens the canonical telemetry contract that 00057/00061/00067
-- established WITHOUT rebuilding it. Two strictly-additive, backward-compatible
-- server changes to the single write path `public.record_telemetry_event`:
--
--   1) CLOSED entity-type validation (closes the audit finding M2): `entity_type`
--      was accepted as free text. It must now be NULL/'' or one of the SAME
--      13-value canonical union as the client (types.ts TELEMETRY_ENTITY_TYPES).
--      Unknown values are REJECTED with INVALID_ENTITY_TYPE. Production has zero
--      out-of-union values today, so this is non-breaking for real clients.
--
--   2) family_id contract (closes audit finding M1): checkout_submit and
--      order_created producers ALREADY send family_id (order-service.ts), and the
--      family_view event is designed to carry family identity — but the per-event
--      server allowlist stripped the key before persistence. The allowlists of
--      family_view / checkout_submit / order_created now explicitly permit
--      `family_id` (a non-PII business id), matching the client registry. The
--      family_view PRODUCER trigger semantics stay deferred (Wave B/E).
--
-- NO DROP, NO table-schema change, NO index change, NO RLS change, NO RBAC
-- change. Grants are re-declared only to prove they remain anon+authenticated.
-- get_telemetry_analytics is untouched. Event names/domains unchanged (97/97
-- parity with the client registry is preserved and test-pinned).
--
-- Rollback: CREATE OR REPLACE back to 00067's function body (no data impact).
-- Post-apply verification: supabase/verify/telemetry_contract_hardening.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) record_telemetry_event(p_events jsonb) — contract hardened (additive)
--    Identical to 00067's body EXCEPT for:
--      a) NEW entity_type closed-union validation (2c block);
--      b) NEW family_id allowlists for family_view/checkout_submit/order_created.
--    All other validation logic is byte-for-byte the 00067 body.
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
      WHEN 'game_round_complete' THEN v_ok_domain := (v_domain = 'game');
      WHEN 'game_result_view' THEN v_ok_domain := (v_domain = 'game');
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
      WHEN 'auth_login_success' THEN v_ok_domain := (v_domain = 'auth');
      WHEN 'auth_login_failed' THEN v_ok_domain := (v_domain = 'auth');
      WHEN 'auth_register_success' THEN v_ok_domain := (v_domain = 'auth');
      WHEN 'auth_register_failed' THEN v_ok_domain := (v_domain = 'auth');
      WHEN 'auth_guest_gate_seen' THEN v_ok_domain := (v_domain = 'auth');
      WHEN 'auth_guest_upgrade_cta' THEN v_ok_domain := (v_domain = 'auth');
      WHEN 'rpc_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'network_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'validation_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'ui_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'unhandled_error' THEN v_ok_domain := (v_domain = 'system');
      WHEN 'permission_denied' THEN v_ok_domain := (v_domain = 'system');
          WHEN 'neighborhood_view' THEN v_ok_domain := (v_domain = 'neighborhood');
      WHEN 'store_view' THEN v_ok_domain := (v_domain = 'neighborhood');
      WHEN 'family_view' THEN v_ok_domain := (v_domain = 'neighborhood');
      WHEN 'checkout_start' THEN v_ok_domain := (v_domain = 'order');
      WHEN 'checkout_submit' THEN v_ok_domain := (v_domain = 'order');
      WHEN 'order_created' THEN v_ok_domain := (v_domain = 'order');
      WHEN 'order_failed' THEN v_ok_domain := (v_domain = 'order');
      WHEN 'order_status_changed' THEN v_ok_domain := (v_domain = 'order');
      WHEN 'order_completed' THEN v_ok_domain := (v_domain = 'order');
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

    -- 2c) entity_type, when present and non-empty, MUST be one of the SAME
    --     closed canonical union as the client (types.ts TELEMETRY_ENTITY_TYPES).
    --     NEW in 00076 (Wave A): free-text entity types were accepted before.
    IF v_etype IS NOT NULL AND v_etype <> '' AND NOT (v_etype IN (
      'catalog_product','category','subcategory','product','listing','ad','game',
      'challenge','user','session','neighborhood','store','order'
    )) THEN
      RAISE EXCEPTION 'INVALID_ENTITY_TYPE';
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
      WHEN 'game_round_complete' THEN v_allowed := ARRAY['game','round_index','hit'];
      WHEN 'game_result_view' THEN v_allowed := ARRAY['game'];
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
      WHEN 'auth_login_failed' THEN v_allowed := ARRAY['error_code'];
      WHEN 'auth_register_failed' THEN v_allowed := ARRAY['error_code'];
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
      WHEN 'auth_login_success' THEN v_allowed := ARRAY[]::text[];
      WHEN 'auth_register_success' THEN v_allowed := ARRAY[]::text[];
      WHEN 'auth_guest_gate_seen' THEN v_allowed := ARRAY[]::text[];
      WHEN 'auth_guest_upgrade_cta' THEN v_allowed := ARRAY[]::text[];
      WHEN 'neighborhood_view' THEN v_allowed := ARRAY[]::text[];
      WHEN 'store_view' THEN v_allowed := ARRAY[]::text[];
      WHEN 'family_view' THEN v_allowed := ARRAY['family_id']::text[];                -- NEW (Wave A)
      WHEN 'checkout_start' THEN v_allowed := ARRAY['items_count','with_delivery']::text[];
      WHEN 'checkout_submit' THEN v_allowed := ARRAY['items_count','family_id']::text[]; -- NEW (Wave A)
      WHEN 'order_created' THEN v_allowed := ARRAY['channel','family_id']::text[];       -- NEW (Wave A)
      WHEN 'order_failed' THEN v_allowed := ARRAY['error_code']::text[];
      WHEN 'order_status_changed' THEN v_allowed := ARRAY['status']::text[];
      WHEN 'order_completed' THEN v_allowed := ARRAY[]::text[];
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

-- Revoke/grant unchanged (least privilege, matches 00057/00061/00067).
REVOKE ALL ON FUNCTION public.record_telemetry_event(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated, anon;

-- Post-apply verification — the hardened branches must be live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'record_telemetry_event'
  ) THEN
    RAISE EXCEPTION '00076: record_telemetry_event missing';
  END IF;
END;
$$;

COMMIT;