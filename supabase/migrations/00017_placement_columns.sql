-- ============================================================================
-- FOCUS Product Contract v1.1 — M1: placement attribution columns (additive)
--
-- Type: Additive
-- Phase: M1 (Campaigns & QR Intelligence — data layer)
-- Needs backfill: no
-- Directly reversible: yes (DROP INDEX, DROP COLUMN placement_id x3)
-- Depends on: 00016 (placements.id for the FKs)
-- Required by: 00018 (lookup_scan_context reads placements + qr_codes)
--
-- Every qr_codes row is a printed VERSION installed at a placement. Sessions
-- and analytics_events gain placement_id so attribution is possible from the
-- FIRST entry of the funnel (scan -> landing -> game) without backfill.
-- qr_codes.placement_id is nullable until a QR is assigned/printed.
--
-- Live tables are ALTERed with IF NOT EXISTS so re-runs and fresh builds are
-- safe. No existing column is changed.
--
-- Rollback (reverse order):
--   ALTER TABLE analytics_events DROP COLUMN placement_id;
--   ALTER TABLE sessions        DROP COLUMN placement_id;
--   ALTER TABLE qr_codes        DROP COLUMN placement_id;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- qr_codes: which placement a QR version is installed at (NULL = unassigned)
-- ----------------------------------------------------------------------------
ALTER TABLE public.qr_codes
  ADD COLUMN IF NOT EXISTS placement_id UUID REFERENCES public.placements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qr_codes_placement ON public.qr_codes (placement_id);

-- ----------------------------------------------------------------------------
-- sessions: the placement the user entered through (recorded at creation)
-- ----------------------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS placement_id UUID REFERENCES public.placements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_placement ON public.sessions (placement_id);

-- ----------------------------------------------------------------------------
-- analytics_events: placement attribution from the first tracked event
-- ----------------------------------------------------------------------------
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS placement_id UUID REFERENCES public.placements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_placement ON public.analytics_events (placement_id);

COMMENT ON COLUMN public.qr_codes.placement_id IS
  'Contract v1.1 M1: placement the printed QR version is installed at. NULL until assigned.';
COMMENT ON COLUMN public.sessions.placement_id IS
  'Contract v1.1 M1: placement the user entered through (set at session creation).';
COMMENT ON COLUMN public.analytics_events.placement_id IS
  'Contract v1.1 M1: placement attribution for the event, set from the first event of the funnel.';
