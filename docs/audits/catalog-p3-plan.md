# P3 DISCOVERY + IMPLEMENTATION PLAN

**Status:** P3 PLAN — COMPLETE, READY FOR OWNER REVIEW
**Date:** 2026-08-17
**Scope:** Discovery + Planning ONLY. No implementation, no schema changes, no code changes.
**Prerequisite:** P2 COMPLETE — COMMITTED at 3d29392

---

## 1. Executive Summary

P3 closes the operational gaps between P2's approval workflow (which exists but has never been used) and a production-grade catalog management system. The DB holds **2178 models (ALL `draft`)** and **1816 variants (ALL `known`)**. Zero models are approved. 866 models are approval-eligible; 1312 have zero variants.

P3 adds: reopen workflow, variant spec editing, search/filter/pagination in the UI, variant viewer, model history viewer, and the SQL RPCs to support them. Total: **5 new SQL RPCs**, **1 CHECK constraint expansion**, **1 new SQL migration**, **1 major UI overhaul**, **~80 new tests**.

**Discovery finds 3 RPCs already exist** that the P3 Discovery report missed:
- `catalog_create_variant` (file 01 §6.3) — already creates variants
- `catalog_archive_variant` (file 01 §6.5) — already archives variants
- `catalog_admin_list_variants` (file 01 §6.6) — already lists all variants bypassing RLS
- `catalog_get_variant_history` (file 01 §6.7) — already reads variant audit trail

---

## 2. Verified Baseline

### Git

| Check | Value |
|---|---|
| Branch | `main` |
| HEAD | `3d29392` |
| Parent | `bf38add` |
| P2 files | 24 files, +4337/-6, UNCHANGED since checkpoint |
| Working tree | Clean (no modified tracked files) |
| Ahead of origin | 2 commits (bf38add + 3d29392) |

### DB State (fmggysdqigtejxbfpgtg)

| Metric | Value |
|---|---|
| catalog_models | 2178 (ALL `approval_status='draft'`, ALL `status='active'`) |
| catalog_variants | 1816 (ALL `status='known'`, ALL `region=NULL`) |
| Approved | 0 |
| Rejected | 0 |
| Models with ≥1 variant | 866 |
| Models with 0 variants | 1312 |
| Orphan variants | 0 |
| catalog_model_history rows | 0 (no approvals/edits yet) |
| catalog_variant_history rows | 0 |

---

## 3. Current Architecture

### Schema (3 tables)

**catalog_models** (15 columns):
```
id uuid PK | canonical_id text UNIQUE | brand_id text | name text
series text NULL | release_year integer NULL | model_numbers text[] | aliases text[]
status text CHECK(active/archived) | approval_status text CHECK(draft/approved/rejected)
owner_notes text NULL | created_at timestamptz | updated_at timestamptz
UNIQUE(brand_id, name)
```

**catalog_variants** (15 columns):
```
id uuid PK | canonical_variant_id text UNIQUE | model_id uuid FK→catalog_models ON DELETE RESTRICT
ram_mb integer CHECK(>0) | storage_gb integer CHECK(>0) | region text NULL
status text CHECK(unverified/known/verified/archived) | source_type text CHECK(5 values)
verified_by uuid FK→users | verified_at timestamptz | created_by uuid FK→users
notes text NULL | created_at timestamptz | updated_at timestamptz
UNIQUE(model_id, ram_mb, storage_gb) WHERE region IS NULL
UNIQUE(model_id, ram_mb, storage_gb, region) WHERE region IS NOT NULL
```

**catalog_model_history** (8 columns):
```
id uuid PK | model_id uuid FK→catalog_models ON DELETE CASCADE
action text CHECK(CREATE/UPDATE/APPROVE/REJECT)
before jsonb NULL | after jsonb NULL | actor_user_id uuid FK→users | created_at timestamptz
```

**catalog_variant_history** (8 columns):
```
id uuid PK | variant_id uuid FK→catalog_variants ON DELETE CASCADE
action text CHECK(CREATE/UPDATE/VERIFY/ARCHIVE/RESTORE)
before jsonb NULL | after jsonb NULL | actor_user_id uuid FK→users | created_at timestamptz
```

### RLS Policies

