-- ============================================================================
-- FOCUS Product Contract v1.0 — Phase A: database baseline documentation
--
-- Type: Baseline
-- Phase: A
-- Needs backfill: no (documents the existing schema; no-op on the live DB)
-- Directly reversible: N/A (changes no data)
-- Depends on: none
-- Required by: 00009-00013 (they reference users/campaigns FKs and update_updated_at)
--
-- PURPOSE
--   The live database was built manually (SQL editor), NOT from this repo's
--   migrations. Today the repo cannot rebuild the database (biggest risk from
--   the Phase 0 audit). This file documents the EXISTING schema idempotently:
--   it must be a no-op on the live database and provide a correct CREATE path
--   on a fresh database.
--
-- STATUS: PLACEHOLDER — NOT COMPLETE (⚠️ CANNOT REBUILD FROM SCRATCH)
--   ╔══════════════════════════════════════════════════════════════════════╗
--   ║  AUDIT 2026-08-01: Baseline Reconstruction RISK — CONFIRMED         ║
--   ║  The live DB was built via SQL editor, NOT through this repo's       ║
--   ║  migrations. The canonical CREATE TABLE definitions for the core    ║
--   ║  tables (users, sessions, devices, calibrations, surveys) are NOT   ║
--   ║  present anywhere in the repo. A fresh `supabase db reset` WILL     ║
--   ║  FAIL for the schema objects that were hand-created in the live DB. ║
--   ║                                                                      ║
--   ║  DISASTER RECOVERY NOTE:                                            ║
--   ║  Do NOT rely on repo-only migrations to rebuild production. Until   ║
--   ║  this file is completed, run a pg_dump of the live public schema    ║
--   ║  and use that as the authoritative source for baseline recovery.    ║
--   ║                                                                      ║
--   ║  TODO (additive safe action):                                       ║
--   ║  1. Dump users/sessions/devices/calibrations/surveys schema from    ║
--   ║     the live Supabase SQL editor using the queries below.           ║
--   ║  2. Paste the result into a NEW idempotent 5-digit migration file   ║
--   ║     (e.g. 00008a_baseline_tables_idempotent.sql) that uses          ║
--   ║     CREATE TABLE IF NOT EXISTS / CREATE TRIGGER IF NOT EXISTS.      ║
--   ║  3. Keep this file (00008) as the documentation index; do NOT       ║
--   ║     delete it or the audit trail will be lost.                      ║
--   ╚══════════════════════════════════════════════════════════════════════╝
--
--   Blocked on the `users` and `surveys` columns plus the constraint/trigger
--   inventory, which the live schema dump did not include. Run the queries
--   below in the Supabase SQL editor and paste the output so the baseline
--   idempotent CREATE TABLE migration can be written.
--
--   Q1 — columns for the two missing tables:
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('users', 'surveys')
--   ORDER BY table_name, ordinal_position;
--
--   Q2 — constraints and foreign keys (every table):
--   SELECT conrelid::regclass AS table_name, con.conname, con.contype,
--          pg_get_constraintdef(con.oid) AS definition
--   FROM pg_constraint con
--   JOIN pg_class rel ON rel.oid = con.conrelid
--   WHERE rel.relkind = 'r' AND rel.relnamespace = 'public'::regnamespace
--   ORDER BY table_name, con.conname;
--
--   Q3 — triggers (every table):
--   SELECT event_object_schema, event_object_table, trigger_name,
--          action_timing, event_manipulation, action_statement
--   FROM information_schema.triggers
--   WHERE event_object_schema = 'public'
--   ORDER BY event_object_table, trigger_name;
--
--   Q4 — sequences (if any):
--   SELECT sequence_name, data_type, start_value, increment_by, last_value
--   FROM information_schema.sequences
--   WHERE sequence_schema = 'public'
--   ORDER BY sequence_name;
--
--   Once available, this file will document (with IF NOT EXISTS guards):
--     - analytics_events, calibrations, campaigns, devices, qr_codes, sessions
--     - users, surveys
--     - all indexes from pg_indexes
--     - all constraints + foreign keys (from pg_constraint / Q2)
--     - all triggers (from Q3)
--     - all RLS policies from pg_policies
--     - functions: update_updated_at, has_super_admin, bootstrap_super_admin,
--       admin_promote_user, handle_new_user, increment_qr_counter,
--       lookup_campaign_by_short_code
--   NOTE: policies that reference users(id) are deferred until users.id is
--   reconciled (live DB uses UUID; migration 00002 declares TEXT).
--
-- Only the shared, idempotent pieces are emitted below so that later
-- migrations are self-contained on a fresh database.
-- ============================================================================

-- UUID generator used by every existing table (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Shared BEFORE UPDATE trigger (matches the live definition exactly).
-- Idempotent so fresh builds and re-runs are safe.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;
