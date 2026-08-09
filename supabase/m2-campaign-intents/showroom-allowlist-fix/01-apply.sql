-- ============================================================================
-- FOCUS — M2 · SHOWROOM ALLOWLIST FIX — APPLY (01)
--
-- Type: Additive fix for the M2 campaign-intent counters (Marketplace Mediator
--   model §17–§20). Aligns the server-side `ad_placement` allowlist with the
--   real placements: the frontend already records showroom view/click events
--   (src/screens/showroom/ShowroomScreen.tsx → src/components/ad-contact/
--   AdContactBanner.tsx → src/services/intent-tracking.ts), but the base
--   migration omitted 'showroom' so the RPC rejected every such event.
--
-- SCOPE — changes ONLY what is needed to accept 'showroom':
--   1. rebuild the ad_placement CHECK constraint to include 'showroom'
--   2. replace record_campaign_intent with 'showroom' in its allowlist
--   It does NOT create tables, does NOT touch QR/Game/Results/WhatsApp, does
--   NOT touch analytics_events, device identity, campaigns or any grant model.
--
-- SAFETY — idempotent and guarded:
--   * if public.campaign_intents does not exist          → FAIL + STOP (no-op)
--   * if public.record_campaign_intent does not exist    → FAIL + STOP (no-op)
--   * re-running is safe (constraint rebuilt by name, function REPLACED).
--
-- APPLY
--   Local/dev/CI: run this file (01-apply.sql).
--   LIVE: the owner runs 04-live-fix.sql (identical SQL, LIVE-labelled).
--   Then run 03-verify-readonly.sql (read-only verification).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Hard guards — the required M2 structure must already exist.
-- ----------------------------------------------------------------------------
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'campaign_intents' AND c.relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION
      'FOCUS M2 showroom fix — STOP: public.campaign_intents does not exist. Apply the base migration supabase/m2-campaign-intents/01-campaign-intents-apply.sql first, then re-run this file. No changes were made.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.record_campaign_intent(text,text,text,uuid,text,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION
      'FOCUS M2 showroom fix — STOP: public.record_campaign_intent does not exist. Apply the base migration supabase/m2-campaign-intents/01-campaign-intents-apply.sql first, then re-run this file. No changes were made.';
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- 1) Rebuild the ad_placement CHECK constraint to include 'showroom'.
--    The constraint is located by column so the fix works regardless of the
--    auto-generated name assigned by the base migration.
-- ----------------------------------------------------------------------------
DO $constraint$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'public.campaign_intents'::regclass
    AND c.contype = 'c'
    AND a.attname = 'ad_placement';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.campaign_intents DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.campaign_intents
    ADD CONSTRAINT campaign_intents_ad_placement_check
    CHECK (ad_placement IN ('home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom'));
END
$constraint$;

-- ----------------------------------------------------------------------------
-- 2) Replace record_campaign_intent with 'showroom' in the allowlist.
--    Body identical to the base migration EXCEPT the placement allowlist.
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

-- ----------------------------------------------------------------------------
-- 3) Defensive grants — CREATE OR REPLACE preserves existing grants; these
--    re-statements are idempotent and keep the anon/authenticated call path.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.record_campaign_intent(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Done. Run 03-verify-readonly.sql next (read-only).
-- ============================================================================