| Table | Policy | Effect |
|---|---|---|
| catalog_models | `status = 'active'` → SELECT to anon, authenticated | Public read for active models |
| catalog_variants | `status IN ('known','verified')` → SELECT to anon, authenticated | Public read for known/verified variants |
| catalog_model_history | No read policy, REVOKE ALL FROM anon/authenticated | Admin RPC only |
| catalog_variant_history | No read policy, REVOKE ALL FROM anon/authenticated | Admin RPC only |

### FK Constraints

```
catalog_variants.model_id → catalog_models.id ON DELETE RESTRICT
catalog_model_history.model_id → catalog_models.id ON DELETE CASCADE
catalog_variant_history.variant_id → catalog_variants.id ON DELETE CASCADE
```

**CRITICAL: `inventory_items.model_id` is `TEXT NOT NULL` — no FK to catalog tables. Zero coupling.**

### Existing RPCs (15 total)

| # | RPC | Signature | Purpose | Security |
|---|---|---|---|---|
| 1 | `catalog_is_admin()` | () → boolean | Role check | SECURITY DEFINER, STABLE |
| 2 | `catalog_model_id` | (text, text) → text | Internal identity helper | IMMUTABLE, REVOKE ALL |
| 3 | `catalog_get_model_variants` | (text, text) → SETOF variants | Public variant read | SECURITY DEFINER, anon+auth |
| 4 | `catalog_resolve_model` | (text, text) → model | Public model read | SECURITY DEFINER, anon+auth |
| 5 | `catalog_create_model` | (6 params) → model | Admin create model | SECURITY DEFINER, auth only |
| 6 | `catalog_create_variant` | (7 params) → variant | Admin create variant | SECURITY DEFINER, auth only |
| 7 | `catalog_verify_variant` | (text, timestamptz) → variant | Admin verify variant | SECURITY DEFINER, auth only |
| 8 | `catalog_archive_variant` | (text, text) → variant | Admin archive variant | SECURITY DEFINER, auth only |
| 9 | `catalog_admin_list_variants` | (text) → SETOF variants | Admin list all variants | SECURITY DEFINER, auth only |
| 10 | `catalog_get_variant_history` | (text) → SETOF history | Admin variant audit trail | SECURITY DEFINER, auth only |
| 11 | `catalog_reconciliation_report` | () → TABLE | Admin reconciliation | SECURITY DEFINER, auth only |
| 12 | `catalog_admin_update_model` | (8 params) → model | Admin edit model + concurrency | SECURITY DEFINER, auth only |
| 13 | `catalog_admin_update_variant` | (2 params) → variant | Admin edit variant notes only | SECURITY DEFINER, auth only |
| 14 | `catalog_admin_approve_model` | (3 params) → model | Admin approve/reject + state machine | SECURITY DEFINER, auth only |
| 15 | `catalog_export_snapshot` | () → jsonb | Consistent snapshot for generator | SECURITY DEFINER, auth only |

### Frontend

- **CatalogApprovalScreen** (353 lines): card list, 4 filters, approve/reject, optimistic concurrency
- **Permission**: `catalog` resource, `research_admin` role, `write` action
- **Navigation**: `catalog-approval` screen, back→settings, reachable from settings/home
- **App.tsx**: lazy-loaded, `ProtectedRoute requiredResource="catalog" requiredAction="write"`
- **loader.ts**: imports 18 brand JSONs statically, zero runtime DB reads

### Tests (P2)

- `approval-transitions.test.ts`: 25 tests (state machine model, already includes reopen logic)
- `approval-eligibility.test.ts`: 20 tests (eligibility filter model)
- `approval-pipeline.test.ts`: 15 tests (pipeline integration model)
- Total: 60 P2 catalog tests

---

## 4. P3 Requirements

### P3-1: Reopen RPC
**Problem:** Rejected models can only return to draft by changing the model name (via `catalog_admin_update_model`). This is semantically wrong — the name shouldn't change just to reopen.
**Solution:** New `catalog_admin_reopen_model` RPC: `rejected → draft` without name change.
**Status:** NO existing RPC handles this. Tests already model the logic but no SQL implementation.

