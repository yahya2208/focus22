-- ============================================================================
-- FOCUS Product Contract v1.0 — Phase B: contract tables
--
-- Type: Additive
-- Phase: B
-- Needs backfill: no (INSERT seeds are idempotent — ON CONFLICT DO NOTHING)
-- Directly reversible: yes (DROP system_settings, audit_log, job_assignments)
-- Depends on: 00008 (campaigns/users tables for FKs; update_updated_at)
-- Required by: none
--
-- Additive & forward-compatible: creates NEW tables only. Does NOT alter,
-- drop, or rename any existing object. Safe to apply over the live database.
--
-- Phase 1 rules honored: ADD ONLY. No DROP, no ALTER TYPE, no new CHECK, no
-- change to any default the current app relies on.
--
-- Rollback (reverse order):
--   DROP TABLE public.job_assignments;
--   DROP TABLE public.audit_log;
--   DROP TABLE public.system_settings;
-- ============================================================================

-- UUID generator used by the new tables (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Shared BEFORE UPDATE trigger. Matches the live definition exactly and is
-- idempotent, so this migration is self-contained on a fresh database.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1) system_settings
--    Global key/value store for runtime configuration and feature flags.
--    Keys are namespaced by GROUP from day one (contract):
--      flags.op   -> operational flags (JSONB object, readable by anonymous QR flow)
--      flags.exp  -> experiment flags  (JSONB object)
--    One key per group = a single lookup, an atomic update, and flags can be
--    added/removed by editing the JSONB object without new rows.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contract default flags (editable at runtime via the settings UI).
-- One key per flag GROUP (remote configuration): adding a flag = editing the
-- JSONB object, never a new row.
-- abandon_timeout_minutes is the GLOBAL default; each campaign overrides it
-- via campaigns.abandon_timeout_minutes.
INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('abandon_timeout_minutes', '5',
   'Global default idle-abandon timeout in minutes; campaigns.abandon_timeout_minutes overrides per campaign', TRUE),
  ('flags.op',
   '{"registration": true, "repair": false, "research": true, "coach": false}',
   'Operational flags (remote configuration), readable by the anonymous QR flow', TRUE),
  ('flags.exp',
   '{"install_v2": false, "registration_v2": true}',
   'Experiment flags', FALSE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Anonymous pre-auth QR flow must be able to read operational flags.
CREATE POLICY "Public read public settings"
  ON public.system_settings FOR SELECT TO public
  USING (is_public = TRUE);

CREATE POLICY "Admins manage settings"
  ON public.system_settings FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 2) audit_log
--    Contract-required append-only audit trail. reason is MANDATORY (NOT NULL).
--    request_id links every entry to the corresponding log/observability row.
--    before/after capture the state change (JSONB diffs).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor       TEXT NOT NULL DEFAULT 'system',  -- acting user id, or 'system'
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      JSONB,
  after       JSONB,
  reason      TEXT NOT NULL,                   -- contract: reason is mandatory
  request_id  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity     ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created    ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON public.audit_log (actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON public.audit_log (request_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated clients append audit entries (write-only for non-admins).
CREATE POLICY "Authenticated insert audit log"
  ON public.audit_log FOR INSERT TO public
  WITH CHECK (auth.role() = 'authenticated');

-- Only admins can READ the audit trail.
CREATE POLICY "Admins read audit log"
  ON public.audit_log FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 3) job_assignments
--    Delegates (مندوبون) assigned to a campaign. Kept SEPARATE from campaigns
--    so a campaign can have zero..n delegates (contract: no fixed delegate
--    count).
--    Assignment status machine (documented here; CHECK lands in Phase E):
--      pending -> accepted | rejected | expired | cancelled
--      accepted -> transferred | completed | cancelled
--    FK to users(id) requires users.id = UUID (true on the live DB; migration
--    00002 declares TEXT and is reconciled by the baseline).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'delegate',
  status      TEXT NOT NULL DEFAULT 'pending',
  assigned_by UUID REFERENCES public.users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_assignments_unique UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_user ON public.job_assignments (user_id);

ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage job assignments"
  ON public.job_assignments FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('admin', 'super_admin')
    )
  );

-- Delegates read their own assignments.
CREATE POLICY "Users read own assignments"
  ON public.job_assignments FOR SELECT TO public
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_job_assignments_updated_at ON public.job_assignments;
CREATE TRIGGER trg_job_assignments_updated_at
  BEFORE UPDATE ON public.job_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
