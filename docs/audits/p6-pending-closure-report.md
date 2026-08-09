# P6 — PENDING-CONFIRMATION CLOSURE REPORT (READ-ONLY EVIDENCE)

- **Date:** 2026-08-08
- **Base:** `HEAD = origin/main = d082dadf698840e9696c30092da5f07ef9f633f4`
- **Mode:** READ-ONLY evidence. No production code modified, no SQL, no migration, no DROP, no commit, no push.
- **Owner directive:** close the PENDING-CONFIRMATION items (R-01/R-02, R-13, R-14, R-15, R-20, CR-00005) with precise evidence before any P6 execution decision.
- **Related docs:** `p6-discovery-report.md`, `p6-dependency-reachability-matrix.md`, `p6-execution-plan.md` (organizational draft), `p6-security-cr-00005-rls.md`.

---

## R-01 / R-02 — customer-memory / device-ledger → **KEEP / PRESERVE (confirmed)**

Owner decision: keep both, no deletion in P6. This is already enforced by the protection gate:

- `src/__tests__/privacy/p6-red-gate-01-localstorage-pii-removal.test.ts` (P6-PROTECT) asserts:
  - `services/customer-memory.ts` **exists** and has zero production importers — **GREEN**.
  - `services/device-ledger.ts` **exists** and has zero production importers — **GREEN**.
  - `__tests__/device-ledger.test.ts` still exists; `golden-audit.ts` still reads `device_ledger_v1` (read-only audit) — **GREEN**.
- **Status:** CLOSED as PRESERVE. No further action. Both stay dormant-but-present.

---

## R-13 — `core/research/api.ts` → evidence for decision (NOT executed)

### What it is
`src/core/research/api.ts` (325 lines) is the **in-memory/mock implementation** of `ResearchAPI` (overview/scientific/user/session/device/survey analytics, live events, system health). It **duplicates its own type definitions** (`OverviewStats`, `ScientificMetrics`, `UserAnalytics`, `SessionAnalytics`, `DeviceAnalytics`, `SurveyAnalytics`, `LiveEvent`, `SystemHealth`, `ResearchAPI` at :5-127). The real DB-backed implementation `api-supabase.ts` is **self-contained** — it imports only `./filters`, `../supabase/client`, `../device/parser` (api-supabase.ts:1-3) and declares its own copies of these types (:5-…). `api.ts` is not imported by `api-supabase.ts`.

### Affected symbols (if deleted)
- `createResearchAPI` (api.ts:137) + the 9 implemented interface methods (getOverview :187, getScientific :233, getUserAnalytics :237, getSessionAnalytics :256, getDeviceAnalytics :267, getSurveyAnalytics :275, getLiveEvents :283, addLiveEvent :287, getSystemHealth :292), plus all exported types (:5-127).
- In the barrel `src/core/research/index.ts`: the re-export block :35-40 (`createResearchAPI`, `type ResearchAPI`, `OverviewStats`, …). The barrel also re-exports permissions/filters/charts/cohort/export (KEEP those).

### Callers (complete)
| Caller | Import | Production? |
|---|---|---|
| `src/__tests__/research/api.test.ts:2` | `createResearchAPI` from `../../core/research/api` | **NO — test only** (~18 call sites :35-202) |
| All research-console dashboards (Users :2, System :2, Surveys :2, Sessions :2, Scientific :2, Overview :2, Devices :2) | `createResearchAPI` from `…/core/research/api-supabase` | YES |
| `src/business-intelligence/api.ts:1` | `createResearchAPI` from `../core/research/api-supabase` | YES |

The barrel `core/research/index.ts` has **zero importers** across the tree (verified: no `from '…/core/research'` import exists).

### Impact on kept Research/BI → **NONE**
- Production Research console and BI use `api-supabase.ts` exclusively. Deleting `api.ts` breaks nothing in production.
- What remains: `api-supabase.ts` (active DB API), `permissions.ts`, `filters.ts`, `charts.ts`, `cohort.ts`, `export.ts` (active research export service), all dashboards, BI.

### Test impact
- `__tests__/research/api.test.ts` tests only the mock. It must be **rewritten against `api-supabase` with a mocked Supabase client** (keeping the valuable computation assertions) or **removed**. No other test imports `api.ts`.

### Recommendation (owner decision required)
- **REMOVE `api.ts`** + drop its re-export block from the barrel (keep the barrel). Zero production impact; test-only. Low urgency (no user-facing effect).
- Alternative: KEEP as a reference mock (harmless, but permanent dead weight).

---

## R-14 — HeatmapChart / FunnelChart / ExportUtils → evidence for decision (NOT executed)

