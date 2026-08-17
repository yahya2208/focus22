# P3 PLAN REVIEW — FINAL

**Status:** APPROVED WITH CHANGES
**Date:** 2026-08-17
**Reviewer:** Technical review of `catalog-p3-plan.md`
**Verdict:** 9 changes required before P3-A GO

---

## 1. Existing RPC Reconfirmation

### catalog_create_variant

| Property | Value | Source |
|---|---|---|
| Signature | `(text, integer, integer, text, text, text, boolean) → catalog_variants` | file 01 §6.3 line 419 |
| SECURITY DEFINER | YES | file 01 line 431 |
| search_path | public | file 01 line 432 |
| ACL | REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated | file 01 lines 490-491 |
| Auth gate | `catalog_is_admin()` → 42501 | file 01 line 439 |
| RLS interaction | INSERT bypasses RLS (SECURITY DEFINER runs as owner) | PostgREST behavior |
| canonical_variant_id | Deterministic via `catalog_variant_id(brand_id, canonical_id, ram, storage, region)` | file 01 line 473-474 |
| History | Records CREATE in catalog_variant_history | file 01 lines 483-484 |
| **UI reusability** | **YES — directly callable from CatalogApprovalScreen** | Supabase client `rpc('catalog_create_variant', {...})` |
| **Wrapper needed?** | **NO** | Existing RPC is complete |
| **P3 modification needed?** | **NO** | Works as-is |

### catalog_archive_variant

| Property | Value | Source |
|---|---|---|
| Signature | `(text, text) → catalog_variants` | file 01 §6.5 line 537 |
| SECURITY DEFINER | YES | file 01 line 544 |
| search_path | public | file 01 line 545 |
| ACL | REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated | file 01 lines 575-576 |
| Auth gate | `catalog_is_admin()` → 42501 | file 01 line 551 |
| RLS interaction | UPDATE bypasses RLS (SECURITY DEFINER) | PostgREST behavior |
| History | Records ARCHIVE in catalog_variant_history | file 01 lines 569-570 |
| **UI reusability** | **YES — directly callable** | |
| **Wrapper needed?** | **NO** | |
| **P3 modification needed?** | **NO** | |

### catalog_admin_list_variants

| Property | Value | Source |
|---|---|---|
| Signature | `(text DEFAULT NULL) → SETOF catalog_variants` | file 01 §6.6 line 579 |
| SECURITY DEFINER | YES | file 01 line 583 |
| search_path | public | file 01 line 584 |
| ACL | REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated | file 01 lines 599-600 |
| Auth gate | `catalog_is_admin()` → 42501 | file 01 line 587 |
| RLS interaction | Bypasses public RLS (SECURITY DEFINER) — returns ALL variants including archived/unverified | file 01 lines 592-595 |
| Ordering | `ORDER BY cv.created_at DESC` (hardcoded) | file 01 line 592 |
| **UI reusability** | **YES — but no model_id filter** | |
| **Wrapper needed?** | **YES — needs model_id filter parameter** | Current signature returns ALL variants across all models |
| **P3 modification needed?** | **YES — add p_model_id parameter** | See Change #1 below |

**CHANGE #1 REQUIRED:** `catalog_admin_list_variants` has no `p_model_id` filter. For the variant viewer, we need to fetch variants for a specific model. Two options:

- **Option A (recommended):** Add `p_model_id uuid DEFAULT NULL` parameter to existing function. DROP + CREATE replacement.
- **Option B:** Use client-side filtering (fetch all 1816, filter by model_id in JS). Works at current scale but wasteful.

**Recommendation:** Option A. The existing function has no callers outside the UI (confirmed by grep). The signature change is additive (new optional parameter at end). No existing caller breaks.

---

## 2. catalog_admin_list_models Design

### Parameters (FINAL)

```sql
p_search       text     DEFAULT NULL     -- ILIKE on name, canonical_id, model_numbers
p_brand        text     DEFAULT NULL     -- exact match on brand_id
p_approval     text     DEFAULT NULL     -- exact match on approval_status
p_has_variants boolean  DEFAULT NULL     -- true=has≥1 variant, false=0 variants, NULL=all
p_limit        integer  DEFAULT 50       -- capped at 200
p_offset       integer  DEFAULT 0        -- non-negative
p_order_by     text     DEFAULT 'brand_id'  -- whitelist
p_order_asc    boolean  DEFAULT true
```

### Return Type

```sql
RETURNS TABLE (
  id              uuid,
  canonical_id    text,
  brand_id        text,
  name            text,
  series          text,
  release_year    integer,
  status          text,
  approval_status text,
  variant_count   bigint,
  updated_at      timestamptz
)
```

### Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Search method** | `ILIKE '%' || p_search || '%'` | No pg_trgm extension needed. Simple, fast enough for 2178 rows. Indexes on name/canonical_id don't help ILIKE with leading wildcard, but table scan of 2178 is <10ms. |
| **Count strategy** | Separate `SELECT count(*)` before data query | Returns total count for pagination UI. Two queries, but both use same WHERE clause. |
| **Max limit** | 200 | Prevents unbounded reads. UI displays 50 per page. |
| **Order whitelist** | `brand_id`, `name`, `approval_status`, `updated_at`, `variant_count` | Prevents SQL injection via ORDER BY. Invalid values → 22023. |
| **Pagination** | OFFSET/LIMIT | Simple, correct for <10K rows. Cursor-based unnecessary at this scale. |
| **has_variants** | LEFT JOIN + HAVING or subquery | `EXISTS (SELECT 1 FROM catalog_variants cv WHERE cv.model_id = cm.id)` for true; NOT EXISTS for false. |
| **Search scope** | `cm.name ILIKE ... OR cm.canonical_id ILIKE ...` | model_numbers search excluded — TEXT[] ILIKE is non-trivial and low value. |

### Indexes Required

| Index | Already Exists? | Needed? |
|---|---|---|
| `catalog_models (brand_id)` | YES (file 01 line 143) | For brand filter |
| `catalog_models (brand_id, name)` | YES (UNIQUE, file 01 line 141) | For ordering |
| `catalog_variants (model_id)` | YES (file 01 line 151) | For variant_count LEFT JOIN |
| `catalog_models (approval_status)` | NO | **NEW index needed for approval_status filter** |
| `catalog_models (name)` | NO (ILIKE with leading wildcard won't use it anyway) | Not needed |

**CHANGE #2 REQUIRED:** Add index `catalog_models_approval_status_idx ON catalog_models (approval_status)` in migration 19.

---

## 3. Security Review for List RPC

**YES — must be SECURITY DEFINER.** Reason: the public RLS policy on `catalog_models` allows SELECT for `status = 'active'` to anon/authenticated. For admin, we need to see ALL models (including archived) and the variant_count (which requires reading catalog_variants). SECURITY DEFINER runs as the function owner (postgres/service_role), bypassing RLS.

| Property | Value |
|---|---|
| SECURITY DEFINER | YES |
| SET search_path | public |
| catalog_is_admin() gate | YES → 42501 |
| REVOKE ALL FROM PUBLIC | YES |
| REVOKE EXECUTE FROM anon | YES |
| GRANT EXECUTE TO authenticated | YES |

**Anon behavior:** 42501 (permission denied) — same as all other admin RPCs.

**Non-admin authenticated behavior:** 42501 — `catalog_is_admin()` checks `users.role IN ('admin','super_admin')`.

---

## 4. Reopen RPC Review

### catalog_admin_reopen_model — FINAL SIGNATURE

```sql
CREATE OR REPLACE FUNCTION public.catalog_admin_reopen_model(
  p_canonical_id          text,
  p_expected_updated_at   timestamptz DEFAULT NULL
)
RETURNS public.catalog_models
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
```

### Transition Table

| Current Status | Action | Allowed? | Result |
|---|---|---|---|
| rejected | reopen | **YES** | draft |
| draft | reopen | **BLOCKED** | error: "approval_status is draft (must be rejected)" |
| approved | reopen | **BLOCKED** | error: "approval_status is approved (must be rejected)" |
| any (archived) | reopen | N/A | reopen doesn't check model status, only approval_status |

### Implementation Logic

```sql
-- 1) AUTH gate: catalog_is_admin() → 42501
-- 2) Validation: canonical_id required → 22023
-- 3) Lookup: canonical_id → P0002 if not found
-- 4) Optimistic concurrency: p_expected_updated_at → 55000 if stale
-- 5) Transition guard: approval_status MUST be 'rejected' → 23505 otherwise
-- 6) UPDATE: SET approval_status = 'draft', updated_at = now()
-- 7) RE-READ final row
-- 8) History: INSERT INTO catalog_model_history (model_id, action, before, after, actor_user_id) VALUES (..., 'REOPEN', ...)
-- 9) RETURN final row
```

### History Action Name

**`'REOPEN'`** — requires CHECK constraint expansion on `catalog_model_history.action`.

**Current:** `CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT'))`
**New:** `CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT','REOPEN'))`

**CHANGE #3 NOTE:** The P3 plan already identifies this. No change needed.

---

## 5. Variant Edit RPC Review

### History Strategy — CRITICAL FINDING

**catalog_model_history** is bound to `model_id` (FK → catalog_models). It does NOT have a `variant_id` column.

**catalog_variant_history** is bound to `variant_id` (FK → catalog_variants). It DOES have variant-level audit.

**Question:** When we edit variant specs via `catalog_admin_update_variant_specs`, which history table gets the record?

**Answer:** `catalog_variant_history` — NOT `catalog_model_history`. This is the correct table. The existing `catalog_variant_history` already supports action `'UPDATE'` in its CHECK constraint (file 01 line 127: `CHECK (action IN ('CREATE','UPDATE','VERIFY','ARCHIVE','RESTORE'))`). No CHECK expansion needed for variant history.

**The P3 plan incorrectly suggested catalog_model_history for variant edits.** This is wrong. The correct history table is `catalog_variant_history`, which already has the `'UPDATE'` action.

**CHANGE #4 REQUIRED:** Fix the P3 plan to use `catalog_variant_history` (not `catalog_model_history`) for variant spec edits. This is a correction, not a new finding.

### catalog_admin_update_variant_specs — FINAL SIGNATURE

```sql
CREATE OR REPLACE FUNCTION public.catalog_admin_update_variant_specs(
  p_canonical_variant_id  text,
  p_ram_mb                integer DEFAULT NULL,
  p_storage_gb            integer DEFAULT NULL,
  p_region                text    DEFAULT NULL,
  p_expected_updated_at   timestamptz DEFAULT NULL
)
RETURNS public.catalog_variants
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
```

### What It Edits

| Field | Editable? | Notes |
|---|---|---|
| ram_mb | YES (if provided, >0) | Recalculates canonical_variant_id |
| storage_gb | YES (if provided, >0) | Recalculates canonical_variant_id |
| region | YES (if provided, any text or NULL) | Recalculates canonical_variant_id |
| status | **NO** | Use catalog_verify_variant / catalog_archive_variant |
| notes | **NO** | Use catalog_admin_update_variant |

### Validation

1. `catalog_is_admin()` → 42501
2. canonical_variant_id required → 22023
3. Variant must exist → P0002
4. Variant must not be archived → 55000
5. At least one spec must change (IS DISTINCT FROM current) → 22023
6. ram_mb > 0 if provided → 22023
7. storage_gb > 0 if provided → 22023
8. New canonical_variant_id recalculated via `catalog_variant_id(v_model.brand_id, v_model.canonical_id, new_ram, new_storage, new_region)`
9. Collision check: `WHERE canonical_variant_id = new_id AND id != v_row.id` → 23505 if exists
10. Optimistic concurrency: `p_expected_updated_at` → 55000 if stale

### Safety: No FK from inventory_items

Confirmed: `inventory_items.model_id` is `TEXT NOT NULL` (file inventory-central/01 line 97). No FK to catalog_variants. No FK to catalog_models. Zero coupling. In-place spec update is safe.

### canonical_variant_id vs UUID

The parameter `p_canonical_variant_id` is **TEXT** (the deterministic business ID), not UUID. The RPC looks up the variant by `canonical_variant_id`, then uses the internal `id` (UUID) for the UPDATE. This matches the existing pattern (see `catalog_admin_update_variant` at file 12 line 401-404).

---

## 6. CHECK Constraint Expansion Review

### Which Constraint?

`catalog_model_history_action_check` on `catalog_model_history.action`

**Defined in:** file 11 line 61-62
**Current:** `CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT'))`

### Why Expansion?

The reopen RPC needs to record `'REOPEN'` in the history table. Without expanding the CHECK constraint, the INSERT would fail with a constraint violation.

### Current Values

`CREATE`, `UPDATE`, `APPROVE`, `REJECT`

### New Values

`CREATE`, `UPDATE`, `APPROVE`, `REJECT`, **`REOPEN`**

### Existing Data Safety

**catalog_model_history currently has 0 rows** (confirmed in baseline). No existing data will fail.

**Migration safety:** DROP CONSTRAINT + ADD CONSTRAINT. Since there are 0 rows, this is safe. If there were existing rows, we'd need to verify no rows have an action outside the new set.

### Migration Pattern

```sql
ALTER TABLE public.catalog_model_history
  DROP CONSTRAINT catalog_model_history_action_check;

ALTER TABLE public.catalog_model_history
  ADD CONSTRAINT catalog_model_history_action_check
  CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT','REOPEN'));
```

**CHANGE #5 NOTE:** This is correct as planned. No change needed.

---

## 7. Variant Viewer Review

### Data Flow

```
CatalogApprovalScreen
  → User expands model card
  → UI calls supabase.rpc('catalog_admin_list_variants', { p_status: null })
  → All 1816 variants returned
  → Client filters by model_id (JavaScript)
```

**Problem:** This returns ALL variants. For 1816 variants this is acceptable, but it's wasteful. The UI only needs variants for the expanded model.

**Better approach:** Add `p_model_id` parameter to `catalog_admin_list_variants` (see Change #1).

### Variant Display Columns

| Column | Source | Notes |
|---|---|---|
| canonical_variant_id | cv.canonical_variant_id | Text ID |
| ram_mb | cv.ram_mb | Integer, display as "X GB" or "X MB" |
| storage_gb | cv.storage_gb | Integer, display as "X GB" or "1 TB" |
| region | cv.region | NULL = "Global" |
| status | cv.status | Badge: known=yellow, verified=green, unverified=gray, archived=red |
| updated_at | cv.updated_at | Relative time |

### Eligibility Indicators

A variant is **approval-eligible** if `status IN ('known', 'verified')`. The UI should clearly indicate:
- ✓ Green badge for verified variants (approval-qualifying)
- ◐ Yellow badge for known variants (approval-qualifying)
- ○ Gray badge for unverified variants (NOT approval-qualifying)
- ✗ Red badge for archived variants (NOT approval-qualifying)

**No approval should proceed without the admin seeing variant eligibility.** The current P2 UI has no variant visibility — this is the core gap P3 closes.

---

## 8. History Viewer Review

### catalog_admin_get_model_history — FINAL SIGNATURE

```sql
CREATE OR REPLACE FUNCTION public.catalog_admin_get_model_history(
  p_canonical_id  text,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  action        text,
  before        jsonb,
  after         jsonb,
  actor_user_id uuid,
  actor_email   text,
  created_at    timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
```

### Authorization

- SECURITY DEFINER: YES
- search_path: public
- catalog_is_admin() gate: YES → 42501
- REVOKE ALL FROM PUBLIC, REVOKE anon, GRANT authenticated

### Ordering

`ORDER BY h.created_at DESC` — newest first

### Actor Information

JOIN to `public.users` on `actor_user_id` to get email. If actor_user_id is NULL (shouldn't happen for admin RPCs, but defensive), return NULL for actor_email.

### Read-Only

YES — the function is STABLE, returns SETOF, performs no writes. No edit/delete/truncate. Client cannot mutate through this RPC.

---

## 9. UI Decomposition Review

### Current: 1 file, 353 lines (CatalogApprovalScreen.tsx)

### P3 Plan Proposed: ~9 subcomponents

### Review: 9 is over-engineered

The current CatalogApprovalScreen is a single file with 353 lines. Splitting into 9 subcomponents for a 800-1000 line file is excessive. Each subcomponent would be 30-80 lines, adding import overhead without meaningful benefit.

### Recommended Decomposition: 5 files

| File | Responsibility | Est. Lines |
|---|---|---|
| `CatalogApprovalScreen.tsx` | Main orchestrator: state, RPC calls, layout, filters, pagination | 300-350 |
| `CatalogModelCard.tsx` | Single model card: badge, metadata, action buttons, expand toggle | 120-150 |
| `CatalogVariantPanel.tsx` | Expandable variant list for a model: table, add form, edit form | 150-200 |
| `CatalogHistoryPanel.tsx` | Expandable history timeline for a model: entries, pagination | 80-100 |
| `CatalogSearchBar.tsx` | Search input + filter dropdowns + pagination controls | 80-100 |

**Total: ~730-900 lines across 5 files.**

**CHANGE #6 REQUIRED:** Reduce subcomponents from 9 to 5. Update P3 plan Section 8.

---

## 10. P3 Checkpoint Review

### Current Plan

```
P3-A: SQL RPCs + tests
P3-B: UI overhaul + tests  
P3-C: Docs
```

### Issue: P3-B mixes implement + test without intermediate verify

The current P3-B does all UI work then tests at the end. This violates the owner's preference for IMPLEMENT → TEST → VERIFY → COMMIT per checkpoint.

### Recommended Checkpoint Structure

```
P3-A: Migration 19 (SQL RPCs)
  → Implement: 19-catalog-p3-rpcs.sql, 19-rollback, 20-verify
  → Test: RPC unit tests (4 files)
  → Verify: tsc, lint, vitest, 20-verify on live DB
  → Commit: "feat(catalog): P3 SQL RPCs — reopen, specs edit, history, list"

P3-B: UI — Search + Pagination + Filters
  → Implement: CatalogSearchBar, CatalogApprovalScreen refactor (server-side pagination)
  → Test: search/filter/pagination tests
  → Verify: tsc, lint, vitest, build
  → Commit: "feat(catalog): P3 UI — search, pagination, filters"

P3-C: UI — Variant Viewer + History Viewer + Actions
  → Implement: CatalogModelCard, CatalogVariantPanel, CatalogHistoryPanel
  → Test: variant viewer, history viewer, action tests
  → Verify: tsc, lint, vitest, build
  → Commit: "feat(catalog): P3 UI — variant viewer, history viewer, reopen action"

P3-D: Final verification + docs
  → Verify: full regression (1746+/1747, tsc, lint, build)
  → Docs: catalog-p3-completion.md
  → Commit: "docs(catalog): P3 completion audit"
```

**CHANGE #7 REQUIRED:** Restructure checkpoints from 3 to 4. Each checkpoint implements → tests → verifies → commits.

---

## 11. Test Matrix

### RPC Tests (4 files, 42 tests)

**p3-reopen-rpc.test.ts (10 tests)**

| # | Test | Category |
|---|---|---|
| 1 | Admin reopens rejected model → approval_status='draft' | Success |
| 2 | Admin reopens rejected model → history action='REOPEN' | Audit |
| 3 | Admin reopens rejected model → updated_at updated | Concurrency |
| 4 | Non-admin reopening → 42501 | Auth |
| 5 | Anon reopening → 42501 | Auth |
| 6 | Reopen draft model → 23505 blocked | Invalid transition |
| 7 | Reopen approved model → 23505 blocked | Invalid transition |
| 8 | Reopen nonexistent model → P0002 | Invalid input |
| 9 | Reopen empty canonical_id → 22023 | Validation |
| 10 | Reopen with stale updated_at → 55000 | Concurrency |

**p3-variant-specs-rpc.test.ts (12 tests)**

| # | Test | Category |
|---|---|---|
| 1 | Admin updates ram_mb → success | Success |
| 2 | Admin updates storage_gb → success | Success |
| 3 | Admin updates region → success | Success |
| 4 | Admin updates all three → canonical_variant_id recalculated | Success |
| 5 | Archived variant → 55000 blocked | Invalid state |
| 6 | Duplicate specs (collision) → 23505 | Duplicate |
| 7 | Nonexistent variant → P0002 | Invalid input |
| 8 | Empty canonical_variant_id → 22023 | Validation |
| 9 | ram_mb ≤ 0 → 22023 | Validation |
| 10 | No spec changed → 22023 | Validation |
| 11 | History recorded in catalog_variant_history | Audit |
| 12 | Anon calling → 42501 | Auth |

**p3-model-history-rpc.test.ts (8 tests)**

| # | Test | Category |
|---|---|---|
| 1 | Admin reads history for model with history → returns entries | Success |
| 2 | History ordered newest-first | Ordering |
| 3 | Pagination (limit/offset) works | Pagination |
| 4 | Actor email included | Data |
| 5 | Empty history → empty result | Edge case |
| 6 | Nonexistent model → P0002 | Invalid input |
| 7 | Empty canonical_id → 22023 | Validation |
| 8 | Anon calling → 42501 | Auth |

**p3-model-list-rpc.test.ts (12 tests)**

| # | Test | Category |
|---|---|---|
| 1 | Admin gets all models (default) | Success |
| 2 | Search by name → filtered results | Search |
| 3 | Search by canonical_id → filtered results | Search |
| 4 | Brand filter → correct subset | Filter |
| 5 | Approval status filter → correct subset | Filter |
| 6 | has_variants=true → only models with variants | Filter |
| 7 | has_variants=false → only models without variants | Filter |
| 8 | Pagination (limit/offset) → correct page | Pagination |
| 9 | Total count returned | Count |
| 10 | Limit capped at 200 | Validation |
| 11 | Invalid order_by → 22023 | Validation |
| 12 | Anon calling → 42501 | Auth |

### UI Tests (5 files, 28 tests)

**p3-ui-search.test.ts (7 tests)**

| # | Test |
|---|---|
| 1 | Search input filters models by name |
| 2 | Search input filters by canonical_id |
| 3 | Brand dropdown filters correctly |
| 4 | Approval status filter works |
| 5 | has_variants toggle works |
| 6 | Clear search restores full list |
| 7 | Empty search state displays correctly |

**p3-ui-pagination.test.ts (5 tests)**

| # | Test |
|---|---|
| 1 | Page navigation works |
| 2 | Total count displayed |
| 3 | Next/Prev buttons disabled at boundaries |
| 4 | Changing filters resets to page 1 |
| 5 | Loading state during page transition |

**p3-ui-variant-viewer.test.ts (8 tests)**

| # | Test |
|---|---|
| 1 | Expanding model card shows variants |
| 2 | Variant count badge correct |
| 3 | Status badges render correctly (known/verified/unverified/archived) |
| 4 | Add variant button calls catalog_create_variant |
| 5 | Archive variant button calls catalog_archive_variant |
| 6 | Edit specs button calls catalog_admin_update_variant_specs |
| 7 | Empty variant state for 0-variant models |
| 8 | Reopen button visible only on rejected models |

**p3-ui-history-viewer.test.ts (4 tests)**

| # | Test |
|---|---|
| 1 | History tab shows entries |
| 2 | Action badges render correctly |
| 3 | Timestamp formatted correctly |
| 4 | Load more pagination works |

**p3-ui-actions.test.ts (4 tests)**

| # | Test |
|---|---|
| 1 | Approve button pre-checks variant count (disabled if 0) |
| 2 | Reject button works |
| 3 | Double-submit prevention (actingOn state) |
| 4 | Optimistic concurrency error displayed |

### Regression (unchanged from P2)

| Check | Expected |
|---|---|
| P2 catalog tests | 60/60 pass |
| Full test suite | 1746+/1747 pass (1 QR flake pre-existing) |
| TypeScript | 0 errors |
| ESLint | 0 errors |
| Build | PASS |

### Total Test Count

| Category | Count |
|---|---|
| RPC tests | 42 |
| UI tests | 28 |
| P2 existing | 60 |
| **New P3 tests** | **70** |
| **Total catalog tests** | **130** |

---

## 12. P2 Immutability Review

### catalog_admin_approve_model

**P3 impact: NONE.** File 15 (transition guard) is not modified. The approve_model signature `(text, boolean, timestamptz)` is unchanged. The state machine logic is unchanged. The eligibility gate is unchanged. P3 adds a new RPC (reopen_model) that works alongside approve_model, not instead of it.

### catalog_admin_update_model

**P3 impact: NONE.** File 16 (concurrency guard) is not modified. The 8-parameter signature is unchanged. The name-change-reset logic is unchanged. The field immutability rules are unchanged.

### catalog_export_snapshot

**P3 impact: NONE.** File 17 (snapshot RPC) is not modified. The `(0-param) → jsonb` signature is unchanged.

### P2 ACLs

**P3 impact: NONE.** Files 14-17 (ACL fix, transition guard, concurrency, snapshot) are not modified. All REVOKE/GRANT statements remain.

### P2 State Machine

**P3 impact: NONE.** P3 adds a NEW transition (rejected → draft via reopen). The existing transitions are unchanged:
- draft → approved (via approve_model, requires active + ≥1 variant) — UNCHANGED
- draft → rejected (via approve_model) — UNCHANGED
- approved → rejected (via approve_model) — UNCHANGED
- rejected → approved BLOCKED — STILL BLOCKED (must reopen to draft first)

### Generator Eligibility

**P3 impact: NONE.** The generator reads `approval_status`, `status`, and variant statuses. P3 doesn't change these values or the filter logic. A model must still be `approved + active + ≥1 known/verified variant` to appear in JSON.

### Validator Gate 7

**P3 impact: NONE.** Gate 7 checks `approval_status = 'approved'` in DB for every model in JSON. P3 doesn't change this check.

### Reconciliation

**P3 impact: NONE.** Reconciler compares DB vs JSON. P3 doesn't change the comparison logic.

### Summary

**P2 contract is 100% preserved.** P3 adds new functionality alongside P2, never modifying existing behavior.

---

## Required Changes Summary

| # | Change | Impact |
|---|---|---|
| 1 | Add `p_model_id uuid DEFAULT NULL` to `catalog_admin_list_variants` | File 01 RPC modification (DROP + CREATE) |
| 2 | Add `catalog_models_approval_status_idx` index | New index in migration 19 |
| 3 | CHECK constraint expansion for REOPEN | Already in plan, no change needed |
| 4 | Fix P3 plan: variant edits use `catalog_variant_history` not `catalog_model_history` | Plan doc correction only |
| 5 | CHECK constraint expansion — confirmed safe (0 rows) | Already in plan, no change needed |
| 6 | Reduce UI subcomponents from 9 to 5 | Plan doc correction only |
| 7 | Restructure checkpoints from 3 to 4 (P3-A/B/C/D) | Plan doc correction only |

---

## Security Findings

1. **No new security risks.** All 4 new RPCs follow the exact same pattern as existing admin RPCs: SECURITY DEFINER, search_path=public, catalog_is_admin() gate, REVOKE ALL FROM PUBLIC, REVOKE anon, GRANT authenticated.
2. **SQL injection: safe.** All parameters are typed (text, integer, boolean, timestamptz). ORDER BY uses whitelist validation. ILIKE uses parameterized query.
3. **Privilege escalation: none.** Non-admin authenticated users get 42501 from all RPCs.
4. **Cross-model access: prevented.** Each RPC validates the entity exists and the caller has admin role. No cross-model data leakage.

---

## DB Findings

1. **0 rows in catalog_model_history** — CHECK constraint expansion is safe.
2. **0 rows in catalog_variant_history** — No impact from any history changes.
3. **No FK from inventory_items to catalog_variants** — Variant spec editing is safe.
4. **All P2 indexes intact** — No index modifications needed for existing RPCs.
5. **One new index needed** — `catalog_models_approval_status_idx` for approval_status filter performance.

---

## Final RPC Signatures

### Existing RPCs (unchanged)

```
catalog_create_variant(text, integer, integer, text, text, text, boolean) → catalog_variants
catalog_archive_variant(text, text) → catalog_variants
catalog_admin_list_variants(text) → SETOF catalog_variants  ← MODIFIED: add p_model_id
```

### New RPCs

```
catalog_admin_reopen_model(text, timestamptz) → catalog_models
catalog_admin_update_variant_specs(text, integer, integer, text, timestamptz) → catalog_variants
catalog_admin_get_model_history(text, integer, integer) → TABLE(...)
catalog_admin_list_models(text, text, text, boolean, integer, integer, text, boolean) → TABLE(...)
```

---

## Migration 19 Structure

```sql
-- 19-catalog-p3-rpcs.sql

-- 1) Index for approval_status filter
CREATE INDEX catalog_models_approval_status_idx ON public.catalog_models (approval_status);

-- 2) CHECK constraint expansion (safe: 0 rows)
ALTER TABLE public.catalog_model_history
  DROP CONSTRAINT catalog_model_history_action_check;
ALTER TABLE public.catalog_model_history
  ADD CONSTRAINT catalog_model_history_action_check
  CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT','REOPEN'));

-- 3) catalog_admin_list_variants — add p_model_id parameter
DROP FUNCTION IF EXISTS public.catalog_admin_list_variants(text);
CREATE OR REPLACE FUNCTION public.catalog_admin_list_variants(
  p_status   text    DEFAULT NULL,
  p_model_id uuid    DEFAULT NULL
) RETURNS SETOF public.catalog_variants ...;

-- 4) catalog_admin_reopen_model
CREATE OR REPLACE FUNCTION public.catalog_admin_reopen_model(
  p_canonical_id        text,
  p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS public.catalog_models ...;

-- 5) catalog_admin_update_variant_specs
CREATE OR REPLACE FUNCTION public.catalog_admin_update_variant_specs(
  p_canonical_variant_id  text,
  p_ram_mb                integer   DEFAULT NULL,
  p_storage_gb            integer   DEFAULT NULL,
  p_region                text      DEFAULT NULL,
  p_expected_updated_at   timestamptz DEFAULT NULL
) RETURNS public.catalog_variants ...;

-- 6) catalog_admin_get_model_history
CREATE OR REPLACE FUNCTION public.catalog_admin_get_model_history(
  p_canonical_id text,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
) RETURNS TABLE (...) ...;

-- 7) catalog_admin_list_models
CREATE OR REPLACE FUNCTION public.catalog_admin_list_models(
  p_search       text     DEFAULT NULL,
  p_brand        text     DEFAULT NULL,
  p_approval     text     DEFAULT NULL,
  p_has_variants boolean  DEFAULT NULL,
  p_limit        integer  DEFAULT 50,
  p_offset       integer  DEFAULT 0,
  p_order_by     text     DEFAULT 'brand_id',
  p_order_asc    boolean  DEFAULT true
) RETURNS TABLE (...) ...;

-- 8) Security grants for all new/modified functions
-- REVOKE ALL FROM PUBLIC, REVOKE anon, GRANT authenticated
```

---

## UI Structure (5 files)

```
src/screens/admin/
  CatalogApprovalScreen.tsx    — orchestrator (300-350 lines)
  CatalogModelCard.tsx         — model card (120-150 lines)
  CatalogVariantPanel.tsx      — variant viewer/editor (150-200 lines)
  CatalogHistoryPanel.tsx      — history timeline (80-100 lines)
  CatalogSearchBar.tsx         — search + filters + pagination (80-100 lines)
```

---

## Test Matrix (70 new tests)

| Category | Files | Tests |
|---|---|---|
| RPC: reopen | p3-reopen-rpc.test.ts | 10 |
| RPC: variant specs | p3-variant-specs-rpc.test.ts | 12 |
| RPC: model history | p3-model-history-rpc.test.ts | 8 |
| RPC: model list | p3-model-list-rpc.test.ts | 12 |
| UI: search | p3-ui-search.test.ts | 7 |
| UI: pagination | p3-ui-pagination.test.ts | 5 |
| UI: variant viewer | p3-ui-variant-viewer.test.ts | 8 |
| UI: history viewer | p3-ui-history-viewer.test.ts | 4 |
| UI: actions | p3-ui-actions.test.ts | 4 |
| **Total new** | **9 files** | **70** |

---

## Checkpoint Structure

```
P3-A: SQL RPCs
  Implement → Test → Verify → Commit
  Files: 19-rpcs.sql, 19-rollback.sql, 20-verify.sql, 4 test files
  Acceptance: all RPC tests pass, 20-verify all PASS, P2 tests unchanged

P3-B: UI — Search + Pagination + Filters
  Implement → Test → Verify → Commit
  Files: CatalogSearchBar.tsx, CatalogApprovalScreen.tsx (refactored), 2 test files
  Acceptance: search/filter/pagination tests pass, tsc 0, lint 0, build PASS

P3-C: UI — Variant Viewer + History Viewer + Actions
  Implement → Test → Verify → Commit
  Files: CatalogModelCard.tsx, CatalogVariantPanel.tsx, CatalogHistoryPanel.tsx, 3 test files
  Acceptance: variant/history/action tests pass, full regression 1746+/1747

P3-D: Final verification + docs
  Verify → Docs → Commit
  Files: catalog-p3-completion.md
  Acceptance: full regression, live DB verification, documentation complete
```

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| DROP FUNCTION for catalog_admin_list_variants signature change | Temporary function absence during migration | Wrap in BEGIN/COMMIT transaction |
| CHECK constraint expansion (DROP+ADD) | Could fail if data exists | Verified: 0 rows. Safe. |
| catalog_admin_list_models LEFT JOIN performance at 10K+ | Slow queries | Indexed on model_id; add approval_status index |
| UI file count (5 files vs 1) | More imports | Acceptable for maintainability |

---

## Exact Implementation Order

### P3-A

1. Write `19-catalog-p3-rpcs.sql`
2. Write `19-catalog-p3-rpcs-rollback.sql`
3. Write `20-catalog-p3-verify.sql`
4. Write `p3-reopen-rpc.test.ts`
5. Write `p3-variant-specs-rpc.test.ts`
6. Write `p3-model-history-rpc.test.ts`
7. Write `p3-model-list-rpc.test.ts`
8. Run `tsc --noEmit` → 0 errors
9. Run `eslint` → 0 errors
10. Run `vitest run` → all pass
11. Commit

### P3-B

1. Write `CatalogSearchBar.tsx`
2. Refactor `CatalogApprovalScreen.tsx` (server-side pagination via `catalog_admin_list_models`)
3. Write `p3-ui-search.test.ts`
4. Write `p3-ui-pagination.test.ts`
5. Run `tsc --noEmit` → 0 errors
6. Run `eslint` → 0 errors
7. Run `vitest run` → all pass
8. Run `pnpm build` → PASS
9. Commit

### P3-C

1. Write `CatalogModelCard.tsx`
2. Write `CatalogVariantPanel.tsx`
3. Write `CatalogHistoryPanel.tsx`
4. Update `CatalogApprovalScreen.tsx` to compose new components
5. Write `p3-ui-variant-viewer.test.ts`
6. Write `p3-ui-history-viewer.test.ts`
7. Write `p3-ui-actions.test.ts`
8. Run `tsc --noEmit` → 0 errors
9. Run `eslint` → 0 errors
10. Run `vitest run` → all pass
11. Run `pnpm build` → PASS
12. Commit

### P3-D

1. Full regression: `vitest run`, `tsc --noEmit`, `eslint`, `pnpm build`
2. Run `20-catalog-p3-verify.sql` on live DB → all PASS
3. Write `docs/audits/catalog-p3-completion.md`
4. Commit

---

## P3-A GO / NO-GO

**GO — with 7 changes applied to plan:**

1. ✅ Add `p_model_id` to `catalog_admin_list_variants`
2. ✅ Add `catalog_models_approval_status_idx` index
3. ✅ CHECK expansion confirmed safe
4. ✅ Fix history table reference (variant_history not model_history)
5. ✅ CHECK expansion confirmed safe (duplicate of 3, no issue)
6. ✅ Reduce UI components from 9 to 5
7. ✅ Restructure checkpoints from 3 to 4

**Awaiting owner approval to proceed with P3-A.**
