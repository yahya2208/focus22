-- ============================================================================
-- Phase C · C1 — SECURITY DEFINER Audit (READ-ONLY · SINGLE RESULT SET)
--
-- ONE statement, ONE result row. Every sub-check (C1.0 → C1.8) is a CTE merged
-- into a single final SELECT that returns ONE row / ONE column: a pretty JSON
-- array of all findings tagged per check (project-wide standard — the Supabase
-- SQL Editor shows only the last result set, so audits MUST return one result).
--
-- Returned columns: audit_result (jsonb)
--
-- Objective:
--   0. Count of functions by security kind per schema.
--   1. Full catalog: every function — schema, args, security, owner, language,
--      volatility, acl, config(search_path), body.
--   2. SECURITY DEFINER functions WITHOUT explicit search_path (hijack risk).
--   3. SECURITY DEFINER functions not owned by postgres.
--   4. Dynamic SQL (plpgsql EXECUTE / format(..)) inside SECURITY DEFINER fns.
--   5. SECURITY DEFINER functions with EXECUTE grantable to anon/authenticated.
--   6. Which SECURITY DEFINER functions call the auth helpers
--      (is_admin / app_role / has_super_admin / auth.uid()).
--   7. Client-reachable surface: public RPCs callable by anon/authenticated.
--   8. ADR-accepted exceptions must be present AND explicit in search_path.
--
-- Guarantees (post-incident lesson): SELECT / catalog reads ONLY · no
-- set_config · no set role · no temp tables · no DDL/GRANT · no transaction ·
-- session unchanged after run.
--
-- Run in Supabase SQL Editor (any role with read access is fine; owner shows all).
-- ============================================================================

