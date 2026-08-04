-- ============================================================================
-- Phase C · C3 — Privilege Audit (READ-ONLY · SINGLE RESULT SET)
--
-- ONE statement, ONE result row. Every sub-check (C3.1 → C3.8) is a CTE merged
-- into a single final SELECT returning ONE row / ONE column: a pretty JSON
-- array of all findings tagged per check (project-wide standard).
--
-- Returned columns: audit_result (jsonb)
--
-- Objective:
--   1. Roles overview: superuser / login / bypassrls / membership (C3.1).
--   2. Schema privileges: USAGE / CREATE for anon & authenticated (C3.2).
--   3. Table privileges: anon / authenticated access to non-system tables (C3.3).
--   4. Function EXECUTE: client-reachable functions in public (C3.4).
--   5. Sequence privileges: nextval exposure to anon / authenticated (C3.5).
--   6. View privileges: client-readable views (C3.6).
--   7. Extensions: installed, superuser-required, trusted, owner schema (C3.7).
--   8. RLS posture: per public table — rls enabled / force / owner (C3.8).
--   9. RLS policies: per policy — command, permissive, target roles,
--      USING / WITH CHECK expressions (C3.9).
--
-- Guarantees (post-incident lesson): SELECT / catalog reads ONLY · no
-- set_config · no set role · no temp tables · no DDL/GRANT · no transaction ·
-- session unchanged after run.
--
-- Run in Supabase SQL Editor (any role with read access is fine; owner shows all).
-- ============================================================================

with
-- ---------------------------------------------------------------------------
c3_1 as (  -- ROLES OVERVIEW
  select r.rolname as metric,
         'superuser=' || r.rolsuper::text ||
         ' login=' || r.rolcanlogin::text ||
         ' bypassrls=' || r.rolbypassrls::text ||
         ' member_of=' || coalesce(
             (select string_agg(m.rolname, ', ' order by m.rolname)
              from pg_auth_members a
              join pg_roles m on m.oid = a.roleid
              where a.member = r.oid), '-') as detail
  from pg_roles r
  where r.rolname not like 'pg\_%'
  order by r.rolname
),
-- ---------------------------------------------------------------------------
c3_2 as (  -- SCHEMA PRIVILEGES for anon & authenticated
  select n.nspname as metric,
         'anon_usage='  || has_schema_privilege('anon', n.oid, 'USAGE')::text ||
         ' anon_create=' || has_schema_privilege('anon', n.oid, 'CREATE')::text ||
         ' auth_usage='  || has_schema_privilege('authenticated', n.oid, 'USAGE')::text ||
         ' auth_create=' || has_schema_privilege('authenticated', n.oid, 'CREATE')::text as detail
  from pg_namespace n
  where n.nspname not in ('pg_catalog', 'information_schema')
    and n.nspname not like 'pg\_%'
  order by n.nspname
),
-- ---------------------------------------------------------------------------
c3_3 as (  -- TABLE PRIVILEGES — anon / authenticated on non-system tables
  select n.nspname || '.' || c.relname as metric,
         'rls=' || c.relrowsecurity::text ||
         ' anon_select='  || has_table_privilege('anon', c.oid, 'SELECT')::text ||
         ' anon_insert='  || has_table_privilege('anon', c.oid, 'INSERT')::text ||
         ' anon_update='  || has_table_privilege('anon', c.oid, 'UPDATE')::text ||
         ' anon_delete='  || has_table_privilege('anon', c.oid, 'DELETE')::text ||
         ' auth_select='  || has_table_privilege('authenticated', c.oid, 'SELECT')::text ||
         ' auth_insert='  || has_table_privilege('authenticated', c.oid, 'INSERT')::text ||
         ' auth_update='  || has_table_privilege('authenticated', c.oid, 'UPDATE')::text ||
         ' auth_delete='  || has_table_privilege('authenticated', c.oid, 'DELETE')::text as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname not in ('pg_catalog', 'information_schema')
    and (has_table_privilege('anon', c.oid, 'SELECT')
         or has_table_privilege('anon', c.oid, 'INSERT')
         or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE')
         or has_table_privilege('authenticated', c.oid, 'SELECT')
         or has_table_privilege('authenticated', c.oid, 'INSERT')
         or has_table_privilege('authenticated', c.oid, 'UPDATE')
         or has_table_privilege('authenticated', c.oid, 'DELETE'))
  order by n.nspname, c.relname
),
-- ---------------------------------------------------------------------------
c3_4 as (  -- FUNCTION EXECUTE — client-reachable functions in public
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as metric,
         'security=' || case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end ||
         ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text ||
         ' auth=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text ||
         ' public=' || has_function_privilege('public', p.oid, 'EXECUTE')::text as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  order by p.proname
),
-- ---------------------------------------------------------------------------
c3_5 as (  -- SEQUENCE PRIVILEGES — nextval exposure
  select n.nspname || '.' || c.relname as metric,
         'anon_usage='  || has_sequence_privilege('anon', c.oid, 'USAGE')::text ||
         ' anon_select=' || has_sequence_privilege('anon', c.oid, 'SELECT')::text ||
         ' anon_update=' || has_sequence_privilege('anon', c.oid, 'UPDATE')::text ||
         ' auth_usage='  || has_sequence_privilege('authenticated', c.oid, 'USAGE')::text ||
         ' auth_select=' || has_sequence_privilege('authenticated', c.oid, 'SELECT')::text ||
         ' auth_update=' || has_sequence_privilege('authenticated', c.oid, 'UPDATE')::text as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'S'
    and n.nspname not in ('pg_catalog', 'information_schema')
    and (has_sequence_privilege('anon', c.oid, 'USAGE')
         or has_sequence_privilege('anon', c.oid, 'SELECT')
         or has_sequence_privilege('anon', c.oid, 'UPDATE')
         or has_sequence_privilege('authenticated', c.oid, 'USAGE')
         or has_sequence_privilege('authenticated', c.oid, 'SELECT')
         or has_sequence_privilege('authenticated', c.oid, 'UPDATE'))
  order by n.nspname, c.relname
),
-- ---------------------------------------------------------------------------
c3_6 as (  -- VIEW PRIVILEGES — client-readable views
  select n.nspname || '.' || c.relname as metric,
         'anon_select=' || has_table_privilege('anon', c.oid, 'SELECT')::text ||
         ' auth_select=' || has_table_privilege('authenticated', c.oid, 'SELECT')::text ||
         ' public_select=' || has_table_privilege('public', c.oid, 'SELECT')::text as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'v'
    and n.nspname not in ('pg_catalog', 'information_schema')
    and (has_table_privilege('anon', c.oid, 'SELECT')
         or has_table_privilege('authenticated', c.oid, 'SELECT'))
  order by n.nspname, c.relname
),
-- ---------------------------------------------------------------------------
c3_7 as (  -- EXTENSIONS (version-portable catalog columns)
  select e.extname as metric,
         'version=' || e.extversion ||
         ' schema=' || n.nspname ||
         ' owner=' || pg_get_userbyid(e.extowner) ||
         ' relocatable=' || e.extrelocatable::text as detail
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  order by e.extname
),
-- ---------------------------------------------------------------------------
c3_8 as (  -- RLS POSTURE — public tables
  select n.nspname || '.' || c.relname as metric,
         'rls=' || c.relrowsecurity::text ||
         ' force=' || c.relforcerowsecurity::text ||
         ' owner=' || pg_get_userbyid(c.relowner) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
  order by c.relname
),
-- ---------------------------------------------------------------------------
c3_9 as (  -- RLS POLICIES — command, permissive, roles, USING / WITH CHECK
  select n.nspname || '.' || c.relname || ' :: ' || pol.polname as metric,
         'command=' ||
         case pol.polcmd when 'r' then 'SELECT'
                         when 'a' then 'INSERT'
                         when 'w' then 'UPDATE'
                         when 'd' then 'DELETE'
                         when '*' then 'ALL'
                         else pol.polcmd::text end ||
         ' permissive=' || pol.polpermissive::text ||
         ' roles=' || coalesce(
             (select string_agg(pg_get_userbyid(r), ', ' order by pg_get_userbyid(r))
              from unnest(pol.polroles) r), '-') ||
         ' using=' || coalesce(pol.polqual::text, '-') ||
         ' with_check=' || coalesce(pol.polwithcheck::text, '-') as detail
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
  order by n.nspname, c.relname, pol.polname
)