### P3-2: Variant Create
**Problem:** Discovery report claimed no variant create RPC exists.
**Reality:** `catalog_create_variant` ALREADY EXISTS in file 01 §6.3. Full admin RPC with SECURITY DEFINER, canonical ID generation, history recording.
**Action:** No new RPC needed. Just verify the existing one works from the UI.

### P3-3: Variant Edit (Specs)
**Problem:** RAM/storage/region are immutable via `catalog_admin_update_variant` (notes-only). Correcting specs requires archive+create, which is a two-step process.
**Solution:** New `catalog_admin_update_variant_specs` RPC that atomically updates ram_mb/storage_gb/region and recalculates canonical_variant_id.
**Safety:** `inventory_items.model_id` is TEXT (no FK to catalog_variants). No FK coupling. Safe to update in-place.

### P3-4: Search + Filter
**Problem:** 2178 models with no text search. Only 4 approval_status filter buttons.
**Solution:** Add text search (name, canonical_id, model_numbers) and additional filters (brand, has_variants) to CatalogApprovalScreen.

### P3-5: Pagination
**Problem:** All 2178 cards render at once.
**Solution:** Server-side pagination via new `catalog_admin_list_models` RPC with offset/limit, or client-side pagination with virtual rendering.

### P3-6: Variant Viewer
**Problem:** Admin approving a model cannot see its variants.
**Solution:** Expandable row in CatalogApprovalScreen showing variants. Uses existing `catalog_admin_list_variants` filtered by model_id.

### P3-7: History Viewer
**Problem:** Audit trail exists in `catalog_model_history` but is not surfaced in UI. No RPC to read model history (only variant history RPC exists).
**Solution:** New `catalog_admin_get_model_history` RPC + expandable history view in UI.

---

## 5. Proposed Architecture

### P3 File Structure

```
supabase/catalog-central/
  19-catalog-p3-rpcs.sql          # NEW: reopen, variant specs edit, model history, model list/search

src/screens/admin/
  CatalogApprovalScreen.tsx       # MODIFIED: search, pagination, variant viewer, history viewer

src/__tests__/catalog/
  approval-transitions.test.ts    # UNCHANGED (already has reopen logic)
  approval-eligibility.test.ts    # UNCHANGED
  approval-pipeline.test.ts       # UNCHANGED
  p3-reopen-rpc.test.ts           # NEW: reopen RPC tests
  p3-variant-specs-rpc.test.ts    # NEW: variant specs edit RPC tests
  p3-model-history-rpc.test.ts    # NEW: model history RPC tests
  p3-model-list-rpc.test.ts       # NEW: model list/search RPC tests
  p3-ui-search.test.ts            # NEW: search/filter/pagination UI tests
  p3-ui-variant-viewer.test.ts    # NEW: variant viewer UI tests
  p3-ui-history-viewer.test.ts    # NEW: history viewer UI tests
```

---

## 6. RPC Signatures

### 6.1 P3-1: `catalog_admin_reopen_model`

```sql
CREATE OR REPLACE FUNCTION public.catalog_admin_reopen_model(
  p_canonical_id          text,
  p_expected_updated_at   timestamptz DEFAULT NULL
)
RETURNS public.catalog_models
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
```

**Validation:**
- `catalog_is_admin()` gate → 42501
- canonical_id required → 22023
- Model must exist → P0002
- `approval_status` must be `rejected` → 23505
- `p_expected_updated_at` optimistic concurrency check → 55000

**Action:** SET `approval_status = 'draft'`, `updated_at = now()`

**History:** INSERT into `catalog_model_history` with action = `'REOPEN'` (CHECK constraint must be expanded)

**ACL:** REVOKE ALL FROM PUBLIC, REVOKE EXECUTE FROM anon, GRANT EXECUTE TO authenticated

### 6.2 P3-3: `catalog_admin_update_variant_specs`

```sql
CREATE OR REPLACE FUNCTION public.catalog_admin_update_variant_specs(
  p_canonical_variant_id  text,
  p_ram_mb                integer DEFAULT NULL,
  p_storage_gb            integer DEFAULT NULL,
  p_region                text DEFAULT NULL,
  p_expected_updated_at   timestamptz DEFAULT NULL
)
RETURNS public.catalog_variants
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
```

