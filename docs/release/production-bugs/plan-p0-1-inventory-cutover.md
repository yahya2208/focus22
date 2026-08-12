# FOCUS — Plan P0-1: Inventory Cutover + Data Reconciliation (Phase A)

- **Date:** 2026-08-11
- **Parent report:** `docs/release/production-bugs/ad-multi-image-inventory-sync.md` (BUG-INV-001)
- **Phase:** PLAN — FOR OWNER REVIEW. **NOT EXECUTED.**
- **Revision:** Rev 2 (2026-08-11, owner review R1) — **NO re-apply of existing objects** (Gate 2 =
  CLOSED/VERIFIED, `01-inventory-apply.sql` = current Production state); backfill is **all-or-nothing
  transactional** (8/8 or 0); decision log in §4 (Decision → Choice → Reason → Consequence);
  D-GATE-2 resolved to **(a)** — no new backup key.
- **Gate status:** Gate 2 remains **CLOSED / VERIFIED**. Nothing below is applied until the owner
  approves this plan (Phase A = Inventory first, then Phase B = Ads, separately).
- **Scope limits honored so far:** no SQL applied, no migration executed, no localStorage data
  deleted, no RLS/storage-policy change, no images touched, no cutover performed.

---

## 1. Objective

Make **Supabase the SINGLE SOURCE OF TRUTH (SSOT)** for the used-phones inventory and reconcile
the one known real dataset into it. The 8 seed records that currently live per-browser in
`localStorage` (verified identical on the primary PC export) become **one canonical central row
each**, and every device reads/writes those same central rows. `localStorage` is **NOT deleted** —
it is retired to a read-only legacy backup after cutover is proven.

## 2. Acceptance criteria (owner contract)

1. **Convergence (A = B = C):** Devices A, B, C capture an inventory snapshot — item IDs, fields,
   quantities, prices, status, published, images, ordering — all identical.
2. **Central propagation:** a change made from the central source (Supabase, admin) is visible on
   Device B after refresh and on Device A after refresh, with no divergence.
3. **Realtime:** editing on one device invalidates the in-memory cache on other clients.
4. **Privacy:** the public read path exposes only `v_public_inventory` columns (never buy_price /
   totals / source_key / internal audit).

## 3. Canonical dataset (extracted, verified, unmodified)

Source: `inventory-phase-c/exports/chrome-pc.json` (sha256 `de8b08df…5f45f0`, exported
2026-08-10 from `http://localhost:5173`). All 8 records are **pristine seed records** — identical
to `DEFAULT_INVENTORY_SEED` (`src/services/inventory-seed.ts:25-34`): same `createdAt`
`2026-08-06T09:37:32.99xZ`, `totalPurchased = quantity`, `totalSold = 0`, movements `createdBy =
'seed'`, and **no `images` field anywhere** (catalog_inventory has no `images`, `catalog_favorites`
and `catalog_most_used` are absent). Status is derived from quantity by `calcStatus`
(`src/services/inventory-service.ts:131-135`).

| # | source_key (local id) | brand | model | variant | condition | qty | status | buy | sell | totalPurchased |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `5cd016dd-d233-4502-93aa-dfa16ddd168f` | Apple | iPhone 15 Pro | 8/256 | Like New | 2 | low_stock | 175000 | 199000 | 2 |
| 2 | `dd304e72-4ed3-456b-99cc-4fcef6986ccd` | Apple | iPhone 14 | 6/128 | Excellent | 2 | low_stock | 115000 | 135000 | 2 |
| 3 | `b9f47a46-38ba-49f1-8323-70ac783c59ea` | Apple | iPhone 13 | 4/128 | Good | 3 | low_stock | 85000 | 105000 | 3 |
| 4 | `89cd5d97-603a-4b16-89b3-898e3acb6f4e` | Samsung | Galaxy S24 Ultra | 12/512 | Like New | 2 | low_stock | 165000 | 190000 | 2 |
| 5 | `26f4240a-ff01-4e56-aba0-f54c233ec7ef` | Samsung | Galaxy S22 | 8/128 | Excellent | 3 | low_stock | 75000 | 90000 | 3 |
| 6 | `585cd6d3-2932-49c8-9d5c-836d613a7fed` | Samsung | Galaxy A54 | 8/128 | Good | 4 | in_stock | 55000 | 68000 | 4 |
| 7 | `19ef1727-dfab-4d84-af89-b55ca9c524fc` | Xiaomi | Redmi Note 13 | 8/256 | Good | 4 | in_stock | 45000 | 58000 | 4 |
| 8 | `03839b3d-b833-4c50-ad78-b1447e8b0905` | Xiaomi | Redmi 12 | 6/128 | Very Good | 3 | low_stock | 28000 | 38000 | 3 |

