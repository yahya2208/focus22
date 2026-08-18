# Catalog Manual Creation & Variant Expansion — Discovery Report

**Date:** 2026-08-17
**Status:** READ-ONLY DISCOVERY COMPLETE — AWAITING OWNER REVIEW
**Author:** automated discovery
**Baseline commit:** `3b4af32` (main)

---

## Executive Summary

The catalog system has a fully functional database layer with RPCs for model creation, variant creation, editing, approval, and audit — but **zero UI for creation or editing**. The owner can currently only approve/reject/reopen existing models. To achieve owner-controlled manual catalog creation, we need to build an admin UI that calls the already-existing RPCs, fix one audit gap (model creation lacks history), and close the P1→runtime publication loop.

**What already works (DB/RPC layer):**
- `catalog_create_model` — creates models with auto-generated `canonical_id`
- `catalog_create_variant` — creates variants with auto-generated `canonical_variant_id`
- `catalog_admin_update_model` — edits model fields with optimistic locking
- `catalog_admin_update_variant_specs` — edits variant RAM/storage/region with CVID recalculation
- `catalog_admin_approve_model` / `catalog_admin_reopen_model` — approval state machine
- Full audit trail on all mutations EXCEPT model creation
- Collision detection via unique constraints and deterministic ID generation

**What is missing:**
- No "Create Model" UI form
- No "Create Variant" UI form
- No "Edit Model" UI form
- No "Edit Variant" UI form
- `catalog_create_model` does NOT write to `catalog_model_history` (audit gap)
- No UI for verify/archive variant
- No unified "publish" button (P1 generation is CLI-only)
- No new-brand runtime support without code change to `loader.ts`

---

## A. What Already Works

### Database Layer
| Capability | RPC | Status |
|---|---|---|
| Create model | `catalog_create_model` | ✅ RPC exists, admin-gated, collision-safe |
| Create variant | `catalog_create_variant` | ✅ RPC exists, admin-gated, audit-logged |
| Edit model fields | `catalog_admin_update_model` | ✅ Optimistic locking, audit, name-change→draft |
| Edit variant specs | `catalog_admin_update_variant_specs` | ✅ Optimistic locking, audit, CVID recalculation |
| Edit variant notes | `catalog_admin_update_variant` | ✅ Audit logged |
| Approve model | `catalog_admin_approve_model` | ✅ Optimistic locking, state machine |
| Reject model | `catalog_admin_approve_model` | ✅ Same RPC, `p_approve=false` |
| Reopen model | `catalog_admin_reopen_model` | ✅ Rejected→draft only |
| Verify variant | `catalog_verify_variant` | ✅ Audit logged |
| Archive variant | `catalog_archive_variant` | ✅ Audit logged, never deletes |
| List models (paginated) | `catalog_admin_list_models` | ✅ Search, filter, sort |
| List variants | `catalog_admin_list_variants` | ✅ Status/model filter |
| View model history | `catalog_admin_get_model_history` | ✅ Paginated, actor email |
| View variant history | `catalog_get_variant_history` | ✅ |
| Export snapshot | `catalog_export_snapshot` | ✅ Consistent JSON export |

### Approval Pipeline
- `draft → approved` (requires ≥1 known/verified variant)
- `draft → rejected`
- `approved → rejected`
- `rejected → draft` (via reopen or name change)
- All transitions audited except model creation

### P1 Generation Pipeline
- `pnpm catalog:generate` reads DB, filters eligible models, writes JSON
- `pnpm catalog:validate` validates 7 gates
- `--dry-run` previews changes
- `--force` required for removals
- JSON committed to git → Vite bundles at build time → runtime loads static JSON

---

## B. What Is Missing

### Critical Gaps
1. **No model creation UI** — `catalog_create_model` RPC exists but no form calls it
2. **No variant creation UI** — `catalog_create_variant` RPC exists but no form calls it
3. **No model editing UI** — `catalog_admin_update_model` RPC exists but no form calls it
4. **No variant editing UI** — `catalog_admin_update_variant_specs` RPC exists but no form calls it
5. **Model creation has no audit trail** — `catalog_create_model` does NOT insert into `catalog_model_history`

