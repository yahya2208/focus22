-- ============================================================================
-- 00003 — CORRECT-ORDER Session Lifecycle (Idempotent)
--
-- ############################################################################
-- # WHY THIS FILE EXISTS (AUDIT FIX:
-- #   Original migration "003_add_session_lifecycle.sql" uses 3-digit naming which sorts
-- #   alphabetically AFTER 5-digit migrations (00013...), so it would be applied LAST
-- #   during a fresh DB rebuild even though it logically belongs between 00002 and 00005.
-- #   This file uses the same SQL with a 5-digit prefix so it runs in the CORRECT place.
-- ############################################################################
-- Type: Additive + Idempotent safe. On a live DB where 003 applied already, every
-- statement is a no-op (all use IF NOT EXISTS).
-- Depends on: 00002_create_users_table.sql
-- Required by: 00005_campaigns_and_qr_codes.sql
-- ============================================================================

-- ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
-- Reconciled copy of 003_add_session_lifecycle.sql (alphabetical order fix)
-- ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity
  ON sessions(last_activity_at)
  WHERE status = 'running';