Not reconciled (out of scope, recorded only):
- `chrome-profile-8.json` has **0 inventory records**; its ghost timeline/transaction row for
  `92dc97db-98a9-40d7-a085-78ea8a1c0ecb` (Xiaomi Redmi 12) and `catalog_favorites` = Oppo A18 are
  **ignored** (device has no inventory).
- No stock was ever sold (totalSold = 0 on every row) — no movement history to migrate beyond the
  initial `purchase` add.

### Evidence (pre-execution, generated from the source export)

Artifact: `docs/release/production-bugs/evidence/canonical-dataset.json` (derived 1:1 from
`inventory-phase-c/exports/chrome-pc.json`, sha256 `de8b08df…5f45f0`). It proves, per the owner's
checklist:

1. **count = 8** — exactly 8 records in `catalog_inventory`.
2. **source_key per item** — the 8 localStorage ids in §3 (kept as `source_key` in the backfill).
3. **model / variant / condition / color** — all 8 populated; `color` is absent in every local
   record (column exists in central schema, default `''`); conditions are all within the central
   CHECK enum (`Like New`, `Excellent`, `Good`, `Very Good`).
4. **quantity** — 2/2/3/2/3/4/4/3; status derived by `calcStatus` (qty ≤ 3 → low_stock, > 3 →
   in_stock).
5. **buy_price / sell_price** — per §3; all non-negative (CHECK-compatible).
6. **status** — `low_stock` ×6, `in_stock` ×2; none archived/discontinued/deleted.
7. **published state** — **all FALSE** (D-CANON-2; `is_published` is never set by seed).
8. **No other production data to preserve** — Production `inventory_items = 0` (Gate 2 evidence);
   `chrome-profile-8.json` has 0 inventory records; `catalog_favorites`/`catalog_most_used` absent
   on the canonical device.
9. **It is the intended dataset, not a technical seed** — the export is from the owner's primary
   PC origin (`http://localhost:5173`, Chrome 126), matches `DEFAULT_INVENTORY_SEED` row-for-row,
   and `totalSold = 0` / `totalPurchased = quantity` / `createdBy = 'seed'` — i.e., a store that
   was seeded and never transacted. There is no other dataset in existence.

## 4. Decision log (Decision → Choice → Reason → Consequence)

### D-CANON-1 — Accept the 8 SKUs as the canonical dataset
- **Choice:** **YES** — backfill exactly the 8 rows from §3.
- **Reason:** `inventory_items = 0` in Production → nothing to overwrite. The 8 rows are the only
  real inventory export that exists and they match `DEFAULT_INVENTORY_SEED` exactly; every other
  export is empty of inventory.
- **Consequence:** Central `inventory_items` will contain exactly these 8 rows. Any later legacy
  localStorage content that differs is stale and non-authoritative.

### D-CANON-2 — Initial `is_published`
- **Choice:** **FALSE** (safe default).
- **Reason:** 00019 owner §12/§13 — visibility is an explicit publish action; the migration/backfill
  never auto-publishes. Keeps the Gate 2 contract "public view empty before publishing".
- **Consequence:** After cutover the public view renders **empty** until the owner publishes rows
  via `inventory_set_published` (explicit admin action; no silent data exposure).

### D-CANON-3 — `source_key` = old localStorage id
- **Choice:** **YES**.
- **Reason:** Enables A/B/C identity mapping (same logical phone across devices via `source_key`),
  powers the ads link remap (Step 7), and gives audit traceability. The partial unique index
  `uq_inventory_items_source_key` already exists in 00019.
- **Consequence:** Each central row carries a unique immutable `source_key`; remap/reconciliation
  key off it. `source_key` is never exposed via `v_public_inventory`.

### D-CANON-4 — Ghost record `92dc97db` (chrome-profile-8.json)
- **Choice:** **IGNORE**.
- **Reason:** That device has 0 inventory records; the ghost timeline/transaction references a
  phone with no inventory row — an orphan artifact, not a real SKU. Importing it would fabricate
  inventory no device can serve.