### Important Gaps
6. **No new-brand runtime support** — Adding a brand requires editing `src/catalog/loader.ts` (code change)
7. **No verify/archive UI** — RPCs exist but no buttons in the UI
8. **No variant history UI** — RPC exists but no viewer component
9. **No unified publish button** — P1 generation is a CLI script, not accessible from UI
10. **No variant panel pagination** — UI passes `p_limit`/`p_offset` to RPC that doesn't accept them

### Nice-to-Have (Deferred)
11. No reconciliation report UI
12. No export snapshot UI
13. No batch operations

---

## C. What Must NOT Be Changed

- Existing catalog RPCs (18 total) — add-only, never modify existing signatures
- `catalog_model_id()` and `catalog_variant_id()` functions — deterministic, proven
- `catalog_fnv1a_hash()` — core identity function, immutable
- `catalog_ram_label()` / `catalog_storage_label()` — canonical formatting
- RLS policies — all read policies are correct
- `canonial-adapter.ts` / `loader.ts` runtime path — production-critical
- `catalog-p1-generate.ts` — proven pipeline
- All 171+ existing catalog tests — regression baseline
- Migration files 00001–00025 — historical record
- P1/P2/P3/P4 catalog commits — proven history

---

## D. Exact Model Creation Path

```
OWNER enters: Brand + Name + [Series] + [Release Year] + [Model Numbers] + [Aliases]
    ↓
UI validates: brand non-empty, name non-empty
    ↓
UI calls: catalog_create_model(p_brand_id, p_name, p_series, p_release_year, p_model_numbers, p_aliases)
    ↓
RPC: catalog_model_id(brand_id, name) → canonical_id
  Algorithm: brand_id || '-' || slugify(name)
  slugify: lower(trim) → replace [^a-z0-9]+ with '-' → trim dashes → fallback 'unknown'
  Special: 4 MODEL_ID_OVERRIDES for Xiaomi Pro+ models
    ↓
RPC: Check (brand_id, name) uniqueness → reject 23505 if exists
RPC: Check canonical_id uniqueness → reject 23505 if exists
    ↓
INSERT INTO catalog_models: status='active', approval_status='draft'
    ↓
RETURN new row
    ↓
⚠️ NO history INSERT (audit gap — needs fix)
    ↓
UI refreshes model list
```

**canonical_id format:** `{brand_slug}-{slugified_name}`
**Examples:**
- Apple + "iPhone 16 Pro" → `apple-iphone-16-pro`
- Samsung + "Galaxy S24 Ultra" → `samsung-galaxy-s24-ultra`
- Xiaomi + "Redmi Note 13 Pro+" → `xiaomi-redmi-note-13-pro-plus` (OVERRIDE)

**Collision defense:**
- UNIQUE on `canonical_id` (deterministic from brand+name)
- UNIQUE on `(brand_id, name)` (explicit compound index)
- Two admins creating same model simultaneously: one succeeds, one gets 23505

---

## E. Exact Variant Creation Path

```
OWNER selects: existing model (via canonical_id)
OWNER enters: RAM (MB) + Storage (GB) + [Region] + [Notes]
    ↓
UI validates: ram_mb > 0, storage_gb > 0
    ↓
UI calls: catalog_create_variant(p_model_canonical_id, p_ram_mb, p_storage_gb, p_region, p_source_type='ADMIN_MANUAL', p_notes, p_verified=false)
    ↓
RPC: Lookup model by canonical_id → reject if not found
    ↓
RPC: catalog_variant_id(brand_id, canonical_id, ram_mb, storage_gb, region) → canonical_variant_id
  Algorithm: FNV-1a-32(brand|model|ramLabel|storageLabel|region) in base-36
  ramLabel: catalog_ram_label(ram_mb) → '256'→'0.25GB', '8192'→'8GB', '1536'→'1.5GB'
  storageLabel: catalog_storage_label(storage_gb) → '128'→'128GB', '1024'→'1TB'
  region: COALESCE(region, '') — NULL becomes empty string
    ↓
RPC: Check partial unique indexes (model_id, ram_mb, storage_gb, [region]) → reject 23505 if duplicate
    ↓
INSERT INTO catalog_variants: status='unverified' (default), source_type='ADMIN_MANUAL'
INSERT INTO catalog_variant_history: action='CREATE'
    ↓
RETURN new row
```

