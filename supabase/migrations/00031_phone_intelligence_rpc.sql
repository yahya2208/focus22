-- ============================================================================
-- FOCUS — PHONE INTELLIGENCE RPC (MIGRATION 00031)
--
-- Migration number: 00031 (after 00030_phone_search_events.sql)
-- Type: Additive (CREATE FUNCTION + GRANT only)
--
-- PURPOSE
--   Staff-only analytics RPC that returns structured Phone Intelligence
--   data for the BI center. Aggregates view events, search events,
--   search selections, and campaign intents independently, then joins
--   aggregates to avoid count inflation.
--
-- SECURITY
--   SECURITY DEFINER — checks role internally.
--   Only admin / super_admin / researcher may call.
--
-- CRITICAL DATA CORRECTNESS RULES
--   1. View events, search selections, and campaign intents are each
--      aggregated INDEPENDENTLY before joining.
--   2. No direct JOIN between phone_view_events and phone_search_selections.
--   3. campaign_intents.device_id has no FK to inventory_items — LEFT JOIN only.
--   4. Detail views are counted from phone_view_events.event_type='detail_view',
--      NOT from phone_view_counts (which has no detail column).
--   5. All timestamps are server-side recorded_at.
--
-- Depends on: 00029 (phone_view_counts, phone_view_events),
--             00030 (phone_search_events, phone_search_selections),
--             00019 (inventory_items),
--             m2-campaign-intents (campaign_intents)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_phone_intelligence(
  p_time_range text DEFAULT 'all',
  p_brand      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_since       timestamptz;
  v_brand_lower text;
BEGIN
  -- 1. Authorization: staff only
  SELECT u.role INTO v_caller_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'super_admin', 'researcher') THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  -- 2. Time range
  v_since := CASE p_time_range
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE NULL  -- 'all'
  END;

  -- 3. Brand filter (case-insensitive)
  v_brand_lower := CASE
    WHEN p_brand IS NULL OR trim(p_brand) = '' THEN NULL
    ELSE lower(trim(p_brand))
  END;

  -- ========================================================================
  -- A. TOP VIEWED PHONES — aggregate from phone_view_events independently
  -- ========================================================================
  -- Card views: count of accepted events where event_type = 'card_view'
  -- Detail views: count of accepted events where event_type = 'detail_view'
  -- Unique viewers: count of DISTINCT identity_key where is_unique = true
  -- ========================================================================

  RETURN jsonb_build_object(
    'time_range',  p_time_range,
    'brand_filter', COALESCE(p_brand, 'all'),

    -- ==================================================================
    -- SECTION 1: TOP VIEWED PHONES
    -- ==================================================================
    'top_viewed', (
      WITH view_agg AS (
        SELECT
          pve.device_id,
          COUNT(*) FILTER (WHERE pve.event_type = 'card_view')  AS card_views,
          COUNT(*) FILTER (WHERE pve.event_type = 'detail_view') AS detail_views,
          COUNT(*) AS total_views,
          COUNT(DISTINCT pve.identity_key) FILTER (WHERE pve.is_unique) AS unique_views,
          MAX(pve.recorded_at) AS last_viewed_at
        FROM public.phone_view_events pve
        WHERE (v_since IS NULL OR pve.recorded_at >= v_since)
        GROUP BY pve.device_id
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'device_id',      ii.id,
          'brand',          ii.brand,
          'model',          ii.model,
          'variant',        ii.variant,
          'total_views',    COALESCE(va.total_views, 0),
          'unique_views',   COALESCE(va.unique_views, 0),
          'card_views',     COALESCE(va.card_views, 0),
          'detail_views',   COALESCE(va.detail_views, 0),
          'last_viewed_at', va.last_viewed_at
        ) ORDER BY COALESCE(va.unique_views, 0) DESC, COALESCE(va.total_views, 0) DESC
      ), '[]'::jsonb)
      FROM public.inventory_items ii
      LEFT JOIN view_agg va ON va.device_id = ii.id
      WHERE ii.status NOT IN ('deleted', 'archived', 'discontinued')
        AND (v_brand_lower IS NULL OR lower(ii.brand) = v_brand_lower)
    ),

    -- ==================================================================
    -- SECTION 2: LOW / ZERO DEMAND
    -- ==================================================================
    'low_demand', (
      WITH view_agg AS (
        SELECT
          pve.device_id,
          COUNT(*) AS total_views,
          COUNT(*) FILTER (WHERE pve.event_type = 'detail_view') AS detail_views,
          COUNT(DISTINCT pve.identity_key) FILTER (WHERE pve.is_unique) AS unique_views
        FROM public.phone_view_events pve
        WHERE (v_since IS NULL OR pve.recorded_at >= v_since)
        GROUP BY pve.device_id
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'device_id',    ii.id,
          'brand',        ii.brand,
          'model',        ii.model,
          'variant',      ii.variant,
          'total_views',  COALESCE(va.total_views, 0),
          'unique_views', COALESCE(va.unique_views, 0),
          'detail_views', COALESCE(va.detail_views, 0),
          'reason', CASE
            WHEN COALESCE(va.total_views, 0) = 0 THEN 'zero_views'
            WHEN COALESCE(va.total_views, 0) <= 5 THEN 'low_views'
            WHEN COALESCE(va.total_views, 0) > 5 AND COALESCE(va.detail_views, 0) = 0 THEN 'high_views_zero_detail'
            ELSE 'ok'
          END
        )
      ), '[]'::jsonb)
      FROM public.inventory_items ii
      LEFT JOIN view_agg va ON va.device_id = ii.id
      WHERE ii.status NOT IN ('deleted', 'archived', 'discontinued')
        AND (v_brand_lower IS NULL OR lower(ii.brand) = v_brand_lower)
        AND (COALESCE(va.total_views, 0) = 0
             OR COALESCE(va.total_views, 0) <= 5
             OR (COALESCE(va.total_views, 0) > 5 AND COALESCE(va.detail_views, 0) = 0))
    ),

    -- ==================================================================
    -- SECTION 3: SEARCH ANALYTICS
    -- ==================================================================
    -- Aggregate from phone_search_events (queries) independently.
    -- selection_count via subquery on phone_search_selections.
    -- ==================================================================
    'search_analytics', (
      WITH search_agg AS (
        SELECT
          lower(trim(pse.query_text)) AS query_norm,
          COUNT(*)                    AS search_count,
          AVG(pse.results_count)      AS avg_results_count
        FROM public.phone_search_events pse
        WHERE (v_since IS NULL OR pse.recorded_at >= v_since)
        GROUP BY lower(trim(pse.query_text))
      ),
      selection_agg AS (
        SELECT
          lower(trim(pse.query_text)) AS query_norm,
          COUNT(pss.id)              AS selection_count
        FROM public.phone_search_selections pss
        JOIN public.phone_search_events pse ON pse.id = pss.search_event_id
        WHERE (v_since IS NULL OR pss.recorded_at >= v_since)
        GROUP BY lower(trim(pse.query_text))
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'query',                    sa.query_norm,
          'search_count',             sa.search_count,
          'avg_results_count',        ROUND(sa.avg_results_count::numeric, 1),
          'selection_count',          COALESCE(sa_sel.selection_count, 0),
          'search_to_selection_rate', CASE
            WHEN sa.search_count > 0 THEN ROUND(
              (COALESCE(sa_sel.selection_count, 0)::numeric / sa.search_count) * 100, 1)
            ELSE 0
          END
        ) ORDER BY sa.search_count DESC
      ), '[]'::jsonb)
      FROM search_agg sa
      LEFT JOIN selection_agg sa_sel ON sa_sel.query_norm = sa.query_norm
    ),

    -- ==================================================================
    -- SECTION 4: SEARCH WITHOUT SELECTION
    -- ==================================================================
    'search_without_selection', (
      WITH search_agg AS (
        SELECT
          lower(trim(pse.query_text)) AS query_norm,
          COUNT(*)                    AS search_count
        FROM public.phone_search_events pse
        WHERE (v_since IS NULL OR pse.recorded_at >= v_since)
        GROUP BY lower(trim(pse.query_text))
      ),
      selection_agg AS (
        SELECT
          lower(trim(pse.query_text)) AS query_norm,
          COUNT(pss.id)              AS selection_count
        FROM public.phone_search_selections pss
        JOIN public.phone_search_events pse ON pse.id = pss.search_event_id
        WHERE (v_since IS NULL OR pss.recorded_at >= v_since)
        GROUP BY lower(trim(pse.query_text))
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'query',         sa.query_norm,
          'search_count',  sa.search_count
        ) ORDER BY sa.search_count DESC
      ), '[]'::jsonb)
      FROM search_agg sa
      LEFT JOIN selection_agg sa_sel ON sa_sel.query_norm = sa.query_norm
      WHERE COALESCE(sa_sel.selection_count, 0) = 0
    ),

    -- ==================================================================
    -- SECTION 5: SEARCH → PHONE (per inventory phone)
    -- ==================================================================
    -- Aggregate from phone_search_selections independently.
    -- Count selections per device_id.
    -- ==================================================================
    'search_to_phone', (
      WITH sel_agg AS (
        SELECT
          pss.device_id,
          COUNT(pss.id) AS selection_count,
          COUNT(DISTINCT pss.search_event_id) AS associated_search_count
        FROM public.phone_search_selections pss
        WHERE (v_since IS NULL OR pss.recorded_at >= v_since)
          AND pss.device_id IS NOT NULL
          AND pss.device_id != ''
        GROUP BY pss.device_id
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'device_id',              ii.id,
          'brand',                  ii.brand,
          'model',                  ii.model,
          'variant',                ii.variant,
          'selection_count',        sa.selection_count,
          'associated_search_count', sa.associated_search_count,
          'search_to_selection_rate', CASE
            WHEN sa.associated_search_count > 0 THEN ROUND(
              (sa.selection_count::numeric / sa.associated_search_count) * 100, 1)
            ELSE 0
          END
        ) ORDER BY sa.selection_count DESC
      ), '[]'::jsonb)
      FROM public.inventory_items ii
      JOIN sel_agg sa ON sa.device_id = ii.id
    ),

    -- ==================================================================
    -- SECTION 6: DETAIL ENGAGEMENT (per inventory phone)
    -- ==================================================================
    -- Card views and detail views counted from phone_view_events.
    -- Detail/card ratio = detail_views / card_views.
    -- ==================================================================
    'detail_engagement', (
      WITH view_agg AS (
        SELECT
          pve.device_id,
          COUNT(*) FILTER (WHERE pve.event_type = 'card_view')   AS card_views,
          COUNT(*) FILTER (WHERE pve.event_type = 'detail_view') AS detail_views,
          COUNT(DISTINCT pve.identity_key)                       AS unique_viewers,
          COUNT(DISTINCT pve.identity_key)
            FILTER (WHERE pve.event_type = 'detail_view')        AS unique_detail_viewers
        FROM public.phone_view_events pve
        WHERE (v_since IS NULL OR pve.recorded_at >= v_since)
        GROUP BY pve.device_id
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'device_id',           ii.id,
          'brand',               ii.brand,
          'model',               ii.model,
          'variant',             ii.variant,
          'card_views',          COALESCE(va.card_views, 0),
          'detail_views',        COALESCE(va.detail_views, 0),
          'unique_viewers',      COALESCE(va.unique_viewers, 0),
          'unique_detail_viewers', COALESCE(va.unique_detail_viewers, 0),
          'detail_card_ratio',   CASE
            WHEN COALESCE(va.card_views, 0) > 0 THEN ROUND(
              (COALESCE(va.detail_views, 0)::numeric / va.card_views) * 100, 1)
            ELSE 0
          END
        ) ORDER BY COALESCE(va.detail_views, 0) DESC
      ), '[]'::jsonb)
      FROM public.inventory_items ii
      LEFT JOIN view_agg va ON va.device_id = ii.id
      WHERE ii.status NOT IN ('deleted', 'archived', 'discontinued')
        AND (v_brand_lower IS NULL OR lower(ii.brand) = v_brand_lower)
        AND (COALESCE(va.card_views, 0) > 0 OR COALESCE(va.detail_views, 0) > 0)
    ),

    -- ==================================================================
    -- SECTION 7: WHATSAPP INTENT (per inventory phone)
    -- ==================================================================
    -- Count from campaign_intents WHERE kind = 'whatsapp_intent'.
    -- campaign_intents.device_id has NO FK to inventory_items — LEFT JOIN only.
    -- Only count actual recorded rows, never infer from search.
    -- ==================================================================
    'whatsapp_intent', (
      WITH wa_agg AS (
        SELECT
          ci.device_id,
          COUNT(*) FILTER (WHERE ci.kind = 'whatsapp_intent')       AS whatsapp_intents,
          COUNT(*) FILTER (WHERE ci.kind = 'click')                 AS clicks,
          COUNT(*) FILTER (WHERE ci.kind = 'view')                  AS ad_views
        FROM public.campaign_intents ci
        WHERE (v_since IS NULL OR ci.created_at >= v_since)
          AND ci.device_id IS NOT NULL
          AND ci.device_id != ''
        GROUP BY ci.device_id
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'device_id',         ii.id,
          'brand',             ii.brand,
          'model',             ii.model,
          'variant',           ii.variant,
          'whatsapp_intents',  COALESCE(wa.whatsapp_intents, 0),
          'clicks',            COALESCE(wa.clicks, 0),
          'ad_views',          COALESCE(wa.ad_views, 0)
        ) ORDER BY COALESCE(wa.whatsapp_intents, 0) DESC
      ), '[]'::jsonb)
      FROM public.inventory_items ii
      LEFT JOIN wa_agg wa ON wa.device_id = ii.id
      WHERE ii.status NOT IN ('deleted', 'archived', 'discontinued')
        AND (v_brand_lower IS NULL OR lower(ii.brand) = v_brand_lower)
        AND (COALESCE(wa.whatsapp_intents, 0) > 0 OR COALESCE(wa.clicks, 0) > 0 OR COALESCE(wa.ad_views, 0) > 0)
    ),

    -- ==================================================================
    -- SECTION 8: BRAND / MODEL AGGREGATION
    -- ==================================================================
    -- Hierarchical aggregation using denormalized TEXT columns.
    -- No FK to catalog tables — grouping by inventory_items columns directly.
    -- ==================================================================
    'brand_aggregation', (
      WITH view_agg AS (
        SELECT
          pve.device_id,
          COUNT(*) AS total_views,
          COUNT(*) FILTER (WHERE pve.event_type = 'detail_view') AS detail_views,
          COUNT(DISTINCT pve.identity_key) FILTER (WHERE pve.is_unique) AS unique_views
        FROM public.phone_view_events pve
        WHERE (v_since IS NULL OR pve.recorded_at >= v_since)
        GROUP BY pve.device_id
      ),
      sel_agg AS (
        SELECT pss.device_id, COUNT(pss.id) AS selection_count
        FROM public.phone_search_selections pss
        WHERE (v_since IS NULL OR pss.recorded_at >= v_since)
          AND pss.device_id IS NOT NULL AND pss.device_id != ''
        GROUP BY pss.device_id
      ),
      wa_agg AS (
        SELECT ci.device_id, COUNT(*) AS whatsapp_intents
        FROM public.campaign_intents ci
        WHERE (v_since IS NULL OR ci.created_at >= v_since)
          AND ci.kind = 'whatsapp_intent'
          AND ci.device_id IS NOT NULL AND ci.device_id != ''
        GROUP BY ci.device_id
      ),
      device_scores AS (
        SELECT
          ii.id,
          ii.brand,
          ii.model,
          ii.variant,
          COALESCE(va.total_views, 0)   AS total_views,
          COALESCE(va.unique_views, 0)  AS unique_views,
          COALESCE(va.detail_views, 0)  AS detail_views,
          COALESCE(sa.selection_count, 0) AS selection_count,
          COALESCE(wa.whatsapp_intents, 0) AS whatsapp_intents,
          -- Popularity score: unique_views*1 + detail_views*3 + selections*5 + whatsapp*10
          COALESCE(va.unique_views, 0) * 1
            + COALESCE(va.detail_views, 0) * 3
            + COALESCE(sa.selection_count, 0) * 5
            + COALESCE(wa.whatsapp_intents, 0) * 10 AS demand_score
        FROM public.inventory_items ii
        LEFT JOIN view_agg va  ON va.device_id  = ii.id
        LEFT JOIN sel_agg sa  ON sa.device_id  = ii.id
        LEFT JOIN wa_agg wa   ON wa.device_id   = ii.id
        WHERE ii.status NOT IN ('deleted', 'archived', 'discontinued')
          AND (v_brand_lower IS NULL OR lower(ii.brand) = v_brand_lower)
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'brand',             ds.brand,
          'model',             ds.model,
          'variants',          ds.variant,
          'total_views',       ds.total_views,
          'unique_views',      ds.unique_views,
          'detail_views',      ds.detail_views,
          'selections',        ds.selection_count,
          'whatsapp_intents',  ds.whatsapp_intents,
          'demand_score',      ds.demand_score
        ) ORDER BY ds.demand_score DESC
      ), '[]'::jsonb)
      FROM device_scores ds
    ),

    -- ==================================================================
    -- SECTION 9: DEMAND OVERVIEW (combined per-device with score)
    -- ==================================================================
    'demand_overview', (
      WITH view_agg AS (
        SELECT
          pve.device_id,
          COUNT(*) AS total_views,
          COUNT(*) FILTER (WHERE pve.event_type = 'detail_view') AS detail_views,
          COUNT(DISTINCT pve.identity_key) FILTER (WHERE pve.is_unique) AS unique_views
        FROM public.phone_view_events pve
        WHERE (v_since IS NULL OR pve.recorded_at >= v_since)
        GROUP BY pve.device_id
      ),
      sel_agg AS (
        SELECT pss.device_id, COUNT(pss.id) AS selection_count
        FROM public.phone_search_selections pss
        WHERE (v_since IS NULL OR pss.recorded_at >= v_since)
          AND pss.device_id IS NOT NULL AND pss.device_id != ''
        GROUP BY pss.device_id
      ),
      wa_agg AS (
        SELECT ci.device_id, COUNT(*) AS whatsapp_intents
        FROM public.campaign_intents ci
        WHERE (v_since IS NULL OR ci.created_at >= v_since)
          AND ci.kind = 'whatsapp_intent'
          AND ci.device_id IS NOT NULL AND ci.device_id != ''
        GROUP BY ci.device_id
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'device_id',         ii.id,
          'brand',             ii.brand,
          'model',             ii.model,
          'variant',           ii.variant,
          'total_views',       COALESCE(va.total_views, 0),
          'unique_views',      COALESCE(va.unique_views, 0),
          'detail_views',      COALESCE(va.detail_views, 0),
          'selections',        COALESCE(sa.selection_count, 0),
          'whatsapp_intents',  COALESCE(wa.whatsapp_intents, 0),
          'demand_score',      COALESCE(va.unique_views, 0) * 1
                                 + COALESCE(va.detail_views, 0) * 3
                                 + COALESCE(sa.selection_count, 0) * 5
                                 + COALESCE(wa.whatsapp_intents, 0) * 10
        ) ORDER BY (
          COALESCE(va.unique_views, 0) * 1
          + COALESCE(va.detail_views, 0) * 3
          + COALESCE(sa.selection_count, 0) * 5
          + COALESCE(wa.whatsapp_intents, 0) * 10
        ) DESC
      ), '[]'::jsonb)
      FROM public.inventory_items ii
      LEFT JOIN view_agg va ON va.device_id = ii.id
      LEFT JOIN sel_agg sa ON sa.device_id = ii.id
      LEFT JOIN wa_agg wa  ON wa.device_id  = ii.id
      WHERE ii.status NOT IN ('deleted', 'archived', 'discontinued')
        AND (v_brand_lower IS NULL OR lower(ii.brand) = v_brand_lower)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_phone_intelligence(text, text) IS
  'Staff-only Phone Intelligence analytics. Returns structured JSONB with view counts, '
  'search analytics, selection linkage, WhatsApp intent, and demand scores. '
  'Aggregates each event source independently to prevent count inflation. '
  'SECURITY DEFINER: checks caller role (admin/super_admin/researcher).';

-- ============================================================================
-- GRANTS — staff-only RPC (no public access)
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_phone_intelligence(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_phone_intelligence(text, text) TO authenticated;

-- ============================================================================
-- DONE — phone intelligence RPC (migration 00031)
-- ============================================================================
