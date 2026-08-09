-- CR-00005 — Pre-snapshot & post-apply verification queries (rev 3)
-- =================================================================
-- Run in the owner-authorized Supabase SQL session.
-- Part A: run BEFORE apply (snapshot evidence). Capture output for the report.
-- Part B: run AFTER apply (post-apply verification). Capture output for the report.
-- If the live schema differs from what the draft expects (missing is_admin(),
-- missing pgcrypto, unexpected policies, RLS disabled) → HARD STOP, do not apply.

-- ── Part A. PRE-APPLY SNAPSHOT ────────────────────────────────────────────────
-- A0. Prerequisites the draft depends on:
SELECT to_regprocedure('public.is_admin()') AS is_admin_exists,
       to_regprocedure('public.app_role()') AS app_role_exists;
SELECT extname, extversion FROM pg_extension WHERE extname = 'pgcrypto';

-- A1. Policy inventory on repair_* tables
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'repair_requests', 'repair_timeline', 'repair_quotes',
    'repair_status_history', 'repair_audit_log', 'repair_photos',
    'repair_courier_jobs', 'repair_notifications'
  )
ORDER BY tablename, cmd;

-- A2. RLS enabled state on repair_* tables
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'repair_requests', 'repair_timeline', 'repair_quotes',
  'repair_status_history', 'repair_audit_log', 'repair_photos',
  'repair_courier_jobs', 'repair_notifications'
)
ORDER BY relname;

-- A3. Row counts (PII scale evidence, no row contents)
SELECT 'repair_requests' AS tbl, count(*) FROM repair_requests
UNION ALL SELECT 'repair_timeline', count(*) FROM repair_timeline
UNION ALL SELECT 'repair_quotes', count(*) FROM repair_quotes
UNION ALL SELECT 'repair_status_history', count(*) FROM repair_status_history
UNION ALL SELECT 'repair_audit_log', count(*) FROM repair_audit_log
UNION ALL SELECT 'repair_photos', count(*) FROM repair_photos
UNION ALL SELECT 'repair_courier_jobs', count(*) FROM repair_courier_jobs
UNION ALL SELECT 'repair_notifications', count(*) FROM repair_notifications;

-- A4. DOCUMENTATION ONLY (users is out of CR-00005 scope): live users policies
--     are captured here to evidence the is_admin() residual dependency
--     ("Users can update own row" self-elevation check). NOT modified by CR-00005.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY cmd, policyname;

-- ── Part B. POST-APPLY VERIFICATION (after the approved draft runs) ──────────
-- B1. Policy inventory: only staff (is_admin) read policies remain on the seven
--     tables; no public (using(true)) read policy may remain.
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'repair_requests', 'repair_timeline', 'repair_quotes',
    'repair_status_history', 'repair_audit_log', 'repair_photos',
    'repair_courier_jobs', 'repair_notifications'
  )
ORDER BY tablename, cmd;

-- B2. Token column: NOT NULL enforced + uniqueness (no dup tokens) + every row
--     tokenized (total == with-token == distinct-tokens).
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'repair_requests' AND column_name = 'tracking_token';
SELECT count(*) AS total_rows,
       count(tracking_token) AS with_token,
       count(DISTINCT tracking_token) AS distinct_tokens
FROM repair_requests;

-- ── RLS role harness (why NOT service_role?) ─────────────────────────────────
-- service_role BYPASSES RLS, so a service-role SELECT proves nothing about the
-- staff policy. These tests simulate a REAL authenticated session with a
-- specific sub by setting request.jwt.claims (the same claim auth.uid() and
-- is_admin() read) together with SET ROLE authenticated/anon. The SQL-editor
-- session runs as the owner role, which may SET ROLE to anon/authenticated.
-- This exercises the actual RLS path: TO authenticated + USING (public.is_admin()).

-- B3. Anonymous: no SELECT on repair_requests (expect denied / 0 rows).
SELECT set_config('request.jwt.claims', '', true);
SET ROLE anon;
SELECT count(*) AS anon_can_read_repair_requests FROM repair_requests;
-- B4. Anonymous code enumeration is dead: RPC with a sequential repair_code
--     (NOT a token) must return nothing.
SELECT count(*) AS anon_rpc_with_repair_code_rows
FROM public.get_repair_tracking('RP-2026-000001');
RESET ROLE;

-- B5. Anonymous tracking works by token and returns the non-PII shape only
--     (owner session first grabs one token, then the anon RPC call).
SELECT repair_code, tracking_token FROM public.repair_requests LIMIT 1;
SELECT set_config('request.jwt.claims', '', true);
SET ROLE anon;
SELECT * FROM public.get_repair_tracking('<TOKEN_ABOVE>');
RESET ROLE;

-- B6. Evidence of the RPC body (SELECT list) for the report — must contain
--     ONLY repair_code/status/updated_at/brand_name/model_name (no PII column).
SELECT prosrc FROM pg_proc WHERE proname = 'get_repair_tracking';

-- B7. STAFF authenticated read works — real admin/super_admin account via the
--     harness (NOT service_role). Grab an admin uid first:
SELECT id AS admin_uid FROM public.users
WHERE role IN ('admin','super_admin') LIMIT 1;
--     Then:
SELECT set_config('request.jwt.claims', '{"sub":"<ADMIN_UID>","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT count(*) AS staff_authenticated_can_read_repair_requests FROM repair_requests;
RESET ROLE;

-- B8. Negative control: authenticated NON-staff (user/guest) sees 0 rows.
SELECT id AS nonstaff_uid FROM public.users
WHERE role NOT IN ('admin','super_admin') LIMIT 1;
--     Then:
SELECT set_config('request.jwt.claims', '{"sub":"<NONSTAFF_UID>","role":"authenticated"}', true);
SET ROLE authenticated;
SELECT count(*) AS nonstaff_authenticated_can_read_repair_requests FROM repair_requests;
RESET ROLE;
