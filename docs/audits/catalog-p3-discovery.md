# P3 DISCOVERY — CATALOG CURATION & APPROVAL WORKFLOW

**Status:** P3 DISCOVERY — COMPLETE
**Date:** 2026-08-17
**Scope:** Read-only discovery of catalog curation gaps, data quality, UX deficiencies, and missing capabilities in the P2-delivered approval workflow.
**Prerequisite:** P2 COMPLETE — COMMITTED at 3d29392

---

## A. Executive Summary

This report documents the current state of the catalog curation system after P2 delivery. P2 completed the approval workflow (ACL hardening, state machine, optimistic concurrency, approval UI, snapshot RPC). However, significant operational gaps remain for a production curation workflow. The DB currently holds **2178 models (ALL `draft`, ALL `active`)** and **1816 variants (ALL `known`, ALL `region=NULL`)**. **Zero models are approved** — the approval workflow exists but has never been used.

---

## B. Current State Summary

| Metric | Value |
|---|---|
| DB models | 2178 (ALL `approval_status='draft'`, ALL `status='active'`) |
| DB variants | 1816 (ALL `status='known'`, ALL `region=NULL`) |
| Approved models | 0 |
| Rejected models | 0 |
| Models with ≥1 known/verified variant | 866 |
| Models with NO variants | 1312 |
| Orphan variants (no parent model) | 0 |
| NULL approval_status rows | 0 |
| Invalid approval_status values | 0 |
| Brand JSON files | 18 |
| JSON models | 2178 (pre-P1 state, will be pruned on first approved-model publish) |
| SQL migrations applied | 00–18 |
| P2 test count | 1746/1747 (1 pre-existing QR routing flake) |
| TypeScript errors | 0 |
| ESLint errors | 0 |
| Production build | PASS |

---

## C. Database Schema

### catalog_models (15 columns)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PRIMARY KEY, gen_random_uuid() |
| canonical_id | text | UNIQUE, NOT NULL |
| brand_id | text | NOT NULL |
| name | text | NOT NULL |
| series | text | NULL (241 models missing) |
| release_year | integer | NULL (1312 models missing) |
| model_numbers | text[] | NULL |
| aliases | text[] | NULL |
| status | text | CHECK (active/archived/draft) |
| approval_status | text | CHECK (draft/approved/rejected), DEFAULT 'draft' |
| owner_notes | text | NULL |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |
| UNIQUE(canonical_id) | constraint | |
| UNIQUE(brand_id, name) | constraint | |

### catalog_variants (11 columns)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PRIMARY KEY, gen_random_uuid() |
| canonical_variant_id | text | UNIQUE, NOT NULL |
| model_id | uuid | FK → catalog_models(id) |
| ram_mb | integer | NOT NULL |
| storage_gb | integer | NOT NULL |
| region | text | NULL (ALL 1816 rows) |
| status | text | NOT NULL, CHECK (known/verified/archived) |
| source_type | text | NULL |
| source_detail | text | NULL |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### catalog_model_history (append-only audit)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PRIMARY KEY |
| model_id | uuid | FK → catalog_models(id) ON DELETE CASCADE |
| action | text | CHECK (CREATE/UPDATE/APPROVE/REJECT) |
| before | jsonb | NULL |
| after | jsonb | NULL |
| actor_user_id | uuid | FK → users(id), NULL |
| created_at | timestamptz | DEFAULT now() |

RLS: deny-all for anon/authenticated. Only service_role (admin RPCs) can write.

---

## D. Data Quality — Variant & Model Statistics

### Variant RAM Distribution

| RAM (MB) | Count | Percentage |
|---|---|---|
| 8192 | 525 | 28.9% |
| 12288 | 368 | 20.3% |
| 4096 | 307 | 16.9% |
| 6144 | 199 | 10.9% |
| 2048 | 180 | 9.9% |
| 16384 | 123 | 6.8% |
| 3072 | 64 | 3.5% |
| 24576 | 32 | 1.8% |
| 1024 | 14 | 0.8% |
| 512 | 3 | 0.2% |
| 256 | 1 | 0.1% |

**DB → JSON label:** `ram_mb / 1024` → e.g., 8192 → "8 GB"

