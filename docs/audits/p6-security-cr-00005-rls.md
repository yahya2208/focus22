# P6 Security Change Request — CR-00005: Repair public RLS read

- **Date:** 2026-08-08
- **Severity:** 🔴 **SECURITY BLOCKER** (owner-classified)
- **Status:** OPEN — NO SQL executed. Not part of P6 execution (no-SQL gate).
- **Discovered in:** P6 Discovery (2026-08-08) — `docs/audits/p6-discovery-report.md`, `docs/audits/p6-dependency-reachability-matrix.md`.

## Problem

The `repair` subsystem persists **real customer PII** (name, phone, address, GPS, base64 photos, and currently also ip/user_agent) in Supabase tables `repair_requests` / `repair_timeline`, yet migration `00005` defines **anonymous public read policies**:

- `00005:38-40` — "Anyone can read repair requests" → `using (true)` on `repair_requests`
- `00005:53-54` — public timeline read
- (`00005:66` — public photos insert, part of the same posture review)

An anonymous client can therefore read customer names, phone numbers, and addresses. This contradicts the decommissioning posture and the P6 minimization direction. P6 execution (app-side) will stop writing ip/user_agent/device_info, but **the PII already stored remains readable** until this CR is applied.

## Approved decision

Owner decision (2026-08-08): **no SQL within P6.** This CR is recorded as a required, separate, mandated security change with its own lifecycle. It must not be treated as an optional future improvement.

## Proposed remediation (for the separate authorized session)

Replace the public `using (true)` policies on `repair_requests` / `repair_timeline` with authenticated/staff-only read (and verify the photos insert policy). Exact SQL to be drafted in the CR session and approved before apply. No SQL is proposed here.

## Own lifecycle (mirrors P4/P5 discipline)

1. **Snapshot** — capture `repair_*` table + RLS policies state (via owner-authorized DB snapshot tooling only).
2. **SQL draft + RED/verification** — write candidate SQL; design verification queries; no apply.
3. **Owner approval** — explicit sign-off on the exact SQL.
4. **Apply** — execute approved SQL against the live database.
5. **Post-apply verification** — confirm anonymous read is revoked and staff access still works.
6. **Report + HARD STOP.**

## Required owner inputs before this CR can proceed

1. Confirm the intended access model (staff-only read vs read-with-token; whether the customer-tracking URL used by `RepairTrackingScreen`/`RepairQR` needs anonymous read of *non-PII* fields only).
2. Authorize the separate DB session and snapshot tooling.
3. Decide whether existing stored PII in `repair_*` should also be scrubbed in the same session (retention/redaction), or left for a later phase.

## Discovery evidence (CR-00005 session — completed, no SQL)

Snapshot: `HEAD == origin/main == 885a323`; only untracked gates/reports in the tree.

RED policy artifacts confirmed in migrations:

- `00005:38-40` — `"Anyone can read repair requests"` → `using (true)` on `repair_requests`.
- `00005:53-54` — public timeline read (`using (true)` on `repair_timeline`).
- `00005:66` — public photos insert (same-posture review item).
- `00006:23-27` — `"Anyone can read status history"` → `using (true)` on `repair_status_history` (stores `ip_address`, `device_info`); authenticated insert.
- `00006` — `repair_audit_log` (stores `ip_address`, `user_agent`) readable by any authenticated user.
- `00002` — `"Users can read own row"` policy includes `or current_user = 'authenticated'` → any authenticated user can read any `users` row (including `role`), not only own row.

PII inventory stored in the public-readable tables:

- `repair_requests`: `customer_name`, `customer_phone`, `latitude`/`longitude`/`google_maps_link` (GPS + address), `photo_paths` (base64), `admin_notes`, `issue`/`description`.
- `repair_timeline`: status + `actor` + notes.
- `repair_status_history` / `repair_audit_log`: `ip_address`, `user_agent`, `device_info`.
- `repair_courier_jobs`: customer/courier name+phone+address+GPS (same read posture).

App-side exposure (anonymous, no auth required):

- `repair-database.ts:339-352` `searchRequests()` matches by `repairCode`, `customerPhone`, `customerName`, `brandName`, `modelName` over the full `repair_requests` set fetched via public read.
- `RepairTrackingScreen.tsx:260` renders `customerName - customerPhone` in results; `:311-318` renders `customerName`, `customerPhone`, and `adminNotes` (internal admin notes) plus the full timeline — all reachable via `RepairQR`/`#/repair-tracking` by any anonymous visitor.
- Impact: an unauthenticated client can enumerate customer PII and internal notes by phone number, name, or repair code.

Staff gate today (for reference in remediation design):

- `RepairHomeScreen.tsx:32` → `permissionGuard.can(researchRole, 'campaigns', 'read')` → only `admin` / `super_admin` (AppRole) pass `ROLE_CAPABILITY_MAP` in `src/core/research/permissions.ts`.

