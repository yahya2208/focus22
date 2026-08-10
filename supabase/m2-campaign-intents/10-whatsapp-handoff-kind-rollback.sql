-- ============================================================================
-- FOCUS — M2 · WHATSAPP_HANDOFF_STARTED KIND — ROLLBACK (exact, one-shot)
--
-- Reverses 10-whatsapp-handoff-kind-apply.sql COMPLETELY: restores the RPC
-- exactly as shipped by the 06-device-id-cap-64-apply.sql body (device_id cap
-- 64, kind allowlist view/click/whatsapp_intent, matrix unchanged). The new
-- kind + matrix branch are removed; existing kinds are byte-identical.
-- Nothing else is touched.
--
-- SAFETY: existing campaign_intents rows keep their kind values; removing the
-- allowlist entry only means future `whatsapp_handoff_started` writes are
-- rejected again — no data risk.
--
-- ROLLBACK (owner executes only if a full reversal is required):
-- ============================================================================

-- 1) RPC back to the 06-device-id-cap-64-apply.sql body (no handoff kind).
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
  IF p_device_id IS NOT NULL AND char_length(p_device_id) > 64 THEN
    RAISE EXCEPTION 'device_id too long (max 64)';
  END IF;
  IF p_ad_placement IS NOT NULL
     AND p_ad_placement NOT IN ('home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom') THEN
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
    RETURN;
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

-- ============================================================================
-- Verify rollback:
--   select pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
--     ... LIKE '%whatsapp_handoff_started%'      → false
--   select pg_get_functiondef(...) LIKE '%kind whatsapp_handoff_started requires cta_type inquiry%'
--     → false
-- ============================================================================