### Variant Storage Distribution

| Storage (GB) | Count | Percentage |
|---|---|---|
| 128 | 568 | 31.3% |
| 256 | 556 | 30.6% |
| 64 | 249 | 13.7% |
| 512 | 191 | 10.5% |
| 1024 | 101 | 5.6% |
| 32 | 71 | 3.9% |
| 16 | 48 | 2.6% |
| 2048 | 28 | 1.5% |
| 8 | 3 | 0.2% |
| 4 | 1 | 0.1% |

**DB → JSON label:** 1024→"1000", 2048→"2000", else `storage_gb` as-is.

### Model Brand Distribution (Top 10)

| Brand | Count | Percentage |
|---|---|---|
| samsung | 366 | 16.8% |
| xiaomi | 305 | 14.0% |
| vivo | 196 | 9.0% |
| oppo | 181 | 8.3% |
| realme | 167 | 7.7% |
| honor | 165 | 7.6% |
| huawei | 115 | 5.3% |
| oneplus | 107 | 4.9% |
| motorola | 97 | 4.5% |
| google | 50 | 2.3% |

### Model Data Quality Gaps

| Gap | Count | Impact |
|---|---|---|
| Missing `series` | 241 (11.1%) | Cannot group by series in UI |
| Missing `release_year` | 1312 (60.2%) | Cannot filter by year, age, or generation |
| Models with 0 variants | 1312 (60.2%) | Cannot be approved (need ≥1 known/verified variant) |
| Models with ≥1 variant | 866 (39.8%) | Approval-eligible (if status='active' + approval_status='draft') |

### Origin of Data

- **866 models:** Original seed from runtime JSON (file 02), imported from manually curated catalog.
- **1312 models:** Added by GC-R3 reconciliation from Golden Catalog (`.catalog-store/catalog_models_v1.json`, 3004 total; 1312 were in-scope).
- **1816 variants:** Only associated with the 866 original models. The 1312 GC-R3 models have **zero variants**.

---

## E. RPC Security Chain

### Available RPCs

| RPC | Signature | Security | Notes |
|---|---|---|---|
| `catalog_create_model` | (6-param) | SECURITY DEFINER, catalog_is_admin(), REVOKE anon | Creates model, sets approval_status='draft' |
| `catalog_admin_update_model` | (8-param) | SECURITY DEFINER, catalog_is_admin(), optimistic lock | Edits name/series/year/numbers/aliases/notes. Name change resets approval_status='draft' |
| `catalog_admin_update_variant` | (2-param) | SECURITY DEFINER, catalog_is_admin(), REVOKE anon | Notes-only edit. RAM/storage/region immutable. |
| `catalog_admin_approve_model` | (3-param) | SECURITY DEFINER, catalog_is_admin(), optimistic lock, state machine | draft→approved (requires active + ≥1 valid variant), reject via p_approve=false |
| `catalog_export_snapshot` | (0-param) | SECURITY DEFINER, catalog_is_admin(), REVOKE anon | Returns {models, variants, exported_at} in single statement |

### Anon Access

| RPC | Anon EXECUTE | Status |
|---|---|---|
| `catalog_admin_update_model` | false | PGRST202 (not in schema cache for anon) |
| `catalog_admin_approve_model` | false | REVOKE applied by file 15 |
| `catalog_admin_update_variant` | false | REVOKE applied by file 14 |
| `catalog_export_snapshot` | false | REVOKE applied by file 17 |
| `catalog_create_model` | false | REVOKE applied by file 09 |

### Anon SELECT on catalog_models

Anon **CAN** read `catalog_models` (SELECT grant + `status='active'` RLS policy, no `approval_status` filter). This is intentional: the public catalog needs model data for end-user features.

---

## F. Approval Workflow (P2 State Machine)

### Transitions

```text
draft   → approved   (requires: status='active', ≥1 known/verified variant)
draft   → rejected   (no additional condition)
approved → rejected  (via p_approve=false)
rejected → draft     (via catalog_admin_update_model name change — only path)
archived → *         BLOCKED (archived cannot be approved)
approved → approved  BLOCKED (must reject first, then re-open to draft)
rejected → approved  BLOCKED (must re-open to draft first)
```

