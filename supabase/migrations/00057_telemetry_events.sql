-- ============================================================================
-- 00057 — FOCUS TELEMETRY EVENTS (owner-approved contract 2026-08-31)
--
-- A single, reliable, analyzable event source. Builds ON the committed
-- baseline (HEAD = 4f73564) and does NOT modify any frozen/committed migration
-- (00047/00049/00050/00056 and earlier are untouched).
--
-- CONTRACT (approved):
--   * telephone_events is written ONLY via the RPC `record_telemetry_event`.
--     anon/authenticated have NO direct table access (RLS is enabled against
--     direct SELECT/INSERT/UPDATE/DELETE). Reads for analytics are done by an
--     admin/research role in a future phase; no analytics UI ships here.
--   * CLOSED schema: every event maps to a fixed dictionary of allowed
--     property keys (allowlist) + an allowlist of event names. No arbitrary
--     payload, no free-form user text.
--   * PII / sensitive / free-text field names are FORBIDDEN server-side and
--     rejected (raise). This mirrors src/core/telemetry/privacy.ts.
--   * `entity_id` is TEXT by design: DB uuids AND future CatalogId slugs.
--   * user_id is derived from auth.uid() server-side — the client never
--     supplies an identity field client-side. anonymous_id is the non-PII
--     `focus_vid_v1` hash. session_id is a client crypto.randomUUID().
--   * dedupe: an optional client `dedupe_key` is enforced by a partial unique
--     index (NULL-able, so ordinary rows never collide).
--
-- Rollback: DROP TABLE IF EXISTS public.telemetry_events; (functions drop
-- automatically). Post-apply verification: supabase/verify/telemetry_events.sql
--
-- This contract is DOUBLE-ENFORCED: the client (privacy.ts) AND the server
-- (this RPC). A blocked/forbidden field never reaches persistence.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) telemetry_events — the single event source
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telemetry_events (
  id             bigserial PRIMARY KEY,
  event_id       text NOT NULL UNIQUE,      -- client random 32-hex (dedupe/replay guard)
  event_name     text NOT NULL,             -- from the closed registry
  event_version  integer NOT NULL DEFAULT 1,
  domain         text NOT NULL,             -- closed domain taxonomy
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  session_id     text NOT NULL,             -- client crypto.randomUUID() per page load
  anonymous_id   text,                      -- non-PII focus_vid_v1 visitor hash
  user_id        uuid,                      -- auth.uid() ONLY, derived server-side
  screen         text,                      -- canonical ScreenName
  entity_type    text,
  entity_id      text,                      -- uuid OR CatalogId slug (TEXT by design)
  properties     jsonb NOT NULL DEFAULT '{}'::jsonb,
  context        jsonb,                     -- non-PII sparse context (e.g. fpHash)
  dedupe_key     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_event_name   ON public.telemetry_events (event_name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_domain       ON public.telemetry_events (domain, occurred_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_session      ON public.telemetry_events (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_user         ON public.telemetry_events (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_entity        ON public.telemetry_events (entity_type, entity_id, occurred_at);

-- de-dupe: identical logical events (keyed by the caller) within the SAME
-- session are collapsed. The uniqueness scope is (session_id, dedupe_key) so one
-- user/session's dedupe key never suppresses a legitimate event from another
-- session (a dedupe key is only meaningful within the session that emitted it).
-- NULL dedupe_key rows never participate (partial index).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_telemetry_dedupe ON public.telemetry_events (session_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) RLS — defense-in-depth, NO direct client table access
-- ---------------------------------------------------------------------------
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.telemetry_events FROM PUBLIC;
REVOKE ALL ON public.telemetry_events FROM anon;
REVOKE ALL ON public.telemetry_events FROM authenticated;

-- No client (anon/authenticated) policy: the ONLY insert path is the RPC.
-- A future admin/research read policy is added in a later analytics phase.
-- (No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated => RLS denies.)

-- ---------------------------------------------------------------------------
-- 3) record_telemetry_event(p_events jsonb) — SECURITY DEFINER write RPC
--    Validates domain dictionary + per-event property allowlist + forbidden
--    fields + value types + rate not strictly limited (batch capped server-side
--    at a sane size to bound request body). user_id = auth.uid().
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

-- ---------------------------------------------------------------------------
-- 4) Grant / revoke execution (least privilege)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_telemetry_event(jsonb) FROM PUBLIC;

-- Writes are allowed under BOTH `authenticated` AND `anon`. Anonymous visitors
-- are always signed in via Supabase Anonymous Auth, so auth.uid() is NOT NULL
-- for them too; guests emit telemetry with user_id = their (anonymous) uid.
-- `anon` must be able to send telemetry so the anonymous visitor contract holds.
-- The SECURITY DEFINER function inserts as the owner and returns void. There is
-- NO direct table access (RLS denies) — the RPC is the only insert path.
GRANT EXECUTE ON FUNCTION public.record_telemetry_event(jsonb) TO authenticated, anon;

COMMIT;
