-- ============================================================================
-- Phase 2 · Task 2.1.2 — Probe protocol (run in Supabase SQL Editor)
-- Known live identities:
--   A = a549a010-3315-4391-b90b-5c41ea3f6fe6  (users.role = super_admin)
--   B = 979e7949-794f-4386-b2a4-dc207d4fb0d0  (users.role = user)
-- RLS applies only when the session role is NOT a superuser, so probes that
-- exercise policies must run under `set local role authenticated` / `anon`.
-- Write probes are zero-impact: wrapped in a transaction and ROLLED BACK.
-- ============================================================================

-- ============================================================
-- STEP 1 · BEFORE PROBES (run BEFORE applying 02-2.1.2-is-admin-predicate-replace.sql)
-- ============================================================

-- 1a) confirm the 3 EXISTS-pattern policies are present (they are the targets)
select tablename, policyname, qual::text
from pg_policies
where schemaname='public'
  and tablename in ('campaigns','qr_codes','users')
  and qual::text like '%admin%'
order by tablename, policyname;

-- 1b) baseline: admin write via the EXISTS pattern — A succeeds, B denied, anon denied
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}',false);
begin;
update public.campaigns set id = id where id = (select id from public.campaigns limit 1) returning id as a_campaign_updated;
rollback;
begin;
update public.qr_codes set id = id where id = (select id from public.qr_codes limit 1) returning id as a_qr_updated;
rollback;
begin;
update public.users set role = role where id = (select id from public.users limit 1) returning id as a_user_role_updated;
rollback;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"979e7949-794f-4386-b2a4-dc207d4fb0d0","role":"authenticated"}',false);
begin;
update public.campaigns set id = id where id = (select id from public.campaigns limit 1) returning id as b_campaign_updated;
rollback;
reset role;

set local role anon;
begin;
update public.qr_codes set id = id where id = (select id from public.qr_codes limit 1) returning id as anon_qr_updated;
rollback;
reset role;

-- ============================================================
-- STEP 2 · APPLY  → paste full contents of 02-2.1.2-is-admin-predicate-replace.sql
-- ============================================================

-- ============================================================
-- STEP 3 · AFTER PROBES (run AFTER applying)
-- ============================================================

-- 3a) policies now reference public.is_admin(); EXISTS pattern must be GONE
select tablename, policyname, qual::text
from pg_policies
where schemaname='public'
  and tablename in ('campaigns','qr_codes','users')
order by tablename, policyname;

-- 3b) proof: ZERO occurrences of the repeated array predicate anywhere
select count(*) as admin_exists_pattern_count
from pg_policies
where schemaname='public'
  and (qual::text like '%ARRAY[''admin''::text, ''super_admin''::text]%'
    or with_check::text like '%ARRAY[''admin''::text, ''super_admin''::text]%');

-- 3c) admin writes still allowed — A succeeds, B denied, anon denied
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}',false);
begin;
update public.campaigns set id = id where id = (select id from public.campaigns limit 1) returning id as a_campaign_updated;
rollback;
begin;
update public.qr_codes set id = id where id = (select id from public.qr_codes limit 1) returning id as a_qr_updated;
rollback;
begin;
update public.users set role = role where id = (select id from public.users limit 1) returning id as a_user_role_updated;
rollback;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"979e7949-794f-4386-b2a4-dc207d4fb0d0","role":"authenticated"}',false);
begin;
update public.campaigns set id = id where id = (select id from public.campaigns limit 1) returning id as b_campaign_updated;
rollback;
reset role;

set local role anon;
begin;
update public.qr_codes set id = id where id = (select id from public.qr_codes limit 1) returning id as anon_qr_updated;
rollback;
reset role;

-- 3d) regression: is_admin()/app_role()/is_research_role()/has_super_admin() unchanged
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}',false);
select public.is_admin() as is_admin_a, public.app_role() as role_a,
       public.is_research_role() as is_research_a, public.has_super_admin() as has_super_admin_a;
reset role;
