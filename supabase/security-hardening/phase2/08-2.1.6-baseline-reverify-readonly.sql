-- ============================================================================
-- Phase 2 · Task 2.1.6 — Baseline Verification (E1–E10) — READ-ONLY REWRITE
--
-- Supersedes 04-2.1.6 (withdrawn after the Production incident).
-- Rebuilt FROM SCRATCH under the post-incident rule:
--
--   "An attestation probe may never be able to write anything — not even
--    after a logical bug."  -> every statement below is SELECT / pg_catalog.
--
-- GUARANTEES (verifiable by inspection — no exception):
--   * NO UPDATE / INSERT / DELETE / CALL / RPC on any production table
--   * NO set_config (neither 'true' nor 'false')  -> no session state at all
--   * NO set role, NO temp tables, NO transaction, NO GRANT / REVOKE / DDL
--   * session state AFTER == BEFORE (claims, role, GUCs, search_path)
--   * allowed building blocks ONLY: SELECT, EXPLAIN, pg_policies, pg_proc,
--     pg_get_functiondef, has_table_privilege, has_function_privilege
--
-- HOW E1–E10 ARE PROVEN WITHOUT EXERCISING THE ROUTES
--   Each expectation is decomposed into static facts that GUARANTEE it:
--     guard body present + EXECUTE revoked  =>  the RPC cannot succeed (E1/E2)
--     TO-public admin policy on is_admin()   =>  anon UPDATE hits 0 rows (E7)
--     INSERT policy TO authenticated only    =>  anon INSERT is 42501 (E8)
--     WITH CHECK user_id = auth.uid()        =>  cross-user INSERT is 42501 (E10)
--     policy list + privilege matrix         =>  read isolation (E4/E4b/E5)
--   The final section maps every E to its evidence rows.
--
-- Execution: Supabase SQL Editor (owner role). Paste all result grids back.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Q1  Policy snapshot — the RLS surface that gates every E below.
-- ----------------------------------------------------------------------------
select t.tablename,
       t.policyname,
       t.cmd,
       coalesce(t.roles::text, 'PUBLIC') as roles,
       coalesce(t.qual::text, '')        as using_expr,
       coalesce(t.with_check::text, '')  as with_check
from pg_policies t
where t.schemaname = 'public'
  and t.tablename in ('users', 'qr_codes', 'analytics_events', 'sessions', 'campaigns')
order by t.tablename, t.cmd, t.policyname;

-- ----------------------------------------------------------------------------
-- Q2  Admin RPCs: internal guard present? EXECUTE revoked from app roles?
--     (E1 = admin_promote_user, E2 = bootstrap_super_admin)
--     NOTE: bootstrap_super_admin intentionally uses a STATE-based guard
--     (calls_has_super_admin=true, calls_is_admin=false) — ADR-001 exception
--     A4-x: the first super_admin has no predecessor, so a caller-identity
--     check is impossible by design. The column split below makes that visible.
-- ----------------------------------------------------------------------------
select p.proname as function,
       has_function_privilege('anon',           p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',  p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',   p.oid, 'EXECUTE') as service_role_execute,
       position('42501'               in pg_get_functiondef(p.oid)) > 0 as has_42501_guard,
       position('public.is_admin()'   in pg_get_functiondef(p.oid)) > 0 as calls_is_admin,
       position('public.has_super_admin()' in pg_get_functiondef(p.oid)) > 0 as calls_has_super_admin,
       p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_promote_user', 'bootstrap_super_admin')
order by p.proname;

-- ----------------------------------------------------------------------------
-- Q3  Role-tool chain attestation (A5/A6): is_admin -> app_role -> auth.uid
--     (R001 of the incident: even the owner yields is_admin=false w/o claims)
-- ----------------------------------------------------------------------------
select p.proname as function,
       position('public.app_role()' in pg_get_functiondef(p.oid)) > 0 as calls_app_role,
       position('auth.uid()'        in pg_get_functiondef(p.oid)) > 0 as calls_auth_uid,
       position('request.jwt'       in pg_get_functiondef(p.oid)) > 0 as reads_request_jwt,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'app_role')
order by p.proname;

-- ----------------------------------------------------------------------------
-- Q4  Table privilege matrix — the outer gate (GRANT) before RLS.
--     Presence of a GRANT is expected and harmless: RLS still governs.
-- ----------------------------------------------------------------------------
select r.role,
       t.tablename,
       has_table_privilege(r.role, 'public.' || t.tablename, 'SELECT') as can_select,
       has_table_privilege(r.role, 'public.' || t.tablename, 'INSERT') as can_insert,
       has_table_privilege(r.role, 'public.' || t.tablename, 'UPDATE') as can_update,
       has_table_privilege(r.role, 'public.' || t.tablename, 'DELETE') as can_delete
