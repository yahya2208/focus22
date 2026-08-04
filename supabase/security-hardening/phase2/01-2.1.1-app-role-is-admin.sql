-- ============================================================================
-- Phase 2 · Task 2.1.1 — Authorization Inventory Consolidation
-- Add unified role tools: app_role() (ADR-001 A5) + is_admin() (A6).
--
-- Scope of THIS task: CREATE the two tools only. NO policy is rewritten here
-- (policy replacement is task 2.1.2). Existing is_research_role() /
-- has_super_admin() are reused untouched. ZERO behavioral change to any
-- live policy is required and is verified by the Before/After probes.
--
-- ADR-001 compliance: A4 (SECURITY DEFINER validates internally via auth.uid),
-- A5 (app_role() is the only reader of caller role), A6 (is_admin() is the
-- only admin predicate going forward), search_path pinned on every function.
-- ============================================================================

-- A5 · Single reader of the caller's application role.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

-- Grant is intentionally limited to authenticated (mirrors is_research_role).
-- A PUBLIC grant is deferred to 2.1.2 when the TO-public admin policies
-- ("Admins manage qr codes", "Admins update user roles", M9 policies) are
-- rewritten to use is_admin() and actually need it.
revoke all on function public.app_role() from public;
grant execute on function public.app_role() to authenticated;

-- A6 · Single admin predicate (role IN ('admin','super_admin')).
-- Delegates to app_role() so the role list lives in exactly one place.
-- coalesce(...) keeps the predicate boolean (NULL role -> false).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() in ('admin', 'super_admin'), false)
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============================================================================
-- Post-apply probes (run as different roles):
--   set local role authenticated;  select public.app_role(), public.is_admin();
--     -> admin user     : 'admin', true
--     -> super_admin    : 'super_admin', true
--     -> researcher     : 'researcher', false
--     -> regular user   : 'user', false
--     -> guest (row)    : 'guest', false
--   set local role anon; select public.is_admin();  -> false
-- Regression probes:
--   select public.is_research_role();  -- unchanged semantics
--   select public.has_super_admin();   -- unchanged semantics
--   pg_policies diff (Before vs After) must be EMPTY.
-- ============================================================================