**Validation:**
- `catalog_is_admin()` gate → 42501
- canonical_variant_id required → 22023
- Variant must exist → P0002
- Variant must not be archived → 55000
- ram_mb must be positive if provided → 22023
- storage_gb must be positive if provided → 22023
- At least one spec must change → 22023
- New canonical_variant_id must not collide → 23505
- `p_expected_updated_at` optimistic concurrency → 55000

**Action:** UPDATE ram_mb, storage_gb, region, recalculate canonical_variant_id, `updated_at = now()`

**History:** INSERT into `catalog_variant_history` with action = `'UPDATE'`

**Note:** This replaces the current "archive old → create new" workflow for spec corrections. The archive+create path remains available for cases where the admin wants a clean audit trail with explicit CREATE.

### 6.3 P3-7a: `catalog_admin_get_model_history`

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

**Validation:**
- `catalog_is_admin()` gate → 42501
- canonical_id required → 22023
- Model must exist → P0002

**Action:** SELECT from catalog_model_history JOIN users for actor email, ORDER BY created_at DESC, LIMIT/OFFSET

**ACL:** REVOKE ALL FROM PUBLIC, REVOKE EXECUTE FROM anon, GRANT EXECUTE TO authenticated

### 6.4 P3-5: `catalog_admin_list_models`

```sql
CREATE OR REPLACE FUNCTION public.catalog_admin_list_models(
  p_search        text DEFAULT NULL,
  p_brand         text DEFAULT NULL,
  p_approval      text DEFAULT NULL,
  p_has_variants  boolean DEFAULT NULL,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0,
  p_order_by      text DEFAULT 'brand_id',
  p_order_asc     boolean DEFAULT true
)
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
```

**Validation:**
- `catalog_is_admin()` gate → 42501
- p_limit capped at 200 → 22023
- p_order_by whitelist (brand_id, name, approval_status, updated_at, variant_count) → 22023

**Action:** 
- LEFT JOIN catalog_variants for variant_count
- Filter: ILIKE on name/canonical_id for p_search
- Filter: brand_id = p_brand
- Filter: approval_status = p_approval
- Filter: variant_count > 0 or = 0 for p_has_variants
- ORDER BY, LIMIT, OFFSET

**ACL:** REVOKE ALL FROM PUBLIC, REVOKE EXECUTE FROM anon, GRANT EXECUTE TO authenticated

---

## 7. DB Changes

### Migration 19: `19-catalog-p3-rpcs.sql`

**Changes:**
1. EXPAND `catalog_model_history.action` CHECK constraint to include `'REOPEN'`
   ```sql
   ALTER TABLE public.catalog_model_history
     DROP CONSTRAINT catalog_model_history_action_check;
   ALTER TABLE public.catalog_model_history
     ADD CONSTRAINT catalog_model_history_action_check
     CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT','REOPEN'));
   ```

2. CREATE `catalog_admin_reopen_model` RPC
3. CREATE `catalog_admin_update_variant_specs` RPC
4. CREATE `catalog_admin_get_model_history` RPC
5. CREATE `catalog_admin_list_models` RPC
6. Security grants for all new RPCs

**Rollback:** `19-catalog-p3-rpcs-rollback.sql` — DROP all new functions, restore CHECK constraint

**No table additions. No column additions. No data modifications.**

---

## 8. UI Changes

### CatalogApprovalScreen.tsx — Major Overhaul

**Current (353 lines):** Card list, 4 filters, approve/reject buttons
**Proposed (~800-1000 lines):** Full admin dashboard

#### 8.1 Search Bar
- Text input at top: searches name, canonical_id, model_numbers
- Client-side filtering for instant feedback (debounce 300ms)
- Clear button

#### 8.2 Filter Bar (enhanced)
- Approval status: All / Draft / Approved / Rejected (existing)
- Brand: dropdown with all 18 brands + "All"
- Has variants: toggle (All / With / Without)
- Active status: toggle (All / Active / Archived) — future-proofing

#### 8.3 Pagination
- Page size: 50 models per page
- Page controls: Prev / Page X of Y / Next
- Total count display
- Uses `catalog_admin_list_models` RPC for server-side pagination + search
- Loading skeleton during page transitions

