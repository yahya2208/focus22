-- ============================================================================
-- FOCUS — M2 · DEVICE_ID CAP 32 → 64 (BATCH 4A) — ROLLBACK (exact, one-shot)
--
-- Reverses 06-device-id-cap-64-apply.sql COMPLETELY: restores the 32-char
-- CHECK and the 32-char RPC validation exactly as shipped by
-- 01-campaign-intents-apply.sql. Nothing else is touched.
--
-- SAFETY: restoring the 32-cap makes the constraint STRICTER — rows with
-- device_id longer than 32 that were written after the 64-apply would now
-- violate it. DROP the constraint's validation only after confirming no such
-- rows exist (rollback runs standalone; inspect data first if unsure).
--
-- ROLLBACK (owner executes only if a full reversal is required):
-- ============================================================================

-- 1) CHECK back to 32.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.campaign_intents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* 'device_id'
  LOOP
    EXECUTE format('ALTER TABLE public.campaign_intents DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.campaign_intents ADD CONSTRAINT campaign_intents_device_id_check
  CHECK (device_id IS NULL OR (char_length(device_id) BETWEEN 1 AND 32));

-- 2) RPC back to the 01-campaign-intents-apply.sql body (device_id cap 32).
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

  IF p_visitor_hash IS NULL OR p_visitor_hash !~ '^[a-f0-9]{16,64}$' THEN
    RAISE EXCEPTION 'invalid visitor_hash (expected 16-64 lowercase hex)';
  END IF;

  IF p_device_id IS NOT NULL AND char_length(p_device_id) > 32 THEN
    RAISE EXCEPTION 'device_id too long (max 32)';
  END IF;
  IF p_ad_placement IS NOT NULL
     AND p_ad_placement NOT IN ('home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom') THEN
    RAISE EXCEPTION 'invalid ad_placement: %', p_ad_placement;
  END IF;

  IF p_campaign_id IS NULL AND p_ad_placement IS NULL AND p_device_id IS NULL THEN
    RAISE EXCEPTION 'no target: at least one of campaign_id/ad_placement/device_id is required';
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = p_campaign_id AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'campaign not found or inactive';
    END IF;
  END IF;

  SELECT count(*) INTO v_hourly_count
  FROM public.campaign_intents
  WHERE visitor_hash = p_visitor_hash
    AND created_at > now() - interval '1 hour';
  IF v_hourly_count >= 60 THEN
    RAISE EXCEPTION 'rate limit exceeded (60/hour/visitor)';
  END IF;

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
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid='public.campaign_intents'::regclass and contype='c';   -- 32
--   select pg_get_functiondef('public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure)
--     ... like '%> 32%';                                                     -- present
-- ============================================================================
