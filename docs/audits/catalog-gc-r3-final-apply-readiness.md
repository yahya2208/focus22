# GC-R3 — FINAL APPLY READINESS REPORT

**Status:** APPLY PREPARATION COMPLETE AND VERIFIED. **NO SQL EXECUTED. NO DB MUTATION. NO SOURCE FILE MODIFIED.**
**Statement P:** **READY FOR OWNER GO** — the full final apply package is built, every precondition and collision proof passes, and it is held dormant until the owner says GO. Nothing is executed by this package on its own.
**Prepared:** from frozen `golden-reconcile-evidence.json` (3,004 rows) + `.catalog-store/catalog_models_v1.json` + `src/catalog/canonical*.ts` + `src/catalog/brands/*.json` (866 runtime) + Gate-05 RPC/schema.

---

## A. Owner Decisions (frozen as instructed)

| # | Decision | Status | Package artifact |
|---|---|---|---|
| 1 | APPROVE the 37 MODEL_ID_OVERRIDES (33 PLUS_VARIANT + 4 UNIFY_ABSORB); exact before/after diff; no invention | FROZEN | `apply-final/07-override-diff-before-after.md`, `02-override-sql-mirror-upgrade.sql` |
| 2 | DROP the 21 `+` base candidates; never seed both sides of a collapsed pair | FROZEN | `00-manifest-excluded-seed.csv` (21 rows) |
| 3 | NULL / `'{}'` policy — validate RPC/schema handling; never fabricate | FROZEN — **validated** (see below) | `03-apply-seed.sql` inserts `release_year=NULL`, `model_numbers='{}'`, `aliases='{}'` explicitly |
| 4 | APPROVE 4 UNIFY_ABSORB; verify each target exists in runtime; no duplicate physical model | FROZEN — **targets verified** (see E) | `00-manifest-absorb.csv` |
| 5 | APPROVE 15 SEED AS-IS; explicit 17-row final decision table | FROZEN | `09-needs-review-final-decisions.csv` + §D |
| 6 | DROP 3 INVALID records; never reach catalog_create_model() | FROZEN | `00-manifest-excluded-seed.csv` (3 rows) |

**Decision #3 validation (RPC + schema, from `supabase/catalog-central/05-catalog-create-model-rpc-apply.sql` and `01-catalog-schema-apply.sql`):**
- `catalog_models` schema: `release_year integer NULL`, `model_numbers text[] NOT NULL DEFAULT '{}'`, `aliases text[] NOT NULL DEFAULT '{}'`, `series text NULL`, `status text DEFAULT 'active' CHECK (active|archived)`, UNIQUE(canonical_id), UNIQUE(brand_id, name).
- RPC `catalog_create_model`: `p_release_year integer DEFAULT NULL` (guard rejects only `<= 0` when provided → **NULL is valid**); `p_model_numbers text[] DEFAULT '{}'` and `p_aliases text[] DEFAULT '{}'`, both `COALESCE(...,'{}')` → **`'{}'` is valid**; `status` hardcoded `'active'`.
- **Conclusion: `release_year = NULL`, `model_numbers = '{}'`, `aliases = '{}'` is fully valid and used explicitly. No fabrication.**
- **Critical implementation note:** the RPC is admin-gated via `catalog_is_admin()` → `auth.uid()` (JWT). Running from the SQL Editor as `postgres` (no JWT) would raise `Forbidden`. Therefore the bulk seed uses **direct INSERT as postgres** (owner/superuser, RLS-bypass for write), not the RPC. The RPC remains the future single-model admin path. `catalog_model_id()` SQL mirror is upgraded in-transaction so the post-apply identity check and future RPC calls stay consistent.

---

## B. Exact 37 Overrides (merged map = 4 existing + 37 proposed = 41; no invented entries)

Verified: no override key collides with any existing runtime `(brand_id, name)`; all 37 targets are unique; none of the 866 existing identities change under the merged map (builder proof).

