-- ============================================================================
-- FOCUS — M2 · SHOWROOM ALLOWLIST — ACCEPTANCE TEST  (05)  —  NON-LIVE ONLY
--
-- PRACTICAL server-side acceptance test for the 'showroom' placement.
--
-- !!! WARNING — NEVER run this file on the LIVE database !!!
-- Run it on a DEV / STAGING / throwaway database where the M2 fix has been
-- applied (01-apply.sql or 04-live-fix.sql + base migration).
--
-- It invokes record_campaign_intent with 'showroom' to PROVE the RPC no longer
-- rejects the placement. Every write is inside a single transaction that is
-- ROLLED BACK — no rows persist.
--
--   * PASS = both SELECTs return without raising an exception (accept).
--   * FAIL = an exception "invalid ad_placement: showroom" is raised (reject).
--
-- This is intentionally separate from 03-verify-readonly.sql, which must stay
-- strictly read-only for the LIVE pre/post verification.
-- ============================================================================

BEGIN;

-- view — showroom placement, no product target.
SELECT public.record_campaign_intent(
  p_kind         := 'view',
  p_visitor_hash := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  p_cta_type     := NULL,
  p_campaign_id  := NULL,
  p_ad_placement := 'showroom',
  p_device_id    := NULL
);

-- click — showroom placement with a product target (ad linked to a phone).
SELECT public.record_campaign_intent(
  p_kind         := 'click',
  p_visitor_hash := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  p_cta_type     := 'ad_click',
  p_campaign_id  := NULL,
  p_ad_placement := 'showroom',
  p_device_id    := 'rec_test1'
);

-- whatsapp_intent — showroom placement with a product target.
SELECT public.record_campaign_intent(
  p_kind         := 'whatsapp_intent',
  p_visitor_hash := 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  p_cta_type     := 'inquiry',
  p_campaign_id  := NULL,
  p_ad_placement := 'showroom',
  p_device_id    := 'rec_test1'
);

ROLLBACK;

-- ============================================================================
-- Done — transaction rolled back. No rows were persisted.
-- ============================================================================