- **Consequence:** Not backfilled, not created. The browser's localStorage (which contains it) is
  never touched; it remains non-authoritative.

### D-CANON-5 — Failure semantics (owner hard requirement: all-or-nothing)
- **Choice:** **Single multi-row INSERT in one transaction; 8/8 or 0/8.**
- **Reason:** The owner forbids Production ending at 7/8. A single multi-row INSERT is atomic in
  PostgreSQL — one row violating any constraint aborts the entire statement. Belt-and-braces: a
  pre-insert guard (`count(*) = 0`, else abort) and a post-insert guard (`count(*) = 8` for the 8
  keys, else `RAISE EXCEPTION`) run inside the same transaction.
- **What if an unexpected `source_key` exists?** It cannot appear from the fixed VALUES list; if
  ANY pre-existing row exists in `inventory_items`, the pre-insert guard aborts before any write.
- **What if a seed value violates the schema?** The CHECKs (`condition_enum`, `status_enum`,
  `quantity_nonneg`, price non-neg, `battery_range`) reject it → whole statement rolls back → 0 rows.
- **Consequence:** A failed element can never leave 7 SKUs in Production — the transaction commits
  all 8 or none.

### D-GATE-1 — PG-57 carve-out (exact, non-expandable)
- **Choice:** **YES (exact-path only, identical mechanism to the existing V-1/V-4 carve-out).**
- **Exact scope — this is the full and only carve-out:**
  - `src/services/inventory-service.ts`
    - **Reason:** facade swap — the 22 public methods delegate to the new
      `inventory-central-service.ts`; the public API must not change.
    - **Exact functions in scope:** module internals only — `loadAll`/`saveAll`/
      `loadTransactions`/`saveTransaction`/`loadMovements`/`saveMovement`/`loadTimeline`/
      `saveTimelineEvent` (lines 137-193) and every method body that calls them (lines 195-652).
    - **Exact permission scope:** replace localStorage reads/writes with central-service delegation.
      Must NOT remove the 4 key-constant strings (lines 126-129, PG-51/52/14);
      must NOT change any exported type or method signature.
  - `src/services/inventory-seed.ts`
    - **Reason:** stop per-browser seeding of localStorage once central rows exist.
    - **Exact function in scope:** body of `ensureInventorySeeded()` (lines 40-61) only.
    - **Exact permission scope:** becomes "if central inventory has rows → no-op".
      `DEFAULT_INVENTORY_SEED` (lines 25-34) and the `SeedPhone` interface stay unchanged.
- **Consequence:** PG-57 remains a hard stop for every other path. Enforcement = append exactly
  these 2 exact paths to `AUTHORIZED_CHANGES` in `p3-stop-write-gate.test.ts` with a dated reason
  block. Any other protected file still fails the gate.

### D-GATE-2 — localStorage backup mirror (`catalog_inventory_backup_v1`)
- **Choice:** **(a) leave the legacy keys untouched; NO new mirror key.**
- **Why it is not needed:** The data already lives in `catalog_inventory` /
  `catalog_inventory_transactions` / `catalog_inventory_movements_v2` / `inventory_timeline_v3`;
  those keys are never deleted, so freezing them in place (stop writing) already preserves history.
  A second copy under a new key adds nothing functional.
- **What currently prevents it:** nothing — PG-51/52/14 only asserts the constant strings remain in
  source; a new key is not blocked but is also not required.
- **Security impact:** writing an extra copy is same-origin, same data, never transmitted — no added
  exposure — but it doubles the localStorage surface and creates a second copy that could drift.
  Per the owner rule (convenience-only → not approved): **rejected**.
- **Consequence:** After cutover the app stops writing the legacy keys; they stay as a frozen,
  read-only, non-authoritative snapshot. The durable audit export is a **file artifact**
  (`docs/release/production-bugs/evidence/canonical-dataset.json`), not a runtime localStorage copy.

## 5. Execution steps (owner-approved sequence)

