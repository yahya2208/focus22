-- ============================================================================
-- Phase 2 · Task 2.1.2 — Replace repeated admin predicates with is_admin()
--
-- Replaces every live occurrence of
--   EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
--           AND users.role = ANY (ARRAY['admin','super_admin']))
-- with the single predicate public.is_admin() (ADR-001 A6).
--
-- Live occurrences found in policy snapshot 2026-08-02 (pg_policies):
--   1. campaigns -> "Admins manage campaigns"   (ALL, TO public)
--   2. qr_codes  -> "Admins manage qr codes"    (ALL, TO public)
--   3. users     -> "Admins update user roles"  (UPDATE, TO public)
--
-- Grants: these policies are TO public, so any session role (incl. anon)
-- evaluates is_admin() when the policy is consulted -> PUBLIC EXECUTE is
-- now required. is_admin() returns false for anon (auth.uid() NULL / no row);
-- this is informational only and mirrors the has_super_admin() exception.
-- Behavioral outcome is identical to the EXISTS pattern (false -> 0 rows).
-- ============================================================================

alter policy "Admins manage campaigns"
  on public.campaigns
  using (public.is_admin());

alter policy "Admins manage qr codes"
  on public.qr_codes
  using (public.is_admin());

alter policy "Admins update user roles"
  on public.users
  using (public.is_admin());

-- PUBLIC EXECUTE: needed because the three policies are TO public.
grant execute on function public.is_admin() to public;

-- ============================================================================
-- Post-apply verification (see 02-2.1.2-probes.sql):
--   - pg_policies must show public.is_admin() and ZERO occurrences of
--     `role = ANY (ARRAY['admin'::text,'super_admin'::text])`.
--   - A (super_admin): UPDATE campaigns/qr_codes/users (transaction+rollback)
--     returns 1 row each.  B (user): 0 rows.  anon: 0 rows.
-- ============================================================================
