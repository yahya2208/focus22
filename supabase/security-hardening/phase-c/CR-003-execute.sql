-- ============================================================================
-- CR-003 — C1 SECURITY DEFINER hardening: search_path + EXECUTE hygiene
--
-- Fixes (from C1 audit evidence):
--   F1/F2/F3: add explicit search_path to the 3 SECURITY DEFINER functions that
--             lacked it (handle_new_user · has_super_admin · increment_qr_counter)
--   F4:       revoke EXECUTE on handle_new_user from PUBLIC/anon/authenticated
--             (trigger-only function; the trigger bypasses EXECUTE checks, so the
--              auth.users trigger keeps working).
--
-- Compliance: docs/security/operations/change-management.md
--   * SQL preview (this file) · approval recorded in CR-003 · DDL, no data rows
--   * before/after captured in ONE evidence grid · rollback in CR-003 doc
-- Idempotent: SET search_path and REVOKE are safe to re-run.
--
-- Roles: run in Supabase SQL Editor as OWNER.
-- ============================================================================

drop table if exists pg_temp.cr003_evidence;
create temp table cr003_evidence (seq int, change_id text, metric text, value text);

-- ---------------------------------------------------------------------------
-- F1/F2/F3 — search_path (before)
-- ---------------------------------------------------------------------------
insert into cr003_evidence
select 1, 'CR-003', 'before_search_path_handle_new_user',
       coalesce(p.proconfig::text, '(default)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'handle_new_user';

insert into cr003_evidence
select 2, 'CR-003', 'before_search_path_has_super_admin',
       coalesce(p.proconfig::text, '(default)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'has_super_admin';

insert into cr003_evidence
select 3, 'CR-003', 'before_search_path_increment_qr_counter',
       coalesce(p.proconfig::text, '(default)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'increment_qr_counter';

-- F1/F2/F3 — apply
alter function public.handle_new_user() set search_path = public;
alter function public.has_super_admin() set search_path = public;
alter function public.increment_qr_counter(uuid, text) set search_path = public;

-- F1/F2/F3 — search_path (after)
insert into cr003_evidence
select 4, 'CR-003', 'after_search_path_handle_new_user',
       coalesce(p.proconfig::text, '(default)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'handle_new_user';

insert into cr003_evidence
select 5, 'CR-003', 'after_search_path_has_super_admin',
       coalesce(p.proconfig::text, '(default)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'has_super_admin';

insert into cr003_evidence
select 6, 'CR-003', 'after_search_path_increment_qr_counter',
       coalesce(p.proconfig::text, '(default)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'increment_qr_counter';

-- ---------------------------------------------------------------------------
-- F4 — handle_new_user EXECUTE (before)
-- ---------------------------------------------------------------------------
insert into cr003_evidence
select 10, 'CR-003', 'before_execute_handle_new_user',
       'public=' || has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE')::text ||
       ' anon=' || has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')::text ||
       ' auth=' || has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')::text;

-- F4 — apply
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- F4 — EXECUTE (after)
insert into cr003_evidence
select 11, 'CR-003', 'after_execute_handle_new_user',
       'public=' || has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE')::text ||
       ' anon=' || has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')::text ||
       ' auth=' || has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')::text;

-- ---------------------------------------------------------------------------
-- Integrity: the auth.users trigger on handle_new_user must still exist
-- (proves REVOKE did not break the signup flow)
-- ---------------------------------------------------------------------------
insert into cr003_evidence
select 12, 'CR-003', 'trigger_handle_new_user',
       coalesce((select string_agg(tgname || ' on ' || tgrelid::regclass::text, '; ')
                 from pg_trigger t
                 where t.tgfoid = 'public.handle_new_user()'::regprocedure), 'NOT FOUND');

-- ---------------------------------------------------------------------------
-- Final verdict
-- ---------------------------------------------------------------------------
insert into cr003_evidence
select 20, 'CR-003', 'final_verdict',
       case
         when not exists (
              select 1
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where p.prosecdef
                and n.nspname = 'public'
                and p.proname in ('handle_new_user', 'has_super_admin', 'increment_qr_counter')
                and (p.proconfig is null or not (p.proconfig @> array['search_path=public']))
         )
         and not has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE')
         and not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
         and not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
         and exists (select 1 from pg_trigger t where t.tgfoid = 'public.handle_new_user()'::regprocedure)
         then 'PASS — 3 search_paths explicit; handle_new_user EXECUTE revoked; trigger intact'
         else 'FAIL — inspect rows'
       end;

-- THE REPORT (single grid = documented evidence)
select seq, change_id, metric, value
from pg_temp.cr003_evidence
order by seq;

drop table if exists pg_temp.cr003_evidence;
