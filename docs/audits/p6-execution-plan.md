# P6 — EXECUTION PLAN (DRAFT — awaiting owner approval; NOT to be executed)

- **Date:** 2026-08-08
- **Base:** `HEAD = origin/main = d082dadf698840e9696c30092da5f07ef9f633f4`
- **Status:** DRAFT. This plan + the aligned RED gates are presented for owner review. **No production code is modified until the owner issues explicit P6 execution approval.**
- **Owner decision reference:** `docs/audits/p6-discovery-report.md`; matrix: `docs/audits/p6-dependency-reachability-matrix.md`; security: `docs/audits/p6-security-cr-00005-rls.md`.
- **Guardrails (verbatim from owner):** no SQL, no migration, no DROP, no P9, no P7/P8, no broad Research deletion, no broad Repair deletion, no modification of KEEP surfaces.

---

## 1. Approved directions (owner, 2026-08-08)

| ID | Surface | Decision | Scope in this plan |
|---|---|---|---|
| R-08 | Repair / `repair_*` | 🟡 MINIMIZE | Dormant writers removed, dead helpers removed, TEST-ONLY modules removed, IP/UA/device_info writes stopped. Feature + 8 screens + UI/engine KEPT. |
| R-10 | Popularity | 🟡 REDUCE | Remove all localStorage persistence (`popularity_events`, `popularity_scores`); remove `recordEvent`/`resetScores` (zero callers). Keep `PhonePopularity.getScore` as a pure in-memory function; catalog ranking contract preserved. |
| R-11 | Research/BI | 🟡 STRONG REDUCE | Remove `display_name` joins and full device fingerprint reads; replace `SELECT *` with explicit columns. Consoles + `scientific:read` + scientific functions KEPT. |
| R-12 | Surveys | 🔴 DELETE APP SURFACE | Delete `getSurveyAnalytics`, SurveysDashboard, nav entry, i18n keys, permissions resource, tied tests. **No DROP of the `surveys` table.** |
| 00005 | Repair public RLS | 🔴 SECURITY BLOCKER | NOT part of P6 execution. Separate CR (see section 8). |

---

## 2. Approved change registry (symbol-by-symbol)

### A. Repair — MINIMIZE (P6-05 … P6-09) — covered by RED gate 02

**A1 — P6-05 Dormant customer search removed**
- `src/core/supabase/repair-data-service.ts:158` `getRepairRequestsByName` — DELETE method
- `src/core/supabase/repair-data-service.ts:164` `getRepairRequestsByPhone` — DELETE method
- `src/services/repair/repair-database.ts:182-197` facade `getRepairRequestsByName` / `getRepairRequestsByPhone` — DELETE
- Callers: none (verified). DB index `idx_repair_requests_customer_name` stays (DB-side, P9).

**A2 — P6-06 Dormant notifications/photos writers removed**
- `src/core/supabase/repair-data-service.ts:240,248,258,266` `getAllNotifications`, `saveNotification`, `getAllPhotos`, `savePhoto` — DELETE
- `src/services/repair/repair-database.ts:271-305` facade methods — DELETE

**A3 — P6-07 Dead WhatsApp helpers removed**
- `src/services/repair/repair-whatsapp.ts:17` `sendStatusWhatsApp` — DELETE (keep ACTIVE `sendRepairRequestWhatsApp` used by `RepairRequestScreen.tsx:11`)
- `src/services/whatsapp-service.ts:102` `openRepairStatus` — DELETE

**A4 — P6-08 TEST-ONLY modules removed**
- `src/services/repair/repair-engine.ts` — DELETE (also carries `collectDeviceInfo`/`collectIp` at :23-24,58,79)
- `src/services/repair/repair-bi.ts` — DELETE
- `src/__tests__/repair/repair.test.ts` — remove engine/bi coverage (`:6` import, `:249` `getRepairBIData` block); keep repair-database/service coverage

**A5 — P6-09 PII write minimization in the runtime chain**
- `src/services/repair/repair-repository.ts:25` `collectDeviceInfo` — DELETE; `:31` stop passing `userAgent`/`ipAddress` on status entries
- `src/core/supabase/repair-data-service.ts:287-288` stop mapping `ip_address`/`device_info` on `repair_status_history` insert; `:295,303-304` drop columns from the history select/read mapping
- `src/core/supabase/repair-data-service.ts:314` stop mapping `ip_address`/`user_agent` on `repair_audit_log` insert; `:321,329` drop columns from audit select/read mapping
- Schema types (`src/core/supabase/schema.ts:201-202,213-214`) and DB columns REMAIN (no SQL/DROP; P9 territory). `RepairStatusHistory`/`RepairAuditLog` field types unchanged; empty-string where the write path previously passed a value.

**Functional KEEP under A:** 8 repair screens (App.tsx:37-53 lazy routes), `RepairDataService` writes to `repair_requests`/`repair_quotes`/`repair_timeline`/`repair_courier_jobs`, `RepairQR`, `RepairTimeline`, `sendRepairRequestWhatsApp`, `repair_*` localStorage fallback.

