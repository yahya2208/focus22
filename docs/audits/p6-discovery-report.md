# P6 — REASSESS DISCOVERY REPORT (READ-ONLY)

- **Date:** 2026-08-08
- **Base:** `HEAD = origin/main = d082dadf698840e9696c30092da5f07ef9f633f4`
- **Status:** P4 `eedcf92` CLOSED, P5 `d082dad` CLOSED, P5 Independent Review **GREEN**.
- **Mode:** DISCOVERY ONLY + RED GATE DESIGN. **No production file modified. No SQL executed. No DROP. No migration. No commit. No push.**
- **Method:** every writer and reader traced from current HEAD source (no reliance on prior reports); every item classified ACTIVE / DORMANT / DEAD / TEST-ONLY with exact `file:line` evidence.
- **Companion artifacts:**
  - Matrix: `docs/audits/p6-dependency-reachability-matrix.md`
  - RED gates: `src/__tests__/privacy/p6-red-gate-01..06-*.test.ts` (intentionally RED — 31 failing / 3 passing today)

---

## Deliverable 1 — Discovery findings (executive)

The REASSESS scope contains **three distinct reality classes**:

1. **Genuinely persistent personal-data surfaces still live in the app:**
   - **Repair subsystem** (owner items 1, 2) — ACTIVE business feature storing customer PII (name, phone, address, GPS, base64 photos, ip/user_agent) in Supabase `repair_*` tables **with public RLS read policies** and in a localStorage fallback. Single writer: `RepairDataService`. 8 screens routed in `App.tsx`.
   - **Research / BI consoles** (owner item 6) — ACTIVE, role-gated (`scientific:read`, analyst+), **read-only**; expose identity (`display_name`) and full device fingerprints (`user_agent`, `timezone`, …) via `getSessionList` / `getCustomerProfile` (`SELECT *`).
   - **Surveys** (owner item 7) — ACTIVE read-only aggregate dashboard over a `surveys` table holding demographic PII; **no writer, no user-facing collector exists** in the app.
   - **Popularity** (owner item 5) — anonymous (brand/model counters), but `catalog-service.searchCatalog` persists `popularity_scores` into localStorage on every search; `recordEvent` (events) has zero callers.

2. **Personal-data-capable modules that are already DEAD / DORMANT in production:**
   - `customer-memory.ts` — DEAD (zero importers, tests included); PII-capable schema.
   - `device-ledger.ts` — DORMANT (zero production callers; tests + read-only CLI audit); **IMEI/serial/counterparty** — highest PII of any local module.

3. **DB-side-only objects with zero app code:**
   - `system_settings`, `audit_log`, `job_assignments` (+ contract columns/RPC/backfill, migrations 00009-00013) — deferred, **never referenced by src**.
   - `campaigns`, `qr_codes`, `analytics_events`, `placements`, `placement_history` (telemetry/QR leftovers, P5 removed all app use).
   - `trade_requests` — read by BI only; **no writer, no CREATE TABLE migration found** (BI reads resolve to empty unless table exists in live DB).
   - `inventory_*` — migration 00014 is marked DRAFT/NOT EXECUTED; app inventory is localStorage-only.

**AI Coach (owner item 9) is KEEP:** pure in-memory statistics over current-run sessions; zero network, zero storage, zero identity, zero chat. `users` (owner item 10) is KEEP: the `public.users` table is only **read** for the auth role gate; no app writer (account creation is `supabase.auth` → `auth.users`, DB-side trigger only).

---

## Deliverable 2 — Dependency / reachability matrix

See `docs/audits/p6-dependency-reachability-matrix.md` (per-surface tables, writer/reader chains, PII fields, `file:line` evidence).

---

## Deliverable 3 — Proposed classification (KEEP / DELETE / REASSESS)