**canonical_variant_id format:** FNV-1a base-36 hash (6-8 chars)
**Examples:**
- apple-iphone-16-pro + 8GB + 128GB + NULL → hash of `apple|apple-iphone-16-pro|8GB|128GB|`
- samsung-galaxy-s24-ultra + 12GB + 512GB + EU → hash of `samsung|samsung-galaxy-s24-ultra|12GB|512GB|EU`

**Collision defense:**
- UNIQUE on `canonical_variant_id`
- Partial UNIQUE on `(model_id, ram_mb, storage_gb) WHERE region IS NULL`
- Partial UNIQUE on `(model_id, ram_mb, storage_gb, region) WHERE region IS NOT NULL`

**RAM representation:**
- DB stores: `ram_mb` as integer MB (8192 for 8GB, 256 for 0.25GB)
- Runtime expects: human-readable labels ("8GB", "0.25GB")
- Conversion: `catalog_ram_label()` in DB, `toCanonicalRam()` in TS

---

## F. Runtime Publication Path

```
DATABASE (catalog_models + catalog_variants)
    ↓
pnpm catalog:generate [--live-db] [--dry-run] [--verbose]
  reads DB via Supabase service role
  applies eligibility filter: approved + active + ≥1 valid variant
  transforms: DB integers → labels, sorts deterministically
  validates: 10 internal checks
  writes: src/catalog/brands/*.json
    ↓
pnpm catalog:validate [--live-db]
  7 gates: syntax, structure, integrity, identity, determinism, compatibility, P2-approval
    ↓
git add + git commit (MANUAL — requires developer with repo access)
    ↓
git push → GitHub Actions: pnpm test + pnpm build
    ↓
Vite bundles: src/catalog/brands/*.json → JS bundle
    ↓
Runtime: loader.ts imports brands/*.json → getAllModels() → phone-catalog.ts → search
```

**Can new models appear without a code commit?**
- Within existing brands: YES (if JSON already includes the brand file). Only DB + generation + commit needed.
- In new brands: NO (requires adding import in `loader.ts` — code change).

**What happens when a model is approved but not published?**
- Model sits in DB with `approval_status='approved'`
- Next `pnpm catalog:generate` will include it
- Until then, it does NOT appear in the app
- No runtime DB fallback

---

## G. Security Requirements

### Who Can Do What

| Operation | Required Role | RPC Gate | UI Access |
|---|---|---|---|
| Create model | admin / super_admin | `catalog_is_admin()` | Currently: NONE (needs UI) |
| Create variant | admin / super_admin | `catalog_is_admin()` | Currently: NONE |
| Edit model | admin / super_admin | `catalog_is_admin()` | Currently: NONE |
| Edit variant | admin / super_admin | `catalog_is_admin()` | Currently: NONE |
| Approve model | admin / super_admin | `catalog_is_admin()` | YES (CatalogApprovalScreen) |
| Reject model | admin / super_admin | `catalog_is_admin()` | YES |
| Reopen model | admin / super_admin | `catalog_is_admin()` | YES |
| Verify variant | admin / super_admin | `catalog_is_admin()` | Currently: NONE |
| Archive variant | admin / super_admin | `catalog_is_admin()` | Currently: NONE |

### Security Stack
- All write RPCs: `SECURITY DEFINER` + `SET search_path = public` + `catalog_is_admin()` check
- All write RPCs: `REVOKE ALL FROM PUBLIC` + `REVOKE anon` + `GRANT authenticated`
- RLS enabled on all catalog tables (read-only policies; writes through RPCs only)
- No SQL injection risk (parameterized queries; dynamic ORDER BY uses whitelist)
- `ProtectedRoute` in UI with `requiredResource="catalog" requiredAction="write"`

---

## H. Audit Requirements

