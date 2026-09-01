-- ============================================================================
-- 00058 — FOCUS TELEMETRY ANALYTICS READ RPC (T4.2 Phase 1)
--
-- Migration number: 00058 (after 00057_telemetry_events.sql — verified highest).
-- Type: Additive (CREATE FUNCTION + GRANT only). Does NOT touch 00057,
--        telemetry_events, record_telemetry_event, RLS, or any frozen migration.
--
-- PURPOSE
--   Provide the FIRST secure read path for Admin analytics over telemetry.
--   00057 explicitly deferred reads: "Reads for analytics are done by an
--   admin/research role in a future phase; no analytics UI ships here." This
--   migration ships that read path as a single SECURITY DEFINER RPC.
--
-- SECURITY MODEL (the ONLY authorized reader; direct table access stays shut)
--   * SECURITY DEFINER — the function reads telemetry_events as its OWNER,
--     bypassing RLS *only* inside the function body. RLS for anon/authenticated
--     remains enabled with ZERO policies => no direct SELECT ever returns rows.
--   * Authorization is enforced INSIDE PostgreSQL against public.users.role
--     (admin / super_admin / researcher), NOT by any client-side guard.
--   * AGGREGATE-ONLY output: counts and top-N business entity ids. The RPC
--     NEVER returns raw event rows, and NEVER returns user_id, anonymous_id,
--     session_id, or raw properties — even to an authorized admin.
--   * `SET search_path = ''` — every object reference is schema-qualified to
--     defeat search_path hijacking (mirrors 00057's record_telemetry_event).
--   * Grant model follows the house pattern: REVOKE ... FROM PUBLIC then
--     GRANT EXECUTE ... TO authenticated.
--
-- CONTRACT COMPATIBILITY
--   * Reuses the EXISTING closed event registry from 00057 exactly. No new
--     events, no new property keys, no allowlist widening.
--   * Filters are typed and bounded (timestamptz / fixed text params only).
--     The client never supplies SQL or dynamic column names; domain/event are
--     validated against the closed registries server-side.
--   * unique_sessions / unique_visitors / unique_users are returned as
--     COUNTS ONLY.
--
-- Rollback (logically reversible — nothing destructive was touched):
--   DROP FUNCTION IF EXISTS public.get_telemetry_analytics(timestamptz, timestamptz, text, text, text, text);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- get_telemetry_analytics — aggregated Admin analytics read (RPC only)
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
  v_dom_ok := (v_domain IS NULL OR v_domain IN (
    'app','navigation','category','product','listing','cart','request','ad','game','ttt','system'));
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
    'game_intro_view','game_start','game_exit','game_pause','game_resume','game_complete','game_abandon',
    'ttt_lobby_view','ttt_game_create','ttt_invite_generate','ttt_invite_share','ttt_invite_open',
    'ttt_join_attempt','ttt_join_success','ttt_join_failed','ttt_game_ready','ttt_move_submit',
    'ttt_move_accepted','ttt_move_rejected','ttt_game_win','ttt_game_draw','ttt_game_exit','ttt_game_abandon',
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

    -- ==================================================================
    -- OVERVIEW — totals (COUNTS ONLY; never the underlying ids)
    -- ==================================================================
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

    -- ==================================================================
    -- EVENTS BY EVENT NAME
    -- ==================================================================
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

    -- ==================================================================
    -- EVENTS BY DOMAIN
    -- ==================================================================
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

    -- ==================================================================
    -- DAILY COUNTS (events over time)
    -- ==================================================================
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

    -- ==================================================================
    -- TOP BUSINESS ENTITIES (category / product / listing ids, NOT user ids)
    -- ==================================================================
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

    -- ==================================================================
    -- CATEGORY FUNNEL
    -- ==================================================================
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

    -- ==================================================================
    -- PRODUCT AGGREGATES
    -- ==================================================================
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

    -- ==================================================================
    -- LISTING FUNNEL
    -- ==================================================================
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

    -- ==================================================================
    -- CART FUNNEL
    -- ==================================================================
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

    -- ==================================================================
    -- REQUEST / WHATSAPP FUNNEL
    -- ==================================================================
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

    -- ==================================================================
    -- GAME ENGAGEMENT (reaction-light stays on legacy; game_* = TTT here)
    -- ==================================================================
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

    -- ==================================================================
    -- ADS (defined; typically zero until wiring)
    -- ==================================================================
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

    -- ==================================================================
    -- SYSTEM / ERROR METRICS
    -- ==================================================================
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

-- ============================================================================
-- GRANTS — staff/research only (house model: revoke PUBLIC, grant authenticated)
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_telemetry_analytics(timestamptz, timestamptz, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_telemetry_analytics(timestamptz, timestamptz, text, text, text, text) TO authenticated;

-- ============================================================================
-- DONE — telemetry analytics read RPC (migration 00058)
--
-- POST-APPLY VERIFICATION (run in a SQL client):
--   1. Admin/super_admin/researcher:
--        SELECT public.get_telemetry_analytics(NULL,NULL,NULL,NULL,NULL,NULL) -> totals present
--   2. Non-staff (role='user'/'guest') hidden via SET ROLE:
--        SET ROLE authenticated; SELECT public.get_telemetry_analytics(...); RESET ROLE;
--        -> expects nothing/authorized-user table check governs (auth.uid() identity test).
--   3. Direct table read is still blocked:
--        SELECT count(*) FROM public.telemetry_events;  -> RLS denies (0 rows) for non-owner.
--   4. Inverted date window -> {"error":"INVALID_DATE_RANGE"}
--   5. Banned event name -> {"error":"INVALID_FILTER"}
-- ============================================================================
