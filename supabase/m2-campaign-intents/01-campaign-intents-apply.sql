-- ============================================================================
-- FOCUS — M2 · CAMPAIGN INTENT COUNTERS (Marketplace Mediator model §17–§20)
--
-- Type: Additive (owner-approved 2026-08-09 — audit §31 N4/N5/N6, phase M2).
-- Needs backfill: NO — counters start empty; they fill from the client's
--   fire-and-forget hook (src/services/intent-tracking.ts) once applied.
-- Directly reversible: YES — exact rollback in 02-campaign-intents-rollback.sql.
-- Depends on: public.campaigns (FK target, baseline), public.is_research_role()
--   (security-hardening/phase1/02-LV1-LV2-LV4-owner-read-policies.sql).
--
-- PURPOSE
--   The Marketplace Mediator model needs per-placement view/click/intent
--   counters WITHOUT touching any frozen telemetry surface. This migration
--   creates ONE new independent table (public.campaign_intents) and ONE
--   guarded write RPC (public.record_campaign_intent). Reads are role-gated
--   to researcher/admin/super_admin for the M3 read-only UI.
--
-- SECURITY (audit §18–§20)
--   * anon/authenticated have NO direct table INSERT/UPDATE/DELETE — writes
--     exist ONLY through the guarded RPC (pattern anon → RPC → validation →
--     INSERT, matching directive §15).
--   * SELECT is granted only to authenticated AND filtered by RLS to
--     is_research_role() (defense in depth).
--   * The RPC is SECURITY DEFINER with SET search_path = public (pattern of
--     lookup_campaign_by_short_code, 00007). It validates kind/cta_type,
--     visitor_hash format, device/placement length, campaign-active, enforces
--     anti-spam (dedup window + hourly rate limit) server-side (§18).
--   * JS is never the protection — enforcement is in the RPC.
--
-- FROZEN: does NOT touch analytics_events / qr_codes / placements /
--   placement_history / lookup_scan_context / increment_qr_counter.
--
-- APPLY (owner runs in the Supabase SQL editor):
--   1. supabase/m2-campaign-intents/03-pre-apply-evidence.sql   (read-only)
--   2. THIS FILE                                               (apply)
--   3. supabase/m2-campaign-intents/04-post-apply-verify.sql    (read-only)
--
-- Rollback (exact, one-shot):
--   see 02-campaign-intents-rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Ensure gen_random_uuid() is available (idempotent; PG13+ has it built-in).
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) campaign_intents — the independent counter table (§19).
--    visitor_hash is a NON-PII, crypto-random, per-page-load hex id generated
--    client-side and held in memory only (P7-02: never persisted).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_intents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('view', 'click', 'whatsapp_intent')),
  cta_type     TEXT CHECK (cta_type IN ('buy', 'exchange', 'installment', 'inquiry', 'ad_click')),
  campaign_id  UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_placement TEXT CHECK (ad_placement IN ('home', 'phones', 'repair', 'results', 'exchange', 'phone-details')),
  device_id    TEXT CHECK (device_id IS NULL OR (char_length(device_id) BETWEEN 1 AND 32)),
  visitor_hash TEXT NOT NULL CHECK (visitor_hash ~ '^[a-f0-9]{16,64}$'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup + rate-limit lookup support.
CREATE INDEX IF NOT EXISTS idx_campaign_intents_dedup
  ON public.campaign_intents (visitor_hash, kind, cta_type, created_at DESC);

-- Hourly rate-limit per visitor_hash.
CREATE INDEX IF NOT EXISTS idx_campaign_intents_visitor_time
  ON public.campaign_intents (visitor_hash, created_at DESC);

-- M3 read-only UI (Campaigns/Ads counters) reads by time.
CREATE INDEX IF NOT EXISTS idx_campaign_intents_research
  ON public.campaign_intents (created_at DESC);

COMMENT ON TABLE public.campaign_intents IS
  'M2 Marketplace Mediator counters: view/click/whatsapp_intent per visitor_hash + target (campaign/ad_placement/device). Writes ONLY via public.record_campaign_intent; SELECT role-gated to researcher/admin/super_admin. Non-PII: visitor_hash is in-memory crypto-random only.';

-- ----------------------------------------------------------------------------
-- 2) Row Level Security — SELECT role-gated; NO write policies (RPC-only).
-- ----------------------------------------------------------------------------
ALTER TABLE public.campaign_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Research roles read campaign intents"
  ON public.campaign_intents FOR SELECT TO authenticated
  USING (public.is_research_role());

-- No INSERT/UPDATE/DELETE policies exist — anon and non-research authenticated
-- roles cannot write (or see) counters except through the guarded RPC.