## Owner decisions (2026-08-08, CR-00005 approval gate #1)

1. **Access model:** Staff-only read on `repair_*` + **tokenized non-PII tracking** (anonymous tracking via an unguessable token exposes status/brand/model only — no PII).
2. **SQL session:** Authorized — with hard constraints: no DROP of data tables; no changes outside CR-00005; no ads / inventory / catalog / game; no `users` / `system_settings` / `audit_log` / `job_assignments`; no P7/P8/P9; no SQL outside the approved plan; **HARD STOP immediately** if live schema differs from snapshot or any unexpected result appears.
3. **Stored PII scrub:** LEFT TO A LATER PHASE (this CR = access control only).

## Owner review — approval gate #2 (2026-08-08): REQUEST CHANGES

The owner reviewed the rev-1 literal SQL and raised **2 BLOCKERs + 1 reporting item**, all addressed in rev 2:

1. **BLOCKER 1 — role source:** rev 1 used `auth.jwt() -> 'user_metadata' ->> 'role'` (client-controllable). **Fix:** role decision now comes solely from server-managed `public.users.role` via the canonical ADR-001 A6 predicate `public.is_admin()` (SECURITY DEFINER → `app_role()` → `role IN ('admin','super_admin')`). No JWT `user_metadata` claim is used anywhere. Trust basis: NR-1 already forces `'guest'` at signup; promotions only via `bootstrap_super_admin`/`admin_promote_user`.
   - *Residual dependency (documented, not fixed — `users` is out of scope):* live `users` UPDATE policies are snapshotted in verification Part A4; if `"Users can update own row"` still permits self-elevation of `role`, that is a separate hardening item outside CR-00005.
2. **BLOCKER 2 — token:** rev 1 keyed `get_repair_tracking` by sequential `repair_code` (enumerable). **Fix:** new additive `repair_requests.tracking_token` column (default `gen_random_uuid()::text`) + unique index + safety-net backfill; RPC is keyed **only by the high-entropy token**, so code enumeration is dead (Part B4 verifies a code returns nothing).
   - The backfill UPDATE is the **only** statement touching rows and writes **only** the new `tracking_token` column — no PII column is read or modified (verified in the statement inventory below).
3. **Reporting item 3 — write policies:** CR-00005 hardens **SELECT only**. INSERT/UPDATE policies on `repair_*` (`Anyone can insert repair requests` with check true, `Authenticated users can update repair requests`, public timeline/photos insert, authenticated quote/courier/notification/status-history/audit inserts) are **NOT reviewed or fixed** here; the final report states this explicitly and CR-00005 claims no write-policy fix.

## Owner review — approval gate #3 (2026-08-08): REQUEST CHANGES (hold)

Owner confirmed Rev-2 closed both BLOCKERs, then requested 2 edits before approval:

1. **`tracking_token` must be NOT NULL** — an INSERT could explicitly send `NULL` and create a token-less request. Fixed in Rev 3: `ALTER TABLE repair_requests ALTER COLUMN tracking_token SET NOT NULL` runs after the backfill, before the unique index.
2. **B7 must not rely on `service_role`** (bypasses RLS, proves nothing about the staff policy). Fixed in Rev 3: B7 now proves authenticated staff access via the **RLS role harness** — `set_config('request.jwt.claims', '{"sub":"<ADMIN_UID>","role":"authenticated"}', true)` + `SET ROLE authenticated` (same claim path `auth.uid()`/`is_admin()` read), with a real admin/super_admin uid; B8 adds the negative control (authenticated non-staff → 0 rows). Anon tests (B3/B4/B5) clear `request.jwt.claims` and run under `SET ROLE anon`.
3. Reporting: CR-00005 = **RLS read-hardening + tokenized tracking identity**; the final evidence must prove the full matrix — anon ✗ select / ✗ code-access / ✓ token / ✓ non-PII shape; staff ✓ read; PII unchanged; write policies explicitly reported as a **later risk**, not security closure.

## SQL draft v3 (awaiting explicit approval — approval gate #4)

