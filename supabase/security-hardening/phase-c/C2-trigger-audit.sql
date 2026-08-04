-- ============================================================================
-- Phase C · C2 — Trigger Audit (READ-ONLY · SINGLE RESULT SET)
--
-- ONE statement, ONE result row. The Supabase SQL Editor shows only the last
-- result set, so every sub-check below (C2.1 → C2.7.5) is a CTE merged into a
-- single final SELECT that returns ONE row / ONE column: a pretty JSON array
-- of all findings tagged per check. Empty checks emit a "NONE / clean" row so
-- nothing is silently missing.
--
-- Returned columns: audit_result (jsonb)
--
-- Objective:
--   1. Enumerate every live trigger (non-system schemas) with its timing,
--      event, function and target table (C2.1).
--   2. Triggers on sensitive tables: auth.users, users, qr_codes,
--      analytics_events, profiles (C2.2).
--   3. Triggers wired to SECURITY DEFINER functions (owner-privilege side
--      effects fired outside developer control) (C2.3).
--   4. Side-effect signals in trigger bodies: set_config(..., false) —
--      the 2.1.6 lesson — temp writes, unqualified writes (C2.4).
--   5. handle_new_user contract post CR-003: trigger alive, explicit
--      search_path, EXECUTE revoked (C2.5).
--   6. Disabled triggers + extension-owned schemas (C2.6).
--   7. Trigger-Function Dependency Audit (C2.7.1–C2.7.5): orphan refs ·
--      unused trigger fns · multi-trigger fire points · same-fn multi-wiring ·
--      overloaded trigger fns.
--
-- Guarantees (post-incident lesson): SELECT / catalog reads ONLY · no
-- set_config · no set role · no temp tables · no DDL/GRANT · no transaction ·
-- session unchanged after run.
--
-- Run in Supabase SQL Editor (any role with read access is fine; owner shows all).
-- ============================================================================

