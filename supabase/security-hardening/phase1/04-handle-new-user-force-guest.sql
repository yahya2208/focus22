-- Type: Hardening (Phase 1 · item 4 · NR-1 — role injection at signup, P0)
-- Notes: handle_new_user() reads NEW.raw_user_meta_data ->> 'role' and writes it into
-- public.users.role. It is SECURITY DEFINER, so the insert bypasses RLS — including
-- the "Bootstrap insert first user" policy (WITH CHECK has_super_admin() = false).
-- raw_user_meta_data is client-controlled at POST /auth/v1/signup, so ANY attacker
-- can self-register with metadata role 'super_admin'/'admin' even when a super_admin
-- already exists (live probe 2026-08-02: has_super_admin() = true) → full takeover.
-- Fix (user decision 2026-08-02, option C): IGNORE the client-supplied role entirely.
-- Every new user is created with role = 'guest'. Promotions to admin/super_admin
-- happen ONLY through trusted admin paths (service_role / documented bootstrap).
-- Reference: docs/security/production-security-audit.md (NR-1 / v3.7) +
--            docs/security/remediation-roadmap.md (NR-1).
-- Derived from supabase/migrations/00002_create_users_table.sql (00002:35-56) with TWO
-- changes: (1) the role value line (coalesce(...) -> 'guest'); (2) the timestamp
-- columns use now() NOT now()::text.
--   REVISION 2026-08-02 (regression): v1 used now()::text, but the LIVE users schema
--   reconciled these columns to timestamp with time zone (00008 baseline) while
--   migration 00002 still says text → live signup failed with
--   ERROR 42804: column "created_at" is of type timestamp with time zone but
--   expression is of type text. Fixed by using now() (returns timestamptz).
--   LESSON: derive the patch from pg_get_functiondef (live), not from migrations.
-- Apply via Supabase SQL Editor (owner role) on Production. Zero other changes.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, display_name, role, is_anonymous, created_at, updated_at, last_login_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name',
    'guest',
    new.is_anonymous,
    now(),
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    last_login_at = now(),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Both triggers (on_auth_user_created, on_auth_user_login) reference the SAME
-- function object — no trigger change needed. Function signature unchanged.
