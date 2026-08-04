-- ============================================================================
-- Phase 2 · Task 2.1.6 — Baseline Verification (re-run E1–E10 after Phase 2)
--
-- Purpose: prove no regression in the frozen Baseline v4.0 matrix after the
-- Phase 2.1 authorization-layer changes (2.1.1–2.1.5), plus re-confirm the
-- ADR-001 acceptance contract (A1–A8 / no new exception beyond A4-x).
--
-- Reference: docs/security/production-security-audit.md §III.1.8 (E1–E10)
-- Execution: SQL Editor (owner role). Every mutation is either rolled back or
-- cleaned up immediately, so this probe is zero-impact on Production.
--
-- NOTE: This variant emits ALL evidence into a SINGLE result table (Results
-- grid) instead of NOTICEs, because the current Supabase editor does not show
-- a Messages tab. The last (and only) SELECT at the bottom is the summary.
--
-- Identifiers:
--   A = a549a010-3315-4391-b90b-5c41ea3f6fe6  (super_admin)
--   B = 979e7949-794f-4386-b2a4-dc207d4fb0d0  (user)
--
-- Emulation recipe:
--   set role authenticated;  -- RLS applies
--   select set_config('request.jwt.claims',
--     '{"sub":"<uuid>","role":"authenticated"}', false);
--   set role anon;           -- for anon contexts
-- ============================================================================

drop table if exists tmp_probe;
create temp table tmp_probe (seq int, step text, outcome text);
grant select, insert on tmp_probe to anon, authenticated;

-- ----------------------------------------------------------------------------
-- A. Baseline inventory checks (same as Phase 1 closure — must hold post-2.1.x)
-- ----------------------------------------------------------------------------

-- A-policies: no broad patterns; ownership + role-gate + bootstrap intact.
insert into tmp_probe
select 1, 'A-policies',
  format('total=%s admin_named=%s',
    count(*),
    count(*) filter (where policyname ilike '%admin%'))
from pg_policies where schemaname = 'public';