-- ============================================================================
-- THE SINGLE RESULT ROW — one row, one column: a JSON array of all findings,
-- tagged per check. Read-only (CTEs only — no temp tables, no DDL).
-- ============================================================================
select jsonb_pretty(
         jsonb_agg(
           jsonb_build_object('chk', chk, 'metric', metric, 'detail', detail)
           order by chk, metric
         )
       ) as audit_result
from (
  select 'C3.1' as chk, metric, detail from c3_1
  union all select 'C3.1', 'NONE — no roles found', '' where not exists (select 1 from c3_1)

  union all select 'C3.2', metric, detail from c3_2
  union all select 'C3.2', 'NONE — no non-system schemas', '' where not exists (select 1 from c3_2)

  union all select 'C3.3', metric, detail from c3_3
  union all select 'C3.3', 'PASS — no client-accessible tables (anon/authenticated)', '' where not exists (select 1 from c3_3)

  union all select 'C3.4', metric, detail from c3_4
  union all select 'C3.4', 'PASS — no client-reachable functions in public', '' where not exists (select 1 from c3_4)

  union all select 'C3.5', metric, detail from c3_5
  union all select 'C3.5', 'PASS — no sequence exposed to anon/authenticated', '' where not exists (select 1 from c3_5)

  union all select 'C3.6', metric, detail from c3_6
  union all select 'C3.6', 'PASS — no view readable by anon/authenticated', '' where not exists (select 1 from c3_6)

  union all select 'C3.7', metric, detail from c3_7
  union all select 'C3.7', 'NONE — no extensions installed', '' where not exists (select 1 from c3_7)

  union all select 'C3.8', metric, detail from c3_8
  union all select 'C3.8', 'NONE — no tables in public schema', '' where not exists (select 1 from c3_8)

  union all select 'C3.9', metric, detail from c3_9
  union all select 'C3.9', 'PASS — no RLS policies (verify with C3.8 which tables have RLS)', '' where not exists (select 1 from c3_9)
) all_rows;