### Reachability (zero importers — verified across full `src`)
| File | Purpose | Importers (prod) | Importers (tests) | Classification |
|---|---|---|---|---|
| `research-console/components/HeatmapChart.tsx` | 7-day × 24-hour **scan-count heatmap** (`val scans` :38) | **0** | 0 | **DEAD** |
| `research-console/components/FunnelChart.tsx` | **Campaign conversion funnel** — uses `t('campaign.fromPrev')` (:29) | **0** | 0 | **DEAD** |
| `research-console/components/ExportUtils.ts` | generic CSV/XLS/JSON download helpers (`exportCSV`/`exportExcel`/`exportJSON`) | **0** | 0 | **DEAD** |

### Are these P5 analytics/QR surfaces or kept Research/BI surfaces?
- **They are P5-analytics leftovers, NOT kept Research/BI.** Evidence:
  - HeatmapChart renders scan counts (the campaign/QR scan analytics data source was removed in P5; the DB RPCs `lookup_campaign_by_short_code` etc. were removed).
  - FunnelChart renders campaign conversion funnels and is the **only** remaining consumer of the orphaned i18n key `campaign.fromPrev` (en:424, ar:404, tr:404; missing in fr).
  - ExportUtils duplicates what the kept research export service `core/research/export.ts` already provides (`exportToCsv`/`exportToJson`/`exportScientificDataset`/…, used by `__tests__/research/export.test.ts`).
- **None of the three is imported by the kept Research/BI console.** The kept console uses `core/research/charts.ts` (`computeHeatmapLayout`, etc.) and `core/research/export.ts` — different modules.

### Recommendation (owner decision required)
- **REMOVE all three (DEAD).** Zero production/test impact (no importers). No i18n removal is proposed; `campaign.fromPrev` becomes fully orphaned and can be swept in a later cleanup if approved.

---

## R-15 — maybe-single RPC → evidence for decision (NOT executed)

### Facts
- `lookup_campaign_by_short_code` appears **only** in `src/__tests__/supabase/maybe-single-behavior.test.ts` (:40, :58, :72, :103, :104).
- The test **stubs global `fetch`** (`vi.stubGlobal('fetch')` :21, :100) — it never reaches a real Supabase project or a real RPC. The RPC name is an **arbitrary string fixture** used to exercise the `@supabase/supabase-js` `.maybeSingle()` contract.
- The actual DB RPC was removed in P5 (campaign/QR telemetry removal).
- The **only runtime `.rpc()` in production** is `has_super_admin` in `src/screens/auth/AdminSetupScreen.tsx:26` — unrelated to campaigns, KEEP.

### Classification
| Surface | Type |
|---|---|
| `lookup_campaign_by_short_code` in the test | **mock/test-only fixture** (never runtime-reachable; references a removed RPC) |
| `.rpc()` calls in production | only `has_super_admin` (KEEP) |

### Recommendation (owner decision required)
- **Rename** the RPC string to a neutral name (e.g., `get_item_by_code`) in the 5 occurrences — zero production impact, test behavior unchanged (it validates library semantics, not campaign data).
- Alternative: KEEP as-is (harmless but references a removed RPC name — misleading for future audits).

---

## R-20 — live-sessions / session-repository → evidence for decision (NOT executed)

### live-sessions.ts
- `src/core/supabase/live-sessions.ts` — **zero importers** (production and tests).
- `__tests__/session/lifecycle.test.ts:156,167` only contain **comments** referencing `live-sessions.ts` source line numbers; the test re-implements tiny predicates and does not import the module.
- No `live-sessions*.test.*` file exists.
- Classification: **DEAD**. Deletion impact: **none**.

### session-repository.ts
- `src/core/supabase/session-repository.ts` (`createSupabaseSessionRepository` :104) — its **only** reference is the export line `src/core/index.ts:88-90`.
- `src/core/index.ts` is a large public barrel (calibration, engine, session, device, events, settings, history, supabase client, auth, offline, qr/share). **It has zero importers** across the whole tree (verified: no `from '…/core/index'`, no path alias configured in `vite.config.ts`). Its exported members are consumed via direct sub-module imports.
- `__tests__/repository/session-repository.test.ts` **does not test `session-repository.ts`** — it imports `createMemorySessionRepository` from `core/repository/memory` (:2). No test covers the Supabase session repository.
- Classification: **DORMANT → effectively DEAD** (unreachable from production and tests).

### Impact on Research/BI → **NONE**
- Research console and BI depend on `api-supabase.ts` / `business-intelligence/api.ts`; neither imports `live-sessions`, `session-repository`, or the `core/index.ts` barrel.