```
 1. huawei     | Mate 40 Pro+           -> huawei-mate-40-pro-plus          PLUS_VARIANT
 2. huawei     | Mate 60 Pro+           -> huawei-mate-60-pro-plus          PLUS_VARIANT
 3. huawei     | P40 Pro+               -> huawei-p40-pro-plus              PLUS_VARIANT
 4. infinix    | Note 40 Pro+           -> infinix-note-40-pro-plus         PLUS_VARIANT
 5. motorola   | Edge+                  -> motorola-edge-plus               PLUS_VARIANT
 6. motorola   | One Fusion+            -> motorola-one-fusion-plus         PLUS_VARIANT
 7. oppo       | F19 Pro+               -> oppo-f19-pro-plus                PLUS_VARIANT
 8. oppo       | Reno 10 Pro+           -> oppo-reno-10-pro-plus            PLUS_VARIANT
 9. realme     | Realme 10 Pro+         -> realme-realme-10-pro-plus        PLUS_VARIANT
10. realme     | Realme 11 Pro+         -> realme-realme-11-pro-plus        PLUS_VARIANT
11. realme     | Realme 12 Pro+         -> realme-realme-12-pro-plus        PLUS_VARIANT
12. realme     | Realme 12+             -> realme-realme-12-plus            PLUS_VARIANT
13. realme     | Realme 13 Pro+         -> realme-realme-13-pro-plus        PLUS_VARIANT
14. realme     | Realme 9 Pro+          -> realme-realme-9-pro-plus         PLUS_VARIANT
15. samsung    | Galaxy A6+ (2018)      -> samsung-galaxy-a6-2018-plus      PLUS_VARIANT
16. samsung    | Galaxy A8+ (2018)      -> samsung-galaxy-a8-2018-plus      PLUS_VARIANT
17. samsung    | Galaxy Grand Prime+    -> samsung-galaxy-grand-prime-plus  PLUS_VARIANT
18. samsung    | Galaxy J4+             -> samsung-galaxy-j4-plus           PLUS_VARIANT
19. samsung    | Galaxy J6+             -> samsung-galaxy-j6-plus           PLUS_VARIANT
20. samsung    | Galaxy Note 10+        -> samsung-galaxy-note-10-plus      UNIFY_ABSORB
21. samsung    | Galaxy S10+            -> samsung-galaxy-s10-plus          UNIFY_ABSORB
22. samsung    | Galaxy S6 Edge+        -> samsung-galaxy-s6-edge-plus      PLUS_VARIANT
23. samsung    | Galaxy S8+             -> samsung-galaxy-s8-plus           PLUS_VARIANT
24. samsung    | Galaxy S9+             -> samsung-galaxy-s9-plus           PLUS_VARIANT
25. samsung    | Galaxy Z Flip7         -> samsung-galaxy-z-flip-7          UNIFY_ABSORB
26. samsung    | Galaxy Z Fold7         -> samsung-galaxy-z-fold-7          UNIFY_ABSORB
27. sony       | Xperia Z3+             -> sony-xperia-z3-plus              PLUS_VARIANT
28. tecno      | Spark 20 Pro+          -> tecno-spark-20-pro-plus          PLUS_VARIANT
29. vivo       | V7+                    -> vivo-v7-plus                     PLUS_VARIANT
30. vivo       | X Fold+                -> vivo-x-fold-plus                 PLUS_VARIANT
31. vivo       | X50 Pro+               -> vivo-x50-pro-plus                PLUS_VARIANT
32. vivo       | X60 Pro+               -> vivo-x60-pro-plus                PLUS_VARIANT
33. vivo       | X70 Pro+               -> vivo-x70-pro-plus                PLUS_VARIANT
34. vivo       | X90 Pro+               -> vivo-x90-pro-plus                PLUS_VARIANT
35. xiaomi     | Redmi Note 12 Pro+     -> xiaomi-redmi-note-12-pro-plus    PLUS_VARIANT
36. xiaomi     | Redmi Note 12 Pro+ 5G  -> xiaomi-redmi-note-12-pro-5g-plus PLUS_VARIANT
37. xiaomi     | Redmi Note 13 Pro+ 5G  -> xiaomi-redmi-note-13-pro-5g-plus PLUS_VARIANT
```

