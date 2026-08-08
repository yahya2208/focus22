# E-9 — repair_* subsystem reassessment

- **Date opened:** 2026-08-08
- **Status:** **OPEN — REASSESSMENT ONLY.** No technical change authorized.
- **Not a continuation of:** CR-00005 (`docs/audits/p6-security-cr-00005-rls.md`), closed as `NON-APPLICABLE / NEVER_DEPLOYED`.
- **Origin:** Privacy decommission plan E-9 REASSESS gate — `docs/audits/privacy-data-minimization-decommission-plan.md` (§12 tables, §14 migration `00021_repair_reassess.sql`, P6 item).

## Scope of this gate

This entry is **REASSESSMENT ONLY**. The following are **NOT** authorized here and each requires a separate owner approval after this reassessment completes:

- `DROP TABLE` / `CREATE TABLE` / migration / schema restoration
- code deletion / data deletion

No SQL, no code change, no migration, no commit, no push.

## Live-state context (evidence — no decision)

- `repair_*` tables are **not present** in the current production database: Production Security Audit v4.0 (`404 PGRST205`, LV-7, DV-5), live `42P01` on `repair_requests`, and current public BASE TABLE inventory (`ads`, `analytics_events`, `calibrations`, `campaigns`, `devices`, `placement_history`, `placements`, `qr_codes`, `sessions`, `surveys`, `users`).
- Migrations `00001_repair_tables.sql` / `00005_fix_repair_tables.sql` / `00006_add_repair_status_history_and_audit.sql` exist in repo only — legacy subsystem, "for completeness only" (`docs/architecture/17-migration-dependency-map.md`).
- App-side code still contains the repair data layer: `src/core/supabase/repair-data-service.ts` (queries `repair_*` tables; sync fails silently per audit III.1.5), `src/services/repair/*`, `src/components/repair/*`, `src/screens/repair/*`.
- Client-side data keys exist in localStorage: `repair_requests_v1`, `repair_quotes_v1`, `repair_timeline_v1`, `repair_courier_jobs_v1`, `repair_notifications_v1`, `repair_photos_v1`, `repair_status_history_v1`, `repair_audit_log_v1` (`docs/architecture/data-audit-report.md`, `docs/repair-os.md`).

## Questions E-9 must answer (reassessment — no decision taken yet)

1. Is the repair subsystem still required for the product?
2. Is the current repair code still in use?
3. Are there UI / routes / services / hooks that depend on it?
4. Are there local data or user-facing flows that depend on it?
5. Should it be: **decommissioned**, **retained as legacy**, or **redesigned and released later**?

## Status — no decision

The five questions above remain **open**. This entry only registers the reassessment gate.

## HARD STOP

This entry records the open reassessment gate only. Await explicit owner decisions on the five questions before any further action.