#### 8.4 Model Cards (enhanced)
- Brand, name, approval status badge (existing)
- NEW: variant count badge (e.g., "3 variants")
- NEW: series display (when present)
- NEW: release year display (when present)
- NEW: expand chevron for variant/history viewer

#### 8.5 Variant Viewer (expandable row)
- Shows when card is expanded
- Uses `catalog_admin_list_variants` filtered by model_id (via additional RPC or client-side)
- Columns: RAM, Storage, Region, Status, Updated
- Status badges: known (yellow), verified (green), unverified (gray), archived (red)
- "Add Variant" button → opens inline form (calls `catalog_create_variant`)
- "Archive" button per variant → calls `catalog_archive_variant`
- "Edit Specs" button per variant → calls `catalog_admin_update_variant_specs` (inline edit)

#### 8.6 History Viewer (expandable tab within variant viewer)
- Uses `catalog_admin_get_model_history` RPC
- Timeline display: action badge, actor email, timestamp
- Before/after diff view (expandable JSON)
- Paginated (50 per page, load more)

#### 8.7 Action Buttons (enhanced)
- Approve: only visible on draft models with ≥1 variant (pre-check in UI)
- Reject: only visible on draft/approved models
- Reopen: only visible on rejected models → calls `catalog_admin_reopen_model`
- Edit: opens inline edit form for model metadata → calls `catalog_admin_update_model`

---

## 9. Security Model

### Per-RPC Security Checklist

| Check | reopen_model | update_variant_specs | get_model_history | list_models |
|---|---|---|---|---|
| SECURITY DEFINER | ✓ | ✓ | ✓ | ✓ |
| search_path = public | ✓ | ✓ | ✓ | ✓ |
| catalog_is_admin() gate | ✓ | ✓ | ✓ | ✓ |
| REVOKE ALL FROM PUBLIC | ✓ | ✓ | ✓ | ✓ |
| REVOKE EXECUTE FROM anon | ✓ | ✓ | ✓ | ✓ |
| GRANT EXECUTE TO authenticated | ✓ | ✓ | ✓ | ✓ |
| SQL injection safe (parameterized) | ✓ | ✓ | ✓ | ✓ |
| Optimistic concurrency | ✓ | ✓ | N/A | N/A |
| Canonical ID validation | ✓ | ✓ (recalculated) | ✓ | N/A |
| No inventory_items reference | ✓ | ✓ | ✓ | ✓ |

### UI Security

| Check | Status |
|---|---|
| ProtectedRoute with catalog/write | ✓ (existing) |
| Admin role required for all actions | ✓ (via RPC catalog_is_admin gate) |
| Anon cannot access screen | ✓ (ProtectedRoute) |
| Double-submit prevention | ✓ (actingOn state) |
| Optimistic concurrency in UI | ✓ (p_expected_updated_at) |

---

## 10. Data Integrity Invariants

These invariants MUST hold after P3:

1. **No orphan variants:** Every variant's model_id points to an existing model. FK ON DELETE RESTRICT enforces this.
2. **Approval workflow respected:** rejected → draft ONLY via reopen RPC. approved → rejected via approve RPC. draft → approved via approve RPC (requires active + ≥1 valid variant).
3. **Name change still resets:** catalog_admin_update_model name change still resets approval_status to 'draft' (P2 contract unchanged).
4. **Inventory isolation:** Zero FK or write coupling between catalog_variants and inventory_items. Confirmed: inventory_items.model_id is TEXT, not UUID FK.
5. **Canonical identifiers:** canonical_variant_id is deterministic (FNV-1a hash). Spec edits recalculate it. Uniqueness enforced by DB.
6. **History immutability:** catalog_model_history and catalog_variant_history are append-only. No UPDATE/DELETE RPCs exist.
7. **Optimistic concurrency:** All write RPCs support p_expected_updated_at. UI sends it on every mutation.
8. **No anonymous mutation:** All admin RPCs are REVOKE FROM anon. catalog_is_admin() gate as defense-in-depth.
9. **Variant uniqueness:** Partial unique indexes on (model_id, ram_mb, storage_gb) prevent duplicate specs.
10. **Status machine:** New REOPEN action added to CHECK constraint. No other CHECK changes.

---

## 11. Test Matrix

### RPC Tests (vitest, ~50 tests)