TS before/after + SQL mirror before/after (41 WHEN clauses) exact text: `apply-final/07-override-diff-before-after.md`. The migration is applied ONLY through the override mechanism (TS `MODEL_ID_OVERRIDES` merge + SQL `catalog_model_id()` mirror) — nothing is invented.

---

## C. Exact 21 Dropped Bases (never seeded; each `+` variant owns the identity via B)

| brand | name | collided cid | brand | name | collided cid |
|---|---|---|---|---|---|
| infinix | Note 40 Pro | infinix-note-40-pro | samsung | Galaxy S6 Edge | samsung-galaxy-s6-edge |
| motorola | One Fusion | motorola-one-fusion | samsung | Galaxy S8 | samsung-galaxy-s8 |
| oppo | F19 Pro | oppo-f19-pro | samsung | Galaxy S9 | samsung-galaxy-s9 |
| realme | Realme 10 Pro | realme-realme-10-pro | tecno | Spark 20 Pro | tecno-spark-20-pro |
| realme | Realme 11 Pro | realme-realme-11-pro | vivo | V7 | vivo-v7 |
| realme | Realme 12 Pro | realme-realme-12-pro | vivo | X Fold | vivo-x-fold |
| realme | Realme 13 Pro | realme-realme-13-pro | xiaomi | Redmi Note 12 Pro 5G | xiaomi-redmi-note-12-pro-5g |
| realme | Realme 9 Pro | realme-realme-9-pro | xiaomi | Redmi Note 13 Pro 5G | xiaomi-redmi-note-13-pro-5g |
| samsung | Galaxy A6 (2018) | samsung-galaxy-a6-2018 | samsung | Galaxy J4 | samsung-galaxy-j4 |
| samsung | Galaxy A8 (2018) | samsung-galaxy-a8-2018 | samsung | Galaxy J6 | samsung-galaxy-j6 |
| samsung | Galaxy Grand Prime | samsung-galaxy-grand-prime | | | |

Verified: none of these 21 `(brand,name)` or their cids appear in the seed manifest (`00-manifest-excluded-seed.csv`, 21 rows).

---

## D. Exact 15 SEED AS-IS (track C) + 17-row final decision table

`09-needs-review-final-decisions.csv` holds the full 17-row table (source → decision → final canonical_id → action). The 15 SEED AS-IS rows:

| source brand | source name | decision | final canonical_id | action |
|---|---|---|---|---|
| huawei | Honor 20 | APPROVE SEED AS-IS | huawei-honor-20 | INSERT (C) |
| nokia | C21 | APPROVE SEED AS-IS | nokia-c21 | INSERT (C) |
| nokia | C30 | APPROVE SEED AS-IS | nokia-c30 | INSERT (C) |
| nokia | C31 | APPROVE SEED AS-IS | nokia-c31 | INSERT (C) |
| nokia | X10 | APPROVE SEED AS-IS | nokia-x10 | INSERT (C) |
| nokia | X100 | APPROVE SEED AS-IS | nokia-x100 | INSERT (C) |
| nokia | X20 | APPROVE SEED AS-IS | nokia-x20 | INSERT (C) |
| nokia | X30 | APPROVE SEED AS-IS | nokia-x30 | INSERT (C) |
| realme | X50 Pro | APPROVE SEED AS-IS | realme-x50-pro | INSERT (C) |
| realme | X7 | APPROVE SEED AS-IS | realme-x7 | INSERT (C) |
| vivo | X20 | APPROVE SEED AS-IS | vivo-x20 | INSERT (C) |
| vivo | X30 | APPROVE SEED AS-IS | vivo-x30 | INSERT (C) |
| vivo | X6 | APPROVE SEED AS-IS | vivo-x6 | INSERT (C) |
| vivo | X7 | APPROVE SEED AS-IS | vivo-x7 | INSERT (C) |
| vivo | X9 | APPROVE SEED AS-IS | vivo-x9 | INSERT (C) |

The 2 UNIFY rows (Galaxy Z Flip7 → `samsung-galaxy-z-flip-7`; Galaxy Z Fold7 → `samsung-galaxy-z-fold-7`) are governed by the approved absorbs (§E) — **NO INSERT**.

