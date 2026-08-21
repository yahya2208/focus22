-- ============================================================================
-- FOCUS — PHONE VIEW COUNTERS (MIGRATION 00029)
--
-- Migration number: 00029 (after 00028_ads_images_staff_read_policy.sql)
-- Type: Additive (CREATE TABLE / FUNCTION / POLICY / INDEX only)
--
-- PURPOSE
--   Server-side phone view counting with dedup, rate limiting, and analytics.
--   Replaces the client-only localStorage counter (useViewCounter.ts).
--
-- IDENTITY MODEL
--   - Authenticated users: dedup by auth.uid() (server-side identity)
--   - Anonymous/guest users: dedup by visitor_hash (focus_vid_v1, non-PII)
--
-- SECURITY DESIGN
--   - All writes via SECURITY DEFINER RPC record_phone_view()
--   - No direct INSERT/UPDATE/DELETE by clients on either table
--   - Public can read aggregated counters (phone_view_counts)
--   - Staff only can read raw events (phone_view_events)
--   - Rate limiting + dedup enforced server-side
--
-- Depends on: public.inventory_items table (migration 00019)
-- ============================================================================

-- ============================================================================
-- 1) phone_view_counts — denormalized counters per phone listing
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.phone_view_counts (
  device_id       text        PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  total_views     integer     NOT NULL DEFAULT 0,
  unique_views    integer     NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.phone_view_counts IS 'Denormalized view counters per phone listing. Updated atomically by record_phone_view().';
COMMENT ON COLUMN public.phone_view_counts.device_id    IS 'FK → inventory_items(id). One row per phone.';
COMMENT ON COLUMN public.phone_view_counts.total_views   IS 'Count of accepted view events (post-dedup + rate-limit check).';
COMMENT ON COLUMN public.phone_view_counts.unique_views  IS 'Distinct identity keys accepted for this device within dedup window.';
COMMENT ON COLUMN public.phone_view_counts.last_viewed_at IS 'Timestamp of the most recent accepted view event.';
COMMENT ON COLUMN public.phone_view_counts.updated_at    IS 'Row-level update timestamp.';

-- ============================================================================
-- 2) phone_view_events — append-only event log (audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.phone_view_events (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id       text        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  identity_key    text        NOT NULL,
  event_type      text        NOT NULL DEFAULT 'card_view'
                        CHECK (event_type IN ('card_view', 'detail_view')),
  is_unique       boolean     NOT NULL DEFAULT false,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.phone_view_events IS 'Append-only log of accepted view events. Used for unique-view dedup and analytics.';
COMMENT ON COLUMN public.phone_view_events.id           IS 'Monotonic event ID. Never reused.';
COMMENT ON COLUMN public.phone_view_events.device_id    IS 'FK → inventory_items(id). Which phone was viewed.';
COMMENT ON COLUMN public.phone_view_events.identity_key IS 'auth.uid() for authenticated users, visitor_hash for guests. Non-PII.';
COMMENT ON COLUMN public.phone_view_events.event_type   IS 'card_view = listing grid; detail_view = details page.';
COMMENT ON COLUMN public.phone_view_events.is_unique    IS 'true if this was the first event from this identity for this device+event_type within the dedup window.';
COMMENT ON COLUMN public.phone_view_events.recorded_at  IS 'Server-side timestamp (not client-submitted).';

-- ============================================================================
-- 3) Indexes
-- ============================================================================

-- Dedup check: "has this identity seen this device in the last hour?" (event_type excluded)
CREATE INDEX IF NOT EXISTS idx_view_events_dedup
  ON public.phone_view_events (device_id, identity_key, recorded_at);

-- Rate limit check: "how many events from this identity for this device+event_type in the last hour?"
CREATE INDEX IF NOT EXISTS idx_view_events_rate_limit
  ON public.phone_view_events (device_id, identity_key, event_type, recorded_at);

-- Analytics: "events for this device, ordered by time"
CREATE INDEX IF NOT EXISTS idx_view_events_device_time
  ON public.phone_view_events (device_id, recorded_at DESC);

-- Cleanup: "delete events older than retention period"
CREATE INDEX IF NOT EXISTS idx_view_events_recorded_at
  ON public.phone_view_events (recorded_at);

-- ============================================================================
-- 4) Row Level Security
-- ============================================================================
ALTER TABLE public.phone_view_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_view_events ENABLE ROW LEVEL SECURITY;

-- phone_view_counts: public read (aggregated counters are non-sensitive)
CREATE POLICY "Public read view counts"
  ON public.phone_view_counts FOR SELECT
  USING (true);

-- phone_view_events: staff read only (admin/super_admin/researcher)
CREATE POLICY "Staff read view events"
  ON public.phone_view_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin','super_admin','researcher')
  ));

