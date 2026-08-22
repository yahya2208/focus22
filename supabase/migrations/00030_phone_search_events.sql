-- ============================================================================
-- FOCUS — PHONE SEARCH EVENTS (MIGRATION 00030)
--
-- Migration number: 00030 (after 00029_phone_view_counters.sql)
-- Type: Additive (CREATE TABLE / FUNCTION / POLICY / INDEX only)
--
-- PURPOSE
--   Collect showroom search intent and search → phone selection relationships
--   for future Phone Intelligence analytics.
--
-- DATA MODEL
--   One search_event represents: the query + displayed result set.
--   One search_selection represents: a phone selected from that result set.
--   The relationship is explicit: search_selection.search_event_id → search_event.id.
--
-- IDENTITY MODEL
--   Same as view counters:
--     - Authenticated: auth.uid()
--     - Anonymous: visitor_hash (focus_vid_v1, non-PII)
--
-- SECURITY DESIGN
--   - All writes via SECURITY DEFINER RPCs (fire-and-forget)
--   - No direct INSERT/UPDATE/DELETE by clients
--   - Staff-only read on raw events (admin/super_admin/researcher)
--   - Rate limiting enforced server-side
--   - Query text sanitized and bounded to 200 chars
--
-- Depends on: public.inventory_items (migration 00019)
-- ============================================================================

-- ============================================================================
-- 1) phone_search_events — one row per meaningful search
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.phone_search_events (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_key    text        NOT NULL,
  query_text      text        NOT NULL,
  results_count   integer     NOT NULL DEFAULT 0,
  context         text        NOT NULL DEFAULT 'showroom'
                    CHECK (context IN ('showroom', 'catalog')),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.phone_search_events IS 'Append-only log of meaningful search events. Used for Phone Intelligence analytics.';
COMMENT ON COLUMN public.phone_search_events.id             IS 'Monotonic event ID. Never reused.';
COMMENT ON COLUMN public.phone_search_events.identity_key   IS 'auth.uid() for authenticated, visitor_hash for guests. Non-PII.';
COMMENT ON COLUMN public.phone_search_events.query_text     IS 'Sanitized search string, max 200 chars.';
COMMENT ON COLUMN public.phone_search_events.results_count  IS 'Number of results displayed at time of search.';
COMMENT ON COLUMN public.phone_search_events.context        IS 'Where the search occurred: showroom or catalog.';
COMMENT ON COLUMN public.phone_search_events.recorded_at    IS 'Server-side timestamp (not client-submitted).';

-- ============================================================================
-- 2) phone_search_selections — links a phone selection to its search event
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.phone_search_selections (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  search_event_id bigint      NOT NULL REFERENCES public.phone_search_events(id) ON DELETE CASCADE,
  device_id       text        NOT NULL,
  context         text        NOT NULL DEFAULT 'showroom'
                    CHECK (context IN ('showroom', 'catalog')),
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.phone_search_selections IS 'Links a phone selection to the search event that produced the displayed result set.';
COMMENT ON COLUMN public.phone_search_selections.id             IS 'Monotonic event ID. Never reused.';
COMMENT ON COLUMN public.phone_search_selections.search_event_id IS 'FK → phone_search_events(id). Which search produced this result.';
COMMENT ON COLUMN public.phone_search_selections.device_id      IS 'inventory_items.id of the selected phone.';
COMMENT ON COLUMN public.phone_search_selections.context         IS 'Where the selection occurred.';
COMMENT ON COLUMN public.phone_search_selections.recorded_at     IS 'Server-side timestamp.';

-- ============================================================================
-- 3) Indexes
-- ============================================================================

-- Analytics: events for this identity over time
CREATE INDEX IF NOT EXISTS idx_search_events_identity_time
  ON public.phone_search_events (identity_key, recorded_at);

-- Analytics: events by context (showroom vs catalog)
CREATE INDEX IF NOT EXISTS idx_search_events_context_time
  ON public.phone_search_events (context, recorded_at);

-- Cleanup: delete events older than retention
CREATE INDEX IF NOT EXISTS idx_search_events_recorded_at
  ON public.phone_search_events (recorded_at);

-- Selection lookups: all selections for a search event
CREATE INDEX IF NOT EXISTS idx_search_selections_event
  ON public.phone_search_selections (search_event_id);

-- Analytics: selections for a device
CREATE INDEX IF NOT EXISTS idx_search_selections_device
  ON public.phone_search_selections (device_id, recorded_at);

-- Cleanup
CREATE INDEX IF NOT EXISTS idx_search_selections_recorded_at
  ON public.phone_search_selections (recorded_at);

-- ============================================================================
-- 4) Row Level Security
-- ============================================================================
ALTER TABLE public.phone_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_search_selections ENABLE ROW LEVEL SECURITY;

-- Staff read only (admin/super_admin/researcher)
CREATE POLICY "Staff read search events"
  ON public.phone_search_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin', 'researcher')
  ));

