# P2 DISCOVERY — EVIDENCE REPORT

**Status:** P2 DISCOVERY — COMPLETE
**Implementation:** NOT STARTED
**Date:** 2026-08-17
**Scope:** Read-only evidence gathering for the P2 approval workflow. No implementation, no schema changes, no RPC changes, no UI changes.

---

## Live ACL Evidence

### Probe method

POST to PostgREST `/rest/v1/rpc/<function>` with the **anon key** and a non-existent canonical_id parameter. No data can be modified because the `catalog_is_admin()` gate raises `42501` before any write path executes. The probe confirms whether anon has `EXECUTE` permission (HTTP 42501 = reaches gate) or is properly blocked (PGRST202 = not in schema cache).

### Results (live DB: fmggysdqigtejxbfpgtg)

| RPC | Intended anon (13 A5/A10/A15) | Live probe result | Verdict |
|---|---|---|---|
| `catalog_admin_approve_model` | false | **42501** (Forbidden: admin role required) | **GAP** — anon reaches gate, has EXECUTE |
| `catalog_admin_update_variant` | false | **42501** (Forbidden: admin role required) | **GAP** — anon reaches gate, has EXECUTE |
| `catalog_admin_update_model` | false | **PGRST202** (not in schema cache) | **OK** — properly blocked |

### Root cause

Supabase platform default privileges inject `anon=X, authenticated=X, service_role=X` on new public-schema functions at creation time. File `09-catalog-create-model-rpc-acl-fix.sql` documents this for `catalog_create_model`. Files `11`/`12` applied later without the equivalent fix. The intended state (per `13-catalog-admin-rpc-verify.sql` A5/A10/A15) was never enforced in the live DB.

### Risk assessment

**No data can currently be modified** via anon because `catalog_is_admin()` is the first executable statement in each SECURITY DEFINER function. For anon, `auth.uid()` is NULL, so the gate always raises `42501` before any write. However, this is a defense-in-depth gap: the functions should return PGRST202 for anon (no EXECUTE at all), not reach the gate.

---

## Approval Transition Evidence

### `catalog_admin_approve_model` (12:527–663)

- **Input:** `p_canonical_id text`, `p_approve boolean`
- **Gate:** `catalog_is_admin()` — checks `public.users.role IN ('admin','super_admin')` via `auth.uid()`
- **Approval variant gate (12:588–603):** when `p_approve=true`, requires ≥1 variant for the model with `status IN ('known','verified')`. Raises `23505` otherwise.
- **State transition:** NONE checked. A model can be flipped directly from `draft`, `approved`, or `rejected` in any direction.

### `catalog_admin_update_model` (12:72–299)

- **Rename reset:** when `name IS DISTINCT FROM` current value, `approval_status` is reset to `'draft'` (line 249). This is the only implicit transition guard.
- **No approval-status modification:** this function never sets `approved`/`rejected`.

### `catalog_admin_update_variant` (12:362–500)

- **Notes-only edit.** RAM/storage/region/model_id/canonical_variant_id are immutable.

### CHECK constraint (11:44–46)

```sql
approval_status text NOT NULL DEFAULT 'draft'
  CONSTRAINT catalog_models_approval_status_check
  CHECK (approval_status IN ('draft','approved','rejected'))
```

### Transition gaps identified

1. **No transition guard:** `rejected → approved` is a single call. No requirement for an intermediate review step.
2. **No `status='active'` prerequisite:** an `archived` model (`status='archived'`) can be approved if it has ≥1 known/verified variant.
3. **No optimistic concurrency:** no `WHERE updated_at = <expected>` — concurrent updates can silently overwrite each other.
4. **No transition history for the `draft` state:** the history table records `APPROVE`/`REJECT` actions, but the initial `draft` state at model creation is not recorded as a transition.

---

## Publish-Path Evidence

### Approval today: DB/SQL only

Zero references to `approve_model`, `update_model`, `update_variant`, `approval_status`, or `catalog_admin_*` exist anywhere in `src/`. The full chain (schema `11`, RPCs `12`, verify `13`) is applied via SQL, with no frontend surface. Approval is a backend-only DBA task.