| # | Surface | Reachability | Proposal | Basis |
|---|---|---|---|---|
| R-01 | `customer-memory.ts` + keys | DEAD | **DELETE** | zero callers; PII-capable schema |
| R-02 | `device-ledger.ts` + `device-ledger.test.ts`; golden-audit ledger section | DORMANT | **DELETE** (trim ledger section from golden-audit) | zero production callers; IMEI/serial/counterparty PII |
| R-03 | Repair dormant methods: `getRepairRequestsByName`, `getRepairRequestsByPhone` | DORMANT | **DELETE** (+ drop `idx_repair_requests_customer_name` DB-side) | no runtime callers |
| R-04 | Repair dormant notifications/photos: `getAllNotifications`, `saveNotification`, `getAllPhotos`, `savePhoto` | DORMANT | **DELETE** | no runtime callers; base64 photo write path not wired |
| R-05 | `sendStatusWhatsApp` (repair-whatsapp.ts), `openRepairStatus` (whatsapp-service.ts) | DEAD | **DELETE** | zero importers |
| R-06 | `repair-engine.ts`, `repair-bi.ts` | TEST-ONLY | **DELETE** (with their tests in `__tests__/repair/repair.test.ts`) | production reachable nowhere |
| R-07 | Repair PII writes: `navigator.userAgent` capture in `repair-repository` (:25/:31); `ip_address`/`user_agent`/`device_info` persists in `addStatusHistory`/`addAuditLog` | ACTIVE | **REASSESS → minimize** (stop writing these three columns app-side) | not required for the repair workflow |
| R-08 | Repair feature + `repair_requests`/`repair_quotes`/`repair_timeline`/`repair_courier_jobs` PII columns | ACTIVE | **KEEP feature**; REASSESS columns (phone/name/address/GPS) and RLS posture | legitimate business feature; **owner decision required** on column minimization vs full removal |
| R-09 | Public RLS read on `repair_requests`/`repair_timeline` (`00005:38-40,53`) | DB-side | **REASSESS → restrict** (tracking-by-code only; drop anonymous `using (true)` name/phone read) | exposes customer PII to anonymous clients |
| R-10 | `catalog-service.searchCatalog` → `PhonePopularity.getScore` (persists `popularity_scores`) | ACTIVE | **REASSESS** — owner decision: (a) strip write path (gate P6-10) or (b) KEEP (anonymous ranking). Recommend (a): no caller of `recordEvent`, scores always recomputed from empty events | anonymous data; events tracking already dead |
| R-11 | Research/BI identity reads (`display_name`, device fingerprints, `SELECT *` on users/devices/sessions) | ACTIVE (role-gated) | **REASSESS → minimize** (remove identity joins; keep aggregate analytics) | admin consoles need aggregates, not identities |
| R-12 | Surveys read surface (`getSurveyAnalytics` + SurveysDashboard) | ACTIVE (read-only) | **REASSESS → DELETE** (no collector exists; table is stale) | no app writer / user flow; aggregate-only dashboard |
| R-13 | `core/research/api.ts` + `index.ts` barrel | TEST-ONLY/DEAD | **DELETE** (migrate tests to mock or drop) | no production importer |
| R-14 | `HeatmapChart.tsx`, `FunnelChart.tsx`, `ExportUtils.ts` | DEAD | **DELETE** | zero importers |
| R-15 | `maybe-single-behavior.test.ts` `lookup_campaign_by_short_code` mock | TEST-ONLY | **DELETE/rewrite** (mock removed RPC) | RPC removed in P5 |
| R-16 | `system_settings`, `audit_log`, `job_assignments` (00009-00013) | DB-only | **NO APP ACTION** (no app code). DB reassessment only if applied; `verify-live-schema` GATE C expects "never applied" | zero src references |
| R-17 | AI Coach (`src/ai/coach/**`, CoachScreen) | ACTIVE | **KEEP** | no data, no persistence, no identity |
| R-18 | `users` table + auth role read | ACTIVE | **KEEP** | auth gate depends on `users.role`; no app writer |
| R-19 | `bi_*` localStorage sandboxes (`bi_staff` etc.) | ACTIVE | **REASSESS** (owner): data-at-rest staff identity; isolate or remove | admin tooling only |
| R-20 | `live-sessions.ts`, `session-repository` (barrel) | DEAD / DORMANT | **DELETE** (P6 optional cleanup; P5 left them in place) | no production importer |

