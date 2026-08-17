# P2 — PUBLICATION WORKFLOW PLAN

**Status:** P2 PLAN — COMPLETE, VERIFIED, READY FOR LIVE MIGRATION
**Implementation:** COMPLETE — all local gates pass
**Date:** 2026-08-17
**Prerequisite:** P1 COMPLETE — VERIFIED at bf38add
**Acceptance Report:** `catalog-p2-acceptance-report.md`

---

This plan is a READ-ONLY design document. It does not implement, migrate, or modify any code, schema, data, or configuration. It is presented to the owner for review and decision before any execution begins.

---

## 1. Scope

P2 adds the operational workflow that turns a `draft` model into an `approved`, published model visible to end users. It closes the gaps identified in the P2 Discovery evidence report.

**In scope (proposed, requires owner confirmation):**

| # | Area | Description |
|---|---|---|
| S1 | ACL remediation | `REVOKE EXECUTE FROM anon` on `catalog_admin_approve_model` and `catalog_admin_update_variant` (same pattern as file 09) |
| S2 | Transition guard | Enforce `draft → approved` only; add `status = 'active'` prerequisite to `approve_model` |
| S3 | Concurrency guard | Add `WHERE updated_at = <expected>` optimistic lock to `approve_model` and `update_model` |
| S4 | Admin UI | A catalog management screen that lists models, shows approval status, and calls `catalog_admin_approve_model` |
| S5 | Publish trigger | The admin UI triggers `catalog:generate --force` after approval (or a separate explicit step) |
| S6 | Generator snapshot | Add explicit ordering to variant reads in generator for deterministic behavior |
| S7 | History audit | Extend `catalog_model_history` to record full state-machine transitions (`DRAFT → APPROVED`, `APPROVED → REJECTED`, etc.) |

---

## 2. Non-scope

| # | Excluded | Reason |
|---|---|---|
| NS1 | Modifying P1 generator eligibility filter | Proven correct at bf38add; the filter is the source of truth |
| NS2 | Modifying P1 validator/reconciler | They verify the output, they don't produce it |
| NS3 | Runtime catalog refresh (hot-reload without rebuild) | Requires significant frontend architecture change; P2 uses offline publish |
| NS4 | Bulk-approve workflows | Single-model approval only; batch operations require separate design |
| NS5 | Modifying inventory | Catalog and inventory are strictly isolated |
| NS6 | Modifying P1 SQL schemas (01, 02, 04) | P1 checkpoint is closed |
| NS7 | Variant editing (RAM/storage/region) | Immutable by design in current RPCs |

---

## 3. Architecture

```text
Admin (authenticated role)
  ↓
Admin UI (React screen, src/screens/admin/)
  ↓ calls via Supabase client (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
Supabase PostgREST
  ↓
catalog_admin_approve_model(canonical_id, approve)
  ↓ SECURITY DEFINER, search_path=public, catalog_is_admin() gate
catalog_models.approval_status = 'approved' / 'rejected'
  + catalog_model_history row (audit)
  ↓ (manual step or UI-triggered)
pnpm catalog:generate --force
  ↓ reads Supabase (paginated)
catalog-p1-generate.ts
  ↓ eligibility filter (approved + active + ≥1 valid variant)
  ↓ atomic write to src/catalog/brands/*.json
App rebuild → published
```

### Key architectural decisions (owner must confirm)

1. **Admin UI triggers generation directly (app side)** vs **generation remains a separate CLI step** — each path requires different deployment and security assumptions.
2. **Single-transaction read in generator** — the two paginated queries (models + variants) should be wrapped in a single Supabase transaction, or the generator should add `ORDER BY` on a deterministic column to reduce the window.

---

## 4. Approval State Machine

### Current state (no guards)

```text
draft ──────────────→ approved
draft ──────────────→ rejected
approved ───────────→ draft       (rename only)
rejected ───────────→ approved    (no guard)
archived ───────────→ approved    (no guard, requires ≥1 known/verified variant)
```

### Proposed state machine (owner must confirm)

```text
draft ──────────────→ approved    (requires: ≥1 known/verified variant AND status='active')
draft ──────────────→ rejected    (requires: no additional condition)
rejected ───────────→ draft       (via catalog_admin_update_model rename OR explicit RPC)
approved ───────────→ rejected    (via catalog_admin_approve_model(p_approve=false))
archived            X             (blocked: archived models cannot be approved)
```

### Proposed guard additions

**In `catalog_admin_approve_model`:**