---

## E. Exact 4 Absorbs (UNIFY_ABSORB) — targets verified in Runtime

| source (golden) | final canonical_id | existing runtime model (verified) | action |
|---|---|---|---|
| samsung / Galaxy S10+ | samsung-galaxy-s10-plus | samsung / Galaxy S10 Plus | NO INSERT — alias resolution |
| samsung / Galaxy Note 10+ | samsung-galaxy-note-10-plus | samsung / Galaxy Note 10 Plus | NO INSERT — alias resolution |
| samsung / Galaxy Z Flip7 | samsung-galaxy-z-flip-7 | samsung / Galaxy Z Flip 7 | NO INSERT — alias resolution |
| samsung / Galaxy Z Fold7 | samsung-galaxy-z-fold-7 | samsung / Galaxy Z Fold 7 | NO INSERT — alias resolution |

Each target exists in the 866 runtime set; none of the source `(brand,name)` pairs exists at runtime, so no second physical model is created. The 4 source records are NOT in the seed manifest.

---

## F. Exact 3 Invalid Exclusions

| brand | name | canonical_id | reason |
|---|---|---|---|
| generic-unknown | Android Tablet | generic-unknown-android-tablet | INVALID_OR_INCOMPLETE placeholder |
| generic-unknown | Keypad Phone | generic-unknown-keypad-phone | INVALID_OR_INCOMPLETE placeholder |
| generic-unknown | Unknown Device | generic-unknown-unknown-device | INVALID_OR_INCOMPLETE placeholder |

Verified absent from the seed manifest. Also out-of-scope (1,029) and runtime-only protected (251) are absent/protected (`00-manifest-out-of-scope.csv`, `00-manifest-runtime-only.csv`).

---

## G. Final Seed Count — **1,312** (A 1,264 + B 33 + C 15)

`00-manifest-seed.csv` = 1,312 rows. Tracks: A (independent SAFE, no override) 1,264; B (plus variants, 33 overrides) 33; C (SEED AS-IS) 15. Every row: `canonical_id = resolveModelId(brand_id, name)` (post-merge), `release_year = NULL`, `model_numbers = '{}'`, `aliases = '{}'` (golden aliases are self-referential display strings only — verified 0 real aliases), `series` faithful to golden `seriesName`, `status = 'active'`.

## H. Expected Final `catalog_models` Count — **2,178** (866 + 1,312)

## I. Expected Variants Count — **1,816** (unchanged; apply touches no variant tables)

## J. Expected Inventory Count — **17** with fingerprint unchanged (`1c5d9b8a117a93f03335e7296abddec1`); inventory_items never written.

---

## K. Pre/Post Fingerprint Strategy

- **Pre (01-pre-apply-baseline.sql + in-tx guard):** assert `catalog_models=866`, `catalog_variants=1816`, `inventory_items=17`, `md5(inventory_items ordered by id) = 1c5d9b8a117a93f03335e7296abddec1`, identity mismatches=0, duplicate canonical_ids=0.
- **In-transaction:** re-assert the same immediately before seed (fail-closed abort) and immediately after seed.
- **Post (04-post-apply-verify.sql):** re-assert `17` + same md5, plus 2178/1816/0/0/866-preserved/1312-seeded/0-unexpected.
- The fingerprint query covers `(id, source_key, model_id, quantity, status, is_published)` ordered by `id` — deterministic; any inventory change aborts the apply.

## L. Collision Proof (all verified by the builder + independent re-checks)

