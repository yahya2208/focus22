-- ============================================================================
-- Phase 2 · Task 2.1.6 — INCIDENT RESPONSE · Phase D+E — Targeted Restore
--
-- Root cause (RCA closed): H1. The incident probe set request.jwt.claims at
-- SESSION scope (set_config(..., false)) at its B-tools step; A's identity
-- leaked into the later "set role anon" steps, so the 2.1.3 guard evaluated
-- is_admin() = true under anon and the temporarily-granted admin_promote_user
-- promoted B. The same leak made E7's anon UPDATE hit all qr_codes rows.
--
-- This script restores ONLY the KNOWN-GOOD state:
--   [1] users.role(B)  'admin' -> 'user'        (original state is KNOWN)
--   [2] analytics_events residue row(s) deleted (original state: none exist)
--   [3] qr_codes scan_count: CLOSED by executive decision (see below).
--
--   CLOSED (2026-08-03, FOCUS v2.0): the scan_count pollution (D2) is closed
--   as a DATA issue. No PITR is available; the 8 affected rows are
--   experimental/non-operational. EXECUTIVE DECISION: do NOT spend further time
--   recovering those values, and do NOT guess them. No UPDATE for scan_count
--   will ever run from this script. Section [3b] is retained only as a record
--   of what was considered; it is deprecated and MUST NOT be re-activated
--   (Change ID: INC-2026-08-03-D2-close).
--
-- SAFETY:
--   * every section prints its current state BEFORE mutating
--   * mutations run as owner (postgres, bypasses RLS) -> each UPDATE/DELETE is
--     exactly targeted (id / event_type) and reports affected row counts
--   * the scan_count section issues NO UPDATE at all (closed)
--
-- Execution: Supabase SQL Editor (owner role). Review each result grid as it
-- runs. Confirm the diagnostics match the expectations before allowing the two
-- mutations below.
-- ============================================================================

-- ============================================================================
-- [0] Reference point (already on record)
--   A  = a549a010-3315-4391-b90b-5c41ea3f6fe6   (super_admin)
--   B  = 979e7949-794f-4386-b2a4-dc207d4fb0d0   (was 'user', now 'admin')
--   pollution marker = scan_count = 999999999
--   incident window  = 2026-08-03 18:30:05Z
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [1] RESTORE — users.role(B)  'admin' -> 'user'
-- ----------------------------------------------------------------------------

-- 1.1 current state (must show role=admin before running the update)
select id, email, role, updated_at
from public.users
where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';

-- 1.2 restore (guarded: only touches the incident row, only if still 'admin')
update public.users
   set role = 'user'
 where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'
   and role = 'admin';

-- 1.3 verify (must show role=user)
select id, email, role, updated_at
from public.users
where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';

-- ----------------------------------------------------------------------------
-- [2] RESTORE — analytics_events probe residue  -> deleted
--   The row was created by the incident probe (E9). Original state: no such row.
-- ----------------------------------------------------------------------------

-- 2.1 current state (expect exactly the residue row(s); review ids before delete)
select id, user_id, event_type, created_at
from public.analytics_events
where event_type like 'baseline_reverify%';

-- 2.2 delete residue (scope = probe-only event types)
delete from public.analytics_events
where event_type like 'baseline_reverify%';

-- 2.3 verify (must be 0)
select count(*) as remaining_residue
from public.analytics_events
where event_type like 'baseline_reverify%';

-- ----------------------------------------------------------------------------
-- [3] DIAGNOSE (NO UPDATE) — qr_codes pollution footprint
--   Purpose: documentation only. Per executive closure (INC-2026-08-03-D2-close)
--   the 8 polluted rows are NOT to be recovered and their scan_count is NOT to
--   be guessed. This SELECT exists so the footprint stays visible/auditable.
-- ----------------------------------------------------------------------------

select id, scan_count, created_at, updated_at,
       (scan_count = 999999999) as is_polluted
from public.qr_codes
order by created_at;

-- ----------------------------------------------------------------------------
-- [3b] DEPRECATED — scan_count restore template (CLOSED, MUST NOT be used)
--
--   Per executive closure (INC-2026-08-03-D2-close): NO PITR is available, the
--   8 affected rows are experimental/non-operational, and no further effort is
--   to be spent recovering these values. This template is retained only as a
--   historical record of the option that was evaluated and rejected. It is
--   DEPRECATED and MUST NOT be uncommented or executed.
--
--   (Removed restore logic; see git history for the original template.)
-- ============================================================================
