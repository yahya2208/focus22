-- ============================================================================
-- FOCUS — M2 · DEVICE_ID CAP 32 → 64 (BATCH 4A) — APPLY
--
-- Scope (owner-approved, MINIMAL): widen the campaign_intents.device_id cap
-- from 32 to 64 chars. Changes EXACTLY two things and nothing else on the M2
-- surface:
--   1) the table CHECK on campaign_intents.device_id;
--   2) the same validation inside public.record_campaign_intent.
-- No other validation, no schema change, no policy/grant change.
--
-- WHY: intent-tracking.ts (FROZEN file) sends the ad's InventoryRecord.id
-- RAW as device_id. Inventory ids are crypto.randomUUID() = 36 chars (or
-- id_<ts>_<rand> ≈ 25) — the live 32-cap rejects the 36-char UUIDv4 id the
-- phone-linked ad flow writes, so the cap must widen to 64. It is widened to
-- 64 (not 36) to absorb any future id format without another migration.
--
-- SAFETY: the widened cap is strictly more permissive — it can never reject a
-- row the old cap accepted. Existing rows (≤ 32) remain valid. One-shot.
--
-- Rollback: see 07-device-id-cap-64-rollback.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CHECK: drop any existing CHECK constraint(s) on device_id (the live one
--    is the inline 32-char cap created by 01-campaign-intents-apply.sql,
--    auto-named campaign_intents_device_id_check) and re-add with cap 64.
-- ----------------------------------------------------------------------------
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
  CHECK (device_id IS NULL OR (char_length(device_id) BETWEEN 1 AND 64));

-- ----------------------------------------------------------------------------
-- 2) RPC: recreate record_campaign_intent with the same body as
--    01-campaign-intents-apply.sql EXCEPT the device_id cap is 64.
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

-- ============================================================================
-- Done. Run 09-device-id-cap-64-post-apply-verify.sql next (read-only).
-- ============================================================================