-- A-functions: admin RPCs revoked (explicit proacl, no PUBLIC/anon EXECUTE).
insert into tmp_probe
select 2, 'A-functions-proacl',
  coalesce((
    select string_agg(p.proname || '=' || coalesce(p.proacl::text, '(null)'),
                      '  ;  ' order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_promote_user','bootstrap_super_admin')),
    '(none found)');

-- A-rls: every core table has RLS on.
insert into tmp_probe
select 3, 'A-rls-on',
  coalesce((
    select string_agg(c.relname || '=' || c.relrowsecurity::text, ' ' order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in ('users','sessions','campaigns','analytics_events',
                        'devices','calibrations','surveys','qr_codes')),
    '(none found)');

-- ----------------------------------------------------------------------------
-- B. Phase 2 regression: role tools + policy replacement count (2.1.1/2.1.2)
-- ----------------------------------------------------------------------------

-- B-tools: app_role()/is_admin() behave under A's claims.
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
do $$
declare v_app text; v_admin boolean; v_research boolean; v_super boolean;
begin
  v_app := public.app_role();
  v_admin := public.is_admin();
  v_research := public.is_research_role();
  v_super := public.has_super_admin();
  insert into tmp_probe values
    (4, 'B-tools',
     format('app_role=%s is_admin=%s is_research_role=%s has_super_admin=%s',
            v_app, v_admin, v_research, v_super));
end $$;
reset role;

-- B-replace: the 3 admin policies route through is_admin() and no ad-hoc
-- EXISTS role IN pattern remains in any live policy.
insert into tmp_probe
select 5, 'B-replace',
  format('admin_policies=%s admin_on_is_admin=%s exists_pattern_count=%s',
    count(*) filter (where policyname ilike '%admin%'),
    count(*) filter (where policyname ilike '%admin%' and qual::text ilike '%is_admin%'),
    count(*) filter (where qual::text like '%ARRAY[''admin''::text, ''super_admin''::text]%'
                      or with_check::text like '%ARRAY[''admin''::text, ''super_admin''::text]%'))
from pg_policies where schemaname = 'public';

-- ----------------------------------------------------------------------------
-- E1–E10 matrix (zero-impact: each step restores role + cleans up)
-- ----------------------------------------------------------------------------

-- E1. anon -> admin_promote_user : 42501 even when EXECUTE granted (2.1.3 guard).
grant execute on function public.admin_promote_user(uuid,text) to anon;
set role anon;
do $$
begin
  begin
    perform public.admin_promote_user('979e7949-794f-4386-b2a4-dc207d4fb0d0','admin');
    insert into tmp_probe values (10, 'E1', 'UNEXPECTED_SUCCESS');
  exception when sqlstate '42501' then
    insert into tmp_probe values (10, 'E1', '42501 Forbidden (expected)');
    when others then
    insert into tmp_probe values (10, 'E1', 'unexpected ' || sqlerrm);
  end;
end $$;
reset role;
revoke execute on function public.admin_promote_user(uuid,text) from anon;

-- E2. anon -> bootstrap_super_admin : 42501 even when EXECUTE granted.
grant execute on function public.bootstrap_super_admin(uuid) to anon;
set role anon;
do $$
begin
  begin
    perform public.bootstrap_super_admin('979e7949-794f-4386-b2a4-dc207d4fb0d0');
    insert into tmp_probe values (11, 'E2', 'UNEXPECTED_SUCCESS');
  exception when sqlstate '42501' then
    insert into tmp_probe values (11, 'E2', '42501 Forbidden (expected)');
    when others then
    insert into tmp_probe values (11, 'E2', 'unexpected ' || sqlerrm);
  end;
end $$;
reset role;
revoke execute on function public.bootstrap_super_admin(uuid) from anon;

-- E3. anon -> has_super_admin : true (documented exception — bootstrap policy).
set role anon;
do $$
declare v boolean;
begin
  v := public.has_super_admin();
  insert into tmp_probe values (12, 'E3', 'anon->has_super_admin = ' || v::text || ' (expected true)');
end $$;
reset role;

-- E4. A(super_admin) reads B's row : 1 (allowed by design — 'Researchers read all users').
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
do $$
declare n int;
begin
  select count(*) into n from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';
  insert into tmp_probe values (13, 'E4', 'A reads B row count = ' || n::text || ' (expected 1)');
end $$;
reset role;

-- E4b. B(user) reads A's row : 0 (ownership isolation for non-privileged).
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"979e7949-794f-4386-b2a4-dc207d4fb0d0","role":"authenticated"}', false);
do $$
declare n int;
begin
  select count(*) into n from public.users where id = 'a549a010-3315-4391-b90b-5c41ea3f6fe6';
  insert into tmp_probe values (14, 'E4b', 'B reads A row count = ' || n::text || ' (expected 0)');
end $$;
reset role;

-- E5. anon -> read users : 0.
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.users;
  insert into tmp_probe values (15, 'E5', 'anon reads users count = ' || n::text || ' (expected 0)');
end $$;
reset role;

-- E6. A inserts a session with user_id=B : 42501 (LV-10 ownership).
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
do $$
begin
  begin
    insert into public.sessions (user_id) values ('979e7949-794f-4386-b2a4-dc207d4fb0d0');
    insert into tmp_probe values (16, 'E6', 'UNEXPECTED_SUCCESS');
  exception when sqlstate '42501' then
    insert into tmp_probe values (16, 'E6', '42501 new row violates RLS (expected)');
    when others then
    insert into tmp_probe values (16, 'E6', 'unexpected ' || sqlerrm);
  end;
end $$;
reset role;

-- E7. anon -> UPDATE qr_codes.scan_count : 0 rows (LV-11).
set role anon;
do $$
declare n int;
begin
  update public.qr_codes set scan_count = 999999999;
  get diagnostics n = row_count;
  insert into tmp_probe values (17, 'E7', 'anon update qr_codes rows = ' || n::text || ' (expected 0)');
end $$;
reset role;

-- E8. anon -> INSERT analytics_events : 42501 + 0 saved (LV-5).
set role anon;
do $$
begin
  begin
    insert into public.analytics_events (event_type) values ('baseline_reverify');
    insert into tmp_probe values (18, 'E8', 'UNEXPECTED_SUCCESS');
  exception when sqlstate '42501' then
    insert into tmp_probe values (18, 'E8', '42501 new row violates RLS (expected)');
    when others then
    insert into tmp_probe values (18, 'E8', 'unexpected ' || sqlerrm);
  end;
end $$;
reset role;

-- E9. authenticated owner -> INSERT analytics_events : allowed, then cleaned up.
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
do $$
declare n int;
begin
  insert into public.analytics_events (user_id, event_type)
  values ('a549a010-3315-4391-b90b-5c41ea3f6fe6','baseline_reverify_owner');
  select count(*) into n
  from public.analytics_events
  where user_id = 'a549a010-3315-4391-b90b-5c41ea3f6fe6'
    and event_type = 'baseline_reverify_owner';
  insert into tmp_probe values (19, 'E9', 'owner insert analytics visible rows = ' || n::text || ' (expected 1)');
  delete from public.analytics_events
  where user_id = 'a549a010-3315-4391-b90b-5c41ea3f6fe6'
    and event_type = 'baseline_reverify_owner';
end $$;
reset role;

-- E10. authenticated cross-user -> INSERT analytics_events : 42501 (LV-5).
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a549a010-3315-4391-b90b-5c41ea3f6fe6","role":"authenticated"}', false);
do $$
begin
  begin
    insert into public.analytics_events (user_id, event_type)
    values ('979e7949-794f-4386-b2a4-dc207d4fb0d0','baseline_reverify_cross');
    insert into tmp_probe values (20, 'E10', 'UNEXPECTED_SUCCESS');
  exception when sqlstate '42501' then
    insert into tmp_probe values (20, 'E10', '42501 new row violates RLS (expected)');
    when others then
    insert into tmp_probe values (20, 'E10', 'unexpected ' || sqlerrm);
  end;
end $$;
reset role;

-- ----------------------------------------------------------------------------
-- C. Cleanup / hygiene check
-- ----------------------------------------------------------------------------
-- No leftover test rows and no leaked grants (all above rolled back / revoked).
insert into tmp_probe
select 30, 'C-leftover-analytics',
  'rows = ' || count(*)::text || ' (expected 0)'
from public.analytics_events where event_type like 'baseline_reverify%';

-- ----------------------------------------------------------------------------
-- SINGLE RESULT — all evidence in one Results grid.
-- ----------------------------------------------------------------------------
select seq, step, outcome from tmp_probe order by seq;