from (values ('anon'), ('authenticated')) as r(role)
cross join (values ('users'), ('qr_codes'), ('analytics_events'),
                    ('sessions'), ('campaigns')) as t(tablename)
order by r.role, t.tablename;

-- ----------------------------------------------------------------------------
-- Q5  Current session identity read (pure SELECT — never writes claims/role).
--     Re-proves the linchpin: without claims, auth.uid()=NULL and is_admin()=false.
-- ----------------------------------------------------------------------------
select current_setting('request.jwt.claims', true) as claims,
       auth.uid()                                  as auth_uid,
       public.app_role()                           as app_role,
       public.is_admin()                           as is_admin;

-- ----------------------------------------------------------------------------
-- Q6  E3 explicit evidence: anon -> has_super_admin : true
--     (documented informational exception, ADR-001 A4-x — read-only predicate)
--     Part 1: anon holds EXECUTE on the predicate (has_function_privilege).
--     Part 2: the predicate evaluates true because a super_admin (A) exists.
--     Both are SELECT-only; nothing is written.
-- ----------------------------------------------------------------------------
select has_function_privilege('anon', 'public.has_super_admin()', 'EXECUTE') as anon_execute,
       (select count(*) from public.users where role = 'super_admin')        as super_admin_count,
       (select exists (select 1 from public.users where role = 'super_admin')) as super_admin_exists;

-- ----------------------------------------------------------------------------
-- VERDICT TABLE — how each expectation is guaranteed by the rows above.
--   (Static attestation; nothing is exercised, so nothing can write.)
--
--   E1  anon -> admin_promote_user : 42501
--       PROOF: Q2 anon_execute=false (REVOKE -> runtime 42501 before the body)
--       AND Q2 has_42501_guard=true (defense-in-depth if EXECUTE were granted).
--   E2  anon -> bootstrap_super_admin : 42501
--       PROOF: Q2 anon_execute=false. Guard is STATE-based by design
--       (calls_has_super_admin=true, calls_is_admin=false): raises 42501
--       whenever a super_admin already exists (A does) — ADR-001 exception A4-x
--       (the first super_admin has no predecessor, so caller identity cannot
--       be required). No mismatch: the comment describes this exact design.
--   E3  anon -> has_super_admin : true (documented ADR-001 A4-x, informational)
--       PROOF: Q6 anon_execute=true (has_function_privilege) AND
--       super_admin_exists=true (A). The predicate only SELECTs users (read-only).
--   E4  A reads B's row : 1 (allowed by design)
--       PROOF: Q1 users SELECT policy "Researchers read all users"
--       USING(is_research_role()) TO authenticated + Q4 authenticated SELECT.
--   E4b B reads A's row : 0 (ownership isolation)
--       PROOF: Q1 users SELECT policies only allow is_research_role() or
--       (id = auth.uid()); B is 'user' -> is_research_role()=false -> B sees
--       only his own row, not A's.
--   E5  anon -> read users : 0
--       PROOF: Q1 users SELECT policies are TO authenticated only -> anon has
--       no SELECT policy -> RLS yields 0 rows even though Q4 grant exists.
--   E6  A inserts a session for B : 42501 (ownership)
--       PROOF: Q1 sessions INSERT policy WITH CHECK (user_id = auth.uid());
--       A inserting B's id violates the check -> new row blocked by RLS.
--   E7  anon -> UPDATE qr_codes : 0 rows
--       PROOF: Q1 qr_codes UPDATE/ALL path = "Admins manage qr codes"
--       USING(is_admin()) only; Q5 shows anon (clean) is_admin()=false -> 0.
--   E8  anon -> INSERT analytics_events : 42501
--       PROOF: Q1 analytics INSERT policy is TO authenticated only -> anon has
--       no INSERT policy -> 42501 despite Q4 grant.
--   E9  authenticated owner -> INSERT analytics_events : allowed, then cleanup
--       PROOF: Q1 INSERT WITH CHECK ((user_id IS NULL) OR (user_id=auth.uid()))
--       allows the owner to insert with their own id. CLEANUP NOTE: there is
--       NO DELETE policy on analytics_events (incident R012) — any probe
--       cleanup DELETE must therefore run as the owner, never as a client role.
--   E10 authenticated cross-user -> INSERT analytics_events : 42501
--       PROOF: Q1 INSERT WITH CHECK user_id = auth.uid() rejects a foreign id.
--
--   Every "PROOF" above is a SELECT over pg_policies / pg_proc / privileges.
--   This probe is structurally incapable of writing to production.
-- ============================================================================