| Operation | History Table | Action | Before | After | Actor |
|---|---|---|---|---|---|
| Create model | `catalog_model_history` | `CREATE` | NULL | new row | auth.uid() |
| Create variant | `catalog_variant_history` | `CREATE` | NULL | new row | auth.uid() |
| Edit model | `catalog_model_history` | `UPDATE` | old row | new row | auth.uid() |
| Edit variant | `catalog_variant_history` | `UPDATE` | old row | new row | auth.uid() |
| Approve model | `catalog_model_history` | `APPROVE` | old row | new row | auth.uid() |
| Reject model | `catalog_model_history` | `REJECT` | old row | new row | auth.uid() |
| Reopen model | `catalog_model_history` | `REOPEN` | old row | new row | auth.uid() |
| Verify variant | `catalog_variant_history` | `VERIFY` | old row | new row | auth.uid() |
| Archive variant | `catalog_variant_history` | `ARCHIVE` | old row | new row | auth.uid() |

**⚠️ GAP: `catalog_create_model` does NOT write to `catalog_model_history`.** This must be fixed. All other mutations are audited.

---

## I. Identifier / Collision Analysis

### Model Identity
- **Function:** `catalog_model_id(brand_id, name)` — `05:50-74`, fixed in `06:39-62`
- **Algorithm:** `brand_id || '-' || slugify(name)`
- **Slugify:** `lower(trim) → regex_replace[^a-z0-9]+ → '-' → trim dashes → 'unknown'`
- **Overrides:** 4 Xiaomi Pro+ models with hardcoded slugs
- **Collision defense:** UNIQUE on `canonical_id` + UNIQUE on `(brand_id, name)`

### Variant Identity
- **Function:** `catalog_variant_id(brand_id, canonical_id, ram_mb, storage_gb, region)`
- **Algorithm:** `FNV-1a-32(brand|model|ramLabel|storageLabel|region)` → base-36
- **Label helpers:** `catalog_ram_label()` + `catalog_storage_label()`
- **NULL region:** COALESCE to empty string
- **Collision defense:** UNIQUE on `canonical_variant_id` + partial unique indexes on spec tuples

### Real Examples

**Models:**
| Brand | Name | canonical_id |
|---|---|---|
| samsung | Galaxy A03 | samsung-galaxy-a03 |
| apple | iPhone (1st Gen) | apple-iphone-1st-gen |
| nothing | Phone (2a) Plus | nothing-phone-2a-plus |
| huawei | Mate 40 Pro+ | huawei-mate-40-pro-plus |
| xiaomi | Redmi Note 13 Pro+ | xiaomi-redmi-note-13-pro-plus |

**Variants:**
| Model | ram_mb | storage_gb | region | canonical_variant_id |
|---|---|---|---|---|
| apple-iphone-1st-gen | 256 | 4 | NULL | dg03pw |
| vivo-x50 | 8192 | 128 | NULL | wgkc1q |
| honor-x50 | 8192 | 128 | NULL | 193500m |
| honor-x50 | 12288 | 512 | NULL | w3hcu6 |

---

## J. Test Gaps

### Current Coverage (18 files, 300 tests)
- ✅ Search, filtering, pagination UI logic
- ✅ Approval pipeline integration (DB→eligibility→JSON)
- ✅ Approval state machine transitions
- ✅ Model/variant list RPCs
- ✅ History RPC and viewer
- ✅ Variant specs update with CVID recalculation
- ✅ Navigation entry/back (P4)
- ✅ Pipeline publication safety invariant

### Missing Coverage
- ❌ Model creation RPC — no test
- ❌ Variant creation RPC — no test
- ❌ Initial identifier generation — only tested for updates, not first creation
- ❌ Security tests — 6 tests are placeholders (`expect(true).toBe(true)`)
- ❌ No rendering tests for admin screens
- ❌ No form validation tests

---

## K. EXACTLY TWO Implementation Phases

### PHASE 1 — Database Repair + Admin CRUD UI

**Objective:** Owner can create, edit, and manage models and variants through the admin UI.

**DB/RPC work:**
- Add `INSERT INTO catalog_model_history` (action='CREATE') to `catalog_create_model` RPC
- No new RPCs needed — all creation/editing RPCs already exist

**UI work:**
- `CreateModelScreen` or modal: brand select + name input + series + release_year + model_numbers + aliases
- `CreateVariantScreen` or modal: RAM (GB) input + Storage (GB) input + optional region
- `EditModelScreen` or modal: name, series, release_year, model_numbers, aliases, owner_notes
- `EditVariantScreen` or modal: RAM, storage, region, status
- Wire into existing `CatalogApprovalScreen` or create `CatalogManagementScreen`
- Add "Create Model" button in admin UI
- Add "Add Variant" button in variant panel
- Add "Edit" button on model cards
- Add "Edit" button on variant rows
- Add "Verify" and "Archive" buttons on variant rows

