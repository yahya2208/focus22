-- Type: Hardening (Phase 1 · item 5 · §III.0 — dormant privilege-escalation RPC)
-- Notes: bootstrap_super_admin(uuid) is SECURITY DEFINER and is guarded only by
-- has_super_admin() (not by caller identity/role) — it changes privileges with
-- owner rights. Evidence (2026-08-02):
--   (a) NOT called anywhere in src/ (grep; only has_super_admin is referenced,
--       in AdminSetupScreen.tsx:26 via .rpc('has_super_admin')).
--   (b) No other function depends on it (dependency query → bootstrap_super_admin only).
--   (c) Not used in any RLS policy.
--   (d) has_super_admin() = true on live Production → its guard refuses any call anyway.
-- REVOKE removes the unauthenticated RPC surface, mirroring LV-9
-- (01-LV9-revoke-admin-rpc-execute.sql).
-- Reference: docs/security/remediation-roadmap.md (Phase 1.1) +
--            docs/security/production-security-audit.md (§III.0).
-- Apply via Supabase SQL Editor (owner role) on Production. Zero other changes.

-- Functions only carry the EXECUTE privilege; REVOKE ALL matches repo convention (00007).
REVOKE ALL ON FUNCTION public.bootstrap_super_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_super_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_super_admin(uuid) FROM authenticated;

-- postgres (owner) and service_role (server-side / documented bootstrap) remain granted.
