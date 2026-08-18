# GC-R3 LAST SAFETY REVIEW

**Scope:** Direct INSERT vs `catalog_create_model()` for the 1,312-row seed.
**Mode:** READ-ONLY. No SQL executed, no DB changed, no runtime/golden/inventory touched, no MODEL_ID_OVERRIDES modified.
**Package:** `catalog-audit/gc-r3/apply-final/` (03/04 updated during this review — file edits only, nothing executed).

---

## A. Direct INSERT equivalence

**Target table:** `public.catalog_models` (only table written).

**Exact statement (03-apply-seed.sql, step 5):**
```sql
INSERT INTO public.catalog_models (canonical_id, brand_id, name, series, release_year, model_numbers, aliases, status)
SELECT canonical_id, brand_id, name, series, NULL::integer, model_numbers, aliases, 'active'
  FROM _gcr3_seed
  ORDER BY canonical_id;
```

| Column | Source | Notes |
|---|---|---|
| canonical_id | manifest = `catalog_model_id(brand_id,name)` | proven equal for all 1,312 under 41-mirror (simulation: 0 mismatches) |
| brand_id | manifest (18 runtime brands) | non-empty |
| name | manifest | non-empty |
| series | manifest (`NULLIF('',…)` → NULL) | nullable per schema |
| release_year | literal `NULL::integer` | RPC accepts NULL (rejects only non-NULL `<= 0`) |
| model_numbers | `'{}'` (`ARRAY[]::text[]`) | exact match to RPC `COALESCE(p_model_numbers,'{}')` |
| aliases | `'{}'` | exact match to RPC `COALESCE(p_aliases,'{}')` |
| status | `'active'` | RPC default; inside CHECK domain |
| id / created_at / updated_at | omitted → defaults | `gen_random_uuid()` / `now()` / `now()` — identical to RPC path |

**No trigger or constraint dropped or modified.** The only DDL is `CREATE OR REPLACE FUNCTION catalog_model_id()` (idempotent) + `CREATE TEMP TABLE … ON COMMIT DROP`. Precedent: GATE-2 already inserted directly as `postgres` (`02-catalog-seed-runtime.sql:2797`).

## B. Trigger/constraint proof

- **Triggers on catalog_models: NONE.** Repo-wide scan: all `CREATE TRIGGER` statements target `ad_images`, `inventory_items`, or `users`. Nothing fires during the INSERT.
- Constraints that fire automatically (these ARE the RPC invariants, enforced by the DB):
  - `UNIQUE (canonical_id)` — collision → abort
  - `UNIQUE (brand_id, name)` via `catalog_models_brand_name_uidx` — collision → abort
  - `CHECK status IN ('active','archived')`
  - NOT NULL on canonical_id/brand_id/name/model_numbers/aliases/status/created_at/updated_at
- 1:1 mapping to `catalog_create_model()` invariants:
  brand_id ✓ · name ✓ · canonical_id=fn() ✓ (post-guard `idn_ok`=0, same guarantee as RPC) · canonical collision ✓ · (brand,name) collision ✓ · release_year rule ✓ (all NULL) · model_numbers/aliases ✓ · status ✓ · timestamps/defaults ✓.
- **Only skipped check: `catalog_is_admin()/auth.uid()`** — the sole, documented exception (unrunnable as `postgres` in SQL Editor).

## C. 41-mirror safety

- 41 WHENs in `02` == inline copy in `03` == TS expected set (41). Zero diffs.
- **Duplicate canonical IDs: none** — 41 distinct keys, 41 distinct targets.
- **Two different models → same id: no.** The only intentional value-reuse is the 4 absorbs, where the source spelling and the runtime spelling are the *same physical device* (one row exists).
- **Existing runtime identities: 0 changes.** Simulated `resolveModelId(old) vs resolveModelId(41)` over all 866 runtime models → 0 changes. `identity mismatches = 0` before (baseline) and after (simulated + enforced by in-tx guard `idn_ok`).

## D. 37-override safety

- 37 = 33 `plus_variant_new_cid` + 4 `unify_absorb` (proposed JSON `meta.counts`). Existing 4 xiaomi overrides preserved.
- None of the 41 override keys is a runtime row name whose stored cid differs (proof: 0 identity changes over the 866).
- Seed identity under 41-mirror: 0 mismatches for all 1,312 (simulated → the in-tx `idn_ok` check will pass).
- **MODEL_ID_OVERRIDES (TS) untouched**, per owner instruction. DB mirror is the identity source of truth post-apply; flagged in J as the one intentional asymmetry.

## E. 4-absorb proof

