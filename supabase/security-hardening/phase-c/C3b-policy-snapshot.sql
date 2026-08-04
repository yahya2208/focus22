-- ============================================================================
-- Phase C · C3.10 — POLICY SNAPSHOT (READ-ONLY · SINGLE RESULT SET)
--
-- Purpose: capture a READABLE snapshot of every RLS policy BEFORE any change
-- (mandated pre-condition for C3 hardening). Unlike C3.9 (raw node trees),
-- this renders the USING / WITH CHECK expressions as SQL via pg_get_expr and
-- resolves policy roles to names (OID 0 => PUBLIC).
--
-- Returned: one row / one column `audit_result` — JSON array of:
--   { table, policy, command, permissive, roles[], using, with_check }
--
-- Guarantees: SELECT / catalog reads ONLY · no temp tables · no DDL/GRANT ·
-- no transaction · session unchanged after run.
-- ============================================================================

with pol as (
  select n.nspname || '.' || c.relname as tbl,
         pol.polname,
         case pol.polcmd when 'r' then 'SELECT'
                         when 'a' then 'INSERT'
                         when 'w' then 'UPDATE'
                         when 'd' then 'DELETE'
                         when '*' then 'ALL'
                         else pol.polcmd::text end as cmd,
         pol.polpermissive as permissive,
         array(select case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end
               from unnest(pol.polroles) r) as roles,
         pg_get_expr(pol.polqual, pol.polrelid) as using_expr,
         pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
)
select jsonb_pretty(jsonb_agg(
         jsonb_build_object(
           'table',      tbl,
           'policy',     polname,
           'command',    cmd,
           'permissive', permissive,
           'roles',      roles,
           'using',      using_expr,
           'with_check', check_expr
         ) order by tbl, polname
       )) as audit_result
from pol;