- `docs/audits/cr-00005-sql-draft.sql` — Rev 3 = Rev 2 + `ALTER COLUMN tracking_token SET NOT NULL` (after backfill, before unique index). Full statement inventory: `ALTER TABLE ADD COLUMN` ×1 (additive token column), `UPDATE` ×1 (token backfill, token column only), `ALTER TABLE ALTER COLUMN SET NOT NULL` ×1, `CREATE UNIQUE INDEX` ×1, `DROP/CREATE POLICY` ×7 each (staff-only read via `public.is_admin()`), `CREATE FUNCTION` ×1 (`get_repair_tracking`), `GRANT` ×1 (anon, authenticated). **No INSERT/DELETE/TRUNCATE, no DROP TABLE, no REVOKE, no changes to users/system_settings/audit_log/job_assignments/ads/inventory/catalog/game.**
- `docs/audits/cr-00005-verification.sql` — Rev 3: B2 checks `tracking_token` NOT NULL (`information_schema.columns.is_nullable`) + uniqueness + full tokenization; B3–B5 anon tests with cleared claims under `SET ROLE anon`; B6 RPC body evidence; B7 authenticated staff harness (not service_role); B8 authenticated non-staff negative control.
- App-side follow-up (code, separate from this SQL session): on request create, generate/read `tracking_token` and embed it in the QR link (`#/repair-tracking?token=…`); `RepairTrackingScreen` uses the RPC by token and stops rendering `customerName`/`customerPhone`/`adminNotes`/timeline for guests; staff flows unchanged.

## Current state

- Status: **CLOSED — NON-APPLICABLE / NEVER_DEPLOYED** (owner decision, 2026-08-08).
- No SQL was ever executed for CR-00005. Rev-3 remains approved-but-not-applied and is preserved verbatim (see below).

## Closure record — NON-APPLICABLE / NEVER_DEPLOYED

### Status

```text
CLOSED — NON-APPLICABLE / NEVER_DEPLOYED
```

### Reason

```text
CR-00005 was designed to harden SELECT access on the repair_* subsystem.
The repair_* subsystem is not present in the current production database.
The approved Rev-3 SQL therefore has no applicable target schema in production.
```

### Evidence

1. **Production Security Audit v4.0 (2026-08-02):** `repair_*` absent from live; `404 PGRST205` (LV-7); divergence **DV-5**; CV-3 marked "Open (لم تُطبَّق)" — not applied.
2. **CR-00005 Part A live execution (2026-08-08):** `ERROR 42P01: relation "repair_requests" does not exist`.
3. **Live inventory:** current public BASE TABLE inventory contains `ads`, `analytics_events`, `calibrations`, `campaigns`, `devices`, `placement_history`, `placements`, `qr_codes`, `sessions`, `surveys`, `users` — **no `repair_*`.**
4. **Git/repository investigation:** `00001_repair_tables.sql`, `00005_fix_repair_tables.sql`, `00006_add_repair_status_history_and_audit.sql` exist in repo (all created in commit `12e49ac`, 2026-07-31; header-only edit `8bba86e`, 2026-08-02; never modified in SQL content, never deleted).
5. **No evidence was found of:** deployment of those repair migrations; later `DROP TABLE repair_*`; intentional decommission execution; alternate production schema/environment.
6. **Selective build evidence:** the live database contains later/selected contract phases (Gate A `ALL_PRESENT — 00012 SAFE`; Gate F `M1_ATTRIBUTION_READY`; `lookup_campaign_by_short_code(text)` present), supporting the documented conclusion that the production database was not simply rebuilt by replaying every legacy migration (`docs/architecture/17-migration-dependency-map.md`: "The live database was built manually"; legacy files "listed for completeness only").

### Conclusion (evidence-bounded)

> **NEVER_DEPLOYED — based on all available repository, migration, deployment, audit, and current live-state evidence; no evidence of prior deployment or subsequent removal was found.**

> **Historical limitation:** current evidence proves absence from the inspected production state, but repository/live evidence alone cannot absolutely disprove a historical pre-audit deployment that left no trace.

### Rev-3 preservation

`docs/audits/cr-00005-sql-draft.sql` and `docs/audits/cr-00005-verification.sql` are retained **unchanged**, recorded as:

```text
APPROVED BUT NOT APPLIED
SUPERSEDED BY LIVE-SCHEMA NON-APPLICABILITY
```

No SQL from CR-00005 may be executed or adapted. **CR-00005 does not become a migration to create the repair subsystem.**

### Gate A / Gate F — recorded separately, NOT part of CR-00005

```text
Gate A = ALL_PRESENT — 00012 SAFE
Gate F = M1_ATTRIBUTION_READY
```

These results only prove readiness of other parts of the production schema. They do **not** mean CR-00005 is executable, nor that `repair_*` was deployed, nor that `repair_*` is security-closed.

### Traceability chain

```text
Discovery
→ Review Gate #1
→ Rev-2
→ Review Gate #2
→ Rev-3
→ Owner Approval #4
→ Snapshot Attempt
→ HARD STOP
→ Live Schema Divergence
→ Read-only Investigation
→ NEVER_DEPLOYED
→ CR CLOSED AS NON-APPLICABLE
```

### Next step (independent of CR-00005)

E-9 — repair_* subsystem reassessment — is opened separately as **REASSESSMENT ONLY** in `docs/audits/e9-repair-reassessment.md`. It is not a continuation of CR-00005; no technical change is authorized by this record.
