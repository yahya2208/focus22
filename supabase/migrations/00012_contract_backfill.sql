-- ============================================================================
-- FOCUS Product Contract v1.0 — Phase D: backfill legacy state -> contract state
--
-- Type: Backfill
-- Phase: D
-- Needs backfill: this migration IS the backfill
-- Directly reversible: not directly (one-way derivation; restore from legacy columns is_active/version/metadata)
-- Depends on: 00010 (the columns it fills)
-- Required by: none (00013 is documentation-only)
--
-- Runs AFTER 00008/00009/00010/00011. One-way derivation (is_active -> status)
-- that never deletes data. Idempotent: re-running only touches rows still null
-- or still holding the legacy 'active' value.
--
-- Phase 1 rules honored: ADD ONLY. No DROP, no ALTER TYPE, no new CHECK, no
-- change to any default the current app relies on.
--
-- Rollback: no data was destroyed; to undo, restore from the legacy columns
-- (is_active / campaigns.version / sessions.metadata) and clear the new ones.
-- ============================================================================

-- 1) campaigns.status: legacy 'active' / NULL becomes a contract value.
--    Preserves explicit statuses (e.g. 'archived') untouched.
UPDATE public.campaigns
SET status = CASE WHEN is_active THEN 'running' ELSE 'ended' END,
    updated_at = now()
WHERE status = 'active' OR status IS NULL;

-- 2) campaigns.campaign_version <- campaigns.version (fallback '1').
UPDATE public.campaigns
SET campaign_version = COALESCE(NULLIF(version, ''), '1'),
    updated_at = now()
WHERE campaign_version IS NULL;

-- 3) Session snapshot: copy campaign facts onto the session so research
--    results stay stable even if the campaign row changes later.
--    Bundle shape (contract):
--      { id, name, version, plugin_id, plugin_version, start_date, end_date, status, created_at }
--    engine_name/engine_version need no backfill: 00010 added them as
--    NOT NULL DEFAULT 'focus-engine' / 1.
UPDATE public.sessions s
SET campaign_snapshot = jsonb_build_object(
      'id', c.id::text,
      'name', c.name,
      'version', COALESCE(NULLIF(c.campaign_version, ''), c.version, '1'),
      'plugin_id', s.plugin_id,
      'plugin_version', s.metadata->>'plugin_version',
      'start_date', c.start_date,
      'end_date', c.end_date,
      'status', c.status,
      'created_at', c.created_at
    )
FROM public.campaigns c
WHERE s.campaign_id = c.id
  AND s.campaign_snapshot IS NULL;

-- 4) analytics_events.schema_version <- '1' (events predate versioning).
UPDATE public.analytics_events
SET schema_version = '1'
WHERE schema_version IS NULL;