### Reopen Path (rejected → draft)

The **only** way to reopen a rejected model is via `catalog_admin_update_model` name change, which implicitly resets `approval_status` to `'draft'`. There is no explicit "reopen" RPC. This is an **operational gap**: a rejected model must have its name changed to re-enter draft state, which is semantically incorrect (the name shouldn't change just to reopen).

### Missing RPC: `catalog_admin_reopen_model`

No RPC exists to explicitly transition `rejected → draft` without requiring a name change. The current path via `catalog_admin_update_model` requires changing the model name, which is a side-effect that corrupts the audit trail.

### Missing RPC: `catalog_admin_delete_model`

No RPC exists to delete a model. Archived models can only be left in `status='archived'` state.

### Missing RPC: `catalog_admin_delete_variant`

No RPC exists to delete a variant. Variants can only be archived via `catalog_admin_update_variant(p_status='archived')`.

### Missing RPC: `catalog_admin_edit_variant`

No RPC exists to edit variant RAM, storage, or region. These fields are immutable by design (see file 12 comments: "Safe future spec correction: archive old variant → create new variant"). This is a significant operational gap: correcting a variant's RAM or storage requires archiving the old variant and creating a new one, but `catalog_create_model` is the only RPC that creates models (not variants), and `catalog_admin_update_variant` is notes-only.

---

## G. Publication Path (DB → JSON → UI)

```text
DB (catalog_models + catalog_variants)
    ↓
catalog_export_snapshot() [P2] or paginated queries [P1 generator]
    ↓
scripts/catalog-p1-generate.ts
  ↓ eligibility filter: approval_status='approved' + status='active' + ≥1 valid variant
  ↓ atomic write to src/catalog/brands/{brand}.json
    ↓
src/catalog/loader.ts (imports all 18 brand JSONs statically at build time)
    ↓
App renders catalog from static JSON (no runtime DB reads)
```

### Key Observations

1. **App has NO direct DB reads at runtime.** All catalog data comes from static JSON imported at build time.
2. **Publication is manual CLI only.** No scheduled/CI/auto publishing.
3. **DB→JSON conversion:** `catalog_export_snapshot()` returns raw DB data. `generate.ts` transforms it to the app's JSON format (`{brand, aliases, models: [{model, series, releaseYear, modelNumbers, variants: [{ram, storage}]}]}`).
4. **No runtime refresh.** Changes require app rebuild + redeploy.
5. **No hot-reload hook.** No mechanism to detect DB changes and trigger regeneration.

---

## H. Approval UI (CatalogApprovalScreen)

**File:** `src/screens/admin/CatalogApprovalScreen.tsx` (353 lines)

### Current Capabilities

| Feature | Status |
|---|---|
| Card list of all models | ✓ |
| Filter by approval_status (All/Draft/Approved/Rejected) | ✓ |
| Approve button (draft→approved) | ✓ |
| Reject button (draft/rejected→rejected) | ✓ |
| Optimistic concurrency (p_expected_updated_at) | ✓ |
| Stats display (total/draft/approved/rejected) | ✓ |
| Refresh button | ✓ |
| Error display | ✓ |
| Success display | ✓ |

### Missing Capabilities (P3 Gaps)

| Gap | Impact | Priority |
|---|---|---|
| **No search/filter by name** | Cannot find specific models among 2178 | REQUIRED |
| **No pagination** | All 2178 models loaded at once | REQUIRED |
| **No variant view** | Cannot inspect variants before approving | REQUIRED |
| **No edit capability** | Cannot edit model metadata from UI | REQUIRED |
| **No history view** | Cannot see audit trail of changes | RECOMMENDED |
| **No brand filter** | Cannot filter by specific brand | RECOMMENDED |
| **No bulk approve/reject** | Must approve/reject one at a time | RECOMMENDED |
| **No status filter on variants** | Cannot filter variants by known/verified/archived | RECOMMENDED |
| **No series grouping** | Cannot group models by series | OPTIONAL |
| **No release year display** | 60% missing, but should show when present | OPTIONAL |

### UI Design Issues

1. **No responsive pagination:** 2178 models all load in one request. The `PAGE_SIZE=1000` loop works but the UI renders all 2178 cards at once.
2. **No model detail view:** Approving a model without seeing its variants is risky. The current UI shows brand + name + status + approval buttons, but no variant info.
3. **Approve button visible on all draft models:** No pre-check for variant eligibility. The RPC will reject models with 0 variants, but the user gets an error only after clicking.
4. **Footer message is the only guidance:** "Only draft models can be approved. Rejected models must be reopened to draft first (edit name)." — this is the entire UX documentation.

---

## I. Navigation & Permissions

### Screen Registration

- `catalog-approval` in `ScreenName` union (navigation.tsx)
- In `ALL_SCREEN_NAMES` array
- Back matrix: `catalog-approval → settings`
- Reachability: inbound from `settings` only
- Permission gate: `catalog` resource in `research_admin`, `write` action
- `ProtectedRoute requiredResource="catalog" requiredAction="write"` in App.tsx

### Access Chain

```text
User (admin/super_admin) → Settings → Catalog Approval → Approve/Reject
```

---

## J. External Sources

**Finding: catalog data is self-contained.** No external APIs are used at runtime or during generation. All phone specs originated from manually curated JSON/CSV files. The Golden Catalog (`.catalog-store/catalog_models_v1.json`) is a local file, not fetched from any external API. External sources are no longer needed.

---

## K. Inventory Isolation

**Confirmed:** Catalog and inventory are strictly isolated.

- `src/catalog/` imports zero inventory references.
- Admin RPCs explicitly state "No reference to inventory_items".
- Seed runtime snapshots inventory before/after and raises on drift.
- No code path connects catalog to inventory.

---

## L. Legacy Paths

### Registered Legacy Paths

- `catalog:generate` → `scripts/catalog-p1-generate.ts`
- `catalog:validate` → `scripts/catalog-p1-validate.ts`
- `catalog:reconcile` → `scripts/catalog-p1-reconcile.ts`
- `catalog:generate:snapshot` → `scripts/catalog-p1-generate.ts --snapshot`
- `catalog:validate:live` → `scripts/catalog-p1-validate.ts --live-db`
- `catalog:reconcile:live` → `scripts/catalog-p1-reconcile.ts --live-db`
- `catalog:live-recon` → `scripts/catalog-p2-live-recon.ts` (read-only)
- `catalog:golden-reconcile` → `scripts/catalog-golden-reconcile.ts` (read-only)
- `catalog:golden-owner-review` → `scripts/catalog-golden-owner-review.ts` (read-only)
- `catalog:gc-r3-prepare` → `scripts/catalog-gc-r3-prepare.ts` (read-only)
- `catalog:gc-r3-build-apply` → `scripts/catalog-gc-r3-build-apply.ts` (read-only)
- `catalog:regenerate-static` → `scripts/catalog-regenerate-static.ts` (legacy, not in npm scripts)

### No Bypass Paths Found

All approval operations go through `catalog_admin_approve_model` RPC. No bypass routes exist in `src/`.

---

## M. Variant Edit Capability (Gap)

**Current state:** `catalog_admin_update_variant(p_canonical_variant_id, p_status)` — notes-only, RAM/storage/region immutable.

**Operational impact:** Correcting a variant's RAM, storage, or region requires:
1. Archive the old variant (`catalog_admin_update_variant(p_status='archived')`)
2. Create a new variant with correct specs — but **no RPC exists to create a variant independently**. The only way to create variants is through `catalog_create_model`, which creates a whole new model.

**Required RPCs:**

| RPC | Purpose |
|---|---|
| `catalog_admin_update_variant_specs` | Edit RAM, storage, region on existing variant |
| `catalog_admin_create_variant` | Add new variant to existing model |
| `catalog_admin_delete_variant` | Remove variant entirely |

---

## N. Model Edit Capability (Gap)

**Current state:** `catalog_admin_update_model` can edit name, series, release_year, model_numbers, aliases, owner_notes. Name change resets `approval_status='draft'`.

**Operational impact:** Most editing works. However:

1. **No reopen RPC:** Rejected models must have their name changed to re-enter draft state. This is semantically incorrect.
2. **No status edit:** `status` (active/archived/draft) cannot be changed via RPC. Models cannot be archived via UI.
3. **No brand_id edit:** Brand assignment is immutable after creation.
4. **No delete:** Models cannot be deleted.

**Required RPCs:**

| RPC | Purpose |
|---|---|
| `catalog_admin_reopen_model` | rejected → draft without name change |
| `catalog_admin_set_status` | Change status (active/archived) |
| `catalog_admin_delete_model` | Remove model entirely |

---

## O. Search & Filtering (Gap)

**Current UI state:** 4 filter buttons (All/Draft/Approved/Rejected). No text search.

**Operational impact:** With 2178 models, finding a specific model is impossible without scrolling.

**Required capabilities:**

| Capability | Priority |
|---|---|
| Text search by model name | REQUIRED |
| Text search by model number | REQUIRED |
| Filter by brand | REQUIRED |
| Filter by series | RECOMMENDED |
| Filter by release year | OPTIONAL |
| Filter by variant count | OPTIONAL |
| Sort by name/brand/updated_at | RECOMMENDED |

---

## P. History & Audit (Gap)

**Current state:** `catalog_model_history` table exists with full audit trail. Admin RPCs write to it. RLS denies anon/authenticated reads.

**Operational impact:** The audit trail exists in the DB but is not surfaced in the UI. An admin approving a model cannot see who approved/rejected it before, or when.

**Required capabilities:**

| Capability | Priority |
|---|---|
| History viewer in UI (per model) | RECOMMENDED |
| RPC to read model history | REQUIRED |
| Export audit trail | OPTIONAL |

---

## Q. Batch Operations (Gap)

**Current state:** Single-model approve/reject only.

**Operational impact:** Approving 866 eligible models one at a time is impractical.

**Required capabilities:**

| Capability | Priority |
|---|---|
| Bulk approve (select multiple) | RECOMMENDED |
| Bulk reject (select multiple) | RECOMMENDED |
| Approve all draft models with ≥1 variant | OPTIONAL |

---

## R. Recommendations

### REQUIRED (must be implemented before production curation use)

| # | Item | Files Affected |
|---|---|---|
| R1 | `catalog_admin_reopen_model` RPC — rejected → draft without name change | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R2 | `catalog_admin_create_variant` RPC — add variant to existing model | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R3 | `catalog_admin_update_variant_specs` RPC — edit RAM/storage/region | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R4 | Search/filter in CatalogApprovalScreen (text search + brand filter) | `src/screens/admin/CatalogApprovalScreen.tsx` |
| R5 | Pagination in CatalogApprovalScreen (virtual or paged) | `src/screens/admin/CatalogApprovalScreen.tsx` |
| R6 | Variant viewer in CatalogApprovalScreen (expandable row) | `src/screens/admin/CatalogApprovalScreen.tsx` |
| R7 | RPC to read model history (`catalog_admin_get_model_history`) | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |

### RECOMMENDED (significant UX/operational improvement)

| # | Item | Files Affected |
|---|---|---|
| R8 | Bulk approve/reject in UI (multi-select) | `src/screens/admin/CatalogApprovalScreen.tsx` |
| R9 | History viewer in UI (per model expandable) | `src/screens/admin/CatalogApprovalScreen.tsx` |
| R10 | `catalog_admin_set_status` RPC (active/archived toggle) | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R11 | Catalog stats dashboard (brand/year/series coverage) | New screen or integration |
| R12 | Variant count display per model in approval list | `src/screens/admin/CatalogApprovalScreen.tsx` |

### OPTIONAL (nice-to-have)

| # | Item | Files Affected |
|---|---|---|
| R13 | `catalog_admin_delete_model` RPC | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R14 | `catalog_admin_delete_variant` RPC | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R15 | Approve-all-batch RPC (approve all draft models with ≥1 variant) | `supabase/catalog-central/19-catalog-p3-rpcs.sql` (new) |
| R16 | Export audit trail to CSV | New script or UI button |
| R17 | Series grouping in approval list | `src/screens/admin/CatalogApprovalScreen.tsx` |
| R18 | Release year filter | `src/screens/admin/CatalogApprovalScreen.tsx` |

### Files That Must NOT Be Modified

| File | Reason |
|---|---|
| `src/__tests__/catalog/*.test.ts` | P2 test suite (1746/1747 pass) |
| `supabase/catalog-central/01-catalog-schema-apply.sql` | Base schema (P1 checkpoint) |
| `supabase/catalog-central/02-catalog-seed-runtime.sql` | Seed data (P1 checkpoint) |
| `supabase/catalog-central/11-catalog-admin-schema-apply.sql` | Admin schema (P1 checkpoint) |
| `supabase/catalog-central/12-catalog-admin-rpcs.sql` | Admin RPCs (P1 checkpoint) |
| `supabase/catalog-central/14-catalog-p2-acl-fix.sql` | P2 ACL fix |
| `supabase/catalog-central/15-catalog-p2-transition-guard.sql` | P2 state machine |
| `supabase/catalog-central/16-catalog-p2-concurrency-guard.sql` | P2 optimistic lock |
| `supabase/catalog-central/17-catalog-p2-snapshot-rpc.sql` | P2 snapshot RPC |
| `scripts/catalog-p1-generate.ts` | P1 generator |
| `scripts/catalog-p1-validate.ts` | P1 validator |
| `scripts/catalog-p1-reconcile.ts` | P1 reconciler |
| `src/catalog/loader.ts` | Static JSON imports (runtime) |
| `src/catalog/types.ts` | Type definitions |

---

## S. Quantitative Evidence Summary

### DB Snapshot (fmggysdqigtejxbfpgtg, 2026-08-17)

```sql
-- Model counts
SELECT approval_status, count(*) FROM catalog_models GROUP BY approval_status;
-- draft: 2178, approved: 0, rejected: 0

-- Variant counts
SELECT status, count(*) FROM catalog_variants GROUP BY status;
-- known: 1816, verified: 0, archived: 0

-- Eligibility
SELECT count(*) FROM catalog_models cm
WHERE cm.approval_status = 'draft'
  AND cm.status = 'active'
  AND (SELECT count(*) FROM catalog_variants cv
       WHERE cv.model_id = cm.id AND cv.status IN ('known','verified')) >= 1;
-- 866 eligible if approved

-- Data gaps
SELECT count(*) FROM catalog_models WHERE series IS NULL;       -- 241
SELECT count(*) FROM catalog_models WHERE release_year IS NULL; -- 1312
SELECT count(*) FROM catalog_models WHERE id NOT IN
  (SELECT DISTINCT model_id FROM catalog_variants);             -- 1312 (no variants)

-- Brand coverage
SELECT brand_id, count(*) FROM catalog_models
GROUP BY brand_id ORDER BY count(*) DESC LIMIT 10;
-- samsung: 366, xiaomi: 305, vivo: 196, oppo: 181, realme: 167

-- Variant RAM distribution
SELECT ram_mb, count(*) FROM catalog_variants
GROUP BY ram_mb ORDER BY count(*) DESC;
-- 8192: 525, 12288: 368, 4096: 307, 6144: 199

-- Variant storage distribution
SELECT storage_gb, count(*) FROM catalog_variants
GROUP BY storage_gb ORDER BY count(*) DESC;
-- 128: 568, 256: 556, 64: 249, 512: 191
```

---

## T. Open Questions for P3 Implementation

1. **Variant creation:** Should P3 add a standalone variant creation RPC, or extend `catalog_create_model` to optionally create variants in one call?
2. **History access:** Should the history RPC be admin-only (security definer) or readable by any authenticated user?
3. **Bulk operations:** Should bulk approve be a single RPC (batch) or multiple calls from the UI?
4. **Search scope:** Should the UI search hit the DB directly (via RPC) or filter the client-side model list?
5. **Pagination strategy:** Virtual scrolling (render only visible rows) or server-side pagination via RPC?
6. **Variant edit safety:** Should variant spec edits be allowed on approved models, or only on draft models?

---

**P1: CLOSED — bf38add**
**P2: CLOSED — 3d29392**
**P3 Discovery: COMPLETE — 2026-08-17**
**P3 Implementation: NOT STARTED**
