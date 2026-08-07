-- ============================================================================
-- FOCUS Product Contract v1.1 — M1: lookup_scan_context RPC (additive)
--
-- Type: Additive
-- Phase: M1 (Campaigns & QR Intelligence — data layer)
-- Needs backfill: no
-- Directly reversible: yes (DROP FUNCTION lookup_scan_context(TEXT, TEXT))
-- Depends on: 00016 (placements), 00017 (qr placement_id). Self-contained on
--             campaign columns that exist on the LIVE database (id, short_code,
--             name, status, start_date, end_date, is_active, created_at). It does
--             NOT read 00010 columns (campaign_version/abandon_timeout_minutes),
--             which are not applied to the live DB.
-- Required by: the app's QR entry flow (App.tsx InitialRoute)
--
-- Single-entry resolution for a printed QR whose URL is
--   /c/{short_code}?p={placement_code}
-- The camera never talks to the DB; this RPC is the ONLY read on the scan path.
-- Returns the full funnel context in one round trip:
--   status     TEXT    -> NOT_FOUND | ENDED | SCHEDULED | PAUSED | FOUND |
--                        PLACEMENT_NOT_FOUND | PLACEMENT_INACTIVE | QR_NOT_ASSIGNED
--   campaign   JSONB   -> campaign bundle when the short code resolves
--   placement  JSONB   -> the resolved placement (safe columns only; notes are
--                         NEVER exposed to anon/authenticated via this RPC)
--   qr_version JSONB   -> the active QR version installed at that placement
--
-- Resolution rules (mirror v2's classification, live-columns only):
--   * codes may be reused across INACTIVE campaigns; owner = active row if one
--     exists, else most recently created.
--   * campaign status classification: draft/NULL => NOT_FOUND, ended/archived =>
--     ENDED, paused => PAUSED, scheduled or not-yet-started => SCHEDULED,
--     past end_date => ENDED, otherwise FOUND.
-- Placement rules (new in M1):
--   * p_placement_code is optional. When absent, FOUND with placement NULL.
--   * when given: placement = the row with (campaign_id, code). Non-active
--     status => PLACEMENT_INACTIVE. Missing => PLACEMENT_NOT_FOUND.
--   * qr_version = latest is_active QR with that placement_id (NULL => QR_NOT_ASSIGNED
--     only when a placement resolved without any active QR).
--
-- Security (contract): STABLE SECURITY DEFINER with explicit SET search_path.
-- Grants: anon + authenticated (the scan runs pre-auth).
--
-- Rollback:
--   DROP FUNCTION public.lookup_scan_context(TEXT, TEXT);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lookup_scan_context(
  p_short_code TEXT,
  p_placement_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  status      TEXT,
  campaign    JSONB,
  placement   JSONB,
  qr_version  JSONB
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH campaign_owner AS (
    SELECT c.id, c.short_code, c.name, c.status, c.start_date, c.end_date
    FROM public.campaigns c
    WHERE c.short_code = TRIM(p_short_code)
    ORDER BY (c.is_active = TRUE) DESC, c.created_at DESC
    LIMIT 1
  ),
  campaign_state AS (
    SELECT
      CASE
        WHEN o.id IS NULL                                   THEN 'NOT_FOUND'
        WHEN o.status IS NULL OR o.status = 'draft'        THEN 'NOT_FOUND'
        WHEN o.status IN ('ended', 'archived')             THEN 'ENDED'
        WHEN o.status = 'paused'                           THEN 'PAUSED'
        WHEN o.status = 'scheduled'                        THEN 'SCHEDULED'
        WHEN o.start_date IS NOT NULL AND o.start_date > now() THEN 'SCHEDULED'
        WHEN o.end_date   IS NOT NULL AND o.end_date   <= now() THEN 'ENDED'
        ELSE 'FOUND'
      END AS cstate,
      o.*
    FROM campaign_owner o
  ),
  resolved_placement AS (
    SELECT p.*
    FROM campaign_state cs
    JOIN public.placements p ON p.campaign_id = cs.id AND p.code = TRIM(p_placement_code)
    WHERE cs.cstate = 'FOUND' AND p_placement_code IS NOT NULL AND TRIM(p_placement_code) <> ''
  ),
  resolved_qr AS (
    SELECT q.*
    FROM resolved_placement rp
    JOIN public.qr_codes q ON q.placement_id = rp.id AND q.is_active = TRUE
    ORDER BY q.created_at DESC
    LIMIT 1
  )
  SELECT
    CASE
      WHEN cs.cstate <> 'FOUND' THEN cs.cstate
      WHEN p_placement_code IS NOT NULL AND TRIM(p_placement_code) <> '' AND rp.id IS NULL THEN 'PLACEMENT_NOT_FOUND'
      WHEN rp.id IS NOT NULL AND rp.status <> 'active' THEN 'PLACEMENT_INACTIVE'
      WHEN rp.id IS NOT NULL AND rq.id IS NULL THEN 'QR_NOT_ASSIGNED'
      ELSE 'FOUND'
    END AS status,
    CASE
      WHEN cs.cstate = 'NOT_FOUND' THEN NULL
      ELSE jsonb_build_object(
        'id', cs.id::text,
        'short_code', cs.short_code,
        'name', cs.name
      )
    END AS campaign,
    CASE
      WHEN rp.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', rp.id::text,
        'campaign_id', rp.campaign_id::text,
        'code', rp.code,
        'name', rp.name,
        'city', rp.city,
        'district', rp.district,
        'venue', rp.venue,
        'building', rp.building,
        'floor', rp.floor,
        'status', rp.status
      )
    END AS placement,
    CASE
      WHEN rq.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', rq.id::text,
        'code', rq.code,
        'referral_code', rq.referral_code,
        'url', rq.url,
        'is_active', rq.is_active,
        'version', rq.version
      )
    END AS qr_version
  FROM (SELECT 1) AS anchor
  LEFT JOIN campaign_state cs ON TRUE
  LEFT JOIN resolved_placement rp ON TRUE
  LEFT JOIN resolved_qr rq ON TRUE;
$$;

REVOKE ALL ON FUNCTION public.lookup_scan_context(TEXT, TEXT) FROM PUBLIC;
-- Scan path runs pre-auth (anon) and post-auth (authenticated).
GRANT EXECUTE ON FUNCTION public.lookup_scan_context(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_scan_context(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.lookup_scan_context(TEXT, TEXT) IS
  'Contract v1.1 M1: single-entry resolution for /c/{short_code}?p={placement_code}. Returns campaign + placement + active QR version with an explicit status so the UI can render the right screen.';