### Publishing today: offline CLI only

- `catalog:generate` (`scripts/catalog-p1-generate.ts`) reads Supabase, applies eligibility filter, writes `src/catalog/brands/*.json`.
- The 18 brand JSON files are `import` statements at build time (`src/catalog/loader.ts:2–19`). No runtime fetch.
- `rebuildIndex()` / `rebuildAliasIndex()` are exported but never called at runtime (dead exports).
- After JSON regeneration, a full app rebuild/deploy is required for changes to appear.

### No runtime refresh hook

The catalog is entirely static. There is no mechanism to refresh the catalog at runtime without rebuilding the app bundle.

---

## P1 Eligibility Predicate (confirmed)

```text
approval_status = 'approved'
AND status = 'active'
AND ≥1 variant with status IN ('known','verified')
```

Live evidence:
- DB: 2178 models, ALL `approval_status='draft'`, ALL `status='active'`
- Generator with live DB: Eligible = 0 (correct behavior)
- JSON: 2178 models remain (pre-P1 state, will be pruned on first approved-model publish)

---

## Generator Snapshot Inconsistency (D5)

The generator reads `catalog_models` and `catalog_variants` as two separate paginated queries (not a single transactional snapshot). A mid-generation approval or state change could produce a model with 0 variants in the output (approved model whose variants were archived between reads) or include a variant for a model that was renamed or had its approval_status changed between reads.

Mitigation: the eligibility filter re-checks both `approval_status` and variant status. But the filter runs in memory after both reads — a torn read at the database level is possible if approvals occur between the two queries.

---

## Inventory Boundary

- `src/catalog/` imports zero inventory references (no `import ... from inventory`, no reference to `inventory_items`, `sticker`, or `InventoryService`).
- Direction: inventory reads catalog only (e.g., `src/services/inventory-service.ts:23` imports `normalizeModelName` from catalog-service).
- Admin RPCs `12-catalog-admin-rpcs.sql` explicitly reference "No reference to inventory_items" (line 700–702).
- Seed runtime (02:2781–2838) snapshots inventory count + fingerprint before and after catalog seed, raising on drift.

---

## Known Baseline Discrepancy (operational evidence, NOT a P2 target)

| File | Inventory count | Fingerprint |
|---|---|---|
| 00-catalog-preflight.sql / 10-catalog-reconcile-baselines-readonly.sql | 17 | `1c5d9b8a117a93f03335e7296abddec1` |
| 13-catalog-admin-rpc-verify.sql | 25 | `a515442884dd43d6fecd47ab73dec618` |

These are different baselines captured at different approval snapshots. Not a P2 implementation target.

---

## Hard Stops (for P2 Plan before any implementation)

1. **HARD STOP — ACL fix scope:** must explicitly decide whether to apply `REVOKE EXECUTE FROM anon` for `catalog_admin_approve_model` and `catalog_admin_update_variant` (same pattern as 09) as part of P2, or exclude.
2. **HARD STOP — Transition guard design:** must explicitly decide whether `approve_model` enforces `draft → approved` only (requiring `rejected` models to first go through `draft`), and whether `archived` models are forbidden from approval.
3. **HARD STOP — Publish trigger source:** must explicitly decide whether P2 builds an admin UI, keeps CLI-only, or adds CI automation. Each has drastically different scope.
4. **HARD STOP — Generator snapshot consistency:** must explicitly decide whether to add a read lock, single-transaction read, or tolerate the current torn-read risk.

---

## Open Owner Decisions (not resolved in Discovery)

1. ACL fix: include or exclude from P2?
2. Transition guard: `draft → approved` only, or allow `rejected → approved` directly?
3. Active-status gate: require `status='active'` before approval?
4. Publish trigger: UI / CLI / CI?
5. Snapshot strategy: tolerate, single-transaction, or explicit lock?
6. Concurrency: add optimistic locking (`updated_at` check)?
7. History audit: full state-machine audit trail, or current AP/RE only?
