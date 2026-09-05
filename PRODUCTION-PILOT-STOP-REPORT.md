# PRODUCTION PILOT DEPLOYMENT REPORT

**Target:** fmggysdqigtejxbfpgtg

```
00065: APPLIED
00066: FAILED  →  fully rolled back (atomic)
00067: NOT APPLIED (blocked by STOP condition)

Pilot neighborhood: ✓ (00065 objects live)
Pilot store:       ✓ (00065 objects live)
Families:         0/5 (00066 seed NOT applied — rolled back)
Store inventory:  ✓ (00065 objects live)
Order integration: ✓ (00065 applied)
Delivery integration: ✓ (00065 applied)
Telemetry:        NOT APPLIED (00067 pending)
RLS:              ✓ (13/13 pilot policies present, all on new pilot tables)
Grants:           ✓ (no ACL removals observed after 00065; pre/post ACL diff additive-only)
Existing objects preserved: ✓ (fp 441→494 exactly as proven; only pilot additions)

Production smoke test: NOT RUN (per STOP policy)
FINAL: BLOCKED — STOPPED per conditions; awaiting owner decision
```

---

## 1. What happened (in exact order)

1. **Final preflight (read-only) — PASS.** Production fingerprint identical to the proven baseline: public schema fp 441/441 (0 diffs), tables 47, views 2, functions 136, roles & extensions identical, `supabase_migrations.schema_migrations` ABSENT, storage equals the documented baseline (+ only the 3 known bucket *data* rows). One cosmetic ACL-text ordering difference (`is_admin`) confirmed as rendering artifact: identical grantees/privileges, different array order.
2. **00065 — APPLIED (EXIT=0, `--single-transaction`).** Verified post-state: 5 pilot tables, 13 pilot policies, 16 `pilot_*` functions + `fn_admin_uid`, `orders` 13→16 columns. Matches replay expectation exactly.
3. **00066 — FAILED (EXIT=3, `--single-transaction`).** The whole file rolled back atomically. **No partial state.**

## 2. Exact failure

```
psql:supabase/migrations/00066_pilot_seed.sql:30: ERROR:  could not create unique index "idx_inventory_items_sku"
DETAIL:  Key (model_id, variant, condition, color)=(بلدي الطماطم, , Good, ) is duplicated.
```

`00066` re-establishes a **UNIQUE index on `public.inventory_items(model_id, variant, condition, color)`** (line 30, matching the comment: migration 00035 had dropped `inventory_items_unique_sku`). **Production catalog data violates that key** — the pair `(بلدي الطماطم, '', 'Good', '')` exists twice. This blocker cannot appear on the empty replay databases used during proofing (schema-only), which is exactly the "environment differs from the proven baseline" case your conditions anticipated.

## 3. Rollback verification (read-only, post-failure)

| Item (expected if rollback complete) | Production state |
|---|---|
| `idx_inventory_items_sku` | ABSENT ✓ |
| Seed rows: `family_groups / neighborhoods / stores / store_inventory` | 0 / 0 / 0 / 0 ✓ |
| `orders` columns | 16 (from 00065 only) ✓ |
| 00065 pilot tables / policies / functions | 5 / 13 / 17 — intact ✓ |
| ACL diff (baseline → now) | additive-only; 0 removals ✓ |

**Current production state = original live + 00065 only.** Nothing else changed.

## 4. Root cause

The approved 00066 logically requires catalog uniqueness it re-establishes, but **existing production data has 1 duplicate group** — `(بلدي الطماطم, '', 'Good', '')` ×2 (2 rows). The replay proof validated DDL on empty tables; a data-level conflict on live catalog was out of scope of what the schema fingerprints could detect.

## 5. Following your STOP conditions

No fix has been attempted. No further production writes will be made until you decide.

## 6. Options for your decision (nothing executed)

- **Option 1 (data fix, then re-run):** You authorize correcting the duplicate catalog row(s) in production (e.g., merge/disable one of the two rows), then I re-run 00066 → 00067.
- **Option 2 (revised 00066):** You approve an amended 00066 that handles pre-existing duplicates deterministically (e.g., de-duplicates before creating the index, or aligns the seed with the true logical key). This changes the approved SHA → requires a new proof run against a replay seeded with production-like duplicate data before any production write.
- **Option 3 (investigate first):** The duplicate may reveal a real data-quality bug worth reviewing (why migration 00035 previously dropped this unique constraint) before proceeding either way.

I recommend Option 3 as a *pre-check*, then Option 1 or 2 on your call.

---

*Production write paused. No additional production statements executed after the 00066 failure.*