1. Runtime = 866 models, 866 unique canonical_ids (identity proof from Gate 05 = 0 mismatches).
2. Merged override map = 41 keys; 37 targets unique; **0 of the 866 existing identities change** under the merged map.
3. Seed batch: 1,312 unique canonical_ids AND 1,312 unique `(brand_id, name)` (no within-batch collision).
4. Seed cids ∩ runtime cids = **0**; seed `(brand,name)` ∩ runtime = **0**.
5. 37 override keys ∩ runtime `(brand,name)` = **0**.
6. 4 absorb sources ∩ runtime `(brand,name)` = **0**; 4 absorb targets ∈ runtime = **proven**.
7. 21 dropped bases + 3 invalid ∩ seed manifest = **0** (cids and `(brand,name)`).
8. SQL-mirror simulation: `catalog_model_id(brand,name)` (41 WHEN clauses) == TS canonical_id for **all 1,312** seed rows → post-apply identity check will return 0.
9. Seed brands ⊆ 18 runtime brands (no foreign brand inserted).

## M. Rollback Proof

- **During apply:** the entire apply is ONE transaction (`03-apply-seed.sql` `BEGIN…COMMIT`). Any guard failure, constraint violation (`canonical_id` UNIQUE, `brand_id+name` UNIQUE), or error → Postgres atomic rollback. Never partially seeds.
- **Post-commit manual recovery (`05-rollback.sql`):** `_gcr3_preapply_models` (866 id/canonical_id snapshot) is created inside the apply transaction. Rollback deletes only rows whose `canonical_id ∈ {1,312 seed}` **AND** `id NOT IN snapshot` → **can only delete rows inserted by this apply; never a pre-existing model.** Guarded by `to_regclass` precondition. `_gcr3_preapply_models` is then dropped.
- Mirror upgrade is idempotent (CREATE OR REPLACE); optional revert snippet documented. No inventory, variant, RLS, RPC, or out-of-scope data is ever modified by either script.

---

## N. Files Created / Modified

**Created (this session; nothing pre-existing was modified):**

`catalog-audit/gc-r3/` (gitignored audit area — package persists, not tracked):
- `apply-final/00-manifest-seed.csv` (1,312), `00-manifest-absorb.csv` (4), `00-manifest-excluded-seed.csv` (24), `00-manifest-out-of-scope.csv` (1,029), `00-manifest-runtime-only.csv` (251)
- `apply-final/01-pre-apply-baseline.sql`, `02-override-sql-mirror-upgrade.sql`, `03-apply-seed.sql`, `04-post-apply-verify.sql`, `05-rollback.sql`, `06-run-order.md`, `07-override-diff-before-after.md`, `09-needs-review-final-decisions.csv`
- (prior phase) `approved-candidate-template.csv`, `plus-pair-decision-matrix.csv`, `needs-review-decision-matrix.csv`, `proposed-model-id-overrides.json`, `runtime-only-protection.csv`, `gc-r3-summary.json`, `apply-baseline.sql`, `apply-verification.sql`

**Created (trackable):**
- `scripts/catalog-gc-r3-build-apply.ts` (package builder; READ-ONLY, no DB)
- `docs/audits/catalog-gc-r3-final-apply-readiness.md` (this report)
- `docs/audits/catalog-gc-r3-apply-preparation.md` (prior phase)

**Modified:** NONE. No file under `src/`, `supabase/catalog-central/*.sql`, or any tracked runtime file was touched this session. `MODEL_ID_OVERRIDES`, Golden, Runtime, Inventory all untouched.

## O. Git Diff / Stat

- This session: **0 tracked files modified** (the 3 modified files `00-catalog-preflight.sql`, `02-catalog-seed-runtime.sql`, `04-catalog-gate1-verify.sql` were changed in prior Gate-05 phases, not here).
- New untracked (trackable): `scripts/catalog-gc-r3-build-apply.ts`, `scripts/catalog-gc-r3-prepare.ts`, `scripts/catalog-golden-owner-review.ts`, `scripts/catalog-golden-reconcile.ts`, plus prior-phase docs and Gate-05 SQL files.
- `catalog-audit/` is gitignored by design (audit artifacts). Owner may choose to add the apply package to tracking before GO.

---

## P. **READY FOR OWNER GO** — BLOCKED until explicit GO.

No DB mutation is authorized or performed until the owner says GO. When authorized: run `01-pre-apply-baseline.sql` → `03-apply-seed.sql` (single transaction) → `04-post-apply-verify.sql`; `05-rollback.sql` only if an undo is ordered.

**STOP — report ends here. No APPLY executed.**