### B. Popularity — REDUCE (P6-10) — covered by RED gate 03

- `src/services/popularity-engine.ts:56` `saveEvents` localStorage write — REMOVE persistence (in-memory only)
- `:46-47` `loadEvents` localStorage read — REMOVE persistence (in-memory only)
- `:130-136` `persistScores` + its call `:125` — DELETE (no `popularity_scores` write)
- `:167-179` `recordEvent` — DELETE (zero callers)
- `:229-235` `resetScores` — DELETE (storage-only)
- `:43-52,60-128,202-257` — KEEP pure in-memory computation over the (now always-empty) events map; `getScore`/`getAllScores`/`getTopDevices`/`searchByPopularity`/`getTrend`/`getMostPopularBrand` return deterministic neutral values
- `src/services/catalog-service.ts:5,20,27,34` — KEEP `PhonePopularity.getScore` ranking call (contract preserved)
- Note: `src/hooks/useViewCounter.ts` (`showroom_view_counts`) is **Showroom KEEP** — NOT touched.

### C. Research / BI — STRONG REDUCE (P6-11, P6-12) — covered by RED gate 04

**api-supabase.ts (research console)**
- `:576` users select `'id, display_name, role'` → drop `display_name` → `'id, role'`
- `:607` `user?.display_name ?? …` userName fallback → role-based label only
- `:579` devices select (full fingerprint: `os, os_version, browser, browser_version, platform, screen_width, screen_height, refresh_rate, memory_gb, cpu_cores, pointer_type, touch_support, pixel_ratio, language, timezone, user_agent`) → reduce to functional subset needed for brand/model/OS display (`id, os, browser, platform, user_agent` — `user_agent` kept for `parseDeviceBrandModel` at :598)
- `:640` `devices.select('*')` → explicit column list
- `:672` `devices.select('*')` → explicit column list
- `:598/:719` `user_agent` parse — KEEP (functional brand/model derivation)

**business-intelligence/api.ts**
- `:38` `users.select('id, display_name, role')` (getCommandCenter) → drop `display_name` → `'id, role'`; `:112` `displayName: userObj?.display_name` → remove
- `:149` `users.select('*')` → explicit `'id, display_name, role, created_at'` (customer-profile staff view KEEPS name explicitly — functional)
- `:150` `sessions.select('*')` → explicit columns
- `:151` `trade_requests.select('*')` → explicit columns
- `:66/:103/:169` single-column `user_agent` reads — KEEP (device-intelligence brand/model parsing is the function)

### D. Surveys — DELETE APP SURFACE (P6-13) — covered by RED gate 05

- `src/core/research/api-supabase.ts:223` interface `getSurveyAnalytics` — DELETE; `:844-869` impl (incl. `:845` `from('surveys').select('*')`) — DELETE
- `src/core/research/api.ts:123` interface member + `:275` mock impl — DELETE (api.ts file itself is PENDING R-13; surveys block removed regardless)
- `src/research-console/pages/surveys/SurveysDashboard.tsx` — DELETE file
- `src/research-console/ResearchConsole.tsx:13,28,44,60` — remove import, tab id, tab list entry, mapping
- `src/research-console/layout/ResearchLayout.tsx:14,23` — remove `'surveys'` nav item
- `src/core/research/permissions.ts:38,48` — remove `surveys` resource entries
- i18n keys: `research.surveys` (en:258, ar:242, fr:223, tr:242) and `research.nav.surveys` (en:589, ar:569, fr:353, tr:569) — DELETE
- Tests: `src/__tests__/research/api.test.ts:139-…` getSurveyAnalytics block; `src/__tests__/research-console/sidebar-navigation.test.tsx:7` remove `'surveys'`; `src/__tests__/research-console/no-key-warnings.test.tsx:12,27` remove SurveysDashboard (keep `resetRepairDataService` at :5,42); `src/__tests__/research/permissions.test.ts:130` surveys capability case
- **No DROP of the `surveys` table.**

---

## 3. PENDING-CONFIRMATION items (NOT approved; owner must tick each at plan review)

| ID | Item | Evidence | Proposed action |
|---|---|---|---|
| R-01 | `src/services/customer-memory.ts` | DEAD, zero importers, PII-capable | DELETE (+ nothing else) — **owner to confirm** |
| R-02 | `src/services/device-ledger.ts` + `__tests__/device-ledger.test.ts` + golden-audit ledger section | DORMANT, zero production callers, IMEI/serial/counterparty | DELETE + trim golden-audit — **owner to confirm** ("unless independently proven removable") |
| R-13 | `src/core/research/api.ts` + `src/core/research/index.ts` barrel | TEST-ONLY/DEAD, zero production importers | DELETE + migrate `__tests__/research/api.test.ts` | 
| R-14 | `HeatmapChart.tsx`, `FunnelChart.tsx`, `ExportUtils.ts` | DEAD components | DELETE |
| R-15 | `maybe-single-behavior.test.ts` mock | mocks P5-removed RPC | rewrite to generic RPC name |
| R-20 | `live-sessions.ts`, `session-repository.ts` (+ core/index.ts trim) | DEAD/DORMANT | DELETE (P5 note; optional) |