**Files affected:**
- `supabase/catalog-central/05-catalog-create-model-rpc-apply.sql` — add history INSERT
- `src/screens/admin/` — new/modified screen components
- `src/__tests__/catalog/` — new tests for creation, editing, validation

**Tests:**
- Model creation: input validation, canonical_id generation, duplicate detection, audit trail
- Variant creation: input validation, CVID generation, spec uniqueness, audit trail
- Model editing: field updates, name-change→draft reset, optimistic locking
- Variant editing: spec changes, CVID recalculation, collision detection
- Security: admin gate enforcement on all creation/editing RPCs

**Verification:**
- Create a model → verify in DB → verify audit trail → verify approval state = draft
- Add a variant → verify CVID generated → verify spec uniqueness enforced
- Edit a model → verify history → verify name change resets approval
- Edit variant specs → verify CVID recalculated → verify collision detection
- Attempt duplicate → verify 23505 error
- Attempt non-admin → verify 42501 error

**Rollback:** All changes are additive (UI) or single SQL fix (audit). No data migration.

**Commit boundary:** `feat(catalog): Phase 1 — admin CRUD UI + model creation audit fix`

### PHASE 2 — Approval + Publication + Runtime Integration

**Objective:** Owner can approve models through the UI, run P1 generation, and confirm runtime publication.

**UI work:**
- Add "Publish" button or "Run P1 Generation" action in admin UI (or document CLI workflow)
- Add status indicators showing: draft → approved → published → runtime
- Add variant history viewer
- Add variant verify/archive buttons
- Add reconciliation report viewer (optional)

**Generator/Runtime work:**
- No changes to `catalog-p1-generate.ts` needed (already works)
- Document the complete owner workflow: create → approve → generate → commit → deploy
- Consider: `catalog:publish` convenience script that chains generate+validate+commit

**Tests:**
- End-to-end: create model → add variant → approve → generate → validate → runtime
- Publication safety: verify P1 eligibility filter catches draft/unapproved models
- Regression: existing 300+ catalog tests must pass

**Verification:**
- Owner creates model + variant → approves → runs generation → JSON updated → app includes new model
- Owner rejects model → generation excludes it
- Owner reopens rejected model → can re-approve

**Commit boundary:** `feat(catalog): Phase 2 — approval workflow + publication integration`

---

## L. Acceptance Criteria

### TEST A: Create a brand-new model
1. Open Catalog Approval screen
2. Click "Create Model"
3. Enter brand="testbrand", name="Test Phone X"
4. Save → model appears in list with status="active", approval_status="draft"
5. Verify canonical_id = "testbrand-test-phone-x"
6. Verify `catalog_model_history` has CREATE entry

### TEST B: Add a new variant
1. Expand the new model card
2. Click "Add Variant"
3. Enter RAM=8GB (8192 MB), Storage=256GB
4. Save → variant appears with status="unverified"
5. Verify canonical_variant_id generated (6-8 char hash)
6. Verify `catalog_variant_history` has CREATE entry

### TEST C: Edit the variant
1. Click "Edit" on the variant
2. Change Storage to 512GB
3. Save → variant updated, canonical_variant_id recalculated
4. Verify history has UPDATE entry

### TEST D: Approve the model
1. Click "Approve" on the model card
2. Verify approval_status = "approved"
3. Verify history has APPROVE entry

### TEST E: Run publication pipeline
1. Run `pnpm catalog:generate --dry-run --verbose`
2. Verify the new model appears in the diff output
3. Run `pnpm catalog:generate`
4. Verify `src/catalog/brands/testbrand.json` contains the new model

### TEST F: Confirm model appears in runtime
1. Build the app (`pnpm build`)
2. Verify `getAllModels()` returns the new model
3. Verify search finds the new model

### TEST G: Confirm variant appears in runtime
1. Verify `getVariantsByName('testbrand', 'Test Phone X')` returns the new variant
2. Verify variant shows correct RAM/Storage labels

### TEST H: Attempt duplicate model
1. Try to create another model with brand="testbrand", name="Test Phone X"
2. Verify error: "model already exists"

