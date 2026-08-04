-- ============================================================================
-- CR-001 + CR-002 — EXECUTION & SINGLE EVIDENCE REPORT
--
-- Produces ONE result grid (a SELECT from a temp evidence table) containing ALL
-- Change Management evidence for BOTH CRs in a single readable report:
--   expected_rows · before_state · rows_affected (GET DIAGNOSTICS) ·
--   after_state · verification · final_verdict
--
-- Idempotent & guarded: mutations are exact-targeted; if a change was already
-- applied they become no-ops (rows_affected = 0) and the verdict still PASSes
-- when the final state is correct. Both outcomes are acceptable per approval.
--
-- Guarantees (post-incident lesson):
--   * targeted mutations only (exact keys + guards), owner bypasses RLS
--   * NO set_config / NO set role / NO DDL on user objects
--   * temp table used ONLY to accumulate the report grid, dropped at the end
--
-- Roles: run in Supabase SQL Editor as OWNER — select ALL statements, run once,
-- copy the single "cr_evidence" grid. That grid IS the documented evidence.
--
-- B = 979e7949-794f-4386-b2a4-dc207d4fb0d0
-- ============================================================================

drop table if exists pg_temp.cr_evidence;
create temp table cr_evidence (seq int, change_id text, metric text, value text);

-- ============================================================================
-- [CR-001] users.role(B)  'admin' -> 'user'  (incident D1)
-- ============================================================================

-- expected rows (same WHERE as the mutation; must be 0 or 1)
insert into cr_evidence
select 1, 'CR-001', 'expected_rows',
       count(*)::text
from public.users
where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'
  and role = 'admin';

-- before state
insert into cr_evidence
select 2, 'CR-001', 'before_state',
       coalesce((select 'role=' || role from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'), 'ROW NOT FOUND');

-- targeted update + ACTUAL rows affected
do $$
declare v_affected integer;
begin
  update public.users
     set role = 'user'
   where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'
     and role = 'admin';
  get diagnostics v_affected = row_count;
  insert into cr_evidence values (3, 'CR-001', 'rows_affected', v_affected::text);
end $$;

-- after state
insert into cr_evidence
select 4, 'CR-001', 'after_state',
       coalesce((select 'role=' || role from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'), 'ROW NOT FOUND');

-- verification (post)
insert into cr_evidence
select 5, 'CR-001', 'verification',
       'rows id=B AND role=user = ' || count(*)::text
from public.users
where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'
  and role = 'user';

-- verdict
insert into cr_evidence
select 6, 'CR-001', 'final_verdict',
       case
         when exists (select 1 from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0' and role = 'user')
          and not exists (select 1 from public.users where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0' and role = 'admin')
         then 'PASS — B is user, no admin residue for B'
         else 'FAIL — inspect rows'
       end;

-- ============================================================================
-- [CR-002] analytics_events residue  'baseline_reverify%' -> deleted  (D3)
-- ============================================================================

-- expected rows (same WHERE as the mutation)
insert into cr_evidence
select 11, 'CR-002', 'expected_rows',
       count(*)::text
from public.analytics_events
where event_type like 'baseline_reverify%';

-- before state
insert into cr_evidence
select 12, 'CR-002', 'before_state',
       (select 'count=' || count(*)::text || ', types=' ||
               coalesce(string_agg(distinct event_type, ','), '(none)')
        from public.analytics_events
        where event_type like 'baseline_reverify%');

-- targeted delete + ACTUAL rows affected
do $$
declare v_affected integer;
begin
  delete from public.analytics_events
   where event_type like 'baseline_reverify%';
  get diagnostics v_affected = row_count;
  insert into cr_evidence values (13, 'CR-002', 'rows_affected', v_affected::text);
end $$;

-- after state
insert into cr_evidence
select 14, 'CR-002', 'after_state',
       (select 'count=' || count(*)::text
        from public.analytics_events
        where event_type like 'baseline_reverify%');

-- verification (post)
insert into cr_evidence
select 15, 'CR-002', 'verification',
       'remaining baseline_reverify% = ' || count(*)::text
from public.analytics_events
where event_type like 'baseline_reverify%';

-- verdict
insert into cr_evidence
select 16, 'CR-002', 'final_verdict',
       case
         when not exists (select 1 from public.analytics_events where event_type like 'baseline_reverify%')
         then 'PASS — zero residue'
         else 'FAIL — residue remains'
       end;

-- ============================================================================
-- SUMMARY
-- ============================================================================
insert into cr_evidence
select 30, 'SUMMARY', 'all_changes',
       case
         when not exists (select 1 from pg_temp.cr_evidence e where e.metric = 'final_verdict' and e.value like 'FAIL%')
         then 'BOTH PASS — CR-001 and CR-002 closed-ready'
         else 'CHECK FAILURES ABOVE'
       end;

-- ============================================================================
-- THE REPORT (single grid = the documented evidence)
-- ============================================================================
select seq, change_id, metric, value
from pg_temp.cr_evidence
order by seq;

drop table if exists pg_temp.cr_evidence;