-- ----------------------------------------------------------------------------
-- 3) Grants — no anon table access; authenticated SELECT only (RLS-filtered);
--    nothing else.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.campaign_intents FROM PUBLIC;
REVOKE ALL ON public.campaign_intents FROM anon, authenticated;
GRANT SELECT ON public.campaign_intents TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) Guarded write RPC (§20) — the ONLY way any row enters the table.
--    SECURITY DEFINER + SET search_path = public (definer = table owner, so
--    the RPC can insert; anon callers never touch the table directly).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_campaign_intent(
  p_kind         TEXT,
  p_visitor_hash TEXT,
  p_cta_type     TEXT,
  p_campaign_id  UUID,
  p_ad_placement TEXT,
  p_device_id    TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_hourly_count INT;
  v_dedup_seconds INT;
BEGIN
  -- ---- input validation (kind / cta_type matrix) -------------------------
  IF p_kind NOT IN ('view', 'click', 'whatsapp_intent') THEN
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;

  IF p_kind = 'click' THEN
    IF p_cta_type IS DISTINCT FROM 'ad_click' THEN
      RAISE EXCEPTION 'kind click requires cta_type ad_click';
    END IF;
  ELSIF p_kind = 'whatsapp_intent' THEN
    IF p_cta_type NOT IN ('buy', 'exchange', 'installment', 'inquiry') THEN
      RAISE EXCEPTION 'kind whatsapp_intent requires cta_type buy|exchange|installment|inquiry';
    END IF;
  ELSE -- 'view'
    IF p_cta_type IS NOT NULL THEN
      RAISE EXCEPTION 'kind view requires cta_type NULL';
    END IF;
  END IF;

  -- ---- visitor_hash: format + length cap --------------------------------
  IF p_visitor_hash IS NULL OR p_visitor_hash !~ '^[a-f0-9]{16,64}$' THEN
    RAISE EXCEPTION 'invalid visitor_hash (expected 16-64 lowercase hex)';
  END IF;

  -- ---- device_id / ad_placement caps ------------------------------------
  IF p_device_id IS NOT NULL AND char_length(p_device_id) > 32 THEN
    RAISE EXCEPTION 'device_id too long (max 32)';
  END IF;
  IF p_ad_placement IS NOT NULL
     AND p_ad_placement NOT IN ('home', 'phones', 'repair', 'results', 'exchange', 'phone-details') THEN
    RAISE EXCEPTION 'invalid ad_placement: %', p_ad_placement;
  END IF;

  -- ---- at least one target is required ----------------------------------
  IF p_campaign_id IS NULL AND p_ad_placement IS NULL AND p_device_id IS NULL THEN
    RAISE EXCEPTION 'no target: at least one of campaign_id/ad_placement/device_id is required';
  END IF;

  -- ---- campaign must exist and be active (server-side) ------------------
  IF p_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = p_campaign_id AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'campaign not found or inactive';
    END IF;
  END IF;

  -- ---- anti-spam: hourly rate limit per visitor_hash (§18) --------------
  SELECT count(*) INTO v_hourly_count
  FROM public.campaign_intents
  WHERE visitor_hash = p_visitor_hash
    AND created_at > now() - interval '1 hour';
  IF v_hourly_count >= 60 THEN
    RAISE EXCEPTION 'rate limit exceeded (60/hour/visitor)';
  END IF;

  -- ---- anti-spam: dedup window (§18) — view 1 h, click/intent 5 min -----
  v_dedup_seconds := CASE WHEN p_kind = 'view' THEN 3600 ELSE 300 END;
  IF EXISTS (
    SELECT 1 FROM public.campaign_intents
    WHERE visitor_hash = p_visitor_hash
      AND kind = p_kind
      AND cta_type IS NOT DISTINCT FROM p_cta_type
      AND campaign_id IS NOT DISTINCT FROM p_campaign_id
      AND ad_placement IS NOT DISTINCT FROM p_ad_placement
      AND device_id IS NOT DISTINCT FROM p_device_id
      AND created_at > now() - (v_dedup_seconds || ' seconds')::interval
  ) THEN
    RETURN; -- duplicate within the window — silently ignored
  END IF;

  INSERT INTO public.campaign_intents
    (kind, cta_type, campaign_id, ad_placement, device_id, visitor_hash)
  VALUES
    (p_kind, p_cta_type, p_campaign_id, p_ad_placement, p_device_id, p_visitor_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) IS
  'M2 guarded counter write: anon → RPC → validation → INSERT. Validates kind/cta_type, visitor_hash, target, campaign-active; enforces hourly rate limit (60/h/visitor) and dedup windows (view 1 h, click/intent 5 min). Fire-and-forget from the client; a failure never blocks WhatsApp.';

-- ============================================================================
-- Done. Run 04-post-apply-verify.sql next (read-only).
-- ============================================================================