### TEST I: Attempt duplicate variant
1. Try to add another variant with same RAM=8GB, Storage=256GB
2. Verify error: unique constraint violation

### TEST J: Attempt unauthorized creation
1. As non-admin user, try to call `catalog_create_model`
2. Verify error: "Forbidden: admin role required" (42501)

### TEST K: Verify audit history
1. View model history → see CREATE, APPROVE entries
2. View variant history → see CREATE, UPDATE entries
3. Verify actor_user_id matches the admin user

### TEST L: Verify existing inventory intact
1. Check inventory_items count unchanged
2. Check existing inventory records still resolve correctly
3. Verify no FK violations (inventory is decoupled from catalog)

### TEST M: Correct an error
1. Edit model name → verify approval_status resets to draft
2. Re-approve → verify state machine works

### TEST N: Concurrent creation safety
1. Two simultaneous creates of same model → one fails with 23505
2. Two simultaneous creates of same variant → one fails with 23505

---

## M. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Model creation has no audit trail | HIGH | Fix in Phase 1: add history INSERT to RPC |
| New brands need code change to `loader.ts` | MEDIUM | Document in owner manual; Phase 2 can add brand auto-registration |
| `catalog_admin_list_variants` pagination mismatch | LOW | UI passes params that are ignored; fix RPC signature or UI in Phase 1 |
| Variant panel history button missing | LOW | Add in Phase 1 |
| P1 generation is CLI-only | MEDIUM | Document workflow; Phase 2 can add publish button |
| `catalog_admin_update_model` name-change resets approval silently | LOW | Document behavior; UI should warn owner |

---

## N. Recommended Execution Order

1. **Owner reviews this report** and confirms GO / NO-GO
2. **Phase 1 begins** — DB audit fix + CRUD UI (can be implemented independently)
3. **Phase 1 checkpoint** — all acceptance tests A-D, H-J, L, N pass
4. **Phase 2 begins** — approval workflow + publication integration
5. **Phase 2 checkpoint** — all acceptance tests E-G, K pass
6. **Catalog manual creation section CLOSED**
7. **Next: Record / High-Score System**

---

## O. Owner Questions Answered

1. **Can I create a completely new phone model?** YES — RPC `catalog_create_model` exists. Needs UI.
2. **Exactly where is it stored?** `catalog_models` table, 14 columns, PK=uuid, canonical_id=text.
3. **How is its canonical_id generated?** `catalog_model_id(brand, name)` → `brand-slugify(name)` with 4 Xiaomi overrides.
4. **Can I add RAM/Storage variants that don't exist?** YES — RPC `catalog_create_variant` exists. Needs UI.
5. **How is canonical_variant_id generated?** `FNV-1a(brand|model|ramLabel|storageLabel|region)` → base-36 hash.
6. **How are collisions prevented?** UNIQUE constraints on canonical_id, (brand,name), canonical_variant_id, and partial unique indexes on spec tuples.
7. **Who is allowed to perform these operations?** `admin` or `super_admin` role only (via `catalog_is_admin()`).
8. **What audit record is created?** All mutations except model creation write to history tables. Model creation audit must be added.
9. **What approval is required?** Model must be `draft` + `active` + ≥1 known/verified variant before approval.
10. **How does it reach the runtime catalog?** DB → `pnpm catalog:generate` → JSON → git commit → build → runtime. No auto-publish.
11. **What happens if publication fails?** P1 validation gates catch errors and abort. Old JSON remains in place. Safe.
12. **Can existing inventory break?** NO. Inventory and catalog are fully decoupled (no FK between them).
13. **What happens if two admins do the same thing simultaneously?** Unique constraints prevent duplicates. One succeeds, one gets 23505. Optimistic locking on edits prevents lost updates.
14. **How do I correct an error?** Edit model fields → approval resets to draft → re-approve. Edit variant specs → CVID recalculated.
15. **What exactly will Phase 1 deliver?** DB audit fix + complete admin CRUD UI (create, edit, verify, archive).
16. **What exactly will Phase 2 deliver?** Approval workflow integration + publication pipeline + runtime verification.

---

**DISCOVERY STATUS: COMPLETE — ALL 16 QUESTIONS ANSWERED WITH EVIDENCE**