| ID | Question | Options | Default recommendation |
|---|---|---|---|
| D-CANON-1 | Accept the 8 seed SKUs above as the canonical central dataset? | Yes / No | **Yes** — it is the only real dataset that exists |
| D-CANON-2 | `is_published` initial value after backfill? | `FALSE` (safe, per 00019 contract — nothing is auto-published) / `TRUE` for qty>0 rows | **FALSE** — matches 00019 owner §12/§13; a separate publish step follows after verification |
| D-CANON-3 | `source_key` = old localStorage id (traceability/audit only)? | Yes / No | **Yes** — enables A/B/C ID mapping and future merge |
| D-CANON-4 | Ghost `92dc97db` record from chrome-profile-8.json | Ignore / create | **Ignore** (no inventory on that device) |
| D-GATE-1 | Approve a **narrow, exact-path carve-out** of PG-57 so `src/services/inventory-service.ts` and `src/services/inventory-seed.ts` may be modified for the facade swap (exact-list style, like the existing V-1/V-4 carve-out)? | Yes / No | **Yes** — required; no other protected path is touched |
| D-GATE-2 | localStorage handling after cutover proven: (a) leave keys untouched as read-only snapshot, or (b) also mirror a copy under a new backup key `catalog_inventory_backup_v1`? | (a) / (b) | **(b)** — freeze + mirror, never delete |

## 5. Execution steps

> Execution only after the Phase A GO. **Gate 2 = CLOSED/VERIFIED; `01-inventory-apply.sql` =
> current Production state. There is NO re-apply of `01-inventory-apply.sql` / `00019` — steps 1-2
> only VERIFY that state.** The corrected sequence maps 1:1 to the owner's accepted order.

### 1. Pre-flight evidence
Run as postgres: `supabase/inventory-central/04-post-apply-verify-unified.sql` (expects **15/15
PASS** — objects PRESENT, RLS/triggers/RPCs/bucket/policies as recorded) and
`supabase/inventory-central/05-constraint-data-reconciliation.sql` (expects all constraints PASS
and `row_items = 0`, `row_images = 0`, `row_movements = 0`). Save both grids.

> Note: `03-pre-apply-evidence-unified.sql` is **NOT** used here — it asserts the pre-apply state
> (tables ABSENT). Since Gate 2 is closed, that file would fail by design.

### 2. Verify Gate 2 remains CLOSED / VERIFIED
Compare the two grids above against the Gate 2 record. Any discrepancy (missing object, extra
row, RLS off, RPC count ≠ 14, storage policies ≠ 4, admin baseline) → **STOP, report, do not
continue.**

### 3. Verify the canonical 8 SKUs
Cross-check `inventory-phase-c/exports/chrome-pc.json` against
`docs/release/production-bugs/evidence/canonical-dataset.json` and §3: count = 8, exact
`source_key`/model/variant/condition/color/quantity/prices/status, published all FALSE, no images,
no other production data. Any mismatch → **STOP.**

### 4. Transactional backfill (all-or-nothing)
Run `supabase/inventory-central/06-inventory-backfill-canonical.sql` (draft for review):