**P3-1 Reopen RPC (~10 tests):**
- Admin can reopen rejected model → draft
- Non-rejected model cannot be reopened (draft → blocked)
- Non-rejected model cannot be reopened (approved → blocked)
- Archived model cannot be reopened (blocked)
- Reopen with stale updated_at → concurrent modification error
- Reopen with correct updated_at → success
- Reopen nonexistent model → not found
- Reopen with empty canonical_id → validation error
- History row recorded with action='REOPEN'
- Anon cannot call reopen (ACL)

**P3-3 Variant Specs Edit (~12 tests):**
- Admin can update ram_mb
- Admin can update storage_gb
- Admin can update region
- Admin can update all three at once
- Archived variant cannot be edited → blocked
- New canonical_variant_id calculated correctly
- Duplicate variant specs → collision error
- Nonexistent variant → not found
- Empty canonical_variant_id → validation error
- Stale updated_at → concurrent modification
- History row recorded with action='UPDATE'
- Anon cannot call (ACL)

**P3-7 Model History RPC (~8 tests):**
- Admin can read history for model with history
- Admin gets empty result for model with no history
- Pagination works (limit/offset)
- Actor email included in result
- Nonexistent model → not found
- Empty canonical_id → validation error
- Anon cannot call (ACL)
- Ordering is newest-first

**P3-5 Model List RPC (~12 tests):**
- Admin gets all models (default)
- Search by name filters correctly
- Search by canonical_id filters correctly
- Brand filter works
- Approval status filter works
- has_variants filter works
- Pagination (limit/offset) works
- Ordering by different columns works
- Empty result for no matches
- Limit capped at 200
- Invalid order_by → validation error
- Anon cannot call (ACL)

### UI Tests (~30 tests)

**Search + Filter (~8 tests):**
- Search input filters models by name
- Search input filters by canonical_id
- Brand dropdown filters correctly
- Approval status filter works
- has_variants toggle works
- Clear search restores full list
- Debounce prevents excessive RPCs
- Empty search state displays correctly

**Pagination (~6 tests):**
- Page navigation works
- Total count displayed
- Page X of Y displays correctly
- Next/Prev buttons disabled at boundaries
- Changing filters resets to page 1
- Loading skeleton during page transition

**Variant Viewer (~8 tests):**
- Expanding model card shows variants
- Variant count badge correct
- Status badges render correctly
- Add variant button works
- Archive variant button works
- Edit specs button works
- Variant viewer shows empty state for 0 variants
- Loading state during variant fetch

**History Viewer (~5 tests):**
- Expanding history tab shows entries
- Action badges render correctly
- Timestamp formatted correctly
- Before/after expandable
- Load more pagination works

**Actions (~3 tests):**
- Reopen button visible only on rejected models
- Approve button pre-checks variant count
- Double-submit prevention works

### Regression

- All 60 P2 catalog tests remain unchanged and pass
- `tsc --noEmit` → 0 errors
- `eslint scripts/catalog-p1-*` → 0 errors
- `vitest run` → 1746+/1747 pass (1 pre-existing QR routing flake unchanged)
- `pnpm build` → PASS

---

## 12. Migration Order

```
01-catalog-schema-apply.sql          (P1 base)
05-catalog-create-model-rpc-apply.sql (model create RPC)
11-catalog-admin-schema-apply.sql    (approval_status, model_history)
12-catalog-admin-rpcs.sql            (admin RPCs)
14-catalog-p2-acl-fix.sql            (P2 ACL fix)
15-catalog-p2-transition-guard.sql   (P2 state machine)
16-catalog-p2-concurrency-guard.sql  (P2 optimistic lock)
17-catalog-p2-snapshot-rpc.sql       (P2 snapshot)
18-catalog-p2-verify.sql             (P2 verification)
─────────────────────────────────────
19-catalog-p3-rpcs.sql               (P3: reopen, specs edit, history, list)
```

**Prerequisite:** All files 01–18 applied and verified. No intermediate state.

---

## 13. Checkpoint Strategy

### Checkpoint P3-A: SQL RPCs + CHECK expansion