| Source (golden spelling) | Final cid | Runtime target (exists ✓) |
|---|---|---|
| samsung / Galaxy S10+ | samsung-galaxy-s10-plus | Galaxy S10 Plus |
| samsung / Galaxy Note 10+ | samsung-galaxy-note-10-plus | Galaxy Note 10 Plus |
| samsung / Galaxy Z Flip7 | samsung-galaxy-z-flip-7 | Galaxy Z Flip 7 |
| samsung / Galaxy Z Fold7 | samsung-galaxy-z-fold-7 | Galaxy Z Fold 7 |

- All 4 targets verified present in the 866 runtime models.
- Sources are **never inserted** (0 leak into seed manifest). Absorb = alias resolution via override.
- **Duplicate physical model: impossible** — no source row is inserted, and `UNIQUE(canonical_id)` + `UNIQUE(brand_id,name)` would abort any accidental insert.

## F. 1,312 arithmetic proof

Seed manifest: **1,312 rows = A 1,264 + B 33 + C 15**. Unique canonical_id = 1,312. Unique (brand_id,name) = 1,312. `03` VALUES literal contains exactly 1,312 rows.

## G. Exclusion proof

- 24 excluded (21 dropped bases + 3 INVALID): **0** leak by cid and by (brand_id,name).
- 1,029 OUT_OF_SCOPE: **0** leak. 251 RUNTIME_ONLY: **0** leak.
- Enforced twice: manifest literals + in-tx post-guard `excl_ok`.

## H. Transaction/rollback proof

`03` verified flow:

```
BEGIN
→ _gcr3_guard_pre   (4 CHECK cols: models=866, variants=1816, inventory=17, fp=1c5d…)
→ _gcr3_preapply_models snapshot
→ mirror upgrade    (CREATE OR REPLACE, 41 WHENs)
→ _gcr3_seed        (temp) + 1,312 literal rows
→ _gcr3_guard_seed  (4 CHECK cols: count=1312, no dup (b,n), no cid collision, no (b,n) collision)
→ INSERT … SELECT    (plain INSERT, NO ON CONFLICT)
→ _gcr3_guard_post  (9 CHECK cols: total=2178, identity=0, cid-uniq, b/n-uniq, preserved=866,
                      seeded=1312, variants=1816, inv-fp, excluded absent)
→ status SELECT
→ COMMIT
```

- **No DO blocks, no EXCEPTION handlers, no plpgsql flow control** (except the pure `IMMUTABLE catalog_model_id()` — no handler, errors propagate → abort). Fail-closed: any violated CHECK aborts the whole transaction; nothing partial ever commits.
- **05-rollback:** deletes only `canonical_id ∈ (exact 1,312 seed list) AND id NOT IN snapshot`. 866 pre-existing ids are in the snapshot → never deletable. 251 runtime-only are part of the 866 → protected. 0 rollback cids overlap runtime cids (verified). Only `catalog_models` touched — variants (FK RESTRICT) and inventory untouched. Post: models = 866.

## I. Post-apply verification proof (04)

Beyond row counts, 04 now verifies: identity (`catalog_model_id=canonical_id`) = 0 · canonical uniqueness = 0 · **brand/name uniqueness = 0** · models 2178 · variants 1816 · inventory 17 + fp unchanged · 866 preserved · 1,312 seeded present · 0 unexpected rows · seeded release_year NULL = 1,312 · **overrides: mirror_when_count = 41, spot samples resolve to override targets, 4 absorb targets exist** · **excluded presence = 0**.

## J. Final risks

1. Only bypassed protection: `auth.uid()` admin gate — required and documented. RLS has no write policy; as `postgres` this is the intended, GATE-2-precedented path.
2. DB mirror (41) vs TS `MODEL_ID_OVERRIDES` (4) intentionally differ. Before any future `catalog_create_model()` for the 37 new names, a TS mirror step must be approved/applied, or RPC-computed ids would diverge. 04 asserts the mirror is in place.
3. `created_at/updated_at = now()` at apply time — same as any RPC call; non-issue.
4. `_gcr3_preapply_models` is a permanent backup table (required by 04/05); dropped only by 05.
5. Absorbed golden spellings ('Galaxy S10+'…) are not rows; they resolve to the existing runtime device. Intentional.
6. Inventory must remain 17 with fp `1c5d9b8a117a93f03335e7296abddec1` — asserted pre, in-tx, and post.

## K. FINAL STATUS

**READY FOR OWNER GO**

Nothing has been executed. No GRANT/REVOKE, no INSERT/UPDATE/DELETE, no migration, no ALTER was run. The package (`03` now pure-SQL fail-closed; `04` extended) is complete and verified.