```sql
-- inventory-central/06-inventory-backfill-canonical.sql (draft for review — NOT a migration)
BEGIN;

-- Guard 1: central inventory must be empty. Any unexpected existing row (including an
-- unexpected source_key) aborts BEFORE any write.
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.inventory_items;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'inventory_items not empty (% rows) — aborting backfill', v_rows;
  END IF;
END $$;

-- Single multi-row INSERT (atomic): one row violating any CHECK/FK/unique aborts the
-- whole statement → 0 rows committed. Values list = the 8 SKUs of §3 verbatim.
INSERT INTO public.inventory_items
  (model_id, brand, model, variant, ram, storage, condition, color, quantity, status,
   buy_price, sell_price, created_at, updated_at, total_purchased, total_sold,
   code, is_published, source_key)
VALUES
  ('Apple iPhone 15 Pro',    'Apple', 'iPhone 15 Pro',      '8/256',  '8GB',   '256GB', 'Like New',   '', 2, 'low_stock',  175000, 199000, '2026-08-06T09:37:32.994Z', '2026-08-06T09:37:32.994Z', 2, 0, NULL, FALSE, '5cd016dd-d233-4502-93aa-dfa16ddd168f'),
  ('Apple iPhone 14',        'Apple', 'iPhone 14',          '6/128',  '6GB',   '128GB', 'Excellent',  '', 2, 'low_stock',  115000, 135000, '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 2, 0, NULL, FALSE, 'dd304e72-4ed3-456b-99cc-4fcef6986ccd'),
  ('Apple iPhone 13',        'Apple', 'iPhone 13',          '4/128',  '4GB',   '128GB', 'Good',       '', 3, 'low_stock',  85000,  105000, '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 3, 0, NULL, FALSE, 'b9f47a46-38ba-49f1-8323-70ac783c59ea'),
  ('Samsung Galaxy S24 Ultra','Samsung', 'Galaxy S24 Ultra', '12/512', '12GB', '512GB', 'Like New',   '', 2, 'low_stock',  165000, 190000, '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 2, 0, NULL, FALSE, '89cd5d97-603a-4b16-89b3-898e3acb6f4e'),
  ('Samsung Galaxy S22',     'Samsung', 'Galaxy S22',       '8/128',  '8GB',   '128GB', 'Excellent',  '', 3, 'low_stock',  75000,  90000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 3, 0, NULL, FALSE, '26f4240a-ff01-4e56-aba0-f54c233ec7ef'),
  ('Samsung Galaxy A54',     'Samsung', 'Galaxy A54',       '8/128',  '8GB',   '128GB', 'Good',       '', 4, 'in_stock',   55000,  68000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 4, 0, NULL, FALSE, '585cd6d3-2932-49c8-9d5c-836d613a7fed'),
  ('Xiaomi Redmi Note 13',   'Xiaomi', 'Redmi Note 13',     '8/256',  '8GB',   '256GB', 'Good',       '', 4, 'in_stock',   45000,  58000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 4, 0, NULL, FALSE, '19ef1727-dfab-4d84-af89-b55ca9c524fc'),
  ('Xiaomi Redmi 12',        'Xiaomi', 'Redmi 12',          '6/128',  '6GB',   '128GB', 'Very Good',  '', 3, 'low_stock',  28000,  38000,  '2026-08-06T09:37:32.995Z', '2026-08-06T09:37:32.995Z', 3, 0, NULL, FALSE, '03839b3d-b833-4c50-ad78-b1447e8b0905');

-- Guard 2: exactly 8/8 committed, else force ROLLBACK. 7/8 is impossible.
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows
  FROM public.inventory_items
  WHERE source_key IN (
    '5cd016dd-d233-4502-93aa-dfa16ddd168f','dd304e72-4ed3-456b-99cc-4fcef6986ccd',
    'b9f47a46-38ba-49f1-8323-70ac783c59ea','89cd5d97-603a-4b16-89b3-898e3acb6f4e',
    '26f4240a-ff01-4e56-aba0-f54c233ec7ef','585cd6d3-2932-49c8-9d5c-836d613a7fed',
    '19ef1727-dfab-4d84-af89-b55ca9c524fc','03839b3d-b833-4c50-ad78-b1447e8b0905');
  IF v_rows <> 8 THEN
    RAISE EXCEPTION 'backfill failed: %/8 rows committed', v_rows;
  END IF;
END $$;

COMMIT;
```

- Why direct INSERT, not the RPC: every management RPC requires `auth.uid()` in an admin session
  (`inventory_add_item` gates on `inventory_is_admin()`); a one-shot maintenance backfill runs as
  postgres. The audit trigger records one `created` movement per row automatically.
- `ram`/`storage` are derived from the export variant split (mirrors `inventory-service.ts:211-212`);
  `created_at`/`updated_at` preserve the original seed timestamps (reconciliation must not invent dates).
- Any statement error → automatic ROLLBACK → **0 rows**. This satisfies the owner's
  all-or-nothing requirement.

### 5. Verify 8/8
SELECT count + the 8 `source_key`s; assert every field (model/variant/condition/color/quantity/
status/prices/totals/created_at) matches §3 exactly.

### 6. Verify constraints / FKs / RLS (post-backfill)
Run `supabase/inventory-central/08-post-backfill-verify.sql` (new read-only file, draft for
review): same structural checks as `05` (FKs incl. CASCADE, CHECK enums, PK/unique, partial
indexes, RLS enabled, publish gating consistency) but with the row counts now expected as
`row_items = 8`, `row_images = 0`, `row_movements = 8`, plus a per-SKU field assertion.
(`05` itself is untouched — its `row_*` checks assert the pre-reconciliation state.)

### 7. Remap ads phone links (cross-phase dependency)
Run `supabase/inventory-central/07-remap-ad-phone-links.sql` (draft for review):