**Files:**
- `supabase/catalog-central/19-catalog-p3-rpcs.sql` (NEW)
- `supabase/catalog-central/19-catalog-p3-rpcs-rollback.sql` (NEW)
- `supabase/catalog-central/20-catalog-p3-verify.sql` (NEW)
- `src/__tests__/catalog/p3-reopen-rpc.test.ts` (NEW)
- `src/__tests__/catalog/p3-variant-specs-rpc.test.ts` (NEW)
- `src/__tests__/catalog/p3-model-history-rpc.test.ts` (NEW)
- `src/__tests__/catalog/p3-model-list-rpc.test.ts` (NEW)

**Acceptance:**
- All 4 new RPC test files pass
- All P2 tests still pass (60/60)
- TypeScript: 0 errors
- ESLint: 0 errors
- `20-catalog-p3-verify.sql` produces all PASS on live DB

**Rollback:** DROP new functions, restore CHECK constraint

---

### Checkpoint P3-B: UI overhaul

**Files:**
- `src/screens/admin/CatalogApprovalScreen.tsx` (MODIFIED: ~800-1000 lines)
- `src/__tests__/catalog/p3-ui-search.test.ts` (NEW)
- `src/__tests__/catalog/p3-ui-pagination.test.ts` (NEW)
- `src/__tests__/catalog/p3-ui-variant-viewer.test.ts` (NEW)
- `src/__tests__/catalog/p3-ui-history-viewer.test.ts` (NEW)

**Acceptance:**
- All new UI test files pass
- All RPC tests pass
- All P2 tests pass (60/60)
- Full test suite: 1746+/1747
- TypeScript: 0 errors
- ESLint: 0 errors
- `pnpm build` → PASS
- Manual verification: search, pagination, variant viewer, history viewer work

**Rollback:** Revert CatalogApprovalScreen.tsx to P2 version

---

### Checkpoint P3-C: Final verification + docs

**Files:**
- `docs/audits/catalog-p3-completion.md` (NEW)

**Acceptance:**
- Full regression: typecheck, lint, tests, build
- Live DB verification: all new RPCs tested with read-only probes
- Documentation complete

---

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| CHECK constraint expansion requires DROP+ADD (not atomic in Postgres) | Migration could fail mid-way | Wrap in BEGIN/COMMIT; rollback restores old constraint |
| catalog_admin_update_variant_specs changes canonical_variant_id | Existing canonical_variant_id references in other systems could break | Verify no external references; canonical_variant_id is only used internally |
| Server-side pagination adds new RPC call to every page load | Slightly slower initial load | OFFSET/LIMIT with indexed queries; 50ms target |
| CatalogApprovalScreen grows to ~1000 lines | Maintainability | Split into subcomponents (SearchBar, FilterBar, ModelCard, VariantViewer, HistoryViewer) |
| catalog_admin_list_models LEFT JOIN for variant_count | Performance at scale (10K+ models) | Index on catalog_variants.model_id already exists; add composite index if needed |

---

## 15. Out-of-Scope

| Item | Reason |
|---|---|
| Bulk approve/reject | Requires batch RPC design; defer to P4 |
| Runtime catalog refresh (hot-reload) | Requires frontend architecture change; P3 uses offline publish |
| External source integration | Catalog is self-contained; no external APIs needed |
| Release year/series auto-fill | Data quality issue; defer to P4 with owner guidance |
| Model deletion RPC | Dangerous; defer to P4 with explicit owner approval |
| Variant deletion RPC | catalog_archive_variant is the safe alternative |
| Batch approval UI (select multiple) | Defer to P4 |
| Export audit trail to CSV | Defer to P4 |

---

## 16. Implementation Order

### Step 1: Migration 19 (SQL RPCs)

1. Write `19-catalog-p3-rpcs.sql`:
   - EXPAND CHECK constraint (DROP old, ADD new with REOPEN)
   - CREATE `catalog_admin_reopen_model`
   - CREATE `catalog_admin_update_variant_specs`
   - CREATE `catalog_admin_get_model_history`
   - CREATE `catalog_admin_list_models`
   - Security grants for all 4 new RPCs

2. Write `19-catalog-p3-rpcs-rollback.sql`:
   - DROP all 4 new functions
   - RESTORE old CHECK constraint (without REOPEN)

