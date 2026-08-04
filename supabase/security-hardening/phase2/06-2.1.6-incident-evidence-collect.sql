-- ============================================================================
-- Phase 2 · Task 2.1.6 — INCIDENT RESPONSE · Phase B — Evidence Collection
--
-- Context: Security/Production Incident — the select-based variant of
-- 04-2.1.6 wrote to Production (D1 users.role(B)=admin · D2 8 qr_codes rows
-- scan_count=999999999 · D3 leftover analytics_events row). Phase A = FREEZE:
-- no more probes/migrations/fixes until the root cause is proven.
--
-- This file is the Phase B catalog. It ONLY observes, it never reproduces.
--
-- CONFIRMED FACTS (already on record):
--   D1  users.role(B)   = 'admin'            (was 'user')
--   D2  qr_codes.scan_count = 999999999      (8 rows)
--   D3  analytics_events 'baseline_reverify_owner' row left behind
--   D4  analytics_events has NO DELETE policy -> D3 is a probe-cleanup flaw
--
-- OPEN QUESTION (do NOT conclude before these results):
--   H1  probe fault: session-scoped set_config('request.jwt.claims', A, false)
--       leaked A's identity into later steps (incl. "set role anon")?
--   H2  real authorization defect: 2.1.3 guard not live / broad qr_codes
--       policy / SECURITY DEFINER / grant issue?
--
-- HARD GUARANTEES (verifiable by inspection — every statement below):
--   * ZERO writes to any table            -> all statements are SELECT
--   * ZERO DDL                            -> no CREATE/ALTER/DROP
--   * ZERO GRANT/REVOKE                   -> no privilege mutation
--   * ZERO session mutation               -> no set_config, no set role,
--                                             no temp tables, no transaction
--   * session state AFTER == BEFORE       -> claims, role, GUCs, search_path
--
-- Execution: Supabase SQL Editor (owner role). Each numbered query is its own
-- result grid. Run ALL and paste every grid back unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- R-001  admin_promote_user() — full definition (guard live? allowlist? A4?)
-- ----------------------------------------------------------------------------
select pg_get_functiondef(p.oid) as admin_promote_user_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'admin_promote_user';

-- ----------------------------------------------------------------------------
-- R-002  is_admin() — full definition (A6 single admin predicate?)
-- ----------------------------------------------------------------------------
select pg_get_functiondef(p.oid) as is_admin_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';

-- ----------------------------------------------------------------------------
-- R-003  app_role() — full definition (A5 single reader of caller role?)
-- ----------------------------------------------------------------------------
select pg_get_functiondef(p.oid) as app_role_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'app_role';

-- ----------------------------------------------------------------------------
-- R-004  auth.uid() / auth.role() / auth.jwt() — the claim readers (H1 chain)
-- ----------------------------------------------------------------------------
select n.nspname || '.' || p.proname as function,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'auth' and p.proname in ('uid', 'role', 'jwt')
order by p.proname;

-- ----------------------------------------------------------------------------
-- R-005  users — live RLS policies
-- ----------------------------------------------------------------------------
select policyname,
       cmd,
       coalesce(roles::text, 'PUBLIC') as roles,
       qual,
       with_check
from pg_policies
where schemaname = 'public' and tablename = 'users'
order by cmd, policyname;

-- ----------------------------------------------------------------------------
-- R-006  qr_codes — live RLS policies (broad UPDATE policy present? H2 branch)
-- ----------------------------------------------------------------------------
select policyname,
       cmd,
       coalesce(roles::text, 'PUBLIC') as roles,
       qual,
       with_check
from pg_policies
where schemaname = 'public' and tablename = 'qr_codes'
order by cmd, policyname;

-- ----------------------------------------------------------------------------
-- R-007  analytics_events — live RLS policies (expect: INSERT + SELECT only)
-- ----------------------------------------------------------------------------
select policyname,
       cmd,
       coalesce(roles::text, 'PUBLIC') as roles,
       qual,
       with_check
from pg_policies
where schemaname = 'public' and tablename = 'analytics_events'
order by cmd, policyname;

-- ----------------------------------------------------------------------------
-- R-008  Function catalog: proacl + SECURITY DEFINER/INVOKER + search_path
--        (covers evidence items 8, 9, 10 in one grid)
-- ----------------------------------------------------------------------------
select n.nspname || '.' || p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args,
       coalesce(p.proacl::text, '(null)') as proacl,
       p.prosecdef as is_security_definer,
       p.provolatile as volatility,
       coalesce(p.proconfig::text, '(none)') as session_settings,
       p.prokind as kind
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public','admin_promote_user'),
  ('public','bootstrap_super_admin'),
  ('public','is_admin'),
  ('public','app_role'),
  ('public','is_research_role'),
  ('public','has_super_admin'),
  ('public','increment_qr_counter'),
  ('public','handle_new_user'),
  ('public','lookup_campaign_by_short_code'),
  ('auth','uid'),
  ('auth','role'),
  ('auth','jwt'))
order by n.nspname, p.proname;

-- ----------------------------------------------------------------------------
-- R-009  EXECUTE privileges per role (OID-based — no signature guessing)
-- ----------------------------------------------------------------------------
select r.role,
       n.nspname || '.' || p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege(r.role, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated'), ('postgres'), ('service_role')) as r(role)
where (n.nspname, p.proname) in (
  ('public','admin_promote_user'),
  ('public','bootstrap_super_admin'),
  ('public','is_admin'),
  ('public','app_role'),
  ('public','is_research_role'),
  ('public','has_super_admin'),
  ('public','increment_qr_counter'),
  ('public','handle_new_user'),
  ('public','lookup_campaign_by_short_code'),
  ('auth','uid'),
  ('auth','role'),
  ('auth','jwt'))
order by n.nspname, p.proname, r.role;

-- ----------------------------------------------------------------------------
-- R-010  Table-level privileges per role (outer gate before RLS)
-- ----------------------------------------------------------------------------
select r.role,
       t.tablename,
       has_table_privilege(r.role, 'public.' || t.tablename, 'SELECT') as can_select,
       has_table_privilege(r.role, 'public.' || t.tablename, 'INSERT') as can_insert,
       has_table_privilege(r.role, 'public.' || t.tablename, 'UPDATE') as can_update,
       has_table_privilege(r.role, 'public.' || t.tablename, 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) as r(role)
cross join (values ('qr_codes'), ('users'), ('analytics_events'),
                    ('campaigns'), ('sessions')) as t(tablename)
order by r.role, t.tablename;

-- ----------------------------------------------------------------------------
-- R-011  Current session context (pure read — never writes claims/role)
--        Shows what THIS session looks like right now.
-- ----------------------------------------------------------------------------
select current_setting('request.jwt.claims', true) as current_session_claims,
       auth.uid() as current_session_auth_uid,
       public.app_role() as current_session_app_role,
       public.is_admin() as current_session_is_admin;