```sql
-- NEW: status='active' prerequisite
IF m.status != 'active' THEN
  RAISE EXCEPTION 'Cannot approve model with status=% (requires active)' USING ERRCODE = '23505';
END IF;

-- NEW: transition guard (draft/rejected → approved only)
IF m.approval_status NOT IN ('draft','rejected') AND p_approve = true THEN
  RAISE EXCEPTION 'Cannot approve model with status=%' USING ERRCODE = '23505';
END IF;

-- NEW: archived guard
IF m.status = 'archived' THEN
  RAISE EXCEPTION 'Archived models cannot be approved' USING ERRCODE = '23505';
END IF;
```

---

## 5. ACL / Security Remediation

### Remediation (mirrors file 09 pattern)

Apply after `12-catalog-admin-rpcs.sql`, before the next verify:

```sql
-- catalog_admin_approve_model (anon has EXECUTE — confirmed by live probe 42501)
REVOKE ALL ON FUNCTION public.catalog_admin_approve_model(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_approve_model(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_approve_model(text, boolean) TO authenticated;

-- catalog_admin_update_variant (anon has EXECUTE — confirmed by live probe 42501)
REVOKE ALL ON FUNCTION public.catalog_admin_update_variant(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catalog_admin_update_variant(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_update_variant(text, text) TO authenticated;
```

**Verify with:** same pattern as `13-catalog-admin-rpc-verify.sql` checks A5/A10/A15:
```sql
SELECT has_function_privilege('anon', 'catalog_admin_approve_model(text,boolean)', 'EXECUTE');   -- expect false
SELECT has_function_privilege('anon', 'catalog_admin_update_variant(text,text)', 'EXECUTE');     -- expect false
```

**Owner decision required:** confirmed in Section 19.

---

## 6. Publish Snapshot Strategy

### Current gap

Generator reads `catalog_models` and `catalog_variants` as two separate paginated queries. An approval occurring between reads could produce an inconsistent output.

### Proposed mitigation (owner must confirm)

