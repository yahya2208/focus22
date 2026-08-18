-- ============================================================================
-- FOCUS — CATALOG CENTRAL (08 — READ-ONLY ACL DIAGNOSIS for catalog_create_model)
--
-- STRICTLY READ-ONLY. Pure SELECT statements ONLY.
--   No GRANT / REVOKE / DROP / CREATE OR REPLACE / INSERT / UPDATE / DELETE /
--   DO block / temp table / any write of any kind.
--
-- Target (Gate 05): public.catalog_create_model(text,text,text,integer,text[],text[])
--
-- Question being answered: v2 verify shows
--   anon_execute         = true  (expect false)
--   authenticated_execute= true  (expect true)
-- i.e. anonymous is (still) allowed to EXECUTE the RPC.
-- These 6 queries return the raw evidence; run all, then report each Result Grid.
-- ============================================================================

-- (Q1) ALL overloads of catalog_create_model in ANY schema (multiple-overload check)
SELECT p.oid AS function_oid,
       n.nspname AS schema,
       p.oid::regprocedure::text AS signature,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       p.prorettype::regtype::text AS return_type,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       p.proowner::regrole::text AS owner,
       p.proacl::text AS proacl_raw,
       CASE WHEN p.proacl IS NULL
         THEN 'NULL = default. Function default ACL = PUBLIC EXECUTE => anon+auth both true. REVOKE NOT reflected here.'
         ELSE 'SET = explicit ACL stored (some REVOKE/GRANT IS reflected)'
       END AS proacl_state,
       count(*) OVER () AS total_overloads
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'catalog_create_model'
ORDER BY n.nspname, p.oid;

-- (Q2) EXACT overload only + effective privilege checks (what the v2 test measured)
SELECT p.oid::regprocedure::text AS function_resolved,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('public',        p.oid, 'EXECUTE') AS public_execute,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role_execute,
       has_function_privilege('postgres',      p.oid, 'EXECUTE') AS postgres_execute,
       p.proacl::text AS proacl_raw
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'catalog_create_model'
  AND replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'text,text,text,integer,text[],text[]'
ORDER BY p.oid;

-- (Q3) Exploded ACL of the EXACT overload.
--   NOTE: if proacl is NULL the effective ACL is the function DEFAULT
--   (= PUBLIC EXECUTE), rendered here as a synthetic grantee 'PUBLIC'.
SELECT p.oid::regprocedure::text AS function_resolved,
       CASE WHEN x.grantee = 0 THEN 'PUBLIC (all roles)'
            ELSE x.grantee::regrole::text END AS grantee,
       x.privilege_type,
       x.is_grantable,
       p.proacl::text AS proacl_raw
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL aclexplode(
       COALESCE(p.proacl, ('{=X/' || p.proowner::text || '}')::aclitem[])
     ) AS x ON true
WHERE n.nspname = 'public'
  AND p.proname = 'catalog_create_model'
  AND replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'text,text,text,integer,text[],text[]'
ORDER BY p.oid, x.grantee;

-- (Q4) Role memberships touching anon / authenticated / service_role (inheritance check).
--   am.member  = role that was granted membership (the child / inheritor)
--   am.roleid  = the role it is a member of (the parent / grantee of the membership)
SELECT m.rolname AS member_role,
       r.rolname AS membership_in_role,
       m.rolinherit AS member_inherit_attr,
       r.rolinherit AS parent_role_inherit_attr
FROM pg_auth_members am
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles r ON r.oid = am.roleid
WHERE m.rolname IN ('anon','authenticated','service_role')
   OR r.rolname IN ('anon','authenticated','service_role')
ORDER BY m.rolname, r.rolname;

-- (Q5) What the v2 test's exact function-string resolves to (test-target binding).
--   Compare resolved_oid with the function_oid of the intended function in Q1.
SELECT 'public.catalog_create_model(text,text,text,integer,text[],text[])'::regprocedure AS resolved_signature,
       'public.catalog_create_model(text,text,text,integer,text[],text[])'::regprocedure::oid AS resolved_oid;

-- (Q6) Attributes of the relevant auth roles (superuser/owner would short-circuit
--   every has_function_privilege check to true; noinherit blocks membership inheritance).
SELECT rolname,
       rolsuper,
       rolinherit,
       rocreaterole,
       rolbypassrls,
       rolcanlogin
FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role','authenticator','postgres')
ORDER BY rolname;

-- ============================================================================
-- END of read-only diagnosis. No ACL change performed.
-- ============================================================================