```sql
-- Pre-check (must return 0): every non-empty ads.device_id resolves to exactly one source_key.
SELECT a.placement, a.device_id
FROM public.ads a
LEFT JOIN public.inventory_items i ON a.device_id = i.source_key
WHERE a.device_id <> '' AND (i.id IS NULL OR EXISTS (
  SELECT 1 FROM public.inventory_items i2 WHERE i2.source_key = a.device_id GROUP BY i2.source_key HAVING count(*) > 1));

-- Remap (reversible): local id → central UUID in device_id and link.
UPDATE public.ads a
SET device_id = i.id::text,
    link      = '#/phone-details?device=' || i.id::text
FROM public.inventory_items i
WHERE a.device_id = i.source_key
  AND a.device_id <> i.id::text;
```

Pre-state snapshot (before UPDATE) is saved as `docs/release/production-bugs/evidence/ads-links-pre-remap.json`
for rollback.

### 8. Verify every remapped link
SELECT each `ads` row: `device_id` = a real `inventory_items.id`, `link` =
`#/phone-details?device=<same id>`, target exists. 0 mismatches; report count of remapped rows.

### 9. Cut over the application facade (reversible via git revert)
New file (NOT protected): `src/services/inventory-central-service.ts` — Supabase-backed
implementation:
- Read public → `v_public_inventory` (never internal columns).
- Read admin → `inventory_management_list()` RPC.
- Writes → SECURITY DEFINER RPCs (`inventory_add_stock` / `inventory_remove_stock` /
  `inventory_adjust_stock` / `inventory_update_prices` / `inventory_update_details` /
  `inventory_set_status` / `inventory_restore` / `inventory_set_published` /
  `inventory_add_item` / `inventory_add_image` / `inventory_remove_image`; delete = soft-delete
  via `inventory_set_status(...,'deleted')`).
- Cache: in-memory + realtime invalidation on `inventory_items` / `inventory_images`
  (publication verified in Gate 2, check 15).
- Images: `inventory_images` rows → public URLs via the `inventory-images` bucket
  (`00019:997-1008`), attached by position/is_cover.

Then modify **exactly two protected files** (per D-GATE-1):
- `src/services/inventory-service.ts` — public API (22 methods) and exported types stay
  **identical**; internals delegate to `inventory-central-service.ts`. The 4 key constants
  (lines 126-129) remain declared (PG-51/52/14). Legacy keys stop being written (D-GATE-2 (a)).
- `src/services/inventory-seed.ts` — `ensureInventorySeeded()` becomes a no-op once central rows
  exist. `DEFAULT_INVENTORY_SEED` stays exported unchanged.

**No other protected file changes.** All §7 consumers keep compiling (API unchanged).

### 10. Remove application dependence on localStorage as source of truth
The service reads/writes central rows only; every localStorage write path is removed from the
code (not the data).

### 11. Keep localStorage as non-authoritative cache / legacy state
Legacy keys stay untouched (frozen), never written, never deleted — until the owner explicitly
retires them in a separate future step.

### 12. Device A/B/C verification (owner acceptance)
Snapshots from A, B, C must be identical on: IDs (via `source_key` mapping), model, variant,
condition, color, quantity, prices, status, published, images.

### 13. Server-side change propagation test
Change one item centrally (admin RPC). Refresh Device B → change appears; refresh Device A → the
same result. Realtime invalidation confirmed on each client.

### 14. Regression tests
`pnpm typecheck` && `pnpm lint` && `pnpm build` && `pnpm test`. New:
`src/__tests__/inventory/inventory-central.test.ts` (delegation, constants preserved, no
localStorage writes after cutover, images from central rows). `sql-migration-gate.test.ts` stays
green (no new migration file); `p3-stop-write-gate.test.ts` green with only the 2 carve-out paths
added (D-GATE-1).

### 15. Report
Evidence grids (steps 1/2/5/6/8) + acceptance results (12/13) + regression (14) + decision log.

## 6. Rollback (exact, tested)

- **Data + schema (abort path, before cutover):** run
  `supabase/inventory-central/02-inventory-rollback.sql` (erases central data — documented
  contract; localStorage untouched).
- **Ads links:** restore `docs/release/production-bugs/evidence/ads-links-pre-remap.json` (step 7
  snapshot) or re-run the remap UPDATE in reverse.