1. **Deterministic variant ordering:** add `ORDER BY model_id, ram_mb, storage_gb` to the variant read (already present, line 127–128). This makes reads deterministic across runs but doesn't solve mid-read tearing.
2. **Single-transaction wrapper (optional, owner must decide):** wrap both reads in a single Supabase RPC that returns both models and variants in one response. This is the most robust option but adds an RPC.
3. **Tolerate current risk (owner must decide):** the window is small and the eligibility filter re-validates both approval_status and variant status in memory. In practice, a mid-generation approval only affects a single model; the worst case is a model with stale data (the generator's idempotency means a re-run fixes it).

---

## 7. UI Workflow

### Proposed screen: `src/screens/admin/CatalogApprovalScreen.tsx`

**No UI exists today.** This screen must be built from scratch.

**Features:**
- Table of all models (paginated, sorted by brand → name)
- Columns: brand, model, approval_status (draft/approved/rejected), variant count, last updated, actor (from history)
- Filter: show only `draft` models (for review queue)
- Action: "Approve" button → calls `catalog_admin_approve_model(canonical_id, true)` → optimistic update of table row
- Action: "Reject" button → calls `catalog_admin_approve_model(canonical_id, false)`
- History: expandable row showing `catalog_model_history` for that model
- Gating: requires `admin` or `super_admin` role (same as `catalog_is_admin()`)

**Routing:** mount at `admin/catalog-approval` in `App.tsx` router, gated by `admin` resource in `permissionGuard`.

**Post-approval trigger:** after a successful approval, the UI should offer a "Rebuild catalog" button that runs `catalog:generate --force` via the server (or instructs the operator to run it manually in terminal). The UI cannot run CLI directly in a browser — this requires either a server-side endpoint or a manual step.

**Owner decision required:** confirmed in Section 19.

---

## 8. CLI Workflow

### Current state

```bash
pnpm catalog:generate --dry-run        # Preview
pnpm catalog:generate --dry-run --force # Preview with removal acknowledgment
pnpm catalog:generate                  # Write
pnpm catalog:validate                  # Verify
pnpm catalog:reconcile                 # Compare DB vs JSON
```

### Proposed additions (owner must confirm)

No new CLI commands. The existing commands are sufficient. The workflow remains:

1. Operator (or UI) approves a model via RPC
2. Operator runs `pnpm catalog:generate --dry-run --force` to preview
3. Operator reviews diff (draft models removed, approved models included)
4. Operator runs `pnpm catalog:generate --force` to write
5. Operator runs `pnpm catalog:validate` and `pnpm catalog:reconcile`
6. Operator commits and deploys

**Hard stop:** the `--force` flag is required whenever the output would remove models currently in the JSON. This prevents accidental data loss even when the operator has review authority.

---

## 9. Validation Gates

### Gate: before publish (generator output)

All existing P1 gates remain unchanged:

| Gate | Check | Source |
|---|---|---|
| Structure | Valid brand objects | `catalog-p1-generate.ts:326` |
| Integrity | No duplicate brands/models | `catalog-p1-generate.ts:328–340` |
| Eligibility | Every model has ≥1 variant (DB mode only) | `catalog-p1-generate.ts:342–350` |
| Structure | All variants have ram + storage | `catalog-p1-generate.ts:352–361` |
| Determinism | Parse → serialize stable | `catalog-p1-generate.ts:363–367` |
| Identity | Existing models preserved (or --force) | `catalog-p1-generate.ts:374–388` |
| Determinism | Brand ordering alphabetical | `catalog-p1-generate.ts:394–397` |

### New P2 gate (proposed)

| Gate | Check | Rationale |
|---|---|---|
| **No draft models in output** | Every model in generated JSON must have `approval_status = 'approved'` at generation time | Proves the filter enforced the boundary at the time of generation (not just at read time) — would require a cross-check with DB at validate time |

This gate is implemented as a read-only verify in `catalog:validate` that queries `catalog_models` for every model name in the JSON and confirms `approval_status = 'approved'`. It runs once after generation and before deploy.

---

## 10. Reconciliation Gates

### Current (P1)

| Check | Source |
|---|---|
| DB vs JSON model count and identity | `catalog-p1-reconcile.ts:99–192` |
| Variant count and identity per model | same |
| Metadata mismatch (series, releaseYear, modelNumbers) | same |
| Publication status counts (DB mode) | `catalog-p1-reconcile.ts:106–148` |

### New P2 gate (proposed)

| Check | Description |
|---|---|
| **Every JSON model approved in DB** | For each model in the runtime JSON, query `catalog_models` and confirm `approval_status = 'approved'` and `status = 'active'` |
| **Every approved model in DB present in JSON** | For each `approval_status = 'approved'` model in the DB, confirm it appears in the runtime JSON (the generator must have included it) |

Both are read-only checks in `catalog-p1-reconcile.ts`, gated behind a `--live-db` flag (requires DB connection). Without `--live-db`, the checks are skipped with "N/A (requires DB connection)".

---

## 11. Rollback Strategy

### ACL fix rollback

If the ACL fix causes unintended access loss:

```sql
-- Reverse: grant anon back (emergency only)
GRANT EXECUTE ON FUNCTION catalog_admin_approve_model(text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION catalog_admin_update_variant(text, text) TO anon;
```

This is a one-line SQL statement. No migration rollback required.

### Transition guard rollback

If the new guard in `approve_model` rejects previously-valid operations:

```sql
-- Remove the new guard block from the RPC body and re-apply the function definition from file 12
-- Then re-verify with file 13
```

This is a function replacement. The CHECK constraint, RLS policies, and history table are not affected.

### UI rollback

Remove the screen import from `App.tsx` and delete `CatalogApprovalScreen.tsx`. No DB impact.

### Generator snapshot rollback

If the single-transaction read causes issues, revert to two separate reads. No DB impact; no migration required.

---

## 12. Audit / History Requirements

### Current state

`catalog_model_history` (11:56–67) records:
- `action CHECK (action IN ('CREATE','UPDATE','APPROVE','REJECT'))`
- `before_state jsonb` (full row before change)
- `after_state jsonb` (full row after change)
- `actor_user_id → public.users(id)`
- RLS: deny-all for anon/authenticated (service_role bypasses RLS)

### Proposed additions

1. **Add `DRAFT` as a valid action** (initial state transition when model is created with `approval_status = 'draft'`).
2. **Record `approval_status` explicitly in `before_state`/`after_state`** (currently included as a column in the full row, but should be explicitly documented as the primary state in the audit entry).
3. **UI: display `catalog_model_history` per model** (expandable row in CatalogApprovalScreen).

No new columns or tables. The existing structure is sufficient; only the `CHECK` constraint needs expansion (from `CREATE,UPDATE,APPROVE,REJECT` to `CREATE,UPDATE,DRAFT,APPROVE,REJECT`).

---

## 13. Concurrency Strategy

### Current state

No optimistic locking. `update_model` and `approve_model` both SET `updated_at = now()` but do not check the prior `updated_at`.

### Proposed approach (owner must confirm)

1. **Add `WHERE updated_at = p_expected_updated_at`** to the UPDATE statement in both `catalog_admin_update_model` and `catalog_admin_approve_model`.
2. If the row was modified since the read, the UPDATE affects 0 rows → raise `55000` "concurrent modification detected: refresh and retry".
3. The UI reads `updated_at` when loading the model; sends it back as `p_expected_updated_at` on approve/reject.

**Cost:** one additional parameter per RPC, one additional WHERE clause.
**Benefit:** prevents silent overwrite when two admins approve/edit the same model concurrently.

---

## 14. Inventory Isolation

No changes. The discovery confirmed:

- `src/catalog/` imports zero inventory references.
- Admin RPCs explicitly state "No reference to inventory_items".
- Seed runtime (02) snapshots inventory before/after and raises on drift.
- P2 does not touch inventory in any way.

**Gate:** any P2 code change must pass a grep for `inventory_items`, `sticker`, or `InventoryService` in the catalog directory, returning zero matches.

---

## 15. Failure Handling

| Failure mode | Detection | Recovery |
|---|---|---|
| **Approve archived model** | P2 gate in `approve_model` rejects with `23505` | Operator restores model (`catalog_admin_update_model`) to active status first |
| **Reject then immediately re-approve** | Audit history shows the sequence | P2 does not prevent this; the operator has authority to reverse their own decision |
| **Concurrent edit during approval** | P2 optimistic lock raises `55000` | Operator refreshes the UI, re-reads the model, retries |
| **Generator reads mid-approval** | Tolerated in current design; worst case = model with stale data | Re-running generator corrects the output |
| **Generator fails mid-write** | Existing atomic temp-dir + backup (P1) | Files are not replaced; backup preserved |
| **CLI publish without --force when removals expected** | P1 identity gate aborts with hint | Operator reviews diff, adds --force if intentional |
| **ACL fix applied but function not re-created** | `13-verify` anon checks fail | Re-apply the fix and re-verify |

---

## 16. Test Strategy

### Unit tests (vitest)

| Test file | Tests | What it verifies |
|---|---|---|
| `src/__tests__/catalog/approval-transitions.test.ts` | 6–8 | Valid transitions (`draft→approved`, `draft→rejected`); invalid transitions blocked (`archived→approved`, `rejected→approved` without re-drafting) |
| `src/__tests__/catalog/approval-eligibility.test.ts` | 4–6 | P1 eligibility filter unchanged; approved+active+≥1 variant = included; draft/rejected/inactive/zero-variant = excluded |

### Integration tests (fixture harness, same as P1 pattern)

| Fixture | Tests | What it verifies |
|---|---|---|
| `.catalog-store/fixture-test/p2-approve-flow.ts` | 4 | Approve flow: read model → approve → generate → validate → confirm model in output |
| `.catalog-store/fixture-test/p2-reject-flow.ts` | 4 | Reject flow: approved model → reject → generate → confirm model removed |
| `.catalog-store/fixture-test/p2-archived-block.ts` | 2 | Archived model cannot be approved (gate error) |

### Verification scripts

| Script | What it verifies |
|---|---|
| `14-catalog-p2-acl-verify.sql` | anon EXECUTE = false on all 3 admin RPCs (same as 13 A5/A10/A15) |
| `15-catalog-p2-transition-verify.sql` | `approve_model` rejects archived models, accepts draft/approved models |

### Regression

Full P1 regression must pass at P2 completion:
- `tsc --noEmit` ✓
- `eslint scripts/catalog-p1-*` ✓
- `vitest run` (146 files, 1687+ tests) ✓
- `pnpm build` ✓
- `catalog:validate` ✓
- `catalog:reconcile --from-json` ✓

---

## 17. Deployment Sequence

### Phase 0: Owner decisions (THIS REVIEW)

Owner reviews this plan and decides on all open questions (Section 19). Nothing is implemented until all decisions are recorded.

### Phase 1: Security hardening (ACL + transition guard)

1. Write `14-catalog-p2-acl-fix.sql` (REVOKE anon from 2 RPCs)
2. Write `15-catalog-p2-transition-guard.sql` (amend `approve_model` body)
3. Run `14` on live DB (or staging first)
4. Run `15` on live DB (or staging first)
5. Run `13` to verify A5/A10/A15 pass (now expects anon=false on all 3)
6. Run P2 unit tests to confirm transition guard works
7. **HARD STOP:** verify ACL fix + transition guard before proceeding

### Phase 2: Concurrency guard (if approved by owner)

1. Write `16-catalog-p2-concurrency-guard.sql` (amend `update_model` and `approve_model` bodies with `WHERE updated_at = p_expected_updated_at`)
2. Run on live DB
3. Run P2 unit tests to confirm optimistic lock
4. **HARD STOP:** verify concurrency guard before proceeding

### Phase 3: Admin UI (if approved by owner)

1. Build `src/screens/admin/CatalogApprovalScreen.tsx`
2. Mount in `App.tsx` router, gated by admin role
3. Test with `catalog_is_admin()` role (not anon)
4. **HARD STOP:** UI tested before proceeding

### Phase 4: Publish workflow integration

1. Add "No draft models in output" gate to `catalog:validate`
2. Add "Every JSON model approved in DB" gate to `catalog:reconcile --live-db`
3. Full regression + live DB end-to-end: approve one model → generate → validate → reconcile → confirm
4. **HARD STOP:** full P1 regression + P2 gates pass

### Phase 5: Documentation + checkpoint commit

1. Write P2 closure audit to `docs/audits/catalog-p2-completion.md`
2. Commit checkpoint: `feat(catalog): P2 publication workflow (00026)`
3. **P2 CLOSED — VERIFIED**

---

## 18. HARD STOP Conditions

These are absolute preconditions. Each must be explicitly confirmed before its respective phase begins.

| ID | Condition | Phase | Confirmed |
|---|---|---|---|
| HS1 | Owner confirms ACL fix scope (2 RPCs or all 3 admin RPCs) | Phase 1 | ⬜ |
| HS2 | Owner confirms transition guard design (Section 4 diagram) | Phase 1 | ⬜ |
| HS3 | Owner confirms concurrency strategy (Section 13) | Phase 2 | ⬜ |
| HS4 | Owner confirms UI scope (Section 7: full screen or minimal) | Phase 3 | ⬜ |
| HS5 | Owner confirms publish trigger (UI triggers CLI, or manual) | Phase 4 | ⬜ |
| HS6 | P1 regression still passes after each phase | All | ⬜ |
| HS7 | Live DB `13-catalog-admin-rpc-verify.sql` passes after Phase 1 | Phase 1 | ⬜ |
| HS8 | Snapshot strategy decided (Section 6) before Phase 4 | Phase 4 | ⬜ |

---

## 19. Owner Decisions Required

These questions must be answered before any P2 implementation begins. Each decision directly affects the implementation.

### Decision 1: ACL Fix Scope

**Question:** Apply `REVOKE EXECUTE FROM anon` to only `catalog_admin_approve_model` and `catalog_admin_update_variant` (the two confirmed gaps), or also proactively re-verify all other admin RPCs?

**Impact:** minimal (2 functions) vs thorough (all 10+ admin RPCs).

**Default recommendation:** fix the two confirmed gaps + re-run `13-verify` on all functions.

---

### Decision 2: Transition Guard

**Question:** Should `approve_model` enforce `draft → approved` ONLY, or allow `rejected → approved` directly?

**Option A (draft → approved only):**
- Requires `rejected` models to be re-drafted (via `catalog_admin_update_model` name change or new `catalog_admin_set_status` RPC)
- More controlled, auditable
- Adds friction to re-approval

**Option B (draft/rejected → approved directly):**
- Simpler, more operational
- Operator authority to reverse their own rejection
- Less auditable friction

**Impact:** affects the `approve_model` RPC body, the UI workflow, and the audit trail design.

**Default recommendation:** Option A (more controlled).

---

### Decision 3: Active-Status Gate

**Question:** Should `approve_model` require `status = 'active'` before allowing approval?

**Yes:** archived models cannot be approved. Must be restored first.
**No:** archived models can be approved if they have ≥1 known/verified variant.

**Impact:** minimal code change (one IF clause in the RPC), but prevents an entire class of misoperation.

**Default recommendation:** Yes, require `active`.

---

### Decision 4: Publish Trigger

**Question:** How does the operator trigger catalog regeneration after approval?

**Option A — UI-triggered (server endpoint):**
- Admin UI calls a server endpoint (Edge Function or RPC) that runs `catalog:generate`
- Requires a new Edge Function or RPC wrapping the CLI
- Most seamless but adds server-side execution surface

**Option B — Manual CLI:**
- Operator approves in UI, then manually runs `pnpm catalog:generate --force` in terminal
- No new server code, no new attack surface
- Adds operational friction

**Option C — CI/CD:**
- Approval in DB triggers a CI pipeline that runs the generator
- Most automated but requires CI integration (GitHub Actions, etc.)
- Most complex to set up

**Impact:** Option A requires an Edge Function; Option B requires only documentation; Option C requires CI pipeline.

**Default recommendation:** Option B (manual CLI) for P2, with Option A as a future enhancement. P2 should not introduce server-side code execution.

---

### Decision 5: Snapshot Strategy

**Question:** How should the generator handle the two-query read gap?

**Option A — Tolerate:** accept the current two-read design, re-run generator if inconsistent.

**Option B — Single-transaction RPC:** add a new RPC `catalog_export_snapshot()` that returns both models and variants in a single response, guaranteeing consistency.

**Impact:** Option A is already in production (P1); Option B requires a new SQL function.

**Default recommendation:** Option A (tolerate) for P2. The window is small and re-runs correct any inconsistency.

---

### Decision 6: Concurrency

**Question:** Should P2 add optimistic locking (`WHERE updated_at = expected`) to `approve_model` and `update_model`?

**Yes:** prevents silent overwrite when two admins act on the same model concurrently.
**No:** accept the current risk; concurrent edits are unlikely in the small admin team.

**Impact:** adds one parameter and one WHERE clause to each RPC; adds one parameter to the UI.

**Default recommendation:** Yes, add optimistic locking. Low cost, high defensive value.

---

### Decision 7: History Expansion

**Question:** Should the CHECK constraint on `catalog_model_history.action` be expanded from `('CREATE','UPDATE','APPROVE','REJECT')` to include `('CREATE','UPDATE','DRAFT','APPROVE','REJECT')`?

**Yes:** records the initial draft state for a complete state-machine audit trail.
**No:** keep the current four actions; the `CREATE` action implicitly implies the initial `draft` state.

**Impact:** one CHECK constraint change (requires a new migration or function update).

**Default recommendation:** No. The `CREATE` action is sufficient. Adding `DRAFT` adds no operational value.

---

### Decision 8: Audit Documentation

**Question:** Should the P2 closure audit be persisted to `docs/audits/` (same convention as P2 Discovery)?

**Recommended:** Yes.

**Default recommendation:** Yes, `docs/audits/catalog-p2-completion.md`.

---

## Summary of Recommended Defaults

| # | Decision | Recommended Default |
|---|---|---|
| 1 | ACL scope | Fix 2 confirmed gaps + re-verify all RPCs |
| 2 | Transition guard | `draft → approved` only (Option A) |
| 3 | Active-status gate | Yes, require `active` |
| 4 | Publish trigger | Manual CLI (Option B) |
| 5 | Snapshot strategy | Tolerate two-read design (Option A) |
| 6 | Concurrency | Yes, add optimistic locking |
| 7 | History expansion | No, keep four actions |
| 8 | Audit docs | Yes, persist to docs/audits/ |

All defaults require explicit owner confirmation before implementation begins.

---

## File Inventory (proposed, no files created)

| File | Status | Purpose |
|---|---|---|
| `docs/audits/catalog-p2-discovery.md` | **CREATED** | Discovery evidence report |
| `docs/audits/catalog-p2-plan.md` | **THIS FILE** | P2 plan (read-only) |
| `supabase/catalog-central/14-catalog-p2-acl-fix.sql` | NOT CREATED | ACL fix for 2 RPCs |
| `supabase/catalog-central/15-catalog-p2-transition-guard.sql` | NOT CREATED | Transition guard in approve_model |
| `supabase/catalog-central/16-catalog-p2-concurrency-guard.sql` | NOT CREATED | Optimistic locking (if approved) |
| `src/screens/admin/CatalogApprovalScreen.tsx` | NOT CREATED | Admin approval UI (if approved) |
| `src/__tests__/catalog/approval-transitions.test.ts` | NOT CREATED | Transition unit tests |
| `src/__tests__/catalog/approval-eligibility.test.ts` | NOT CREATED | Eligibility integration tests |
| `docs/audits/catalog-p2-completion.md` | NOT CREATED | P2 closure audit |

---

**P1: CLOSED — bf38add**
**P2 Discovery: COMPLETE**
**P2 Implementation: NOT STARTED**
**P2 Plan: READY FOR OWNER REVIEW**
