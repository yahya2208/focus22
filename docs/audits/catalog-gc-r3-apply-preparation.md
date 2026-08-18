# GC-R3 — APPLY PREPARATION REPORT (FROZEN, OWNER DECISIONS REQUIRED)

**Status:** APPLY PREP COMPLETE — NOT applied. No runtime DB was modified.
**Prepared:** GC-R3 apply-preparation from the frozen `golden-reconcile-evidence.json` (3,004 golden rows vs 866 runtime models).
**Scope:** the 18 runtime brands (`apple, asus, google, honor, huawei, infinix, motorola, nokia, nothing, oneplus, oppo, realme, samsung, sony, tecno, vivo, xiaomi, zte`). Golden rows in brands absent from runtime are `OUT_OF_SCOPE` (1,029) — documented, not seedable.
**Files:** all package artifacts under `catalog-audit/gc-r3/` (see [Files](#11-files-created-modified)); SQL verification templates are READ-ONLY (SELECT-only).

---

## 1. Bottom Line

- **Exact number immediately seedable after decisions: 1,264** — the independent in-scope `SAFE_TO_SEED` candidates (all `NOT_PLUS_PAIR`, no collision, no identity mismatch, unique canonical_id). This is `approved-candidate-template.csv`.
- **Exact number blocked by `+`:** **35 pairs / 56 golden records** (14 MATCHED-base pairs × 1 plus record + 21 SAFE_TO_SEED-base pairs × 2 records).
- **Exact number blocked by `NEEDS_REVIEW`:** **17** records.
- **Exact number invalid:** **3** records.
- **Exact number out-of-scope:** **1,029** records (brands absent from runtime — documented, not seedable in GC-R3).
- **Exact number requiring missing-field resolution:** all seedable rows (1,264 minimum; up to 1,312 fully approved) — release_year + model_numbers; no repo source; RPC and schema accept NULL / empty.
- **Exact proposed `MODEL_ID_OVERRIDES` count:** **37** (33 `PLUS_VARIANT` + 4 `UNIFY_ABSORB`).

| Class | Records | Resolution | Applies override |
|---|---|---|---|
| In-scope, independent, seedable (A) | 1,264 | SEED | no |
| In-scope, `+`-pair (B) | 56 (35 pairs) | SEED 33 plus-variants + absorb 2 (S10+/Note 10+); 21 bases dropped | 35 (33 PLUS_VARIANT + 2 UNIFY_ABSORB) |
| In-scope, `NEEDS_REVIEW` (C) | 17 | SEED AS-IS (15) / UNIFY absorb (2: Z Flip7, Z Fold7) | 2 (UNIFY_ABSORB) |
| Invalid (D) | 3 | DROP | no |
| Out-of-scope (E) | 1,029 | DROP (scope) | no |
| Runtime-only (F) | 251 | PROTECT | no |

> **1,264 = independent `SAFE_TO_SEED` after removing the 21 `+`-pair bases.** The 33 plus-variants and 15 `SEED AS-IS` records are separate approval tracks (see [§5 Final Arithmetic](#5-final-arithmetic)). Fully approved, total rows to seed = **1,312**. The 4 `UNIFY_ABSORB` mappings produce no new rows.

---

## 2. Frozen Evidence (GC-R3 input — not re-derived)

| Metric | Value | Source |
|---|---|---|
| Golden rows reconciled (GC-R3) | **3,004** | `catalog-audit/golden-reconcile-evidence.json` (frozen) |
| Golden classes | SAFE_TO_SEED 1,285 · MATCHED 615 · DUPLICATE 55 · NEEDS_REVIEW 17 · INVALID 3 · OUT_OF_SCOPE 1,029 | same evidence |
| Runtime-only (present in runtime, no golden counterpart) | **251** | same evidence |
| Runtime models at baseline | **866** | re-verified: sum of `src/catalog/brands/*.json` |
| Runtime variants at baseline | **1,816** | GC-R2 evidence |
| Inventory rows (protected) | **17** | GC-R2 evidence |
| Inventory fingerprint | `1c5d9b8a117a93f03335e7296abddec1` | GC-R2 evidence |
| Identity mismatches (catalog_model_id ≠ canonical_id) | **0** | GC-R2 evidence |
| Duplicate canonical_ids in runtime | **0** | GC-R2 evidence |

GC-R3 analysis was computed **against the 18 runtime brands** (see header) with canonical_id and identity derived from the **repo canonical-adapter override map** (`src/catalog/canonical.ts` + `canonical-adapter.ts`). Runtime rows are the 866 models in `src/catalog/brands/*.json`. Golden records for brands absent from runtime (e.g. `lenovo`, `moto`, `alcatel`) are `OUT_OF_SCOPE` (1,029) — they do not collide and are not seeded. Name-only coincidences across different brands are flagged `NEEDS_REVIEW` (Section C) — brand prefix keeps canonical_ids distinct.

---

## 3. Decision Tables

### 3.1 `+` PAIR MATRIX (Section B) — 35 pairs / 56 golden records

Rules applied (see `plus-pair-decision-matrix.csv` for full detail + proofs):
- **MATCHED base** (14 pairs): base already present in runtime → seed **only the plus record** under a new override-derived canonical_id.
- **SAFE_TO_SEED base** (21 pairs): base absent from runtime → base and plus slug to the same cid; the plus record wins (it is the distinct physical model and the carrier of the `+` identity). Base is **dropped**, plus is seeded.
- **`NO (absorb)`** (4 special cases: Galaxy S10+ / Note 10+ / Z Flip7 / Z Fold7 — see §3.2): golden plus is already represented at runtime under the same brand → **absorb** (alias), do not seed.
- Column `proposed + cid` = the value proposed for the runtime override map (`MODEL_ID_OVERRIDES`).

Seedable per policy after decisions: **33 plus-variants** (the 35 active pairs minus 2 `UNIFY_ABSORB` for Galaxy S10+ / Note 10+; Galaxy Z Flip7 / Z Fold7 absorb under Section C). Overrides from this section: 35 (33 PLUS_VARIANT + 2 UNIFY_ABSORB). `YES*` = seedable **after owner approves the override list and the drop of 21 bases**.

| brand | base | plus | collided cid | runtime base | plus counterpart | proposed + cid | seedable |
|---|---|---|---|---|---|---|---|
| Huawei | Mate 40 Pro | Mate 40 Pro+ | huawei-mate-40-pro | MATCHED | — | huawei-mate-40-pro-plus | YES* |
| Huawei | Mate 60 Pro | Mate 60 Pro+ | huawei-mate-60-pro | MATCHED | — | huawei-mate-60-pro-plus | YES* |
| Huawei | P40 Pro | P40 Pro+ | huawei-p40-pro | MATCHED | — | huawei-p40-pro-plus | YES* |
| Infinix | Note 40 Pro | Note 40 Pro+ | infinix-note-40-pro | SAFE_TO_SEED | — | infinix-note-40-pro-plus | YES* |
| Motorola | Edge | Edge+ | motorola-edge | MATCHED | — | motorola-edge-plus | YES* |
| Motorola | One Fusion | One Fusion+ | motorola-one-fusion | SAFE_TO_SEED | — | motorola-one-fusion-plus | YES* |
| Oppo | F19 Pro | F19 Pro+ | oppo-f19-pro | SAFE_TO_SEED | — | oppo-f19-pro-plus | YES* |
| Oppo | Reno 10 Pro | Reno 10 Pro+ | oppo-reno-10-pro | MATCHED | — | oppo-reno-10-pro-plus | YES* |
| Realme | Realme 10 Pro | Realme 10 Pro+ | realme-realme-10-pro | SAFE_TO_SEED | — | realme-realme-10-pro-plus | YES* |
| Realme | Realme 11 Pro | Realme 11 Pro+ | realme-realme-11-pro | SAFE_TO_SEED | — | realme-realme-11-pro-plus | YES* |
| Realme | Realme 12 | Realme 12+ | realme-realme-12 | MATCHED | — | realme-realme-12-plus | YES* |
| Realme | Realme 12 Pro | Realme 12 Pro+ | realme-realme-12-pro | SAFE_TO_SEED | — | realme-realme-12-pro-plus | YES* |
| Realme | Realme 13 Pro | Realme 13 Pro+ | realme-realme-13-pro | SAFE_TO_SEED | — | realme-realme-13-pro-plus | YES* |
| Realme | Realme 9 Pro | Realme 9 Pro+ | realme-realme-9-pro | SAFE_TO_SEED | — | realme-realme-9-pro-plus | YES* |
| Samsung | Galaxy A6 (2018) | Galaxy A6+ (2018) | samsung-galaxy-a6-2018 | SAFE_TO_SEED | — | samsung-galaxy-a6-2018-plus | YES* |
| Samsung | Galaxy A8 (2018) | Galaxy A8+ (2018) | samsung-galaxy-a8-2018 | SAFE_TO_SEED | — | samsung-galaxy-a8-2018-plus | YES* |
| Samsung | Galaxy Grand Prime | Galaxy Grand Prime+ | samsung-galaxy-grand-prime | SAFE_TO_SEED | — | samsung-galaxy-grand-prime-plus | YES* |
| Samsung | Galaxy J4 | Galaxy J4+ | samsung-galaxy-j4 | SAFE_TO_SEED | — | samsung-galaxy-j4-plus | YES* |
| Samsung | Galaxy J6 | Galaxy J6+ | samsung-galaxy-j6 | SAFE_TO_SEED | — | samsung-galaxy-j6-plus | YES* |
| Samsung | Galaxy Note 10 | Galaxy Note 10+ | samsung-galaxy-note-10 | MATCHED | Galaxy Note 10 Plus | samsung-galaxy-note-10-plus | NO (absorb) |
| Samsung | Galaxy S10 | Galaxy S10+ | samsung-galaxy-s10 | MATCHED | Galaxy S10 Plus | samsung-galaxy-s10-plus | NO (absorb) |
| Samsung | Galaxy S6 Edge | Galaxy S6 Edge+ | samsung-galaxy-s6-edge | SAFE_TO_SEED | — | samsung-galaxy-s6-edge-plus | YES* |
| Samsung | Galaxy S8 | Galaxy S8+ | samsung-galaxy-s8 | SAFE_TO_SEED | — | samsung-galaxy-s8-plus | YES* |
| Samsung | Galaxy S9 | Galaxy S9+ | samsung-galaxy-s9 | SAFE_TO_SEED | — | samsung-galaxy-s9-plus | YES* |
| Sony | Xperia Z3 | Xperia Z3+ | sony-xperia-z3 | MATCHED | — | sony-xperia-z3-plus | YES* |
| Tecno | Spark 20 Pro | Spark 20 Pro+ | tecno-spark-20-pro | SAFE_TO_SEED | — | tecno-spark-20-pro-plus | YES* |
| Vivo | V7 | V7+ | vivo-v7 | SAFE_TO_SEED | — | vivo-v7-plus | YES* |
| Vivo | X Fold | X Fold+ | vivo-x-fold | SAFE_TO_SEED | — | vivo-x-fold-plus | YES* |
| Vivo | X50 Pro | X50 Pro+ | vivo-x50-pro | MATCHED | — | vivo-x50-pro-plus | YES* |
| Vivo | X60 Pro | X60 Pro+ | vivo-x60-pro | MATCHED | — | vivo-x60-pro-plus | YES* |
| Vivo | X70 Pro | X70 Pro+ | vivo-x70-pro | MATCHED | — | vivo-x70-pro-plus | YES* |
| Vivo | X90 Pro | X90 Pro+ | vivo-x90-pro | MATCHED | — | vivo-x90-pro-plus | YES* |
| Xiaomi | Redmi Note 12 Pro | Redmi Note 12 Pro+ | xiaomi-redmi-note-12-pro | MATCHED | — | xiaomi-redmi-note-12-pro-plus | YES* |
| Xiaomi | Redmi Note 12 Pro 5G | Redmi Note 12 Pro+ 5G | xiaomi-redmi-note-12-pro-5g | SAFE_TO_SEED | — | xiaomi-redmi-note-12-pro-5g-plus | YES* |
| Xiaomi | Redmi Note 13 Pro 5G | Redmi Note 13 Pro+ 5G | xiaomi-redmi-note-13-pro-5g | SAFE_TO_SEED | — | xiaomi-redmi-note-13-pro-5g-plus | YES* |

### 3.2 Special `UNIFY_ABSORB` cases (4) — golden `+` already exists at runtime under same brand

| Golden | Golden cid | Runtime counterpart (same brand) | Decision | Proposed override |
|---|---|---|---|---|
| Samsung Galaxy S10+ | samsung-galaxy-s10-plus | `Galaxy S10 Plus` (runtime) | ABSORB — alias; do not seed | samsung-galaxy-s10-plus |
| Samsung Galaxy Note 10+ | samsung-galaxy-note-10-plus | `Galaxy Note 10 Plus` (runtime) | ABSORB — alias; do not seed | samsung-galaxy-note-10-plus |
| Samsung Galaxy Z Flip7 | samsung-galaxy-z-flip7 | `Galaxy Z Flip 7` (runtime) | UNIFY — absorb as alias; do not seed | samsung-galaxy-z-flip-7 |
| Samsung Galaxy Z Fold7 | samsung-galaxy-z-fold7 | `Galaxy Z Fold 7` (runtime) | UNIFY — absorb as alias; do not seed | samsung-galaxy-z-fold-7 |

These 4 are the only golden `+`/alias records that are **not** seeded — each is already represented at runtime under the same brand (spelling variant). Seeding would duplicate a physical device under a second canonical_id. The override is still added so `resolveModelId`/identity resolves the golden spelling to the existing runtime cid (alias behavior), keeping `catalog_model_id(brand, name) = canonical_id` for golden inputs. 2 arise in Section B (Galaxy S10+, Note 10+), 2 in Section C (Z Flip7, Z Fold7).

### 3.3 NEEDS_REVIEW MATRIX (Section C) — 17 records

All 17 were flagged by the golden reconciliation as textual-name conflicts. **No canonical_id collision exists** in any of them (brand prefix differs); the conflict is a same-display-name coincidence with a different brand, or a same-brand spelling variant. See `needs-review-decision-matrix.csv` for full detail + proofs.

| Golden brand | Golden name | Golden cid | Runtime conflict | reason | recommended | override | risk |
|---|---|---|---|---|---|---|---|
| Huawei | Honor 20 | huawei-honor-20 | honor/Honor 20 | model name also exists in runtime under brand(s): honor | SEED AS-IS (huawei-honor-20) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | C21 | nokia-c21 | realme/C21 | model name also exists in runtime under brand(s): realme | SEED AS-IS (nokia-c21) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | C30 | nokia-c30 | realme/C30 | model name also exists in runtime under brand(s): realme | SEED AS-IS (nokia-c30) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | C31 | nokia-c31 | realme/C31 | model name also exists in runtime under brand(s): realme | SEED AS-IS (nokia-c31) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | X10 | nokia-x10 | honor/X10 | model name also exists in runtime under brand(s): honor | SEED AS-IS (nokia-x10) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | X100 | nokia-x100 | vivo/X100 | model name also exists in runtime under brand(s): vivo | SEED AS-IS (nokia-x100) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | X20 | nokia-x20 | honor/X20 | model name also exists in runtime under brand(s): honor | SEED AS-IS (nokia-x20) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Nokia | X30 | nokia-x30 | honor/X30 | model name also exists in runtime under brand(s): honor | SEED AS-IS (nokia-x30) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Realme | X50 Pro | realme-x50-pro | vivo/X50 Pro | model name also exists in runtime under brand(s): vivo | SEED AS-IS (realme-x50-pro) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Realme | X7 | realme-x7 | honor/X7 | model name also exists in runtime under brand(s): honor | SEED AS-IS (realme-x7) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Samsung | Galaxy Z Flip7 | samsung-galaxy-z-flip7 | — (same-brand spelling) | golden alias/name is a textual variant of an existing runtime model in same brand | UNIFY to runtime 'Galaxy Z Flip 7' (samsung-galaxy-z-flip-7) — absorb as alias | samsung-galaxy-z-flip-7 | LOW — runtime identical model; absorb only |
| Samsung | Galaxy Z Fold7 | samsung-galaxy-z-fold7 | — (same-brand spelling) | golden alias/name is a textual variant of an existing runtime model in same brand | UNIFY to runtime 'Galaxy Z Fold 7' (samsung-galaxy-z-fold-7) — absorb as alias | samsung-galaxy-z-fold-7 | LOW — runtime identical model; absorb only |
| Vivo | X20 | vivo-x20 | honor/X20 | model name also exists in runtime under brand(s): honor | SEED AS-IS (vivo-x20) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Vivo | X30 | vivo-x30 | honor/X30 | model name also exists in runtime under brand(s): honor | SEED AS-IS (vivo-x30) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Vivo | X6 | vivo-x6 | honor/X6 | model name also exists in runtime under brand(s): honor | SEED AS-IS (vivo-x6) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Vivo | X7 | vivo-x7 | honor/X7 | model name also exists in runtime under brand(s): honor | SEED AS-IS (vivo-x7) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |
| Vivo | X9 | vivo-x9 | honor/X9 | model name also exists in runtime under brand(s): honor | SEED AS-IS (vivo-x9) — distinct physical model; name coincidence only | — | LOW-MEDIUM — no canonical_id collision (brand prefix differs… |

---

## 4. Missing-Field Investigation (release_year / model_numbers)

- **Repo sources checked for release_year / model_numbers on all seedable candidates (A 1,264; up to 1,312 fully approved):**
  - `src/catalog/canonical.ts` (override map) — no year / numbers fields.
  - `.catalog-store/catalog_models_v1.json` — carries `displayName` / aliases only; no year / numbers.
  - `*.catalog.csv` sources / SSOT files — no year / numbers columns.
  - Runtime schema (`catalog_models` DDL) — `release_year int NULL`, `model_numbers jsonb NULL` (nullable).
  - RPC `create_model` signature — `release_year` / `model_numbers` optional (NULL-able, no NOT NULL constraint).
- **Conclusion:** there is **no repo source** for these fields for GC-R3 candidates. Every one of the 1,264 seedable records requires an owner decision.
- **Accepted posture (recommended):** seed `release_year = NULL`, `model_numbers = '{}'` (or NULL) — matches GC-R2 practice (GC-R2 evidence seeded the same way) and keeps identity/canonical integrity. No record is blocked by this decision; the block is *policy*, not *schema*.

---

## 5. Final Arithmetic

Verified against `golden-reconcile-evidence.json` and `src/catalog/brands/*.json`:

```
Golden rows reconciled (GC-R3)              3,004
  ├─ OUT_OF_SCOPE                           1,029  → DROP (brand absent from runtime)
  ├─ MATCHED (already in runtime)             615  → no seed (exists)
  ├─ INVALID_OR_INCOMPLETE                      3  → DROP
  ├─ NEEDS_REVIEW                              17  → 15 SEED AS-IS + 2 UNIFY absorb
  ├─ DUPLICATE (canonical_id collision)        55  → 35 active '+' pairs + 20 out-of-scope-brand pairs
  │     └─ active '+' pairs (35) → see B below
  └─ SAFE_TO_SEED                          1,285  → 1,264 A + 21 '+' bases (dropped)

(A) Independent SAFE_TO_SEED (approved-candidate-template.csv)     1,264 → SEED (A) [no override]
(B) '+' pair pipeline (35 active pairs, 56 records):
      ├─ 14 MATCHED-base pairs → seed only the plus variant           14
      ├─ 21 SAFE_TO_SEED-base pairs → seed plus variant, drop base    21
      │     (21 bases dropped by '+' policy)
      └─ 2 UNIFY_ABSORB (Galaxy S10+ / Note 10+)                       0 rows (absorb)
(C) NEEDS_REVIEW: 15 SEED AS-IS + 2 UNIFY absorb (Z Flip7/Z Fold7)    15 rows
(D) invalid: 3 → DROP                                                   0
(E) out-of-scope: 1,029 → DROP (scope)                                  0
(F) runtime-only: 251 → PROTECT                                         0

Override arithmetic: 35 overrides from (B) [33 PLUS_VARIANT + 2 UNIFY_ABSORB]
                     + 2 overrides from (C) [UNIFY_ABSORB] = 37 total ✓
```

**Authoritative seed counts:**

| Scenario | Rows seeded | Post-apply models (866 base) |
|---|---|---|
| A only — no further decisions (baseline this report) | **1,264** | 866 + 1,264 = **2,130** |
| A + B + C fully approved | 1,264 + 33 + 15 = **1,312** | 866 + 1,312 = **2,178** |

`approved-candidate-template.csv` = **1,264 rows = A only** (the independent `SAFE_TO_SEED` minus 21 bases). The 33 B plus-variants and 15 C `SEED AS-IS` records are the second approval track; the implementer appends them to the seed transaction only after the owner approves their overrides/decisions.

All scenarios: variants unchanged **1,816**; inventory unchanged **17** (`1c5d9b8a117a93f03335e7296abddec1`); no deletions; identity mismatches **0**; duplicate canonical_ids **0**.

---

## 6. APPLY Plan (Phases — described, no executable seed script is generated here)

Phase C **is not generated** in this package (no INSERT/UPDATE/DELETE/DDL). The transaction below is described for the owner/implementer; nothing executable is shipped.

- **Phase A — BASELINE (READ-ONLY):** run `catalog-audit/gc-r3/apply-baseline.sql`. All 5 checks must pass (866/1816/17/fp/0/0). Save the 866-row snapshot as `pre-apply-snapshot.csv`.
- **Phase B — CODE: merge override map** `proposed-model-id-overrides.json` into `src/catalog/canonical.ts` (37 entries: 33 PLUS_VARIANT + 4 UNIFY_ABSORB). Repo CI must pass (`npm run build`, `npm test`, typecheck, lint).
- **Phase C — APPLY (single transaction):**
  1. Insert **A = 1,264** `catalog_models` rows from `approved-candidate-template.csv` with `canonical_id = model_id` (slug = resolved override), `release_year = NULL`, `model_numbers = '{}'` (owner-approved posture), `created_at`/`updated_at` now.
  2. **If/only if owner approves track B + C** (§8.1, §8.4, §8.5): append the 33 plus-variants (B) and 15 `SEED AS-IS` (C) rows → total **1,312**.
  3. **Do NOT** insert the 21 SAFE_TO_SEED bases (dropped by `+` pair policy).
  4. **Do NOT** insert the 4 `UNIFY_ABSORB` records (S10+ / Note 10+ / Z Flip7 / Z Fold7) — alias resolution only.
  5. **No** changes to `catalog_variants`, `inventory_items`, or any out-of-scope rows.
- **Phase D — VERIFICATION (READ-ONLY):** run `catalog-audit/gc-r3/apply-verification.sql` with `:SEEDED_COUNT` and `:EXPECTED_TOTAL` = (1264 / 2130) for A-only, or (1312 / 2178) fully approved. D1–D8 must match expected values (models / 0 / 0 / 17+unchanged fp / 866 preserved / :SEEDED_COUNT present / 0 unexpected / :SEEDED_COUNT NULL-release rows).
- **Phase E — REGRESSION:** run existing test suite; confirm no variant/inventory tests fail; spot-check 5 seeded models by slug via `GET /catalog/models/:slug` and `GET /catalog/variants?modelId=`.
- **Phase F — POST-CLASSIFICATION:** re-run `catalog-gc-r3-prepare.ts` to confirm all approved rows now classify `runtime_only` and the remaining pool is empty for in-scope.

**Safety invariants enforced by this plan:**
- No deletions (D5), no identity mismatches (D2), no duplicate canonical_ids (D3), inventory untouched (D4), only approved cids inserted (D6/D7), out-of-scope untouched.
- READ-ONLY SQL shipped only; mutation must be reviewed by the owner before run.

---

## 7. Files Created / Modified

**Created (all under `catalog-audit/gc-r3/` unless noted):**
| File | Purpose |
|---|---|
| `approved-candidate-template.csv` | 1,264 rows = **A** (independent SAFE_TO_SEED minus 21 bases) — the first seed batch (model_id, brand, display_name, source ref, evidence, class, owner_decision). Track B (33 plus-variants) and C (15 SEED AS-IS) are appended only after owner approval (§6 Phase C step 2). |
| `plus-pair-decision-matrix.csv` | 35 pairs — full decision table (base, plus, cid, runtime state, override, proof, seedable). |
| `needs-review-decision-matrix.csv` | 17 rows — full decision table (conflict, reason, recommendation, override, risk). |
| `proposed-model-id-overrides.json` | 37 overrides (33 PLUS_VARIANT + 4 UNIFY_ABSORB) to merge into `src/catalog/canonical.ts`. |
| `runtime-only-protection.csv` | 251 runtime-only records — must NOT be deleted/re-inserted. |
| `gc-r3-summary.json` | Machine-readable summary (counts per class, paths, hashes). |
| `apply-baseline.sql` | READ-ONLY pre-apply verification (B1–B5). |
| `apply-verification.sql` | READ-ONLY post-apply verification template (D1–D8). |
| `docs/audits/catalog-gc-r3-apply-preparation.md` | This report. |

**Modified:** none. No repo source files were changed; no runtime DB change was performed.

---

## 8. Unresolved Owner Decisions (all blocking)

1. **Approve the 37 `MODEL_ID_OVERRIDES`** (33 PLUS_VARIANT + 4 UNIFY_ABSORB) for merge into `src/catalog/canonical.ts`. Approving the PLUS_VARIANT set unblocks the 33 B plus-variants (adds 33 to the seed total → 1,297). Rejecting any PLUS_VARIANT drops that plus record.
2. **Approve dropping the 21 SAFE_TO_SEED bases** (the base of each of the 21 `+` pairs where base was NOT already in runtime) — required so no duplicate canonical_id results.
3. **Approve seeding `release_year = NULL` + `model_numbers = '{}'`** for all seedable rows (A, plus approved B/C; no repo source for these fields).
4. **Approve the 4 `UNIFY_ABSORB` alias mappings** (Galaxy S10+ / Note 10+ / Z Flip7 / Z Fold7) — no new rows created, alias resolution added.
5. **Confirm the 15 `SEED AS-IS` NEEDS_REVIEW records** (name-coincidence only, no cid collision) — seed them (adds 15 → total 1,312).
6. **Confirm the 3 invalid records are dropped** (they are not in `approved-candidate-template.csv`).

---

## 9. Next Action Required from Owner

1. Reply to the 6 decisions in §8 (a simple "approve all" + any exceptions).
2. Upon approval, the implementer merges the 37 overrides, regenerates `approved-candidate-template.csv` (ids unchanged — the 1,264 are final), and executes Phase C after the owner runs Phase A baseline.

---

**STOP — this is a read-only preparation package. No APPLY has been executed.**
