# PRODUCTION PILOT DEPLOYMENT REPORT

**Target:** fmggysdqigtejxbfpgtg

```
00065: APPLIED
00066: APPLIED
00067: APPLIED

Pilot neighborhood: ✓
Pilot store: ✓
Families: 5/5
Store inventory: ✓
Order integration: ✓
Delivery integration: ✓
Telemetry: ✓
RLS: ✓
Grants: ✓
Existing objects preserved: ✓

Production smoke test: PASS

FINAL: READY FOR REAL PILOT
```

---

## 1. Deployment method

Live-derived deployment model (owner-approved): applied migrations **only** as a Pilot delta on top of the real production schema. **No migration-repair, no fabricated migration history** was used (production still has no `supabase_migrations.schema_migrations`). Each file ran as its own transaction with `ON_ERROR_STOP`:

- `00065` via `psql --single-transaction` → EXIT=0 (atomic)
- `00066` via `psql --single-transaction` → EXIT=0 (atomic)
- `00067` via `psql` (file has internal BEGIN…COMMIT) → EXIT=0 (atomic)

SHA-256 verified immediately before apply:
`00065` = `e250ddfe…4f65`, `00066` = `0b8e0b9e…c0b5`, **`00067` = `fdf21245…eca2` (the repaired version — broken `1fdbefeebe…` was never used).**

## 2. Pre-deployment incident — resolved under owner direction

`00066` **failed on first attempt** (EXIT=3, atomic rollback) because it re-creates the unique index `idx_inventory_items_sku(model_id, variant, condition, color)` and production catalog held a duplicated test row `(بلدي الطماطم, '', 'Good', '') ×2`.

- Read-only verification (per your instructions) proved the two rows were pure test data: empty `source_key`, `total_sold=0`, `quantity=1`, no order/item references, and a full whole-row scan of all 52 public tables showed **zero** links beyond their own CASCADE children.
- **Deleted exactly one row** (authorized cleanup): `a06a1074-d244-4546-b35f-b2f24a277172` (the older, unpublished duplicate; kept the published `83156482-…`). Its two CASCADE children (creation `inventory_movements`, `produce_details`) were removed with it. **Nothing else was deleted.** Post-cleanup: duplicate groups = **0**; `inventory_items` 69 → 68.
- `00066` (unchanged SHA) then applied cleanly.

## 3. Post-deploy verification (all read-only)

**Objects vs. the proven replay reference (byte-fingerprint):**

| Dimension | Proved reference | Production post | Match |
|---|---|---|---|
| public schema fingerprint (`fp-live4`) | 494 | **494** | exact (0/0 diffs) |
| ACL / grants / RLS (`acl-fp`) | 286 | **286** | exact (only `is_admin` array-order rendering artifact, semantics identical) |
| storage schema | 42 (incl. the 3 documented bucket-data rows) | **42** | identical (0/0) |

**Delta vs. production before Pilot:** +57 / −4 exactly as proven (20 functions incl. the 3 rewritten + `fn_admin_uid`; 18 indexes; 13 policies; 6 table keys incl. `orders` 13→16 cols).

**Scope checks:** pilot tables = 5, all with RLS enabled; pilot policies = 13 (all on new tables only); `idx_inventory_items_sku` present; telemetry arms 80 → **97** (only-post 17, only-live 0), allowlist 81 → **98**; `game_result_view` and all the Pilot/Phase-8 events present; `orders` = 16 columns.

**Seeds:** neighborhoods 1, stores 1, **families 5/5**, neighborhood↔families 5, store↔inventory 5.

## 4. Production smoke tests — PASS (non-persisting)

All smoke actions ran inside transactions that were rolled back — **no test orders, items, or telemetry rows were left in production** (verified: `orders=3, order_items=3, telemetry=886` before and after).

- `pilot_active_neighborhoods()` → 1 ✓
- `pilot_active_stores(neigh)` → 1 (pilot-store-1) ✓
- `pilot_neighborhood_families(neigh)` → 5/5 ✓
- `pilot_store_products(store)` → 5 ✓
- `pilot_orders_for_store(store)` → empty (0) with valid auth context ✓
- `pilot_admin_list_neighborhoods()` → seeded neighborhood ✓
- **End-to-end order:** `delivery_create_order()` for a seeded store catalog item returned: `order_number FC-000005`, `subtotal 549`, `delivery_fee 350`, `total 899`, `status pending`, **`store_id 8e1bdb04…` (store resolution), `neighborhood_id ffbf7c33…` (neighborhood tagging)** ✓ — the full Pilot header columns + `order_items` + delivery estimate write path executed, then rolled back.
- Auth gates behave as designed (order + orders-for-store require `auth.uid()`; both verified with a real `public.users` super_admin identity under rollback).

## 5. Constraints honored

- No migration outside the approved Pilot scope was run.
- No existing object dropped or recreated beyond the 3 intended function rewrites (CREATE OR REPLACE) + `orders` column additions.
- RLS/grants/storage/policies: **untouched except the 13 intended pilot additions** (ACL diff: 0 removals, +35 additive only; storage 42→42; bucket data rows unchanged).
- `00067` repaired-sha applied; broken sha never used; the cli-proof copy still needs refreshing to `fdf21245…` before any future CLI push.
- Sequence counters advanced only by `FC-000005` from the (rolled-back) smoke — expected, harmless.

## 6. Go / limitations note

**READY FOR REAL PILOT.** Remaining observations for the live trial: (a) the `MULTI_STORE_ORDER` guard is present (P0002, inside `delivery_create_order`) but was not trigger-tested on production because only one store exists; it was proven on the two disposable replays; (b) `pilot_reset` is intentionally NOT invoked; (c) no user data was created or modified — the 5-user trial can start with a clean slate.

🥬 محل خضار → 🏘️ حي → 👨‍👩‍👧‍👦 5 عائلات → 🛒 طلبات → 🛵 مندوب → 🏠 توصيل → 📊 Telemetry كامل.