CREATE POLICY "Staff read search selections"
  ON public.phone_search_selections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin', 'researcher')
  ));

-- No INSERT/UPDATE/DELETE policies — all writes via SECURITY DEFINER RPCs

-- ============================================================================
-- 5) SECURITY DEFINER RPC: record_phone_search
--    Records a meaningful search event after debounce.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_phone_search(
  p_query_text    text,
  p_results_count integer,
  p_visitor_hash  text,
  p_context       text DEFAULT 'showroom'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity   text;
  v_query      text;
  v_event_id   bigint;
  v_rate_limit constant integer := 60;
BEGIN
  -- 1. Determine identity
  IF auth.uid() IS NOT NULL THEN
    v_identity := auth.uid()::text;
  ELSE
    IF p_visitor_hash IS NULL OR p_visitor_hash !~ '^[a-f0-9]{16,64}$' THEN
      RETURN jsonb_build_object('error', 'INVALID_VISITOR');
    END IF;
    v_identity := p_visitor_hash;
  END IF;

  -- 2. Validate and sanitize query
  IF p_query_text IS NULL OR length(trim(p_query_text)) = 0 THEN
    RETURN jsonb_build_object('error', 'EMPTY_QUERY');
  END IF;
  v_query := left(trim(p_query_text), 200);

  -- 3. Validate context
  IF p_context NOT IN ('showroom', 'catalog') THEN
    RETURN jsonb_build_object('error', 'INVALID_CONTEXT');
  END IF;

  -- 4. Rate limit: max 60 searches per identity per hour
  IF EXISTS (
    SELECT 1 FROM phone_search_events
    WHERE identity_key = v_identity
      AND recorded_at > now() - interval '1 hour'
    LIMIT 1 OFFSET (v_rate_limit - 1)
  ) THEN
    RETURN jsonb_build_object('error', 'RATE_LIMITED');
  END IF;

  -- 5. Dedup: skip if identical query from same identity in last 10 seconds
  IF EXISTS (
    SELECT 1 FROM phone_search_events
    WHERE identity_key = v_identity
      AND query_text = v_query
      AND context = p_context
      AND recorded_at > now() - interval '10 seconds'
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', true, 'deduped', true);
  END IF;

  -- 6. Insert search event
  INSERT INTO phone_search_events (identity_key, query_text, results_count, context)
  VALUES (v_identity, v_query, COALESCE(p_results_count, 0), p_context)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'search_event_id', v_event_id,
    'deduped',       false
  );
END;
$$;

COMMENT ON FUNCTION public.record_phone_search(text, integer, text, text) IS
  'Record a meaningful search event. Atomic: validate → rate limit → dedup → insert. '
  'Returns search_event_id for subsequent selection linking.';

-- ============================================================================
-- 6) SECURITY DEFINER RPC: record_search_selection
--    Links a phone selection to its originating search event.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_search_selection(
  p_search_event_id bigint,
  p_device_id       text,
  p_context         text DEFAULT 'showroom'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sel_id bigint;
BEGIN
  -- 1. Validate search event exists
  IF NOT EXISTS (
    SELECT 1 FROM phone_search_events WHERE id = p_search_event_id
  ) THEN
    RETURN jsonb_build_object('error', 'INVALID_SEARCH_EVENT');
  END IF;

  -- 2. Validate device exists (if provided)
  IF p_device_id IS NOT NULL AND p_device_id != '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM inventory_items WHERE id = p_device_id
    ) THEN
      RETURN jsonb_build_object('error', 'INVALID_DEVICE');
    END IF;
  END IF;

  -- 3. Validate context
  IF p_context NOT IN ('showroom', 'catalog') THEN
    RETURN jsonb_build_object('error', 'INVALID_CONTEXT');
  END IF;

  -- 4. Dedup: skip if same device already selected for this search event
  IF EXISTS (
    SELECT 1 FROM phone_search_selections
    WHERE search_event_id = p_search_event_id
      AND device_id = COALESCE(p_device_id, '')
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', true, 'deduped', true);
  END IF;

  -- 5. Insert selection
  INSERT INTO phone_search_selections (search_event_id, device_id, context)
  VALUES (p_search_event_id, COALESCE(p_device_id, ''), p_context)
  RETURNING id INTO v_sel_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'selection_id',    v_sel_id,
    'search_event_id', p_search_event_id,
    'deduped',         false
  );
END;
$$;

COMMENT ON FUNCTION public.record_search_selection(bigint, text, text) IS
  'Link a phone selection to its originating search event. Deduped per search_event+device.';

-- ============================================================================
-- 7) Grants — anon + authenticated can call both RPCs
-- ============================================================================
REVOKE ALL ON FUNCTION public.record_phone_search(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_phone_search(text, integer, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_phone_search(text, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.record_search_selection(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_search_selection(bigint, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_search_selection(bigint, text, text) TO authenticated;

-- ============================================================================
-- DONE — phone search events (migration 00030)
-- ============================================================================
