-- ============================================================================
-- FOCUS — ANONYMOUS CAMPAIGN QR MEASUREMENT — APPLY (draft — OWNER EXECUTES)
--
-- Type: Additive (owner-approved execution 2026-08-09 — Anonymous QR
--   Measurement directive, audit report in .opencode-summary/reports/
--   anonymous-qr-measurement-architecture-audit.md).
-- Needs backfill: NO — the funnel starts empty and fills from the client's
--   fire-and-forget sender (src/services/qr-measurement.ts) once applied.
-- Directly reversible: YES — exact rollback in 02-campaign-qr-metrics-rollback.sql.
-- Depends on (LIVE DB): public.campaigns (FK target, baseline),
--   public.qr_codes / public.placements (FK targets, M1 — 00016/00017),
--   public.is_research_role() (security-hardening/phase1/
--   02-LV1-LV2-LV4-owner-read-policies.sql).
--
-- PURPOSE
--   Measure the anonymous campaign funnel scan -> game_start -> game_complete
--   -> registration WITHOUT re-adding any legacy telemetry/QR attribution:
--     * NO write to qr_codes / analytics_events / placements /
--       placement_history / campaigns / campaign_intents;
--     * NO increment_qr_counter / scan_count / lookup_scan_context / cookies;
--     * NO user/device identity — events are tied ONLY to an in-memory,
--       single-use, 128-bit nonce with a 24 h server TTL.
--
-- SECURITY MODEL (mirrors M2 campaign_intents exactly)
--   * anon/authenticated have NO direct table write; writes exist ONLY through
--     the two guarded SECURITY DEFINER RPCs (pattern anon -> RPC -> validation
--     -> INSERT);
--   * the campaign is resolved server-side from the short code (the client can
--     NEVER choose the campaign) and the funnel's campaign is DERIVED from the
--     nonce's original scan row and cross-checked against the supplied id;
--   * SELECT is granted to authenticated AND filtered by RLS to
--     is_research_role() (defense in depth); aggregates go through
--     get_campaign_qr_metrics which enforces is_research_role() itself;
--   * per-campaign rate limits (1 000/hour, 10 000/day) enforced server-side
--     inside an advisory lock (race-free);
--   * nonce format validated server-side (base64url, 20-64 chars).
--
-- APPLY ORDER (owner runs in the Supabase SQL editor):
--   1. THIS FILE
--   2. 03-campaign-qr-metrics-verify-readonly.sql (read-only verification)
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) SCHEMA GUARD — verify the LIVE schema BEFORE creating FKs (§23).
--    If any expected column is missing/untyped on the live DB, STOP loudly
--    instead of guessing or altering existing tables.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='campaigns'
                   AND column_name='id'       AND data_type='uuid') THEN
    RAISE EXCEPTION 'STOP: campaigns.id missing/not uuid on live DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='campaigns'
                   AND column_name='short_code' AND data_type='text') THEN
    RAISE EXCEPTION 'STOP: campaigns.short_code missing/not text on live DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='campaigns'
                   AND column_name='is_active' AND data_type='boolean') THEN
    RAISE EXCEPTION 'STOP: campaigns.is_active missing/not boolean on live DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='qr_codes'
                   AND column_name='id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'STOP: qr_codes.id missing/not uuid on live DB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='qr_codes'
                   AND column_name='campaign_id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'STOP: qr_codes.campaign_id missing/not uuid — cannot resolve QR server-side';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='qr_codes'
                   AND column_name='is_active' AND data_type='boolean') THEN
    RAISE EXCEPTION 'STOP: qr_codes.is_active missing/not boolean — cannot resolve QR server-side';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='qr_codes'
                   AND column_name='placement_id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'STOP: qr_codes.placement_id missing/not uuid — cannot resolve placement server-side';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='qr_codes'
                   AND column_name='created_at' AND data_type='timestamp with time zone') THEN
    RAISE EXCEPTION 'STOP: qr_codes.created_at missing — cannot resolve latest QR';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='placements'
                   AND column_name='id' AND data_type='uuid') THEN
    RAISE EXCEPTION 'STOP: placements.id missing/not uuid on live DB';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1) campaign_qr_events — the independent, anonymous funnel event table.