- **App code:** `git revert` the Phase A commit(s) — services restore to localStorage-only reads.
- **After rollback** the app continues to read localStorage exactly as today (no data was ever
  deleted). Cutover rollback is only needed if steps 12-13 fail; data steps 4-8 are independently
  reversible via 02-rollback.

## 7. Files affected (exact list)

**SQL (new, for review — live under `supabase/inventory-central/`, NOT under `supabase/migrations/`):**
- `supabase/inventory-central/06-inventory-backfill-canonical.sql` (transactional, all-or-nothing)
- `supabase/inventory-central/07-remap-ad-phone-links.sql`
- `supabase/inventory-central/08-post-backfill-verify.sql` (read-only)

**SQL (frozen, NOT edited — verify-only in this plan):**
- `supabase/inventory-central/01-inventory-apply.sql` / `02-inventory-rollback.sql` /
  `03-pre-apply-evidence-unified.sql` / `04-post-apply-verify-unified.sql` /
  `05-constraint-data-reconciliation.sql`
- `supabase/migrations/00019_inventory_central.sql` (mirror copy)
- These are used as follows: `04` + `05` run as **verification** (steps 1/2); `02` only as the
  abort/rollback path. **`01` and `03` are NOT executed in this plan.**

**Evidence artifacts (new):**
- `docs/release/production-bugs/evidence/canonical-dataset.json` (canonical 8 SKUs, owner checklist)
- `docs/release/production-bugs/evidence/ads-links-pre-remap.json` (step 7 rollback snapshot)

**App (new):**
- `src/services/inventory-central-service.ts`

**App (modified — exact 2, requires D-GATE-1):**
- `src/services/inventory-service.ts`
- `src/services/inventory-seed.ts`

**Consumers (unchanged, verified by grep — API preserved):**
- `src/main.tsx:17` `ensureInventorySeeded()`
- `src/screens/inventory/CatalogInventoryScreen.tsx:21-41,56,66,71` (getAll/search/addStock/
  removeStock/deleteRecord/hideRecord/unhideRecord/getRecentTransactions)
- `src/components/inventory/AddInventoryModal.tsx:44,58` · `EditInventoryModal.tsx:27-33`
- `src/components/catalog/CatalogCascadeTypes.tsx:52` (getAll)
- `src/hooks/useProductDetails.ts:23` · `src/hooks/useSimilarPhones.ts:11`
  · `src/services/ad-device-resolver.ts:26` (getExchangeableDevices)
- `src/screens/home/HomeScreen.tsx:171` · `src/screens/showroom/ShowroomScreen.tsx:26`
  · `src/screens/phone-services/CustomerPhoneFlow.tsx:33` · `src/research-console/pages/ads/AdsManager.tsx:42`
- `src/services/catalog-quality.ts:78,204,357,415`
- `src/business-intelligence/actions/InventoryIntelligence.tsx:22`

**Tests (updated/added):**
- New `src/__tests__/inventory/inventory-central.test.ts` (facade delegates to central service;
  constants preserved; no localStorage writes after cutover; images resolved from central rows)
- `src/__tests__/inventory/exchange-source.test.ts` · `seed-and-prices.test.ts` (unchanged —
  validate API contract still holds)
- `src/__tests__/privacy/p3-stop-write-gate.test.ts` — **only** `AUTHORIZED_CHANGES` gets the 2
  exact paths (D-GATE-1). No other edit.

## 8. What this plan does NOT do (gates honored)

- No deletion of `catalog_inventory` / `catalog_inventory_transactions` /
  `catalog_inventory_movements_v2` / `inventory_timeline_v3`.
- **No re-execution of `01-inventory-apply.sql` / `00019` / `03-pre-apply-evidence`** — Gate 2 is
  CLOSED/VERIFIED; `01` = current Production state. Only `04`/`05`/`08` run as verification.
- No change to RLS, storage policies, or the frozen inventory-central SQL files.
- No new migration file (backfill is a maintenance SQL under `supabase/inventory-central/`).
- No image upload/migration (there are no images today).
- No Phase B (ads multi-image) work — that is Plan P0-2, separate.

---

**Rev 2 ready. Decisions logged: D-CANON-1..5 (incl. all-or-nothing), D-GATE-1 (exact-path),
D-GATE-2 = (a). Awaiting Phase A GO.**
