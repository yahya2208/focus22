-- Type: Hardening (Phase 1 · LV-9 · item 1)
-- Notes: Removes EXECUTE from PUBLIC/anon/authenticated on the privilege-escalation
-- RPC admin_promote_user — proven callable by an anonymous session (LV-9, III.0.11).
-- Reference: docs/security/production-security-audit.md (LV-9) +
--            docs/security/remediation-roadmap.md (Phase 1.1, execution order item 1).
-- Scope: EXECUTE grants ONLY. The in-function authorization guard is a Phase 2
--        requirement (authorization layer) and is deliberately NOT written here.

-- Apply via Supabase SQL Editor (owner role) on Production. Zero other changes.

-- Functions only carry the EXECUTE privilege; REVOKE ALL matches repo convention (00007).
REVOKE ALL ON FUNCTION public.admin_promote_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_promote_user(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_promote_user(uuid, text) FROM authenticated;

-- postgres (owner) and service_role (server-side) intentionally remain granted.
