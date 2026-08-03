-- ============================================================================
-- Phase 2 · Task 2.1.3 — Probe protocol (Before / After)
--
-- Acceptance (execution plan 2.1.3): "calling from a non-admin -> 42501 /
-- Forbidden even with a missing REVOKE" — i.e. the INTERNAL guard must fire
-- even if EXECUTE were still granted to anon/authenticated.
--
-- Identifiers:
--   A = a549a010-3315-4391-b90b-5c41ea3f6fe6  (super_admin)
--   B = 979e7949-794f-4386-b2a4-dc207d4fb0d0  (user)
--
-- Emulation recipe (SQL Editor, owner role):
--   set local role authenticated;  -- RLS applies
--   select set_config('request.jwt.claims',
--     '{"sub":"<uuid>","role":"authenticated"}', false);
--
-- A4 probe trick: to prove the guard (not the REVOKE) blocks non-admins, we
-- GRANT EXECUTE inside a transaction, run the probe, then ROLLBACK.
--   begin;
--   grant execute on function public.admin_promote_user(uuid,text) to anon;
--   set local role anon;
--   select public.admin_promote_user('<B>','admin');   -- expect 42501 Forbidden
--   rollback;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BEFORE (run once, before applying 03-2.1.3-rpc-internal-guard.sql)
-- ----------------------------------------------------------------------------

-- B1. Live body of both functions (proves current unguarded state).
select p.proname, pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_promote_user', 'bootstrap_super_admin');

-- B2. proacl snapshot (Phase 1 revoked state — postgres + service_role only).
select p.proname, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_promote_user', 'bootstrap_super_admin');

-- B3. Live proof that the current admin_promote_user has NO caller check:
--     temporarily grant EXECUTE to anon and call as anon with target=B.
--     With the CURRENT (unguarded) body this reaches 'User not found.'
--     (P0001) instead of 42501 — proving LV-9 is only held by the REVOKE.
begin;
grant execute on function public.admin_promote_user(uuid,text) to anon;
set local role anon;
select 'before-b3' as step, public.admin_promote_user('979e7949-794f-4386-b2a4-dc207d4fb0d0','admin') as outcome;
rollback;

-- ----------------------------------------------------------------------------
-- AFTER (run once, after applying 03-2.1.3-rpc-internal-guard.sql)
-- ----------------------------------------------------------------------------

-- A1. Internal guard fires for anon -> admin_promote_user (42501 Forbidden),
--     EVEN with EXECUTE granted (proves A4 defense-in-depth).
begin;
grant execute on function public.admin_promote_user(uuid,text) to anon;
set local role anon;
select 'after-a1-anon' as step, public.admin_promote_user('979e7949-794f-4386-b2a4-dc207d4fb0d0','admin') as outcome;
rollback;

-- A2. Internal guard fires for authenticated user B (42501 Forbidden).
begin;
grant execute on function public.admin_promote_user(uuid,text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"979e7949-794f-4386-b2a4-dc207d4fb0d0","role":"authenticated"}',false);
select 'after-a2-userB' as step, public.admin_promote_user('979e7949-794f-4386-b2a4-dc207d4fb0d0','admin') as outcome;
rollback;

-- A3. Internal guard fires for anon -> bootstrap_super_admin (42501 Forbidden),
--     even with EXECUTE granted.
begin;
grant execute on function public.bootstrap_super_admin(uuid) to anon;
set local role anon;
select 'after-a3-anon' as step, public.bootstrap_super_admin('979e7949-794f-4386-b2a4-dc207d4fb0d0') as outcome;
rollback;

-- A4. Positive control: super_admin A promotes B to 'admin' -> succeeds,
--     row actually changes (proof the guard lets admins through).
begin;
grant execute on function public.admin_promote_user(uuid,text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}',false);
select 'after-a4-promote-admin' as step, public.admin_promote_user('979e7949-794f-4386-b2a4-dc207d4fb0d0','admin') as outcome;
select 'after-a4-role' as step, role from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';
rollback;

-- A5. Positive control: super_admin A promotes B to 'super_admin' -> succeeds
--     (top of allowlist; only super_admin may grant super_admin).
begin;
grant execute on function public.admin_promote_user(uuid,text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}',false);
select 'after-a5-promote-super' as step, public.admin_promote_user('979e7949-794f-4386-b2a4-dc207d4fb0d0','super_admin') as outcome;
select 'after-a5-role' as step, role from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';
rollback;

-- A6. Regression: role tools + policy snapshot unchanged by the RPC rewrite.
select public.app_role(), public.is_admin(), public.is_research_role(), public.has_super_admin();

-- A7. Cleanup check: grant side-effects rolled back everywhere above;
--     verify no leftover grants after the probes.
select p.proname, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_promote_user', 'bootstrap_super_admin');