---

## Deliverable 4 — RED gates for every proposed P6 removal

Files under `src/__tests__/privacy/` (untracked test artifacts, consistent with P4/P5 gates). **Status verified by execution on HEAD d082dad: 31 failing / 3 passing.** These are intentionally RED (the P6 pre-execution state) and turn GREEN after P6 execution.

| Gate file | Proposals covered | Current status |
|---|---|---|
| `p6-red-gate-01-localstorage-pii-removal.test.ts` | R-01, R-02 | **0/6** RED |
| `p6-red-gate-02-repair-dormant-and-pii.test.ts` | R-03, R-04, R-05, R-06, R-07 | **0/11** RED |
| `p6-red-gate-03-popularity-tracking.test.ts` | R-10 | **0/3** RED (decision-dependent) |
| `p6-red-gate-04-research-bi-identity-reads.test.ts` | R-11 | **0/6** RED (decision-dependent) |
| `p6-red-gate-05-surveys-read-only.test.ts` | R-12 | **0/3** RED (decision-dependent) |
| `p6-red-gate-06-invariants.test.ts` | R-13, R-14, R-15 (RED) + invariants P6-14/15/16 (GREEN) | **3/5** (3 GREEN invariants + 2 RED) |

Invariants already GREEN today (must not regress): live-sessions and session-repository have no production importer; no app reference to system_settings/audit_log/job_assignments/contracts tables.

**Note on scope control:** gates 03/04/05 are authored for the **recommended** direction but are decision-dependent — the owner must confirm each before P6 execution; any rejected direction drops its gate. Gates never required the execution to run the suite; after execution they must be run to confirm GREEN.

---

## Deliverable 5 — Explicit list of files that would change during a future P6 execution

Production (app) files:
1. `src/services/customer-memory.ts` — DELETE
2. `src/services/device-ledger.ts` — DELETE
3. `src/database/golden-audit.ts` — trim `auditLedger` section (:306-353, :587)
4. `src/core/supabase/repair-data-service.ts` — DELETE dormant methods (R-03/04); remove ip/user_agent/device_info columns from `addStatusHistory` (:283-289) and `addAuditLog` (:310-316) reads/writes
5. `src/services/repair/repair-database.ts` — DELETE dormant facade methods (:182-193, :271-305)
6. `src/services/repair/repair-repository.ts` — remove `collectDeviceInfo`/`navigator.userAgent` (:25, :31) and ip/device capture (:38-40)
7. `src/services/repair/repair-whatsapp.ts` — DELETE `sendStatusWhatsApp` (:17-…)
8. `src/services/whatsapp-service.ts` — DELETE `openRepairStatus` (:102-…)
9. `src/services/repair/repair-engine.ts` — DELETE
10. `src/services/repair/repair-bi.ts` — DELETE
11. `src/services/catalog-service.ts` — remove `PhonePopularity.getScore` call + `popularityScore` (:5, :20, :27, :33-34) if R-10(a) approved
12. `src/services/popularity-engine.ts` — DELETE (or strip write path) if R-10(a) approved
13. `src/core/research/api-supabase.ts` — remove identity/fingerprint selections (R-11); remove `getSurveyAnalytics` (:844-869) (R-12)
14. `src/core/research/api.ts` — DELETE (R-13)
15. `src/core/research/index.ts` — DELETE barrel (R-13)
16. `src/business-intelligence/api.ts` — remove `display_name`/`user_agent`/`SELECT *` reads (R-11)
17. `src/research-console/pages/surveys/SurveysDashboard.tsx` — DELETE (R-12)
18. `src/research-console/ResearchConsole.tsx` — remove surveys dashboard entry (R-12)
19. `src/research-console/layout/ResearchLayout.tsx` — remove `'surveys'` nav entry (R-12)
20. `src/research-console/components/HeatmapChart.tsx` — DELETE (R-14)
21. `src/research-console/components/FunnelChart.tsx` — DELETE (R-14)
22. `src/research-console/components/ExportUtils.ts` — DELETE (R-14)
23. `src/core/supabase/live-sessions.ts` — DELETE (R-20)
24. `src/core/supabase/session-repository.ts` — DELETE (R-20) + trim `src/core/index.ts` exports
25. `src/i18n/translations/{en,ar,fr,tr}.ts` — remove orphaned keys (`research.surveys`, unused `coach.*`, `surveys.*` if R-12 approved)

