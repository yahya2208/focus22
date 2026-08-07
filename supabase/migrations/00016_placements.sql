-- ============================================================================
-- FOCUS Product Contract v1.1 — M1: placements + placement_history (additive)
--
-- Type: Additive
-- Phase: M1 (Campaigns & QR Intelligence — data layer)
-- Needs backfill: no
-- Directly reversible: yes (DROP placement_history, placements)
-- Depends on: 00014/00015 baseline (update_updated_at, users.id = UUID, campaigns.id)
-- Required by: 00017 (qr_codes/sessions/analytics_events gain placement_id FKs)
--
-- Introduces the Campaign -> Placement -> QR Version hierarchy:
--   * placements is the STABLE, channel-agnostic hub (a physical location).
--     Printed QRs are versions INSTALLED at a placement; moving a QR between
--     placements (e.g. Gate A -> Gate C) is recorded, never overwritten.
--   * placement_history is an immutable change log: creation, QR assign/unassign,
--     status flips, field edits. It is the single source for placement timeline.
--
-- Roles note (M1 decision): campaigns OWNER/EDITOR/ANALYST are expressed via
-- job_assignments.role ('owner'|'editor'|'analyst'|'delegate'), NOT via a new
-- campaigns.owner column — job_assignments already models campaign-scoped,
-- multi-person assignments with a status machine.
--
-- Phase 1 rules honored: ADD ONLY. No DROP, no ALTER TYPE, no change to any
-- existing object.
--
-- Rollback (reverse order):
--   DROP TABLE public.placement_history;
--   DROP TABLE public.placements;
-- ============================================================================

-- UUID generator used by existing tables (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1) placements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id  UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  city         TEXT,
  district     TEXT,
  venue        TEXT,
  building     TEXT,
  floor        TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  installed_at TIMESTAMPTZ,
  removed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT placements_campaign_code_unique UNIQUE (campaign_id, code)
);

CREATE INDEX IF NOT EXISTS idx_placements_campaign ON public.placements (campaign_id);
CREATE INDEX IF NOT EXISTS idx_placements_status ON public.placements (status);

-- ----------------------------------------------------------------------------
-- 2) placement_history (immutable change log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  placement_id UUID NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  qr_id        UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  field        TEXT,
  from_value   JSONB,
  to_value     JSONB,
  actor        UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_history_placement ON public.placement_history (placement_id);
CREATE INDEX IF NOT EXISTS idx_placement_history_qr ON public.placement_history (qr_id);

-- ----------------------------------------------------------------------------
-- Trigger: bump placements.updated_at on UPDATE
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_placements_updated_at ON public.placements;
CREATE TRIGGER trg_placements_updated_at
  BEFORE UPDATE ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
--   Admins manage placements. Public read is limited to ACTIVE rows so the
--   QR flow (pre-auth) can resolve a placement by code without seeing notes.
--   placement_history is write-only via the app layer's RPC/security definer
--   helpers; the team reads it. No DELETE policy anywhere.
-- ----------------------------------------------------------------------------
ALTER TABLE public.placements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active placements"
  ON public.placements FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY "Staff manage placements"
  ON public.placements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')));

CREATE POLICY "Staff read placement history"
  ON public.placement_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin','researcher')));

CREATE POLICY "Staff write placement history"
  ON public.placement_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')));

-- ----------------------------------------------------------------------------
-- Grants
--   anon/authenticated read ACTIVE placement identity columns only (enough to
--   render the resolved placement on the landing page). Notes are never exposed.
--   Staff get full INSERT/UPDATE via RLS. No DELETE grant => no hard delete.
-- ----------------------------------------------------------------------------
GRANT SELECT (id, campaign_id, code, name, city, district, venue, building, floor, status)
  ON public.placements TO anon, authenticated;
GRANT SELECT (id, campaign_id, code, name, city, district, venue, building, floor,
              notes, status, installed_at, removed_at, created_at, updated_at)
  ON public.placements TO authenticated;
GRANT INSERT, UPDATE ON public.placements TO authenticated;

GRANT SELECT ON public.placement_history TO authenticated;

COMMENT ON TABLE public.placements IS
  'Contract v1.1 M1: stable, channel-agnostic hub of a campaign hierarchy (Campaign -> Placement -> QR Version). Physical locations; QRs are printed versions installed here.';
COMMENT ON TABLE public.placement_history IS
  'Contract v1.1 M1: immutable change log for placements (creation, QR assign/move, status flips, edits). Single source for placement timeline.';
