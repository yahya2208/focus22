-- ============================================================================
-- Phase 2 · Task 2.1.3 — Internal role guard on every admin RPC
--
-- ADR-001 A4: every SECURITY DEFINER RPC must validate the caller internally
-- (defense in depth — must NOT rely on EXECUTE grants alone).
-- Design §4.2: guard = is_admin() (A6) + parameter allowlist + SET search_path.
--
-- Covered live functions (not defined in any migration — live-only):
--   1. admin_promote_user(uuid, text)   LV-9 (had NO caller check)
--   2. bootstrap_super_admin(uuid)      design risk — state-guarded only
--
-- Behavioral changes:
--   admin_promote_user:
--     - NEW: caller must be admin/super_admin (is_admin()) else 42501 Forbidden.
--     - NEW: only super_admin may promote a user TO 'super_admin'
--            (acceptance matrix §3: promote/bootstrap super_admin = super_admin only).
--     - NEW: role allowlist (guest/user/researcher/admin/super_admin) — 22023.
--     - KEPT: 'No super admin exists.' guard (bootstrap-window protection).
--     - KEPT: 'User not found.' + UPDATE semantics (updated_at = now()).
--   bootstrap_super_admin:
--     - KEPT + formalized: refuses with 42501 Forbidden whenever a super_admin
--       already exists (state-based guard — the ONLY correct guard for a
--       bootstrap path: requiring is_admin() would create a chicken-and-egg).
--     - NEW EXCEPTION (documented in ADR-001 §2): bootstrap_super_admin does
--       NOT check caller identity — see ADR update in this task's commit.
--
-- Apply via Supabase SQL Editor (owner role) on Production. Zero other changes.
-- ============================================================================

create or replace function public.admin_promote_user(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A4: internal caller check (single admin predicate per A6).
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- KEEP bootstrap-window protection (original live guard).
  if not public.has_super_admin() then
    raise exception 'No super admin exists.';
  end if;

  -- Allowlist (defense in depth — mirrors increment_qr_counter model).
  if new_role not in ('guest', 'user', 'researcher', 'admin', 'super_admin') then
    raise exception 'Invalid role: %', new_role using errcode = '22023';
  end if;

  -- Acceptance matrix: only super_admin may grant super_admin.
  if new_role = 'super_admin' and public.app_role() <> 'super_admin' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.users
     set role = new_role, updated_at = now()
   where id = target_user_id;

  if not found then
    raise exception 'User not found.';
  end if;
end;
$$;

create or replace function public.bootstrap_super_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- State-based guard (bootstrap path): once a super_admin exists the function
  -- is permanently locked. Caller-identity check is impossible by design
  -- (the first super_admin has no predecessor) -> documented ADR-001 exception.
  if public.has_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.users
     set role = 'super_admin', updated_at = now()
   where id = target_user_id;

  if not found then
    raise exception 'User not found.';
  end if;
end;
$$;

-- Grants are intentionally NOT restored: Phase 1 REVOKEd EXECUTE from
-- anon/authenticated/PUBLIC on both functions; postgres + service_role keep it.
-- The probes below prove the internal guard fires even when EXECUTE is granted.

-- ============================================================================
-- Post-apply verification (see 03-2.1.3-probes.sql):
--   - user B  -> admin_promote_user  -> 42501 Forbidden (even with EXECUTE granted)
--   - anon    -> admin_promote_user  -> 42501 Forbidden
--   - anon    -> bootstrap_super_admin -> 42501 Forbidden
--   - super_admin A -> admin_promote_user(B,'admin') -> OK (positive control)
--   - super_admin A -> admin_promote_user(B,'super_admin') -> OK (allowlist top)
-- ============================================================================