Test files that would change:
26. `src/__tests__/device-ledger.test.ts` — DELETE (R-02)
27. `src/__tests__/repair/repair.test.ts` — remove engine/bi coverage, adapt (R-06)
28. `src/__tests__/research/api.test.ts` — rewrite/remove (R-13)
29. `src/__tests__/supabase/maybe-single-behavior.test.ts` — remove RPC mock (R-15)
30. `src/__tests__/research-console/no-key-warnings.test.tsx`, `sidebar-navigation.test.tsx` — drop SurveysDashboard refs (R-12)

Audit/report files (untracked, not production):
31. `docs/audits/p6-discovery-report.md` (this file), `docs/audits/p6-dependency-reachability-matrix.md` — UPDATE on execution
32. `src/__tests__/privacy/p6-red-gate-*.test.ts` — remain as GREEN gates after execution

---

## Deliverable 6 — Explicit list of DB objects that would eventually require reassessment

App-side (no SQL executed in P6 Discovery; these are the objects a future authorized phase must revisit):
1. `repair_requests` — PII columns `customer_name`, `customer_phone`, `customer_id`, `latitude`, `longitude`, `google_maps_link`, `photo_paths`; unique `idx_repair_requests_code_unique`; `idx_repair_requests_customer_name`
2. `repair_courier_jobs` — PII `courier_name`, `customer_name`, `customer_phone`, `customer_address`, GPS
3. `repair_status_history` — `ip_address`, `device_info` (00006)
4. `repair_audit_log` — `ip_address`, `user_agent` (00006)
5. `repair_quotes`, `repair_timeline`, `repair_notifications`, `repair_photos` — retention/posture
6. **RLS policies** `00005:38-40` public read on repair_requests, `:53-54` public timeline, `:66` public photos insert
7. `surveys` — demographic PII; no app writer (decommission candidate)
8. `users` — role gate read (KEEP); display_name exposure via console reads
9. `devices` — fingerprint columns (user_agent, timezone, screen, memory, cpu, pointer, touch, pixel_ratio)
10. `sessions` — `user_id`, `device_id`, `metadata`, `measurements`, `scientific_results`
11. `trade_requests` — no writer/no migration found; BI-only reads
12. `calibrations` — research-only reads
13. `campaigns`, `qr_codes`, `analytics_events`, `placements`, `placement_history`, RPCs `lookup_campaign_by_short_code(_v2)`, `lookup_scan_context` — telemetry/QR leftovers (P5 removed app use)
14. Deferred contract objects (00009-00013): `system_settings`, `audit_log`, `job_assignments`, contract columns, contract RPC — **never applied per GATE C expectation**; no app dependency
15. `inventory_*` (00014) — DRAFT/not executed; app uses localStorage
16. Trigger/function `handle-new-user` (phase-c C2b) — DB-side account bootstrap for `public.users`
17. `repair_*` localStorage keys (client-side, not DB): `repair_requests_v1` etc., `repair_couriers`, `repair_technicians`, plus `device_ledger_v1`, `customer_memory_*`, `popularity_*`, `focus_sessions*`, `bi_staff`

---

## Deliverable 7 — Blockers and contradictions