3. Write `20-catalog-p3-verify.sql`:
   - ACL checks: anon has no EXECUTE on all 4 new RPCs
   - Signature checks: correct parameters
   - Security checks: SECURITY DEFINER, search_path=public
   - Schema checks: REOPEN in CHECK constraint
   - Data checks: model/variant counts unchanged, inventory untouched

### Step 2: RPC Unit Tests

1. Write `p3-reopen-rpc.test.ts` (10 tests)
2. Write `p3-variant-specs-rpc.test.ts` (12 tests)
3. Write `p3-model-history-rpc.test.ts` (8 tests)
4. Write `p3-model-list-rpc.test.ts` (12 tests)

**Verify:** `vitest run` — all P2 + P3 RPC tests pass

### Step 3: UI Overhaul

1. Refactor CatalogApprovalScreen into subcomponents:
   - `SearchBar.tsx` (text input + debounce)
   - `FilterBar.tsx` (approval status, brand, has_variants)
   - `Pagination.tsx` (page controls)
   - `ModelCard.tsx` (card with expand)
   - `VariantViewer.tsx` (expandable variant list)
   - `HistoryViewer.tsx` (expandable history timeline)
   - `AddVariantForm.tsx` (inline variant creation)
   - `EditVariantSpecsForm.tsx` (inline spec editing)
   - `EditModelForm.tsx` (inline model metadata editing)

2. Rewrite main CatalogApprovalScreen to compose subcomponents
3. Use `catalog_admin_list_models` RPC for server-side pagination + search

### Step 4: UI Tests

1. Write `p3-ui-search.test.ts` (8 tests)
2. Write `p3-ui-pagination.test.ts` (6 tests)
3. Write `p3-ui-variant-viewer.test.ts` (8 tests)
4. Write `p3-ui-history-viewer.test.ts` (5 tests)
5. Write action tests (3 tests)

### Step 5: Full Regression

1. `tsc --noEmit` → 0 errors
2. `eslint` → 0 errors
3. `vitest run` → 1746+/1747 pass
4. `pnpm build` → PASS
5. Live DB: run `20-catalog-p3-verify.sql` → all PASS

### Step 6: Documentation + Checkpoint

1. Write `docs/audits/catalog-p3-completion.md`
2. Commit: `feat(catalog): P3 catalog management (reopen, specs edit, search, pagination, variant viewer, history)`

---

## 17. Acceptance Criteria

### SQL Layer
- [ ] `19-catalog-p3-rpcs.sql` applied to live DB without errors
- [ ] `20-catalog-p3-verify.sql` produces all PASS
- [ ] REOPEN action in CHECK constraint
- [ ] 4 new RPCs exist with correct signatures
- [ ] Anon has no EXECUTE on any new RPC
- [ ] catalog_model_history records REOPEN action
- [ ] catalog_variant_history records UPDATE on specs edit

### RPC Layer
- [ ] catalog_admin_reopen_model: rejected→draft works
- [ ] catalog_admin_reopen_model: non-rejected blocked
- [ ] catalog_admin_update_variant_specs: ram/storage/region editable
- [ ] catalog_admin_update_variant_specs: canonical_variant_id recalculated
- [ ] catalog_admin_get_model_history: returns paginated history
- [ ] catalog_admin_list_models: search + filter + paginate works
- [ ] All RPCs: optimistic concurrency works
- [ ] All RPCs: audit trail recorded

### UI Layer
- [ ] Search by name/canonical_id works
- [ ] Brand filter works
- [ ] Approval status filter works
- [ ] has_variants filter works
- [ ] Pagination works (50 per page)
- [ ] Variant viewer shows variants with status badges
- [ ] Add variant inline form works
- [ ] Edit variant specs inline form works
- [ ] History viewer shows timeline
- [ ] Reopen button visible only on rejected models
- [ ] Approve button pre-checks variant count
- [ ] Double-submit prevention works
- [ ] Optimistic concurrency error handled gracefully

### Regression
- [ ] All 60 P2 catalog tests pass
- [ ] All P3 tests pass (~80 new)
- [ ] TypeScript: 0 errors
- [ ] ESLint: 0 errors
- [ ] Full test suite: 1746+/1747
- [ ] `pnpm build`: PASS
- [ ] No inventory_items modified
- [ ] No catalog data modified (except CHECK constraint)
- [ ] No P2 files modified