with
-- ---------------------------------------------------------------------------
c1_0 as (  -- OVERVIEW — functions by security kind (non-system schemas)
  select n.nspname as metric,
         'security_definer=' || count(*) filter (where p.prosecdef) ||
         ' security_invoker=' || count(*) filter (where not p.prosecdef) as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prokind in ('f', 'p')
  group by n.nspname
),
-- ---------------------------------------------------------------------------
c1_1 as (  -- FULL CATALOG — every function with its security posture + body
  select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as metric,
         'security=' || case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end ||
         ' owner=' || pg_get_userbyid(p.proowner) ||
         ' language=' || l.lanname ||
         ' volatility=' || p.provolatile::text ||
         ' acl=' || coalesce(p.proacl::text, '(default)') ||
         ' config=' || coalesce(p.proconfig::text, '(default)') ||
         ' body=' || p.prosrc as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prokind in ('f', 'p')
),
-- ---------------------------------------------------------------------------
c1_2 as (  -- SEARCH_PATH — SECURITY DEFINER fns WITHOUT explicit search_path
  select n.nspname || '.' || p.proname as metric,
         'owner=' || pg_get_userbyid(p.proowner) ||
         ' config=' || coalesce(p.proconfig::text, '(none)') ||
         case
           when p.proconfig is null then ' — DEFAULT — RISK: no explicit search_path'
           when not exists (select 1 from unnest(p.proconfig) u where u like 'search_path=%') then ' — NO search_path entry — RISK'
           else ' — explicit search_path'
         end as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
),
-- ---------------------------------------------------------------------------
c1_3 as (  -- OWNERS — SECURITY DEFINER fns not owned by postgres
  select n.nspname || '.' || p.proname as metric,
         'owner=' || pg_get_userbyid(p.proowner) ||
         ' config=' || coalesce(p.proconfig::text, '(none)') as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
    and pg_get_userbyid(p.proowner) <> 'postgres'
),
-- ---------------------------------------------------------------------------
c1_4 as (  -- DYNAMIC SQL — inside SECURITY DEFINER fns (injection surface)
  select n.nspname || '.' || p.proname as metric,
         'has_dynamic_sql=' || (p.prosrc ~* '\mexecute\M')::text ||
         ' uses_format=' || (p.prosrc ~* '\mformat\s*\(')::text ||
         ' language=' || l.lanname as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
),
-- ---------------------------------------------------------------------------
c1_5 as (  -- EXECUTE EXPOSURE — DEFINER fns grantable to anon/authenticated/PUBLIC
  select n.nspname || '.' || p.proname as metric,
         'owner=' || pg_get_userbyid(p.proowner) ||
         ' acl=' || coalesce(p.proacl::text, '(default)') ||
         ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text ||
         ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text ||
         ' public=' || has_function_privilege('public', p.oid, 'EXECUTE')::text as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
),
-- ---------------------------------------------------------------------------
c1_6 as (  -- INTERNAL HELPER CALLS — which DEFINER fns call the auth helpers
  select n.nspname || '.' || p.proname as metric,
         'calls_is_admin='         || (p.prosrc ~* 'is_admin\s*\(')::text ||
         ' calls_app_role='        || (p.prosrc ~* 'app_role\s*\(')::text ||
         ' calls_has_super_admin=' || (p.prosrc ~* 'has_super_admin\s*\(')::text ||
         ' reads_auth_uid='        || (p.prosrc ~* 'auth\.uid\s*\(')::text as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
),
-- ---------------------------------------------------------------------------
c1_7 as (  -- CLIENT-REACHABLE SURFACE — public RPCs callable by anon/authenticated
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as metric,
         'security=' || case p.prosecdef when true then 'SECURITY DEFINER' else 'SECURITY INVOKER' end ||
         ' anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')::text ||
         ' authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
),
-- ---------------------------------------------------------------------------
c1_8 as (  -- DOCUMENTED EXCEPTIONS — ADR-accepted DEFINER fns must be explicit
  select p.proname as metric,
         'schema=' || n.nspname ||
         ' secdef=' || p.prosecdef::text ||
         ' config=' || coalesce(p.proconfig::text, '(none)') ||
         case
           when p.proconfig is null then ' — DEFAULT — RISK'
           when not exists (select 1 from unnest(p.proconfig) u where u like 'search_path=%') then ' — NO search_path — RISK'
           else ' — explicit search_path'
         end as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname in ('handle_new_user', 'has_super_admin', 'increment_qr_counter')
         or p.proname like 'lookup\_%')
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
  select 'C1.0' as chk, metric, detail from c1_0
  union all select 'C1.0', 'NONE — no non-system functions', '' where not exists (select 1 from c1_0)

  union all select 'C1.1', metric, detail from c1_1
  union all select 'C1.1', 'NONE — no non-system functions', '' where not exists (select 1 from c1_1)

  union all select 'C1.2', metric, detail from c1_2
  union all select 'C1.2', 'PASS — every SECURITY DEFINER fn has explicit search_path', '' where not exists (select 1 from c1_2)

  union all select 'C1.3', metric, detail from c1_3
  union all select 'C1.3', 'PASS — no SECURITY DEFINER fn owned by non-postgres', '' where not exists (select 1 from c1_3)

  union all select 'C1.4', metric, detail from c1_4
  union all select 'C1.4', 'NONE — no SECURITY DEFINER functions', '' where not exists (select 1 from c1_4)

  union all select 'C1.5', metric, detail from c1_5
  union all select 'C1.5', 'NONE — no SECURITY DEFINER functions', '' where not exists (select 1 from c1_5)

  union all select 'C1.6', metric, detail from c1_6
  union all select 'C1.6', 'NONE — no SECURITY DEFINER functions', '' where not exists (select 1 from c1_6)

  union all select 'C1.7', metric, detail from c1_7
  union all select 'C1.7', 'NONE — no client-reachable public RPCs', '' where not exists (select 1 from c1_7)

  union all select 'C1.8', metric, detail from c1_8
  union all select 'C1.8', 'NONE — no ADR exception functions found', '' where not exists (select 1 from c1_8)
) all_rows;
