-- ============================================================================
-- CR-00006 · LV-3 — campaigns read RLS hardening — VERIFY (read-only)
-- ----------------------------------------------------------------------------
-- Runs in the Supabase SQL Editor. All probes are SELECT-only (structural
-- catalog reads + RLS-controlled SELECTs). No data is modified. The write
-- regression (Section D) is zero-impact: single existing row, SET id = id
-- (no value change), wrapped in BEGIN; ROLLBACK; — no set_config(..., false),
-- per docs/security/operations/change-management.md §3.2.
--
-- Usage:
--   STEP 1 (pre-apply):  run Sections A + B. Record results. Expected:
--                        both policies present, RLS enabled, every non-admin
--                        role = 0 rows, admin/super_admin = campaigns_total.
--                        If this differs -> HARD STOP, do not apply.
--   STEP 2 (apply):      run 09-LV3-campaigns-read-rls.sql
--   STEP 3 (post-apply): run Sections A + B + C + D again. Expected:
--                        "Authenticated read campaigns" GONE; "Admins manage
--                        campaigns" unchanged; non-admin roles still 0 rows;
--                        admin/super_admin still campaigns_total; QR RPC
--                        still resolves; admin write still passes.
-- ============================================================================

-- ============================================================
-- SECTION A · Policy + RLS baseline snapshot (read-only)
-- ============================================================

-- A1) exact policy definitions (cmd / roles / qual / with_check)
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;

-- A2) RLS enabled on campaigns
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.campaigns'::regclass;

-- A3) helper functions used by the surviving admin policy
SELECT proname, provolatile, prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('is_admin', 'app_role', 'is_research_role')
ORDER BY proname;

-- A4) campaigns row total (run as owner/service_role so RLS is bypassed).
--     Reference value: admin/super_admin probes below must equal this.
SELECT count(*) AS campaigns_total FROM public.campaigns;

-- ============================================================
-- SECTION B · RLS read probes (anonymous + each app role)
-- Expected per role (both pre- and post-apply):
--   anon: 0   user: 0   guest: 0   researcher: 0
--   admin / super_admin: campaigns_total
-- NOTE: probes resolve a real role holder from public.users. If a role has
-- NO live holder, the sub falls back to NULL -> probe reads 0 rows; record
-- that as "no live holder" rather than a denial.
-- ============================================================

-- B0) anon — no identity; policies are TO authenticated only
begin;
set local role anon;
select count(*) AS anon_campaigns_rows FROM public.campaigns;
rollback;
reset role;

-- B1) user
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'user' LIMIT 1), 'role', 'authenticated')::text, true);
select count(*) AS user_campaigns_rows FROM public.campaigns;
rollback;
reset role;

-- B2) guest
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'guest' LIMIT 1), 'role', 'authenticated')::text, true);
select count(*) AS guest_campaigns_rows FROM public.campaigns;
rollback;
reset role;

-- B3) researcher
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'researcher' LIMIT 1), 'role', 'authenticated')::text, true);
select count(*) AS researcher_campaigns_rows FROM public.campaigns;
rollback;
reset role;

-- B4) admin
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'admin' LIMIT 1), 'role', 'authenticated')::text, true);
select count(*) AS admin_campaigns_rows FROM public.campaigns;
rollback;
reset role;

-- B5) super_admin
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'super_admin' LIMIT 1), 'role', 'authenticated')::text, true);
select count(*) AS super_admin_campaigns_rows FROM public.campaigns;
rollback;
reset role;

-- ============================================================
-- SECTION C · QR flow regression — lookup_campaign_by_short_code (anon)
-- The QR flow resolves via this SECURITY DEFINER RPC (bypasses RLS by
-- design). Dropping the broad SELECT policy MUST NOT affect it.
-- NOTE: resolves the first ACTIVE campaign's short_code automatically. If no
-- active campaign exists, p_code is NULL and the RPC returns 0 rows — record
-- that as "no active campaigns present" rather than a regression.
-- ============================================================
begin;
set local role anon;
select id, short_code, name, is_active
FROM public.lookup_campaign_by_short_code(
  (SELECT short_code FROM public.campaigns WHERE is_active = true LIMIT 1)
);
rollback;
reset role;

-- ============================================================
-- SECTION D · Admin write regression (zero-impact, transaction + rollback)
-- "Admins manage campaigns" (ALL) is NOT modified by CR-00006; this proves
-- admin write still passes RLS. Single existing row, SET id = id (no value
-- change), ROLLBACK. If campaigns is EMPTY the subquery yields 0 rows and
-- this probe is inconclusive — the policy snapshot (A1) then remains the
-- authoritative write-access evidence.
-- ============================================================

-- D1) admin
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'admin' LIMIT 1), 'role', 'authenticated')::text, true);
update public.campaigns SET id = id
WHERE id = (SELECT id FROM public.campaigns LIMIT 1)
RETURNING id AS admin_write_probe_row;
rollback;
reset role;

-- D2) super_admin
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM public.users WHERE role = 'super_admin' LIMIT 1), 'role', 'authenticated')::text, true);
update public.campaigns SET id = id
WHERE id = (SELECT id FROM public.campaigns LIMIT 1)
RETURNING id AS super_admin_write_probe_row;
rollback;
reset role;