with
-- ---------------------------------------------------------------------------
c2_1 as (  -- ALL LIVE TRIGGERS
  select n.nspname || '.' || c.relname || '.' || t.tgname as metric,
         (case when (t.tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end) || ' ' ||
         case when (t.tgtype & 4) <> 0 then 'INSERT'
              when (t.tgtype & 8) <> 0 then 'DELETE'
              when (t.tgtype & 16) <> 0 then 'UPDATE'
              when (t.tgtype & 64) <> 0 then 'TRUNCATE'
         end || ' ' ||
         case when (t.tgtype & 1) = 1 then 'ROW' else 'STATEMENT' end ||
         ' -> ' || nf.nspname || '.' || pf.proname || '(' ||
         pg_get_function_identity_arguments(pf.oid) || ')' ||
         case when pf.prosecdef
              then ' [SECURITY DEFINER owner=' || pg_get_userbyid(pf.proowner) || ']'
              else ' [INVOKER]' end ||
          ' search_path=' || coalesce(pf.proconfig::text, '(default)') ||
          ' enabled=' || t.tgenabled::text as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and n.nspname not in ('pg_catalog', 'information_schema')
),
-- ---------------------------------------------------------------------------
c2_2 as (  -- TRIGGERS ON SENSITIVE TABLES
  select n.nspname || '.' || c.relname || '.' || t.tgname as metric,
         (case when (t.tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end) || ' ' ||
         case when (t.tgtype & 4) <> 0 then 'INSERT'
              when (t.tgtype & 8) <> 0 then 'DELETE'
              when (t.tgtype & 16) <> 0 then 'UPDATE'
              when (t.tgtype & 64) <> 0 then 'TRUNCATE'
         end || ' ' ||
         case when (t.tgtype & 1) = 1 then 'ROW' else 'STATEMENT' end ||
         ' -> ' || nf.nspname || '.' || pf.proname || '(' ||
         pg_get_function_identity_arguments(pf.oid) || ')' ||
         case when pf.prosecdef then ' [SECURITY DEFINER]' else ' [INVOKER]' end ||
         ' body: ' || left(pf.prosrc, 80) as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and ( (n.nspname = 'auth' and c.relname = 'users')
       or (n.nspname = 'public' and c.relname in ('users', 'qr_codes', 'analytics_events'))
       or c.relname like '%profile%'
       or c.relname like '%keycloak%' )
),
-- ---------------------------------------------------------------------------
c2_3 as (  -- TRIGGERS ON SECURITY DEFINER FUNCTIONS
  select nf.nspname || '.' || pf.proname as metric,
         'fires on ' || n.nspname || '.' || c.relname || ' (' || t.tgname || ') ' ||
         (case when (t.tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end) || ' ' ||
         case when (t.tgtype & 4) <> 0 then 'INSERT'
              when (t.tgtype & 8) <> 0 then 'DELETE'
              when (t.tgtype & 16) <> 0 then 'UPDATE'
              when (t.tgtype & 64) <> 0 then 'TRUNCATE'
         end || ' ' ||
         case when (t.tgtype & 1) = 1 then 'ROW' else 'STATEMENT' end ||
         ' (owner=' || pg_get_userbyid(pf.proowner) ||
         ' search_path=' || coalesce(pf.proconfig::text, '(default)') || ')' as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and pf.prosecdef
    and n.nspname not in ('pg_catalog', 'information_schema')
),
-- ---------------------------------------------------------------------------
c2_4 as (  -- SIDE-EFFECT SIGNALS in trigger function bodies
  select n.nspname || '.' || p.proname as metric,
         'secdef=' || p.prosecdef::text ||
         ' set_config(_,_,false)=' || (p.prosrc ~* 'set_config\s*\([^,]+,[^,]+,\s*false\s*\)')::text ||
         ' uses_set_config=' || (p.prosrc ~* 'set_config\s*\(')::text ||
         ' pg_temp=' || (p.prosrc ~* 'pg_temp')::text ||
         ' unqualified_update=' || (p.prosrc ~* '(?<![a-z_])update\s+[a-z_][a-z0-9_]*')::text ||
         ' unqualified_insert=' || (p.prosrc ~* '(?<![a-z_])insert\s+into\s+[a-z_][a-z0-9_]*')::text as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.oid in (select distinct t.tgfoid from pg_trigger t where not t.tgisinternal)
),
-- ---------------------------------------------------------------------------
c2_5 as (  -- HANDLE_NEW_USER CONTRACT (post CR-003)
  select 'handle_new_user' as metric,
         'trigger=' || t.tgname || ' on ' || n.nspname || '.' || c.relname ||
         ' enabled=' || t.tgenabled::text ||
         ' secdef=' || pf.prosecdef::text ||
         ' search_path=' || coalesce(pf.proconfig::text, '(default)') ||
         ' EXECUTE public=' || has_function_privilege('public', pf.oid, 'EXECUTE')::text ||
         ' anon='        || has_function_privilege('anon', pf.oid, 'EXECUTE')::text ||
         ' auth='        || has_function_privilege('authenticated', pf.oid, 'EXECUTE')::text ||
         ' body: ' || left(pf.prosrc, 90) as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and pf.proname = 'handle_new_user'
),
-- ---------------------------------------------------------------------------
c2_6 as (  -- DISABLED / EXTENSION-SCHEMA TRIGGERS
  select n.nspname || '.' || c.relname || '.' || t.tgname as metric,
         'enabled=' || t.tgenabled::text || ' fn=' || nf.nspname || '.' || pf.proname ||
         case when n.nspname in ('storage', 'realtime', 'graphql_public')
              then ' (extension-owned schema — document only)' else '' end as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and (t.tgenabled = 'D' or n.nspname in ('storage', 'realtime', 'graphql_public'))
),
-- ---------------------------------------------------------------------------
c2_7_1 as (  -- ORPHANED REFERENCES — trigger pointing to a missing function
  select n.nspname || '.' || c.relname || '.' || t.tgname as metric,
         'ORPHAN — function oid ' || t.tgfoid || ' does not exist in pg_proc' as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname not in ('pg_catalog', 'information_schema')
    and not exists (select 1 from pg_proc p where p.oid = t.tgfoid)
),
-- ---------------------------------------------------------------------------
c2_7_2 as (  -- UNUSED TRIGGER FUNCTIONS — return "trigger", referenced by no trigger
  select n.nspname || '.' || p.proname as metric,
         'args=' || coalesce(pg_get_function_identity_arguments(p.oid), '') ||
         ' owner=' || pg_get_userbyid(p.proowner) ||
         ' secdef=' || p.prosecdef::text ||
         ' signature=' || p.oid::regprocedure::text as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prorettype = 'trigger'::regtype
    and not exists (select 1 from pg_trigger t
                    where not t.tgisinternal and t.tgfoid = p.oid)
),
-- ---------------------------------------------------------------------------
c2_7_3 as (  -- MULTIPLE TRIGGERS ON THE SAME FIRE POINT (double-side-effect risk)
  select n.nspname || '.' || c.relname || ' (' ||
         (case when (t.tgtype & 2) = 2 then 'BEFORE' else 'AFTER' end) || ' ' ||
         case when (t.tgtype & 4) <> 0 then 'INSERT'
              when (t.tgtype & 8) <> 0 then 'DELETE'
              when (t.tgtype & 16) <> 0 then 'UPDATE'
              when (t.tgtype & 64) <> 0 then 'TRUNCATE'
         end || ' ' ||
         case when (t.tgtype & 1) = 1 then 'ROW' else 'STATEMENT' end || ')' as metric,
         'count=' || count(*) ||
         ' triggers: ' || string_agg(nf.nspname || '.' || pf.proname || ' (' || t.tgname || ')', ' ; ' order by t.tgname) as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and n.nspname not in ('pg_catalog', 'information_schema')
  group by n.nspname, c.relname, (t.tgtype & 2), (t.tgtype & 4), (t.tgtype & 8),
           (t.tgtype & 16), (t.tgtype & 64), (t.tgtype & 1)
  having count(*) > 1
),
-- ---------------------------------------------------------------------------
c2_7_4 as (  -- SAME FUNCTION WIRED TO MULTIPLE TRIGGERS ON ONE TABLE
  select n.nspname || '.' || c.relname as metric,
         'wired ' || count(*) || 'x -> ' || nf.nspname || '.' || pf.proname ||
         ' via: ' || string_agg(t.tgname, ' ; ' order by t.tgname) as detail
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc pf on pf.oid = t.tgfoid
  join pg_namespace nf on nf.oid = pf.pronamespace
  where not t.tgisinternal
    and n.nspname not in ('pg_catalog', 'information_schema')
  group by n.nspname, c.relname, nf.nspname, pf.proname
  having count(*) > 1
),
-- ---------------------------------------------------------------------------
c2_7_5 as (  -- OVERLOADED TRIGGER TARGETS — every trigger fn and its signature count
  select n.nspname || '.' || p.proname as metric,
         'signatures=' || count(*) ||
         ' -> ' || string_agg(p.oid::regprocedure::text, ' ; ' order by p.oid::regprocedure::text) as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prorettype = 'trigger'::regtype
  group by n.nspname, p.proname
)

-- ============================================================================
-- THE SINGLE RESULT ROW — one row, one column: a JSON array of all findings,
-- tagged per check. Read-only (CTEs only — no temp tables, no DDL). This is
-- the project-wide standard so no editor can drop any result set.
-- ============================================================================
select jsonb_pretty(
         jsonb_agg(
           jsonb_build_object('chk', chk, 'metric', metric, 'detail', detail)
           order by chk, metric
         )
       ) as audit_result
from (
  select 'C2.1' as chk, metric, detail from c2_1
  union all select 'C2.1', 'NONE — no live triggers found', '' where not exists (select 1 from c2_1)

  union all select 'C2.2', metric, detail from c2_2
  union all select 'C2.2', 'NONE — no sensitive-table triggers', '' where not exists (select 1 from c2_2)

  union all select 'C2.3', metric, detail from c2_3
  union all select 'C2.3', 'NONE — no trigger on SECURITY DEFINER fn', '' where not exists (select 1 from c2_3)

  union all select 'C2.4', metric, detail from c2_4
  union all select 'C2.4', 'NONE — no trigger functions', '' where not exists (select 1 from c2_4)

  union all select 'C2.5', metric, detail from c2_5
  union all select 'C2.5', 'NONE — handle_new_user has no trigger', '' where not exists (select 1 from c2_5)

  union all select 'C2.6', metric, detail from c2_6
  union all select 'C2.6', 'NONE — no disabled / extension triggers', '' where not exists (select 1 from c2_6)

  union all select 'C2.7.1', metric, detail from c2_7_1
  union all select 'C2.7.1', 'PASS — no orphaned trigger references', '' where not exists (select 1 from c2_7_1)

  union all select 'C2.7.2', metric, detail from c2_7_2
  union all select 'C2.7.2', 'PASS — every trigger fn is wired to a trigger', '' where not exists (select 1 from c2_7_2)

  union all select 'C2.7.3', metric, detail from c2_7_3
  union all select 'C2.7.3', 'PASS — no fire point has >1 trigger', '' where not exists (select 1 from c2_7_3)

  union all select 'C2.7.4', metric, detail from c2_7_4
  union all select 'C2.7.4', 'PASS — no function wired to multiple triggers on one table', '' where not exists (select 1 from c2_7_4)

  union all select 'C2.7.5', metric, detail from c2_7_5
  union all select 'C2.7.5', 'PASS — no overloaded trigger functions', '' where not exists (select 1 from c2_7_5)
) all_rows;
