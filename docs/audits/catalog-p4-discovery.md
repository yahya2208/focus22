# P4 Discovery Report — Catalog Management System

**Date:** 2024-08-17
**Status:** READ-ONLY Discovery Complete
**Baseline:** HEAD = f6053ee (P1 bf38add → P2 3d29392 → P3-A ff4b08b → P3-B 011aaf7 → P3-C 57eca47 → P3-D f6053ee)

---

## A. Executive Summary

P1-P3 delivered a working catalog pipeline: DB schema + RPCs (P1), approval workflow (P2), and management UI (P3). However, **the system is not production-ready**. The owner cannot safely curate the 2,178-model catalog because:

1. **No UI entry point** — the catalog-approval screen is orphaned (no link in Settings)
2. **No back navigation** — admin is trapped on the screen once they reach it via URL
3. **No P3→P1 pipeline** — approved models don't appear in the app until someone manually runs a script and commits JSON
4. **No bulk actions** — approving 2,000+ draft models one-by-one at 50/page = 40 pages of individual clicks
5. **Hardcoded brand filter** — only 7 brands in the dropdown, new brands invisible
6. **Race conditions** — no request cancellation, stale data overwrite possible
7. **Raw error messages** — concurrency conflicts shown as raw SQL errors
8. **Stale reconciliation report** — hardcoded 866-model baseline doesn't match 2,178 live models

---