--    Funnel rows share the nonce of their originating scan row; each
--    (nonce, event_type) pair exists at most once (client + server dedup).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_qr_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id  UUID NOT NULL REFERENCES public.campaigns(id)  ON DELETE CASCADE,
  qr_code_id   UUID REFERENCES public.qr_codes(id)            ON DELETE SET NULL,
  placement_id UUID REFERENCES public.placements(id)          ON DELETE SET NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('scan', 'game_start', 'game_complete', 'registration')),
  nonce        TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one row per nonce+event (dedup); the same nonce legitimately spans
  -- scan -> game_start -> game_complete -> registration rows.
  CONSTRAINT campaign_qr_events_nonce_event_key UNIQUE (nonce, event_type)
);

-- At most ONE scan per nonce (spec: nonce is single-use). This is a partial
-- unique index rather than a bare UNIQUE(nonce): a bare UNIQUE(nonce) would
-- forbid the funnel rows that legitimately share the scan's nonce. The
-- UNIQUE(nonce, event_type) above already enforces the single-use scan;
-- this index makes that intent explicit and gives the RPC a fast lookup.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_qr_events_scan_nonce_unique
  ON public.campaign_qr_events (nonce)
  WHERE event_type = 'scan';

CREATE INDEX IF NOT EXISTS campaign_qr_events_campaign_type_idx
  ON public.campaign_qr_events (campaign_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS campaign_qr_events_created_idx
  ON public.campaign_qr_events (created_at);
CREATE INDEX IF NOT EXISTS campaign_qr_events_expires_idx
  ON public.campaign_qr_events (expires_at);

COMMENT ON TABLE public.campaign_qr_events IS
  'Anonymous campaign QR funnel events (scan/game_start/game_complete/registration). Campaign is resolved server-side from the short code; funnel events are derived from the nonce of the originating scan. No PII, no device identity. Writes ONLY via public.record_campaign_qr_scan / public.record_campaign_funnel; SELECT role-gated to researcher/admin/super_admin.';

-- ----------------------------------------------------------------------------
-- 2) Row Level Security — SELECT role-gated; NO write policies (RPC-only).
-- ----------------------------------------------------------------------------
ALTER TABLE public.campaign_qr_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Research roles read campaign_qr_events"
  ON public.campaign_qr_events FOR SELECT TO authenticated
  USING (public.is_research_role());

-- No INSERT/UPDATE/DELETE policies exist — anon and non-research authenticated
-- roles cannot write (or see) events except through the guarded RPCs.