Gate 06 currently carries P6-17 (R-15) and P6-18 (R-14) as RED; gate 01 now **protects** R-01/R-02 (REASSESS/PRESERVE). None of the above is executed without explicit confirmation.

---

## 4. File-by-file change list (production + tests)

**APPROVED — will change on execution:**
1. `src/core/supabase/repair-data-service.ts` (A1,A2,A5)
2. `src/services/repair/repair-database.ts` (A1,A2)
3. `src/services/repair/repair-repository.ts` (A5)
4. `src/services/repair/repair-whatsapp.ts` (A3)
5. `src/services/whatsapp-service.ts` (A3)
6. `src/services/repair/repair-engine.ts` (A4 — delete)
7. `src/services/repair/repair-bi.ts` (A4 — delete)
8. `src/services/popularity-engine.ts` (B)
9. `src/core/research/api-supabase.ts` (C,D)
10. `src/core/research/api.ts` (D only — surveys block; full file PENDING R-13)
11. `src/business-intelligence/api.ts` (C)
12. `src/research-console/pages/surveys/SurveysDashboard.tsx` (D — delete)
13. `src/research-console/ResearchConsole.tsx` (D)
14. `src/research-console/layout/ResearchLayout.tsx` (D)
15. `src/core/research/permissions.ts` (D)
16. `src/i18n/translations/en.ts`, `ar.ts`, `fr.ts`, `tr.ts` (D)
17. `src/__tests__/repair/repair.test.ts` (A4)
18. `src/__tests__/research/api.test.ts` (D block)
19. `src/__tests__/research-console/sidebar-navigation.test.tsx` (D)
20. `src/__tests__/research-console/no-key-warnings.test.tsx` (D)
21. `src/__tests__/research/permissions.test.ts` (D)

**PENDING-CONFIRMATION (only if owner approves):** per section 3.

**NOT touched (KEEP / REASSESS-PRESERVE):** App.tsx routes, all repair screens/components, ResearchConsole layout beyond surveys, business-intelligence console/actions, catalog-service (beyond unchanged popularity contract), useViewCounter, Game/Ads/Inventory/Catalog SSOT/Showroom/Similar/WhatsApp/Theme/AI Coach, `users` table reads, `system_settings`/`audit_log`/`job_assignments`/contract tables (zero app references), device-ledger/customer-memory (protected by gate 01).

---

## 5. Test impact map

| Test file | Change | Affected by |
|---|---|---|
| `src/__tests__/repair/repair.test.ts` | remove engine/bi coverage; keep DB/service | A4 |
| `src/__tests__/research/api.test.ts` | remove getSurveyAnalytics block | D |
| `src/__tests__/research/permissions.test.ts` | remove surveys capability case | D |
| `src/__tests__/research-console/sidebar-navigation.test.tsx` | remove 'surveys' entry | D |
| `src/__tests__/research-console/no-key-warnings.test.tsx` | remove SurveysDashboard entry; keep resetRepairDataService | D |
| `src/__tests__/showroom/useViewCounter.test.ts` | **none** | Showroom KEEP |
| `src/__tests__/auth/auth.test.ts` | **none** (display_name in auth mock is unrelated) | — |
| P6 gates 01/07 | must stay GREEN (protection) | — |
| P6 gates 02/03/04/05 | must flip RED→GREEN | execution |
| P6 gate 06 | P6-17/18 only if confirmed | R-14/R-15 |

Verification after execution (owner-authorized only): `tsc --noEmit`, `eslint src/`, full vitest suite, `vite build`, plus the privacy gate suite.

---

## 6. Execution order (fires ONLY after explicit owner approval)

1. Take the snapshot (status as of this plan) for the execution report.
2. Apply Approved registry (sections 2A-2D) — production + tests together.
3. Apply any confirmed PENDING items (section 3) if approved.
4. Run P6 privacy gates: gates 02/03/04/05 must be GREEN; gates 01/07 and 06 invariants stay GREEN.
5. Run full suite + tsc + eslint + build.
6. Write `p6-execution-report.md`, including evidence per gate.
7. **Independent commit** of the change (untracked artifacts remain untracked unless owner says otherwise).
8. **HARD STOP.** (Do not push. Do not open the 00005 SQL session. Do not start P7/P8/P9.)

## 7. Explicit non-goals for execution
No SQL, no migration, no DROP (incl. no `surveys`/`repair_*` DROP, no RLS change, no index drop), no P7/P8/P9, no commit of audit artifacts without instruction, no changes to KEEP surfaces, no changes to `users`/contract tables, no changes to device-ledger/customer-memory.

## 8. 00005 RLS security blocker
See `docs/audits/p6-security-cr-00005-rls.md` — a standalone change request with its own lifecycle. It is NOT executed here.

---

**HARD STOP — P6 EXECUTION PLAN DRAFT COMPLETE — AWAITING EXPLICIT P6 EXECUTION APPROVAL.**
