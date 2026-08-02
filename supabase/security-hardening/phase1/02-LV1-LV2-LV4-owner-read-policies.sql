-- Type: Hardening (Phase 1 · LV-1/LV-2/LV-4 + §III.0 4-6 · item 2)
-- Notes: Replaces the broad authenticated reads (auth.role()='authenticated', NO
-- row filter) with owner-scope + role-gated policies on users / sessions /
-- analytics_events / devices / calibrations / surveys.
-- Reference: docs/security/production-security-audit.md (LV-1, LV-2, LV-4, §III.0 4-6) +
--            docs/security/remediation-roadmap.md (Phase 1, execution order item 2).
-- DECISIONS (user, 2026-08-02 — before apply):
--   (1) ADD role-gated full read for researcher/admin/super_admin (app research
--       console / BI reads are cross-user by design; UI permission guard is
--       cosmetic only — RLS is the enforcement point). Pattern mirrors existing
--       "Admins update user roles" (EXISTS on users.role) via a SECURITY DEFINER
--       helper to avoid RLS recursion on public.users.
--   (2) analytics_events: owner + role only. No generic user read.
--   (3) sessions with user_id IS NULL (guest): NO longer readable/manageable by
--       regular authenticated users (role-gated only). Verified safe: all session
--       inserts in src/ set a real uid (session-repository.ts:110-115 throws if
--       unauthenticated; no user_id:null/undefined anywhere).
-- Scope: SELECT (read) policies ONLY, plus the user_id IS NULL restriction on
-- "Users manage own sessions". Role-based expansion is now PART of this item
-- per decision (1). Campaigns (LV-3) handled separately in
-- 03-LV3-campaigns-schema-gap.md (blocked by schema). Idempotent.

-- ============================================================================
-- Helper: role gate for cross-user research reads. SECURITY DEFINER + STABLE to
-- bypass RLS (avoids infinite recursion since the caller's own policy on
-- public.users would otherwise re-enter). Read-only; mirrors has_super_admin.
-- ============================================================================
create or replace function public.is_research_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role in ('researcher','admin','super_admin')
  );
$$;

grant execute on function public.is_research_role() to authenticated;

-- ============================================================================
-- LV-1 · users — any authenticated session can read ALL users (emails/roles/
-- referral_code). Fix: owner scope + role-gated full read.
-- NOTE: "Admins update user roles" (UPDATE) and "Bootstrap insert first user"
--       (INSERT) are untouched. A full user-list remains role-gated now.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated read users" ON public.users;
CREATE POLICY "Users read own profile" ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Researchers read all users" ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_research_role());

-- ============================================================================
-- LV-2 · sessions — any authenticated session can read ALL scientific results.
-- Fix: owner scope + role-gated full read. Additionally restrict guest sessions:
-- "Users manage own sessions" loses its "user_id IS NULL" clause so anonymous/
-- guest sessions are no longer visible to arbitrary authenticated users.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated read sessions" ON public.sessions;
CREATE POLICY "Users read own sessions" ON public.sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Researchers read all sessions" ON public.sessions
  FOR SELECT
  TO authenticated
  USING (public.is_research_role());

-- Restrict guest sessions (decision 3): drop the broad ALL policy and recreate
-- owner-scope only. Verified: no INSERT path uses a NULL user_id.
DROP POLICY IF EXISTS "Users manage own sessions" ON public.sessions;
CREATE POLICY "Users manage own sessions" ON public.sessions
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- LV-4 · analytics_events — any authenticated session can read ALL events.
-- Fix (decision 2): owner scope + role-gated raw read. INSERT policy
-- ("Anyone can insert analytics events") is out of scope — LV-5 / item 08.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated read analytics events" ON public.analytics_events;
CREATE POLICY "Users read own analytics events" ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Researchers read all analytics events" ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (public.is_research_role());

-- ============================================================================
-- §III.0 4-6 · devices / calibrations / surveys — identical broad-read pattern,
-- owner columns confirmed (user_id UUID). Owner scope + role-gated full read.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated read devices" ON public.devices;
CREATE POLICY "Users read own devices" ON public.devices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Researchers read all devices" ON public.devices
  FOR SELECT
  TO authenticated
  USING (public.is_research_role());

DROP POLICY IF EXISTS "Authenticated read calibrations" ON public.calibrations;
CREATE POLICY "Users read own calibrations" ON public.calibrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Researchers read all calibrations" ON public.calibrations
  FOR SELECT
  TO authenticated
  USING (public.is_research_role());

DROP POLICY IF EXISTS "Authenticated read surveys" ON public.surveys;
CREATE POLICY "Users read own surveys" ON public.surveys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Researchers read all surveys" ON public.surveys
  FOR SELECT
  TO authenticated
  USING (public.is_research_role());

-- Verify after apply (compare with pg_policies before-snapshot):
-- select tablename, policyname, cmd, qual
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('users','sessions','analytics_events','devices','calibrations','surveys')
-- order by tablename, policyname;
-- Expected: NO remaining policy whose qual is only auth.role()='authenticated'
-- on these tables; sessions "Users manage own sessions" no longer has
-- "user_id IS NULL"; new is_research_role() helper exists.
