-- ============================================================================
-- Phase 2 · Task 2.1.1 — Probe protocol (run in Supabase SQL Editor)
-- Known live identities:
--   A = a549a010-3315-4391-b90b-5c41ea3f6fe6  (users.role = super_admin)
--   B = 979e7949-794f-4386-b2a4-dc207d4fb0d0  (users.role = user)
-- JWT emulation: set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',false)
-- ============================================================================

-- ============================================================
-- STEP 1 · BEFORE PROBES  (run BEFORE applying 01-2.1.1-app-role-is-admin.sql)
-- ============================================================

-- 1a) the two new tools must NOT exist yet
select to_regprocedure('public.app_role()') as app_role_exists,
       to_regprocedure('public.is_admin()') as is_admin_exists;

-- 1b) baseline policy snapshot (the After diff must be EMPTY)
select schemaname, tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 1c) existing tools semantics (baseline) — emulated as A
select set_config('request.jwt.claims',
       '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
select public.is_research_role() as is_research_role_a,
       public.has_super_admin()  as has_super_admin_a;

-- ============================================================
-- STEP 2 · APPLY  → paste full contents of 01-2.1.1-app-role-is-admin.sql
-- ============================================================

-- ============================================================
-- STEP 3 · AFTER PROBES (run AFTER applying)
-- ============================================================

-- 3a) functions now exist
select to_regprocedure('public.app_role()') as app_role_exists,
       to_regprocedure('public.is_admin()') as is_admin_exists;

-- 3b) role matrix — emulated A (super_admin)
select set_config('request.jwt.claims',
       '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
select public.app_role() as role_a, public.is_admin() as is_admin_a;

-- 3c) role matrix — emulated B (user)
select set_config('request.jwt.claims',
       '{"sub":"979e7949-794f-4386-b2a4-dc207d4fb0d0","role":"authenticated"}', false);
select public.app_role() as role_b, public.is_admin() as is_admin_b;

-- 3d) anon — the authorization result must NEVER be true.
--      Observed 2026-08-02: `false` (not 42501). In the SQL Editor context
--      auth.uid() is NULL, so app_role() -> NULL and is_admin() -> false,
--      regardless of whether the EXECUTE grant check surfaces as 42501.
--      Invariant: is_admin() must never evaluate to true for anon.
set local role anon;
select public.is_admin() as is_admin_anon;   -- EXPECTED: false (or 42501); NEVER true
reset role;

-- 3e) regression: existing tools unchanged
select set_config('request.jwt.claims',
       '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
select public.is_research_role() as is_research_role_a,
       public.has_super_admin()  as has_super_admin_a;
select set_config('request.jwt.claims',
       '{"sub":"979e7949-794f-4386-b2a4-dc207d4fb0d0","role":"authenticated"}', false);
select public.is_research_role() as is_research_role_b;

-- 3f) policy snapshot diff (compare against 1b — must be EMPTY)
select schemaname, tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
