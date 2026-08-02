-- ============================================================================
-- FOCUS Product Contract v1.0 — Phase C: lookup RPC v2 (additive)
--
-- Type: Additive
-- Phase: C
-- Needs backfill: no
-- Directly reversible: yes (DROP FUNCTION lookup_campaign_by_short_code_v2(TEXT))
-- Depends on: 00010 (reads campaign_version/abandon_timeout_minutes); classification is most accurate after 00012
-- Required by: none (the app switches to v2 during Phase E)
--
-- Creates lookup_campaign_by_short_code_v2 WITHOUT touching v1, which the app
-- still calls today. The app switches to v2 during Phase E.
--
-- Unlike v1, v2 never returns "no result" without an explanation. It returns:
--   status      TEXT  -> FOUND | ENDED | SCHEDULED | PAUSED | NOT_FOUND
--   campaign    JSONB -> campaign bundle when the code resolves to a campaign
--                        (FOUND / ENDED / SCHEDULED / PAUSED), NULL otherwise
-- so the UI can render the correct screen without inference.
--
-- Resolution rule: codes may be reused across INACTIVE campaigns, so the
-- "owner" of a code is the active row if one exists, else the most recently
-- created row with that code (ORDER BY (is_active) DESC, created_at DESC).
--
-- Status classification:
--   no campaign with this code            -> NOT_FOUND
--   status IN ('draft') or NULL           -> NOT_FOUND (never published)
--   status IN ('ended','archived')        -> ENDED
--   status = 'paused'                     -> PAUSED
--   status = 'scheduled'                  -> SCHEDULED
--   status IN ('running','active') and
--     start_date > now()                  -> SCHEDULED (not started yet)
--   status IN ('running','active') and
--     end_date   <= now()                 -> ENDED (window passed)
--   otherwise                             -> FOUND
-- Legacy 'active' is treated like 'running' so v2 keeps working during the
-- app-conversion window (00013).
--
-- Security (contract): STABLE SECURITY DEFINER with explicit SET search_path.
--
-- Rollback:
--   DROP FUNCTION public.lookup_campaign_by_short_code_v2(TEXT);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lookup_campaign_by_short_code_v2(p_code TEXT)
RETURNS TABLE (
  status   TEXT,
  campaign JSONB
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH owner AS (
    SELECT c.id, c.short_code, c.name, c.status, c.campaign_version,
           c.abandon_timeout_minutes, c.start_date, c.end_date
    FROM public.campaigns c
    WHERE c.short_code = TRIM(p_code)
    ORDER BY (c.is_active = TRUE) DESC, c.created_at DESC
    LIMIT 1
  ),
  resolved AS (
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
      END AS code,
      o.*
    FROM owner o
  )
  SELECT
    r.code AS status,
    CASE
      WHEN r.code = 'NOT_FOUND' THEN NULL
      ELSE jsonb_build_object(
        'id', r.id::text,
        'short_code', r.short_code,
        'name', r.name,
        'version', r.campaign_version,
        'abandon_timeout_minutes', r.abandon_timeout_minutes
      )
    END AS campaign
  FROM (SELECT 1) AS anchor
  LEFT JOIN resolved r ON TRUE;
$$;

REVOKE ALL ON FUNCTION public.lookup_campaign_by_short_code_v2(TEXT) FROM PUBLIC;
-- Same grants as v1: the QR flow runs pre-auth (anon) and post-auth.
GRANT EXECUTE ON FUNCTION public.lookup_campaign_by_short_code_v2(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_campaign_by_short_code_v2(TEXT) TO authenticated;

COMMENT ON FUNCTION public.lookup_campaign_by_short_code_v2(TEXT) IS
  'Contract v1.0: resolves a campaign by short code and explains the outcome (FOUND|ENDED|SCHEDULED|PAUSED|NOT_FOUND) so the UI can render the right screen. v1 is untouched; app switches to v2 in Phase E.';