-- No INSERT/UPDATE/DELETE policies — all writes via SECURITY DEFINER RPC

-- ============================================================================
-- 5) SECURITY DEFINER RPC: record_phone_view
--    Atomic: validate → rate limit → dedup → insert event → upsert counter
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_phone_view(
  p_device_id    text,
  p_visitor_hash text,
  p_event_type   text DEFAULT 'card_view'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity     text;
  v_is_unique    boolean;
  v_total        integer;
  v_unique       integer;
  v_rate_limit   constant integer := 100;
BEGIN
  -- 1. Validate phone exists
  IF NOT EXISTS (SELECT 1 FROM inventory_items WHERE id = p_device_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_DEVICE');
  END IF;

  -- 2. Determine identity: authenticated users use auth.uid(), guests use visitor_hash
  IF auth.uid() IS NOT NULL THEN
    v_identity := auth.uid()::text;
  ELSE
    -- Validate visitor_hash format for guests (non-PII, 16-64 hex chars)
    IF p_visitor_hash IS NULL OR p_visitor_hash !~ '^[a-f0-9]{16,64}$' THEN
      RETURN jsonb_build_object('error', 'INVALID_VISITOR');
    END IF;
    v_identity := p_visitor_hash;
  END IF;

  -- 3. Validate event_type
  IF p_event_type NOT IN ('card_view', 'detail_view') THEN
    RETURN jsonb_build_object('error', 'INVALID_EVENT_TYPE');
  END IF;

  -- 4. Abuse protection: max events per (identity, device, event_type) per hour
  IF EXISTS (
    SELECT 1 FROM phone_view_events
    WHERE device_id = p_device_id
      AND identity_key = v_identity
      AND event_type = p_event_type
      AND recorded_at > now() - interval '1 hour'
    LIMIT 1 OFFSET (v_rate_limit - 1)
  ) THEN
    RETURN jsonb_build_object('error', 'RATE_LIMITED');
  END IF;

  -- 5. Dedup check: first event from this identity for this device in 1 hour?
  --    event_type is NOT part of dedup — unique = one viewer per phone, regardless of event type.
  SELECT NOT EXISTS (
    SELECT 1 FROM phone_view_events
    WHERE device_id = p_device_id
      AND identity_key = v_identity
      AND recorded_at > now() - interval '1 hour'
  ) INTO v_is_unique;

  -- 6. Insert event
  INSERT INTO phone_view_events (device_id, identity_key, event_type, is_unique)
  VALUES (p_device_id, v_identity, p_event_type, v_is_unique);

  -- 7. Upsert counter (atomic)
  INSERT INTO phone_view_counts (device_id, total_views, unique_views, last_viewed_at, updated_at)
  VALUES (p_device_id, 1, CASE WHEN v_is_unique THEN 1 ELSE 0 END, now(), now())
  ON CONFLICT (device_id) DO UPDATE SET
    total_views  = phone_view_counts.total_views + 1,
    unique_views = phone_view_counts.unique_views + CASE WHEN v_is_unique THEN 1 ELSE 0 END,
    last_viewed_at = now(),
    updated_at = now()
  RETURNING total_views, unique_views INTO v_total, v_unique;

  RETURN jsonb_build_object(
    'ok',         true,
    'total',      v_total,
    'unique',     v_unique,
    'is_unique',  v_is_unique
  );
END;
$$;

COMMENT ON FUNCTION public.record_phone_view(text, text, text) IS
  'Record a phone view event. Atomic: validate → rate limit → dedup → insert → upsert counter. '
  'Identity: auth.uid() for authenticated, visitor_hash for guests.';

-- ============================================================================
-- 6) SECURITY DEFINER RPC: get_phone_view_counts
--    Batch read aggregated counters for multiple phones
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_phone_view_counts(
  p_device_ids text[]
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      device_id,
      jsonb_build_object(
        'total_views',  total_views,
        'unique_views', unique_views,
        'last_viewed',  last_viewed_at
      )
    ),
    '{}'::jsonb
  )
  FROM phone_view_counts
  WHERE device_id = ANY(p_device_ids);
$$;

COMMENT ON FUNCTION public.get_phone_view_counts(text[]) IS
  'Batch read aggregated view counters for multiple phone devices. Returns empty object for unknown devices.';

-- ============================================================================
-- 7) Grants — anon + authenticated can call both RPCs
-- ============================================================================
REVOKE ALL ON FUNCTION public.record_phone_view(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_phone_view(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.record_phone_view(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_phone_view_counts(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_phone_view_counts(text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_phone_view_counts(text[]) TO authenticated;

-- ============================================================================
-- DONE — phone view counters (migration 00029)
-- ============================================================================