### Deletion impact (if approved)
- Delete `live-sessions.ts` — nothing else.
- Delete `session-repository.ts` — plus remove export lines `core/index.ts:88-90` (a zero-consumer barrel; nothing else references them).
- Tests: **none affected** (no live-sessions test; the session-repository test targets a different module).

### Recommendation (owner decision required)
- Either **REMOVE both** (provably safe, minimal) or **PRESERVE** (they are documented as future infrastructure in `core/index.ts:16-39`). Evidence shows removal is zero-risk; preservation is also zero-risk. Owner preference decides.

---

## CR-00005 — Proposed RLS model + roles (NO SQL; for the separate authorized session)

### Evidence: actual role model and access flows
- `AppRole = 'guest' | 'user' | 'researcher' | 'admin' | 'super_admin'` (`src/core/auth/index.ts:7`).
- Role resolution: `supabase.auth` user → `user_metadata.role`, fallback to `public.users.role` (`fetchRoleFromProfile`, auth/index.ts:50-60).
- **Repair staff gate** (which roles can reach the staff screens): `RepairHomeScreen.tsx:32` → `permissionGuard.can(researchRole, 'campaigns', 'read')` → true only for `research_admin` (= AppRole `admin`) and `super_admin` (`permissions.ts:16-22, 30-43`).
- **Public repair flows:** request creation (`requiresAuth: false`, RepairHomeScreen.tsx:11) and customer tracking via public link/QR `#/repair-tracking?code=<code>` (`RepairQR.tsx:22`).

### Proposed access model (policy shapes — prose; exact SQL deferred to the CR session)
1. **Revoke anonymous full read** of `repair_requests`, `repair_timeline`, `repair_status_history`, `repair_audit_log`, `repair_photos`, `repair_courier_jobs` — remove the `using (true)` policies (migration `00005`).
2. **Staff read (SELECT):** authenticated users whose `public.users.role` is `'admin'` or `'super_admin'` — mirrors the app-side `canManage` gate so the UI and the DB agree.
3. **Customer tracking:** expose **only a non-PII projection** (repair code, status, timestamps, non-identity timeline events), reached by `code`. Recommended mechanism: a **security-definer RPC** (e.g., `track_repair_status(p_code)`) that returns sanitized rows, so no other rows are visible. Alternative (weaker): a narrow RLS policy matching on `repair_code` with a supplied setting — documented as fragile, not recommended.
4. **Anonymous request creation:** allow anonymous **INSERT only** (no SELECT) for `repair_requests`, or move request creation behind the auth flow — **owner decision**; the current flow is anonymous.
5. **Photos / notifications:** INSERT restricted to staff; photos SELECT staff-only.
6. **Roles allowed to read:** `admin`, `super_admin` (minimal set). `researcher` (analyst) is **not** included — the research console reads sessions/devices/surveys, not repair tables. This set is not final; the owner reviews it in the CR session.

These are **model proposals only**. No SQL is executed or proposed for execution now.

---

## Gate state (unchanged, verified by execution)

| Gate | Status |
|---|---|
| p6-01 (customer-memory/device-ledger PRESERVE) | 🟢 GREEN |
| p6-07 (KEEP surfaces + Repair/Research/BI preservation) | 🟢 GREEN |
| p6-06 invariants P6-14/15/16 | 🟢 GREEN |
| p6-02 (repair MINIMIZE) | 🔴 RED — approved direction |
| p6-03 (popularity REDUCE) | 🔴 RED — approved direction |
| p6-04 (research/BI STRONG REDUCE) | 🔴 RED — approved direction |
| p6-05 (surveys surface DELETE) | 🔴 RED — approved direction |
| p6-06 P6-17 (R-15) / P6-18 (R-14) | 🔴 RED — **pending owner decision** |
| p3 / p4 / p5 gates | 🟢 GREEN |

## Verification commands used (read-only)
```powershell
git status --porcelain                                   # only untracked audit/gate artifacts
git rev-parse HEAD                                       # d082dadf698840e9696c30092da5f07ef9f633f4
# reachability evidence (greps documented above):
#   createResearchAPI importers -> api.ts is test-only
#   HeatmapChart|FunnelChart|ExportUtils importers -> none
#   .rpc( callers -> only has_super_admin (prod) + test fixture
#   createSupabaseSessionRepository references -> only core/index.ts:89
node node_modules/vitest/vitest.mjs run src/__tests__/privacy   # 5 failed / 5 passed files (27 failed / 60 passed)
```

---

**HARD STOP — PENDING-CONFIRMATION EVIDENCE DELIVERED — NO PRODUCTION CHANGE MADE — WAITING FOR EXPLICIT P6 EXECUTION APPROVAL.**