-- ----------------------------------------------------------------------------
-- 3) Grants — no anon table access; authenticated SELECT only (RLS-filtered);
--    nothing else.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.campaign_qr_events FROM PUBLIC;
REVOKE ALL ON public.campaign_qr_events FROM anon, authenticated;
GRANT SELECT ON public.campaign_qr_events TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) RPC record_campaign_qr_scan(p_short_code text, p_nonce text) -> jsonb
--    The ONLY way a 'scan' row enters the table. SECURITY DEFINER + SET
--    search_path = public (pattern of lookup_campaign_by_short_code, 00007).
--    Resolves campaign -> qr_code -> placement server-side; enforces nonce
--    format, campaign-active, per-campaign rate limits (advisory-lock, race
--    free) and dedup. Idempotent: a replayed nonce returns deduped=true.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_campaign_qr_scan(p_short_code TEXT, p_nonce TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_campaign_id  UUID;
  v_qr_code_id   UUID;
  v_placement_id UUID;
  v_hourly_count INT;
  v_daily_count  INT;
  v_inserted_id  BIGINT;
BEGIN
  -- ---- nonce: base64url, 20-64 chars (client generates 22) ----------------
  IF p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9_-]{20,64}$' THEN
    RAISE EXCEPTION 'invalid nonce (expected base64url 20-64 chars)';
  END IF;

  -- ---- resolve the campaign server-side from the short code ----------------
  SELECT c.id INTO v_campaign_id
  FROM public.campaigns c
  WHERE c.short_code = TRIM(p_short_code) AND c.is_active = TRUE;
  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'campaign not found or inactive';
  END IF;

  -- ---- resolve the latest active QR + its placement server-side ------------
  SELECT q.id, q.placement_id INTO v_qr_code_id, v_placement_id
  FROM public.qr_codes q
  WHERE q.campaign_id = v_campaign_id AND q.is_active = TRUE
  ORDER BY q.created_at DESC
  LIMIT 1;

  -- ---- serialize per campaign so count-then-insert is race-free ------------
  PERFORM pg_advisory_xact_lock(hashtext('campaign_qr_scan:' || v_campaign_id::text)::bigint);

  -- ---- rate limits: 1 000/hour, 10 000/day per campaign --------------------
  SELECT count(*) INTO v_hourly_count
  FROM public.campaign_qr_events
  WHERE campaign_id = v_campaign_id AND event_type = 'scan'
    AND created_at >= now() - interval '1 hour';
  IF v_hourly_count >= 1000 THEN
    RAISE EXCEPTION 'rate limit exceeded (1000 scans/hour)';
  END IF;

  SELECT count(*) INTO v_daily_count
  FROM public.campaign_qr_events
  WHERE campaign_id = v_campaign_id AND event_type = 'scan'
    AND created_at >= now() - interval '1 day';
  IF v_daily_count >= 10000 THEN
    RAISE EXCEPTION 'rate limit exceeded (10000 scans/day)';
  END IF;

  -- ---- idempotent insert; a replayed nonce is a no-op, not an error --------
  INSERT INTO public.campaign_qr_events
    (campaign_id, qr_code_id, placement_id, event_type, nonce, expires_at)
  VALUES
    (v_campaign_id, v_qr_code_id, v_placement_id, 'scan', p_nonce, now() + interval '24 hours')
  ON CONFLICT (nonce, event_type) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'deduped', TRUE, 'campaign_id', v_campaign_id::text);
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE, 'deduped', FALSE,
    'campaign_id',  v_campaign_id::text,
    'qr_code_id',   v_qr_code_id::text,
    'placement_id', v_placement_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.record_campaign_qr_scan(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_campaign_qr_scan(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_campaign_qr_scan(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.record_campaign_qr_scan(TEXT, TEXT) IS
  'Anonymous QR scan write. Resolves campaign/qr_code/placement server-side from the short code; validates nonce format; enforces per-campaign rate limits (1000/h, 10000/d) under an advisory lock; idempotent on nonce replay. Fire-and-forget from the client.';

-- ----------------------------------------------------------------------------
-- 5) RPC record_campaign_funnel(p_campaign_id uuid, p_nonce text,
--       p_event_type text) -> jsonb
--    The campaign is DERIVED from the nonce's original scan row and the
--    supplied p_campaign_id is cross-checked against it (directive §7B). A
--    funnel event can never be attributed to a campaign the client invented.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_campaign_funnel(
  p_campaign_id UUID,
  p_nonce       TEXT,
  p_event_type  TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_scan_campaign UUID;
  v_qr_code_id    UUID;
  v_placement_id  UUID;
  v_hourly_count  INT;
  v_daily_count   INT;
  v_inserted_id   BIGINT;
BEGIN
  -- ---- event type allowlist -------------------------------------------------
  IF p_event_type NOT IN ('game_start', 'game_complete', 'registration') THEN
    RAISE EXCEPTION 'invalid event_type: %', p_event_type;
  END IF;

  -- ---- nonce: base64url, 20-64 chars ----------------------------------------
  IF p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9_-]{20,64}$' THEN
    RAISE EXCEPTION 'invalid nonce (expected base64url 20-64 chars)';
  END IF;

  -- ---- derive campaign from the nonce''s ORIGINAL scan row (never trust the
  --      client-supplied campaign on its own) ---------------------------------
  SELECT s.campaign_id, s.qr_code_id, s.placement_id
    INTO v_scan_campaign, v_qr_code_id, v_placement_id
  FROM public.campaign_qr_events s
  WHERE s.nonce = p_nonce AND s.event_type = 'scan' AND s.expires_at > now();
  IF v_scan_campaign IS NULL THEN
    RAISE EXCEPTION 'unknown or expired nonce';
  END IF;
  IF p_campaign_id IS DISTINCT FROM v_scan_campaign THEN
    RAISE EXCEPTION 'campaign mismatch: funnel event does not match the scanned campaign';
  END IF;

  -- ---- serialize per campaign so count-then-insert is race-free ------------
  PERFORM pg_advisory_xact_lock(hashtext('campaign_qr_funnel:' || v_scan_campaign::text)::bigint);

  -- ---- rate limits: 1 000/hour, 10 000/day per campaign --------------------
  SELECT count(*) INTO v_hourly_count
  FROM public.campaign_qr_events
  WHERE campaign_id = v_scan_campaign
    AND created_at >= now() - interval '1 hour';
  IF v_hourly_count >= 1000 THEN
    RAISE EXCEPTION 'rate limit exceeded (1000 events/hour)';
  END IF;

  SELECT count(*) INTO v_daily_count
  FROM public.campaign_qr_events
  WHERE campaign_id = v_scan_campaign
    AND created_at >= now() - interval '1 day';
  IF v_daily_count >= 10000 THEN
    RAISE EXCEPTION 'rate limit exceeded (10000 events/day)';
  END IF;

  -- ---- idempotent insert; a duplicate (nonce, event_type) is a no-op -------
  INSERT INTO public.campaign_qr_events
    (campaign_id, qr_code_id, placement_id, event_type, nonce, expires_at)
  VALUES
    (v_scan_campaign, v_qr_code_id, v_placement_id, p_event_type, p_nonce, now() + interval '24 hours')
  ON CONFLICT (nonce, event_type) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'deduped', TRUE);
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'deduped', FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.record_campaign_funnel(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_campaign_funnel(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_campaign_funnel(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.record_campaign_funnel(UUID, TEXT, TEXT) IS
  'Anonymous QR funnel write (game_start/game_complete/registration). Derives the campaign from the nonce''s original scan row and cross-checks the supplied campaign_id; validates event_type + nonce format; enforces per-campaign rate limits under an advisory lock; idempotent per (nonce, event_type). Fire-and-forget from the client.';

-- ----------------------------------------------------------------------------
-- 6) RPC get_campaign_qr_metrics(p_campaign_id uuid default null) -> setof
--    Role-gated aggregate read for the research/admin dashboard. Enforces
--    is_research_role() INSIDE the function (SECURITY DEFINER) so anonymous
--    AND authenticated non-research users cannot call it. Returns aggregates
--    only — never raw rows, never nonces.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campaign_qr_metrics(p_campaign_id UUID DEFAULT NULL)
RETURNS TABLE (
  campaign_id UUID,
  event_type  TEXT,
  total       BIGINT,
  first_at    TIMESTAMPTZ,
  last_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_research_role() THEN
    RAISE EXCEPTION 'insufficient_privilege: research role required';
  END IF;

  RETURN QUERY
    SELECT e.campaign_id, e.event_type, count(*) AS total,
           min(e.created_at) AS first_at, max(e.created_at) AS last_at
    FROM public.campaign_qr_events e
    WHERE (p_campaign_id IS NULL OR e.campaign_id = p_campaign_id)
    GROUP BY e.campaign_id, e.event_type;
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_qr_metrics(UUID) FROM PUBLIC;
-- Metrics RPC is authenticated-only. The REVOKE FROM anon is REQUIRED: Supabase
-- default privileges grant EXECUTE to anon at function creation time, and that
-- explicit grant is NOT removed by REVOKE FROM PUBLIC — without it a fresh apply
-- leaves anon with EXECUTE (C2 FAIL). The function body still requires
-- is_research_role(), so even authenticated callers are gated server-side.
REVOKE EXECUTE ON FUNCTION public.get_campaign_qr_metrics(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_qr_metrics(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_campaign_qr_metrics(UUID) IS
  'Role-gated aggregate read: campaign_id, event_type, total, first_at, last_at. Requires is_research_role(); anonymous and ordinary authenticated users are rejected server-side. Never exposes nonces or raw rows.';

-- ============================================================================
-- Done. Run 03-campaign-qr-metrics-verify-readonly.sql next (read-only).
-- Expected: table + partial unique scan index + 3 indexes + RLS SELECT policy +
-- minimal grants + 3 SECURITY DEFINER RPCs.
-- ============================================================================