1. **Public RLS read on repair PII (00005:38-40) contradicts the decommission posture.** Even with app-side minimization, `repair_requests`/`repair_timeline` are anonymous-readable. Any RLS change is **SQL** — blocked outside P6 Discovery, needs its own authorized phase.
2. **Repair feature dependency:** `repair_*` writes are reachable through the repository facade from 8 routed screens; removing the feature (vs minimizing) would delete routes (`App.tsx:84-91`) and screens — a product decision, not just a privacy one. Flagged as **owner decision (R-08)**.
3. **Popularity (R-10), Research/BI (R-11), Surveys (R-12) gates are decision-dependent.** Removing them changes catalog ranking behavior and admin-console content. Authorized RED gates 03/04/05 reflect the recommended direction; owner confirmation required.
4. **`trade_requests` mismatch:** BI reads a table with no CREATE TABLE migration in this repo. If the live DB lacks it, `getCommandCenter`/`getCustomerProfile` silently read empty — a latent contradiction worth noting for the DB inventory.
5. **`surveys` has no collector:** the table aggregates foreign/legacy data; the dashboard displays aggregates only, but reads `SELECT *` (full PII rows) over the wire. Removal is safe app-side (no writer); DB-side needs separate authorization.
6. **`maybe-single-behavior.test.ts` is a library-behavior probe** that mocks a P5-removed RPC name; it is the only `.rpc()` reference left and must be rewritten to an arbitrary RPC name (its purpose is the supabase-js maybeSingle contract, not campaigns).
7. **No contradiction found** between current code and the P5 Independent Review verdict: KEEP/REASSESS surfaces verified intact at HEAD; the four P5 low-severity notes (live-sessions DEAD, stale stageLabels, stale vi.mock, maybe-single mock) are all captured here as P6 items (R-20, R-15).
8. **Untracked-artifact convention:** this report, the matrix, and the 6 RED gate files are untracked (as are P4/P5 gates and reports). They must not be committed without explicit owner instruction.

---

## Deliverable 8 — Independent verification commands (read-only)

```powershell
# Git integrity
git rev-parse HEAD                                    # expect d082dadf698840e9696c30092da5f07ef9f633f4
git status --porcelain                                # expect only untracked audit/gate artifacts
git diff --stat eedcf926..d082dad                     # expect 100 files, +259/-11147

# Reachability re-verification (queries — safe)
# Writers of repair_* tables (expect only repair-data-service.ts)
#   grep -n "\.from('repair_" src/core/supabase/repair-data-service.ts
# Readers/writers of personal tables (expect zero insert/upsert/update/delete)
#   grep -rn "\.from('surveys'\|\.from('users'\|\.from('devices'\|\.from('sessions'\|\.from('calibrations'\|\.from('trade_requests'" src
# RPC surface (expect zero production hits)
#   grep -rn "\.rpc(" src --include=*.ts --include=*.tsx

# Gates (expect: gates 01-05 RED, gate 06 3 GREEN invariants + 2 RED)
node node_modules/vitest/vitest.mjs run src/__tests__/privacy/p6-red-gate-0*.test.ts

# Green suite baseline (expect 107 files / 1045 passed, 20.2s)
node node_modules/vitest/vitest.mjs run

# Static checks
node_modules/.bin/tsc --noEmit                        # expect exit 0
node_modules/.bin/eslint src/                         # expect 0 errors
node_modules/.bin/tsc -b && node_modules/.bin/vite build   # expect success
```

---

## Scope compliance
- No production code modified. No files deleted. No routes deleted. No tables dropped. No SQL executed. No migrations created. No RLS/policies/triggers/functions changed. No commit. No push. KEEP surfaces untouched. P7/P8/P9 not started.
- New artifacts are **test-only** (6 RED gate files) and **docs** (report + matrix) — both untracked, per convention.

---

**HARD STOP — P6 DISCOVERY COMPLETE — WAITING FOR OWNER APPROVAL.**
