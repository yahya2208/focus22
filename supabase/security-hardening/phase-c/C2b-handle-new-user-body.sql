-- ============================================================================
-- Phase C · C2b — handle_new_user FULL BODY REVIEW (READ-ONLY · SINGLE RESULT)
--
-- Purpose: capture the COMPLETE current definition of public.handle_new_user()
-- plus its live posture, so a manual security review of the body can decide
-- whether any CR is needed — WITHOUT assuming the unqualified-write flags
-- from C2.4 are real (they were regex hits: "DO UPDATE SET" and
-- "insert into public.users").
--
-- Checks delivered in one result row:
--   * config      — proconfig (search_path) / owner / SECURITY DEFINER flag
--   * acl_execute — EXECUTE for public / anon / authenticated (CR-003 target: false)
--   * trigger     — every trigger bound to this function (must stay intact)
--   * full_definition — pg_get_functiondef() verbatim for manual review
--
-- Guarantees: SELECT / catalog reads ONLY · no temp tables · no DDL/GRANT ·
-- no transaction · session unchanged after run.
-- ============================================================================

with
cfg as (
  select p.prosecdef::text as secdef,
         pg_get_userbyid(p.proowner) as owner,
         coalesce(p.proconfig::text, '(default)') as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_new_user'
),
acl as (
  select has_function_privilege('public',        'public.handle_new_user()', 'EXECUTE')::text as pub,
         has_function_privilege('anon',          'public.handle_new_user()', 'EXECUTE')::text as anon,
         has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')::text as auth
),
trg as (
  select n.nspname || '.' || c.relname || '.' || t.tgname as trigger_name,
         t.tgenabled::text as enabled,
         (case when (t.tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end) || ' ' ||
         case when (t.tgtype & 4) <> 0 then 'INSERT'
              when (t.tgtype & 8) <> 0 then 'DELETE'
              when (t.tgtype & 16) <> 0 then 'UPDATE'
              when (t.tgtype & 64) <> 0 then 'TRUNCATE'
         end || ' ' ||
         case when (t.tgtype & 1) = 1 then 'ROW' else 'STATEMENT' end as event
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where t.tgfoid = 'public.handle_new_user()'::regprocedure
    and not t.tgisinternal
),
def as (
  select pg_get_functiondef('public.handle_new_user()'::regprocedure) as body
)
select jsonb_pretty(jsonb_build_object(
         'config',          (select to_jsonb(cfg) from cfg),
         'acl_execute',     (select to_jsonb(acl) from acl),
         'triggers',        (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from trg t),
         'full_definition', (select body from def)
       )) as audit_result;