## B. Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     RUNTIME (App Bundle)                        │
│  src/catalog/brands/*.json (18 files, 2178 models)             │
│  src/catalog/loader.ts → src/services/catalog-service.ts       │
│  Static JSON imported at build time by Vite                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Manual: pnpm catalog:generate
                           │ (runs scripts/catalog-p1-generate.ts)
┌──────────────────────────┴──────────────────────────────────────┐
│                     P1 GENERATION PIPELINE                      │
│  scripts/catalog-p1-generate.ts                                 │
│  DB read (snapshot RPC or paginated) → eligibility filter       │
│  → transform → validate (10 checks) → write JSON → backup      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                     SUPABASE DB (Authoritative)                 │
│  catalog_models (2178 rows, ALL approval_status='draft')       │
│  catalog_variants (1816 rows, ALL status='known')              │
│  catalog_model_history (audit trail)                            │
│  catalog_variant_history (audit trail)                          │
│  20 RPCs (8 admin, 4 write, 4 internal, 2 public-read, 2 misc) │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                     P3 ADMIN UI                                 │
│  CatalogApprovalScreen (orphaned, no entry point)               │
│  Server-side search/filter/pagination via RPC                   │
│  Expandable cards → variant viewer + history viewer             │
│  Approve/Reject/Reopen actions with optimistic locking          │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** P3 manages the DB. P1 reads the DB and writes JSON. But there is **no automated trigger** from P3 to P1. The pipeline is entirely manual.

---

## C. Live Database Evidence

*Reconstructed from migration verify scripts and test assertions (no direct DB access in this environment)*

| Metric | Value | Source |
|--------|-------|--------|
| catalog_models total | 2178 | `21-verify.sql:168-170` |
| catalog_variants total | 1816 | `21-verify.sql:176-178` |
| inventory_items | 25 | P3-A implementation report |
| All models approval_status | `draft` | P3-A live verification (11/11 PASS) |
| All models status | `active` | P3-A live verification |
| All variants status | `known` | P3-A live verification |
| All variants region | `NULL` | P3-A live verification |
| Orphan variants | 0 | P3-A pre-live verification |
| NULL approval_status | 0 | P3-A pre-live verification |
| Model history records | Unknown (not verified in this session) | — |
| Variant history records | Unknown (not verified in this session) | — |

---

## D. RPC Inventory

### Admin RPCs (8 total)

| # | Function | Signature | SECURITY DEFINER | search_path | Admin Gate | File |
|---|----------|-----------|-------------------|-------------|------------|------|
| 1 | `catalog_admin_list_models` | `(text, text, text, boolean, int, int, text, boolean) → TABLE(...)` | YES | public | `catalog_is_admin()` | 21:54-141 |
| 2 | `catalog_admin_list_variants` | `(text, uuid) → SETOF catalog_variants` | YES | public | `catalog_is_admin()` | 19:102-125 |
| 3 | `catalog_admin_approve_model` | `(text, boolean, timestamptz) → catalog_models` | YES | public | `catalog_is_admin()` | 15:45-231 |
| 4 | `catalog_admin_reopen_model` | `(text, timestamptz) → catalog_models` | YES | public | `catalog_is_admin()` | 19:154-235 |
| 5 | `catalog_admin_update_model` | `(text,text,text,int,text[],text[],text,timestamptz) → catalog_models` | YES | public | `catalog_is_admin()` | 16:38-277 |
| 6 | `catalog_admin_update_variant` | `(text, text) → catalog_variants` | YES | public | `catalog_is_admin()` | 12:362-484 |
| 7 | `catalog_admin_update_variant_specs` | `(text, int, int, text, text, timestamptz) → catalog_variants` | YES | public | `catalog_is_admin()` | 19:271-431 |
| 8 | `catalog_admin_get_model_history` | `(text, int, int) → TABLE(...)` | YES | public | `catalog_is_admin()` | 19:457-526 |

### Write RPCs (4 total, non-admin)

| # | Function | Signature | Admin Gate | File |
|---|----------|-----------|------------|------|
| 1 | `catalog_create_model` | `(text,text,text,int,text[],text[]) → catalog_models` | None (any auth) | 05:79-142 |
| 2 | `catalog_create_variant` | `(text,int,int,text,text,text,bool) → catalog_variants` | None (any auth) | 01:419-491 |
| 3 | `catalog_verify_variant` | `(text, timestamptz) → catalog_variants` | None (any auth) | 01:494-534 |
| 4 | `catalog_archive_variant` | `(text, text) → catalog_variants` | None (any auth) | 01:537-576 |

### Public Read RPCs (2)

| # | Function | Grants | File |
|---|----------|--------|------|
| 1 | `catalog_get_model_variants` | anon, authenticated | 01:361-389 |
| 2 | `catalog_resolve_model` | anon, authenticated | 01:392-416 |

### Internal Helpers (6, all REVOKE ALL FROM PUBLIC)

`catalog_fnv1a_hash`, `catalog_ram_label`, `catalog_storage_label`, `catalog_variant_id`, `catalog_is_admin`, `catalog_model_id`

### ACL Pattern
All admin RPCs: `REVOKE ALL FROM PUBLIC` → `REVOKE EXECUTE FROM anon` → `GRANT EXECUTE TO authenticated`

---

## E. Security/ACL Findings

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| E1 | **Write RPCs have no admin gate** — `catalog_create_model`, `catalog_create_variant`, `catalog_verify_variant`, `catalog_archive_variant` can be called by ANY authenticated user, not just admins | MEDIUM | `05:141-142`, `01:491`, `01:534`, `01:576` |
| E2 | **No RLS INSERT/UPDATE/DELETE policies** — all writes go through SECURITY DEFINER RPCs (correct by design) | INFO | `01:175-195` |
| E3 | **RLS enabled on all tables** — anon/authenticated can only SELECT active models and known/verified variants | OK | `01:179-187` |
| E4 | **catalog_model_history has no read policy** — accessed only via admin RPC | OK | `11:77-80` |
| E5 | **No direct table mutations found in source code** — all writes route through RPCs | OK | Source scan |

---

## F. RLS Findings

| Table | RLS Enabled | SELECT Policy | INSERT/UPDATE/DELETE |
|-------|-------------|---------------|---------------------|
| catalog_models | YES | anon+auth WHERE status='active' | None (RPC-only) |
| catalog_variants | YES | anon+auth WHERE status IN ('known','verified') | None (RPC-only) |
| catalog_model_history | YES | None (admin RPC only) | None (RPC-only) |
| catalog_variant_history | YES | None (admin RPC only) | None (RPC-only) |

**No RLS gaps found.** All mutation paths are via SECURITY DEFINER RPCs that bypass RLS.

---

## G. P1/P2/P3 Integration Analysis

### G1. No Automated P3→P1 Pipeline
**Problem:** P3 manages approval workflow in Supabase. P1 reads DB and writes static JSON. But there is no trigger (cron, webhook, CI job) that runs P1 after P3 changes.
**Evidence:** `scripts/catalog-p1-generate.ts` is invoked manually via `pnpm catalog:generate`. No scheduled job or post-approval hook exists.
**Impact:** Approved models don't appear in the app until someone manually runs the script and commits the JSON.
**SQL required:** No. **RPC required:** No. **UI required:** No. **Migration required:** No.

### G2. 1,312 Seeded Models with Empty Variants
**Problem:** `catalog-regenerate-static.ts` appended 1,312 models with `variants: []` to the runtime JSON. These models:
- Exist in runtime JSON → visible in UI browse
- Have zero variants → `getVariantsForModel()` returns `[]`
- Would fail P1 eligibility (rule 2: zero valid variants) → would be **removed** if P1 re-run from DB
**Evidence:** `src/__tests__/catalog-adapter.test.ts:58-74` confirms 2178 = 866 variant-bearing + 1312 seeded
**Impact:** Latent divergence between runtime JSON and DB truth. If P1 is re-run, 1,312 models disappear from the app.
**SQL required:** No. **RPC required:** No. **UI required:** No.

### G3. Brand Display Name Bootstrap
**Problem:** P1 generation reads existing JSON files to recover brand display names. New brands approved in DB without a matching JSON file get raw slug names.
**Evidence:** `scripts/catalog-p1-generate.ts:279-288`
**Impact:** New brands display as "brandname" instead of "Brand Name".
**SQL required:** No. **RPC required:** No. **UI required:** No.

### G4. Variant Status Filter in P1
**Problem:** P1 eligibility filter uses `variant.status IN ('known', 'verified')`. But P3 `catalog_admin_update_variant_specs` can set status to `unverified` or `archived`. A variant set to `unverified` by P3 will **not** appear in P1 output.
**Evidence:** `scripts/catalog-p1-generate.ts:222-224` vs `19-catalog-p3-management-foundation.sql:366`
**Impact:** Admin can accidentally make a model appear to have zero variants in P1 output by archiving all variants.
**SQL required:** No. **RPC required:** No. **UI required:** Yes (show eligibility status).

### G5. Gate 7 (P2 Approval) is Opt-In in Validation
**Problem:** `scripts/catalog-p1-validate.ts:389-399` — the P2 approval verification gate only runs with `--live-db` flag. Default validation does NOT check whether JSON models are approved in DB.
**Evidence:** `scripts/catalog-p1-validate.ts:389-399`
**Impact:** Validation passes even when JSON contains unapproved models.
**SQL required:** No. **RPC required:** No.

### G6. Snapshot Consistency
**Problem:** Non-snapshot mode reads models and variants separately, creating a potential torn-read window.
**Evidence:** `scripts/catalog-p1-generate.ts:160-171` (separate queries) vs `:142-156` (snapshot RPC)
**Impact:** Low risk — only affects manual non-snapshot runs. `--snapshot` flag is available.
**SQL required:** No.

### G7. `catalog_reconciliation_report` Hardcodes 866 Models
**Problem:** The `seed_complete` metric checks `count(*) = 866` but live DB has 2,178 models. This metric always returns 0.
**Evidence:** `01-catalog-schema-apply.sql:650-652`
**Impact:** Misleading reconciliation output.
**SQL required:** Yes. **RPC required:** No.

---

## H. P3 UI Analysis

### H1. No UI Entry Point (CRITICAL)
**Problem:** `SettingsScreen.tsx` has an "Administration" section with "Admin Setup" button but NO link to `catalog-approval`. The screen is only reachable by manually typing `#/catalog-approval` in the URL bar.
**Evidence:** `src/screens/settings/SettingsScreen.tsx:181-183` — grep for "catalog" returns 0 results in this file
**Impact:** Owner cannot discover or access the catalog approval workflow.

### H2. No Back Navigation (CRITICAL)
**Problem:** `back-matrix.ts:64` declares `hasInContentBackButton: true` for `catalog-approval`, which suppresses the global back button. But `CatalogApprovalScreen.tsx` does NOT render its own back button. Admin is trapped.
**Evidence:** `src/core/navigation/back-matrix.ts:64` + `src/screens/admin/CatalogApprovalScreen.tsx` (no back button rendered)
**Impact:** Once on the screen, admin has no way to navigate back via the UI.

### H3. No Bulk Actions
**Problem:** With 2,000+ draft models, admin must click Approve/Reject on each one individually. At 50/page, that's 40+ pages of single clicks.
**Evidence:** `CatalogModelCard.tsx` — no select-all, no bulk approve/reject
**Impact:** Owner curation of 2,178 models is impractical.

### H4. Race Condition in loadModels
**Problem:** No `AbortController`. Rapid filter changes cause multiple concurrent RPCs. If an older request resolves after a newer one, state is overwritten with stale data.
**Evidence:** `CatalogApprovalScreen.tsx:23-46` — no cleanup for async operations
**Impact:** Stale data display, potential wrong-model action.

### H5. Raw Error Messages
**Problem:** RPC errors (concurrency conflicts, permission errors) shown as raw Supabase error strings.
**Evidence:** `CatalogApprovalScreen.tsx:70,89,108` — `(err as Error).message`
**Impact:** Admin sees "new row violates row-level security policy" instead of "Permission denied".

### H6. Hardcoded Brand List
**Problem:** Only 7 brands in the filter dropdown. New brands added to DB won't appear.
**Evidence:** `CatalogSearchBar.tsx:26-35` — static `BRAND_OPTIONS` array
**Impact:** Admin can't filter by new brands.

### H7. Expanded Cards Collapse After Action
**Problem:** After approve/reject/reopen, `loadModels` re-fetches resets the list. All expanded cards collapse. Admin loses context.
**Evidence:** `CatalogApprovalScreen.tsx:68,88,107`
**Impact:** UX friction during bulk curation.

### H8. No Approval Counts/Dashboard
**Problem:** No summary showing "2000 draft / 100 approved / 28 rejected" at a glance.
**Evidence:** `CatalogApprovalScreen.tsx` — removed stats in P3-B refactor
**Impact:** Admin can't assess overall catalog health.

### H9. Success/Error Banners Never Auto-Dismiss
**Problem:** Success/error messages persist until the next user action.
**Evidence:** `CatalogApprovalScreen.tsx:58-59,78-79,98-99`
**Impact:** Visual clutter.

### H10. 100-Variant Cap
**Problem:** `CatalogVariantPanel.tsx:58` — `p_limit: 100`. Models with >100 variants show truncated list but tab count shows full number.
**Evidence:** `CatalogVariantPanel.tsx:58`
**Impact:** Misleading variant count display.

---

## I. Data Integrity Analysis

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| I1 | **All writes route through SECURITY DEFINER RPCs** — no direct table mutations found | OK | Source scan |
| I2 | **Optimistic locking on approve/reject/reopen** — `p_expected_updated_at` prevents lost updates | OK | P2/P3 RPCs |
| I3 | **CHECK constraints enforce valid states** — approval_status, model status, variant status all constrained | OK | Schema DDL |
| I4 | **FK constraints prevent orphans** — variant→model ON DELETE RESTRICT, history→model/variant ON DELETE CASCADE | OK | Schema DDL |
| I5 | **Unique constraints prevent duplicates** — canonical_id, brand+name, variant spec uniques | OK | Schema DDL |
| I6 | **No inventory↔catalog coupling** — cleanly separated at both SQL and TS layers | OK | Source scan |
| I7 | **Append-only history** — no UPDATE/DELETE on history tables | OK | Schema + RPCs |

---

## J. Concurrency Analysis

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| J1 | **Optimistic locking on approve/reject/reopen** — works correctly | OK | P2/P3 RPCs |
| J2 | **No optimistic locking on variant spec edits** — `p_expected_updated_at` exists in SQL (`19:328-335`) but no TS test covers it | MEDIUM | `p3-variant-specs-rpc.test.ts` (missing) |
| J3 | **Race condition in UI loadModels** — no AbortController | MEDIUM | `CatalogApprovalScreen.tsx:23-46` |
| J4 | **Global actingOn lock** — blocks ALL models' buttons during single action | LOW | `CatalogModelCard.tsx:108` |

---

## K. Scalability Analysis

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| K1 | **2,178 models at 50/page = 44 pages** — manageable but slow without bulk actions | MEDIUM | `PAGE_SIZE = 50` |
| K2 | **No catalog_admin_list_variants pagination** — returns ALL matching rows (up to 1816) | MEDIUM | `19:102-125` |
| K3 | **100-variant cap per model display** — truncated but count shown | LOW | `CatalogVariantPanel.tsx:58` |
| K4 | **Static JSON imported at build time** — 18 brand files bundled into app | LOW | `src/catalog/loader.ts` |

---

## L. Owner/Admin Workflow Analysis

### Current Workflow (Broken)
1. Owner knows to type `#/catalog-approval` in URL bar (no UI entry point)
2. Owner arrives at screen (no back button to leave)
3. Owner sees 2,000 draft models at 50/page (40 pages)
4. Owner clicks Approve on each model individually (2,000 clicks)
5. After each approve, all expanded cards collapse (context lost)
6. Owner runs `pnpm catalog:generate` manually (no automation)
7. Owner commits JSON changes manually
8. Owner pushes to deploy

### Desired Workflow
1. Owner clicks "Catalog Approval" in Settings (entry point exists)
2. Owner sees dashboard with draft/approved/rejected counts
3. Owner uses search/filter to find specific models
4. Owner bulk-selects and bulk-approves groups of models
5. Owner reviews individual models with expand/collapse (persists across actions)
6. Owner can navigate back to Settings
7. P1 generation triggers automatically after approval
8. App updates with new catalog data

---

## M. Missing Capabilities

| # | Capability | Priority | SQL | RPC | UI | Migration |
|---|-----------|----------|-----|-----|----|-----------| 
| M1 | UI entry point in Settings | CRITICAL | No | No | Yes | No |
| M2 | Back navigation button | CRITICAL | No | No | Yes | No |
| M3 | Bulk approve/reject | HIGH | No | Yes | Yes | No |
| M4 | Auto-dismiss success/error | LOW | No | No | Yes | No |
| M5 | Dynamic brand list from DB | MEDIUM | No | Yes | Yes | No |
| M6 | Persist expanded card state | LOW | No | No | Yes | No |
| M7 | Approval counts dashboard | MEDIUM | No | Yes | Yes | No |
| M8 | Request cancellation (AbortController) | MEDIUM | No | No | Yes | No |
| M9 | User-friendly error messages | MEDIUM | No | No | Yes | No |
| M10 | P3→P1 automated pipeline | HIGH | No | No | No | No |
| M11 | Fix hardcoded 866 in reconciliation | LOW | Yes | No | No | No |
| M12 | Variant spec edit concurrency test | MEDIUM | No | No | No | No |

---

## N. Test Coverage Gaps

### Actual Defect
| ID | Description | Location |
|----|-------------|----------|
| D1 | `canLoadMore` logic bug — returns true when shownCount=20 and no totalEstimate | `p3-ui-history-viewer.test.ts:47-49` |

### Missing Tests
| ID | Description | Location |
|----|-------------|----------|
| MT1 | All 6 "security contract" tests are stubbed (`expect(true).toBe(true)`) | `p3-admin-list-models-rpc.test.ts:100-123` |
| MT2 | "Filter Reset" tests are stubbed (`expect(1).toBe(1)`) | `p3-ui-pagination.test.ts:134-142` |
| MT3 | No optimistic concurrency test for `catalog_admin_update_variant_specs` | `p3-variant-specs-rpc.test.ts` |
| MT4 | No test that variant spec edits produce history rows | `p3-variant-specs-rpc.test.ts` |
| MT5 | No test that model history records all 5 action types in SQL | `p3-model-history-rpc.test.ts` |
| MT6 | No concurrent mutation tests (two-admin race) | *(absent)* |
| MT7 | No error recovery tests (network failure, RPC timeout) | *(absent)* |

### Pre-existing Issues
| ID | Description | Location |
|----|-------------|----------|
| PI1 | QR routing flake — 300ms timing-dependent assertions | `qr-routing.test.tsx:56,65,73,81,101,109` |
| PI2 | `catalog_admin_list_variants` has no pagination | `19:102-125` |

---

## O. Documentation Gaps

| ID | Description | Location |
|----|-------------|----------|
| DG1 | `12-catalog-admin-rpcs.sql` header says "FINAL P0" but P2/P3 modified functions | `12:1-43` |
| DG2 | `catalog_admin_approve_model` signature changed from 2-param to 3-param without deprecation note | `12:527` vs `15:45` |
| DG3 | No runbook for owner to perform catalog curation workflow | *(absent)* |
| DG4 | No documentation of P1→P3 pipeline gap | *(absent)* |

---

## P. Risks Ranked

### CRITICAL
| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | No UI entry point — owner can't access catalog approval | Screen unreachable | Add link in Settings |
| R2 | No back button — admin trapped on screen | Navigation broken | Add back button |

### HIGH
| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R3 | No bulk actions — 2,000+ individual clicks | Owner curation impractical | Add bulk approve/reject |
| R4 | No P3→P1 automation — approved models don't appear in app | Manual pipeline required | Add CI trigger or webhook |
| R5 | 1,312 seeded models would disappear if P1 re-run | Latent data loss | Fix eligibility or preserve seeded models |

### MEDIUM
| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R6 | Hardcoded brand list — new brands invisible in filter | Filter incomplete | Fetch brands from DB |
| R7 | Race condition in loadModels — stale data | Wrong model action | Add AbortController |
| R8 | Raw error messages — admin sees SQL errors | Poor UX | Map errors to friendly messages |
| R9 | No optimistic concurrency test for variant specs | Untested safety net | Add test |
| R10 | Expanded cards collapse after each action | Context lost | Persist expanded state |
| R11 | No approval counts dashboard | No at-a-glance health | Add summary stats |
| R12 | Write RPCs have no admin gate | Any authenticated user can create models | Add admin gate |
| R13 | `catalog_admin_list_variants` no pagination | All rows returned | Add limit/offset |

### LOW
| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R14 | Success/error banners never auto-dismiss | Visual clutter | Add timeout |
| R15 | 100-variant cap per model display | Truncated list | Add pagination |
| R16 | `canLoadMore` logic bug in history viewer | Edge case false positive | Fix logic |
| R17 | Hardcoded 866 in reconciliation report | Misleading metric | Update count |
| R18 | Stubbed security contract tests | No actual assertion | Implement tests |
| R19 | Stubbed filter reset tests | No actual assertion | Implement tests |

---

## Q. Recommended P4 Scope

Based on evidence, P4 should address the **critical and high** blockers that prevent the owner from safely curating the catalog:

### P4-A: Navigation & Entry (CRITICAL)
- Add "Catalog Approval" link in SettingsScreen
- Add back button to CatalogApprovalScreen
- Fix back-matrix configuration

### P4-B: Bulk Actions (HIGH)
- Add select-all checkbox per page
- Add bulk approve/reject buttons
- Add confirmation dialog for bulk actions
- RPC: `catalog_admin_bulk_approve` or batch via existing RPCs

### P4-C: UX Improvements (MEDIUM)
- Dynamic brand list from DB (new RPC or include in list_models response)
- Persist expanded card state across refreshes
- Auto-dismiss success/error banners (5s timeout)
- User-friendly error messages (map concurrency errors)
- Approval counts dashboard (stats bar)

### P4-D: Pipeline Automation (HIGH)
- CI script or webhook to run P1 generation after approval
- Or: document the manual workflow clearly

### P4-E: Safety & Testing (MEDIUM)
- Add AbortController to loadModels
- Fix `canLoadMore` logic bug
- Un-stub security contract tests
- Un-stub filter reset tests
- Add variant spec concurrency test
- Add admin gate to write RPCs

---

## R. Items Explicitly OUT OF SCOPE

| Item | Reason |
|------|--------|
| New SQL migrations for schema changes | Schema is stable; no new columns needed |
| Variant editing UI (inline specs) | P3 deliberately read-only; editing is via separate admin workflow |
| Real-time collaboration | Over-engineered for current scale |
| Elasticsearch/search optimization | Current RPC search is adequate for 2,178 models |
| Mobile-optimized catalog UI | Desktop admin tool |
| Inventory integration | Intentionally decoupled |
| Role-based variant-level access | Current admin-gate is sufficient |
| Catalog versioning/snapshots | P1 backup mechanism is adequate |

---

## S. Evidence for Every Finding

| Finding | Evidence File:Line | Verified |
|---------|-------------------|----------|
| H1 (No entry point) | `SettingsScreen.tsx:181-183` — no catalog reference | YES |
| H2 (No back button) | `back-matrix.ts:64` + `CatalogApprovalScreen.tsx` (no back button) | YES |
| H3 (No bulk actions) | `CatalogModelCard.tsx` — no select-all | YES |
| H4 (Race condition) | `CatalogApprovalScreen.tsx:23-46` — no AbortController | YES |
| H5 (Raw errors) | `CatalogApprovalScreen.tsx:70,89,108` | YES |
| H6 (Hardcoded brands) | `CatalogSearchBar.tsx:26-35` | YES |
| G1 (No P3→P1 pipeline) | `catalog-p1-generate.ts` — manual invocation only | YES |
| G2 (1312 seeded models) | `catalog-adapter.test.ts:58-74` | YES |
| G7 (Hardcoded 866) | `01-catalog-schema-apply.sql:650-652` | YES |
| E1 (Write RPCs no admin gate) | `05:141-142`, `01:491`, `01:534`, `01:576` | YES |
| K2 (No variant pagination) | `19:102-125` | YES |
| D1 (canLoadMore bug) | `p3-ui-history-viewer.test.ts:47-49` | YES |
| MT1 (Stubbed security tests) | `p3-admin-list-models-rpc.test.ts:100-123` | YES |
| MT2 (Stubbed filter tests) | `p3-ui-pagination.test.ts:134-142` | YES |

---

## T. Final Recommendation

**P4 should be scoped as a "Production Readiness" checkpoint** focused on:

1. **P4-A: Navigation fixes** (2 files, ~20 lines) — CRITICAL, unblocks owner access
2. **P4-B: Bulk actions** (3 files + 1 RPC, ~200 lines) — HIGH, enables practical curation
3. **P4-C: UX polish** (4 files, ~100 lines) — MEDIUM, improves daily workflow
4. **P4-D: Pipeline documentation** (1 doc) — HIGH, clarifies manual process
5. **P4-E: Test hardening** (5 files, ~150 lines) — MEDIUM, closes coverage gaps

**Estimated scope:** ~10 files, ~470 lines, 1 new RPC, 0 migrations, 0 schema changes.

**P4 is NOT about new features.** It's about making the existing P1-P3 system usable by the owner.

---

*P4 DISCOVERY COMPLETE — awaiting owner review.*
