# FOCUS — Plan P0-1 §9–§15: App Facade Cutover (Rev 4 — owner-corrected)

- **Date:** 2026-08-11
- **Parent plan:** `docs/release/production-bugs/plan-p0-1-inventory-cutover.md` (Rev 2)
- **Phase:** PLAN — FOR OWNER REVIEW. **NOT EXECUTED. NO GO.**
- **Revision:** Rev 4 (owner review of Rev 3 → 5 corrections applied, scope unchanged).
- **Execution state (verified):** Gate 2 CLOSED/VERIFIED; `04-post-apply-verify-unified.sql` = 15/15 PASS; `05-constraint-data-reconciliation.sql` = 36/36 PASS; `06-inventory-backfill-canonical.sql` = **8/8 COMMIT**; `08-post-backfill-verify.sql` = PASS; **Step 7 = N/A / BLOCKED / NOT EXECUTED** (all 7 `ads` rows: `device_id=''`, `link=''`, `alt=''`, `enabled=true`, `sort_order=0`, `updated_by=null`).

---

## 0. Rev 3 → Rev 4 correction log (owner review)

| # | Owner point | Fix in Rev 4 | Where |
|---|---|---|---|
| 1 | Write-method count is **12**, not 11 | Adopt the owner-listed **12** write methods as canonical; map them onto **11 RPCs** (`deleteRecord` reuses `inventory_set_status('deleted')`); number unified in §1, §10, §12, §14 | §1, §10, §12, §14 |
| 2 | "central-service = single Supabase point" contradicts §10 direct `inventory_movements` read | All `inventory_movements` reads (timeline / movements / transactions / record-summary) move **inside** `inventory-central-service.ts`; no screen/service touches Supabase for inventory data | §1, §9, §10 |
| 3 | `bootstrapCentralInventory()` does not guarantee data before first paint | Replaced the "before first paint" claim with an explicit contract: inventory screens **never read localStorage** and render **loading/empty state until bootstrap completes**; connection failure → explicit error/empty, never a localStorage fallback | §1, §3, §14 |
| 4 | Image path must be pinned exactly | Pin literally: `inventory-images/{recordId}/{uuid}.jpg` — the `inventory-images/` prefix **is part of the object name**, matching `inventory_add_image` (`00019:894`), the upload policy (`00019:1026-1030`), and `storage.objects.name` | §5 |
| 5 | D-GATE-1 must stay strict | Carve-out = exactly the 2 files; any other protected file changed → **STOP + escalation**; PG-57 fails; no silent widening | §12, §14, §8 |
| 6 | No DB change at all | Hard constraint restated: no new migration, no RLS change, no ads change, no `inventory_items` change | §13, §14 |
| 7 | Step 7 stays final N/A | No use of the new central UUIDs for any ad mapping; ads remain 7 rows, `device_id=''`, `link=''` | §6, §14 |

**Scope:** unchanged — §9–§15 App Facade Cutover only, no new DB object, no code executed.

---

## 1. Inventory facade / data access

### New file (NOT protected)
`src/services/inventory-central-service.ts` — the **only** Supabase access point for inventory data (reads, writes, movements). Exports:

- `bootstrapCentralInventory()` (async) — called once from `main.tsx` (not awaited before first render). Hydrates cache: public → `.from('v_public_inventory').select('*')`; admin (`role ∈ admin/super_admin`) → `.rpc('inventory_management_list')`. Builds id / modelId / sourceKey indexes. Sets `isReady`.
- `refetchCentralInventory()` (async) — refetch public (+ admin) lists; fired on `visibilitychange`/`focus` and after every successful write. Fires listeners.
- `subscribeCentralInventory(fn)` — cache-change subscription (Realtime is not deliverable under RLS — see §9).
- `getCachedPublic()` / `getCachedAdmin()` — sync cache reads used by the facade.
- `isReady` — readiness flag for loading/empty states.

### Write methods — canonical 12 (unified count)

| # | Write method | RPC |
|---|---|---|
| 1 | `addStock` | `inventory_add_stock` |
| 2 | `removeStock` | `inventory_remove_stock` |
| 3 | `adjustStock` | `inventory_adjust_stock` |
| 4 | `updatePrices` | `inventory_update_prices` |
| 5 | `updateDetails` | `inventory_update_details` |
| 6 | `setStatus` | `inventory_set_status` |
| 7 | `restore` | `inventory_restore` |
| 8 | `setPublished` | `inventory_set_published` |
| 9 | `addItem` | `inventory_add_item` |
| 10 | `addImage` | `inventory_add_image` |
| 11 | `removeImage` | `inventory_remove_image` |
| 12 | `deleteRecord` | `inventory_set_status(p_status='deleted')` |

> 12 write methods ← **11 RPCs** (`deleteRecord` reuses `inventory_set_status`). Facade convenience wrappers `removeStockWithReason` / `hideRecord` / `unhideRecord` / `updateImages` delegate into the 12 — they are wrappers, not extra operations (asserted in §12 tests).

### Protected files (modified under D-GATE-1 — exactly 2, no others)
- `src/services/inventory-service.ts` — the 22 public method names + exported types stay; read methods stay sync (cache); the 12 write methods become async per **D-CUT-1 (a)**; the 4 key constants (lines 126-129) remain declared but are never written after cutover (D-GATE-2 (a)).
- `src/services/inventory-seed.ts` — `ensureInventorySeeded()` (lines 40-61) becomes a no-op returning `false`. `DEFAULT_INVENTORY_SEED` + `SeedPhone` unchanged.

### `main.tsx` (NOT protected)
`void bootstrapCentralInventory()` at boot after `ensureInventorySeeded()`.

### Bootstrap contract (new in Rev 4)
- `bootstrapCentralInventory()` hydrates the cache and sets `isReady`.
- Inventory screens: `!isReady` → **loading state** (admin screens) / **empty state** (public); `isReady` → render from cache.
- Bootstrap failure (network/error) → explicit error/empty state. **No localStorage read.** Sole exception: the build-time rollback lever `CUTOVER_ENABLED=false` (read-only frozen snapshot, §11), off in prod until GO.

### Current data source per screen → target
| Screen / consumer | Today | After cutover |
|---|---|---|
| `ShowroomScreen` (`:26`), `HomeScreen` (`:171`) | `getExchangeableDevices()` from localStorage | central-service cache of `v_public_inventory` |
| `useProductDetails` (`:23`), `useSimilarPhones` (`:11`) | sync lookup | same, via cache by UUID |
| `CatalogInventoryScreen` (getAll/search/movements/transactions) | localStorage | central-service → `inventory_management_list` + `inventory_movements` (staff RLS) |
| `AddInventoryModal` / `EditInventoryModal` | sync writes | async RPC writes (D-CUT-1 (a)) |
| `AdsManager` (`:42`) picker | `getExchangeableDevices()` | public cache (empty until owner publishes) |
| `ad-device-resolver` (`:26`) | sync | public cache, UUID-validated |
| `CustomerPhoneFlow` (`:33`), `CatalogCascadeTypes` (`:52`), `catalog-quality` (`:78,204,357,415`), `InventoryIntelligence` (`:22`) | sync | central-service cache (same semantics) |

### What stays legacy / removed
- **Kept (frozen, read-only):** `catalog_inventory`, `catalog_inventory_transactions`, `catalog_inventory_movements_v2`, `inventory_timeline_v3` — never written, never read by the facade after cutover.
- **Removed from code:** all `localStorage` reads/writes inside the 22 methods.
- **Prevent unintended direct reads:** §12 test proves no `.from('inventory_items')`, `.from('v_public_inventory')`, or `.from('inventory_movements')` outside `inventory-central-service.ts` (inventory bounded context).

### D-CUT-1 — async writes (owner-approved (a))
The 12 write methods return `Promise<…>`; read methods stay sync via cache. Touches ~6 non-protected files (`AddInventoryModal`, `EditInventoryModal`, `CatalogInventoryScreen`, 2 tests). D-GATE-1 wording amended: "names identical; write subset becomes async".

---

## 2. Central inventory identity

- `inventory_items.id` (UUID) = canonical identity for every app link, ad link, route param, and A/B/C snapshot.
- `source_key` = traceability only (D-CANON-3); not in `v_public_inventory`; never in routes, share links, or `ads.device_id`.
- Reconciliation/audit/evidence uses `source_key` only via `inventory_management_list` (admin RPC).
- No unproven mapping; a central UUID is only ever obtained from the backfill / `inventory_add_item` result.

---

## 3. Phone details

- **Route shape (unchanged):** `#/phone-details?device=<id>`; `ProductDetailsScreen` reads `routeParams.device` (`:67`).
- **Loading:** while `!isReady` → loading state (no false results); resolution from public cache only after ready.
- **Param validation (new, in facade/`useProductDetails`):** missing/empty → `notFound=true`; not a valid UUIDv4 → `notFound=true` (covers all legacy source_key params — §8).
- **Fetch:** cache lookup by UUID.
- **Visibility gate (single source):** render only if present in `v_public_inventory` (`is_published = TRUE AND quantity > 0 AND status NOT IN (archived,discontinued,deleted)`); otherwise `notFound=true`.
- **Unpublished leak prevention:** all 8 canonical rows are `is_published=FALSE` → after cutover the showroom is empty and every phone-details link renders ProductNotFound until the owner publishes via the admin control (expected contract, not a bug).
- **Admin publish control (required):** `CatalogInventoryScreen` gains publish/unpublish toggle calling `inventory_set_published`.

---

## 4. Public inventory

- Public reads only through `v_public_inventory` (owned by postgres, `security_invoker=false`). No direct `inventory_items` reads anywhere.
- **Field map to `InventoryRecord`:** `id→id`, `model_id→modelId`, `brand`, `model`, `variant`, `ram`, `storage`, `condition`, `color` ('' → undefined), `quantity`, `status`, `sell_price→sellPrice`, `code`, `battery_health`, `warranty`, `city`, `description`, `updated_at→updatedAt`. Public rows: `totalPurchased/totalSold=0`, `buyPrice=undefined` (privacy criterion 4).
- **Filtering/sorting/pagination:** keep client-side `useShowroomState.filterAndSortDevices` for the small dataset (incl. `latest` via `updated_at`). Server-side paging deferred (documented, not built).
- `getLowStock`/`getOutOfStock` derive from public cache for public surfaces; admin pages use admin cache.

---

## 5. Images

- **Central model:** `inventory_images` rows (`inventory_id, path, position, is_cover`); objects in the `inventory-images` bucket (public, `00019:1002-1018`).
- **Pinned object path (literal):** `inventory-images/{recordId}/{uuid}.jpg`
  - The `inventory-images/` prefix **is part of the object name** (stored in `inventory_images.path` and `storage.objects.name`), passed verbatim to `storage.from('inventory-images').upload(path, …)`, `getPublicUrl(path)`, and `inventory_add_image(p_path)`.
  - Matches the contract literally:
    - `inventory_add_image` (`00019:894`): `p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%'` ✅
    - object existence check (`00019:907-913`): `storage.objects.name = p_path` ✅
    - upload policy (`00019:1026-1030`): `name LIKE 'inventory-images/%'` + folder segment = real `inventory_items.id` ✅
    - contract comment (`00019:998`): `inventory-images/{inventory_id}/{uuid}.jpg` ✅
  - **Forbidden:** `{recordId}/…` without the prefix; any `source_key` in a path.
- **Mapping in facade:** order by `position`; cover = `is_cover=true` (fallback position 0); URL = `getPublicUrl(path).data.publicUrl`.
- **0 images today:** gallery renders empty; presentational sections hide — exactly today's behavior.
- **Admin writes (async):** upload → `inventory_add_image` (server validates prefix/existence/position/cover). Removals via `inventory_remove_image` (deletes object + row atomically).
- **No invented mapping.**
- **Known constraint (deferred to Phase C, not fixed now):** the "Public read inventory images" policy (`00019:289-296`) references `inventory_items` in an `EXISTS` subquery, but anon has **no SELECT on `inventory_items`** (REVOKE ALL + no SELECT policy) → public image reads return empty. Safe today (0 images); public image display later needs a Phase C decision (new `security_invoker=false` public image view = new migration). Not touched in §9–§15.

---

## 6. Ads integration

- **State:** Step 7 N/A/BLOCKED (owner-adopted). All 7 rows unchanged: `device_id=''`, `link=''`, `alt=''`, `enabled=true`, `sort_order=0`, `updated_by=null`. `public.ads` untouched; no UPDATE run.
- **No auto mapping, no order matching, no source_key mapping. No use of the new central UUIDs for any ad mapping.**
- **Behavior with `device_id=''`:** `AdContactBanner` (`:55-57,132-133`) → `hasPhoneLink=false` → normal `AdSpot` path (no WhatsApp handoff).
- **Future phone-linked ads:** `device_id` = a UUID; resolution via public cache (`resolveAdDevice`). Phone-format link with unresolvable device → existing non-interactive banner (BATCH 4A fallback).
- **After cutover (until owner publishes):** `AdsManager` picker (public cache) is empty → phone linking structurally impossible → no invalid mapping can be created.

---

## 7. Admin / Ads Manager (future linking)

- Picker source: `InventoryService.getExchangeableDevices()` → public cache → only published, in-stock, active phones.
- Option `value` = `inventory_items.id` (UUID); `link` = existing `buildAdPhoneLink(deviceId)`.
- `saveAd` writes `device_id` = that UUID only; `validateAdInput` unchanged.
- **Invalid-mapping prevention:** (1) picker offers exchangeable devices only; (2) save re-checks id in cache (`AdsManager.tsx:88-92`); (3) if a linked device becomes unpublished/qty-0/inactive → non-interactive banner, never broken-link/source_key leak.
- No `AdsManager` file change required for the picker source.

---

## 8. Legacy compatibility

- Legacy phone-details links carry the localStorage id (`source_key`). No production ad links exist; favorites store nothing.
- **Rule:** non-UUID `device` param (or unknown UUID) → ProductNotFound + similar phones. No silent fallback, no source_key→UUID auto-resolution.
- Why not auto-resolve: `source_key` is private and absent from `v_public_inventory`; a resolver RPC = new migration (blocked).
- **D-CUT-2 (owner-approved (a)):** legacy links render not-found after cutover. (Option (b) — sanctioned read-only `inventory_resolve_legacy` RPC — deferred to Phase C.)

---

## 9. Security / RLS

- Public read = `v_public_inventory` only. Admin full read = `inventory_management_list` (SECURITY DEFINER, `inventory_is_admin`). All writes = the RPCs (EXECUTE revoked from PUBLIC; each re-checks admin role). **No reopening of closed privileges.**
- **Movements reads run inside `inventory-central-service.ts` only** (staff RLS: admin/super_admin/researcher).
- Frontend role gating via `AuthService` role; non-admin misuse of admin RPCs → 42501 surfaced, not swallowed.
- **Realtime caveat:** `inventory_items` has RLS enabled with no SELECT policy for anon/authenticated + REVOKE ALL → Supabase Realtime `postgres_changes` cannot deliver to the app. Cache invalidation = refetch on focus/visibility + after successful writes (owner-approved). True realtime needs a Phase C migration — out of scope.
- Defense: central-service is the only reader of the view (§12 grep).

---

## 10. Reads vs Writes (per component)

| Component | Read/Write | Source (after cutover) | Auth context |
|---|---|---|---|
| Showroom / Home lists | R | central-service → `v_public_inventory` (cache) | anon/authenticated |
| Phone details (+ similar) | R | central-service → public cache (by UUID) | anon/authenticated |
| ad-device-resolver | R | central-service → public cache | anon/authenticated |
| AdsManager picker | R | central-service → public cache | admin UI |
| AdsManager save/reset | W | `ads-service` (separate bounded context, unchanged) | RLS admin |
| CatalogInventoryScreen list/search | R | central-service → `inventory_management_list` | admin |
| Timeline / movements / transactions | R | **central-service** → `inventory_movements` (staff RLS) | authenticated staff |
| Add / Edit InventoryModal | W | central-service → the 12 write methods / 11 RPCs | admin |
| hide / restore / delete / publish | W | central-service → set_status / restore / set_published | admin |
| catalog-quality / CatalogCascadeTypes / InventoryIntelligence / CustomerPhoneFlow | R | central-service cache (public or admin per role) | as above |

> "Single access point" = the **inventory** bounded context. Ads keep their own `ads-service` (unchanged).

---

## 11. Rollback

| Layer | Mechanism |
|---|---|
| App code | `git revert` the Phase A commit(s) → facade restores localStorage reads. Legacy keys intact (never deleted, never written). |
| Deployment lever | Build-time `CUTOVER_ENABLED` in central-service: **off by default in prod until GO**; on a rollback deploy (off), the facade reads the frozen localStorage snapshot **read-only** (no writes); when on, localStorage is never touched. Removed after acceptance (D-CUT-3). |
| Database | Only if needed: `supabase/inventory-central/02-inventory-rollback.sql` (documented: erases central data; localStorage untouched). Not run in §9–§15. |
| Ads | None — Step 7 not executed; `public.ads` unchanged. |
| Images | None — 0 images; no image migration. |

---

## 12. Testing

- **Gates:** `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
- `p3-stop-write-gate.test.ts` — **only** `AUTHORIZED_CHANGES` gains the 2 exact paths (`src/services/inventory-service.ts`, `src/services/inventory-seed.ts`) + dated D-GATE-1 reason. Any other protected file changed → PG-57 fails → **STOP + escalation**. No silent widening.
- `sql-migration-gate.test.ts` — green unchanged (max migration = 19, no new file).
- New `src/__tests__/inventory/inventory-central.test.ts`:
  - facade: 22 method names intact; the **12** write methods (no extras); 4 key constants still declared;
  - no `localStorage.setItem` after cutover (source walk, like PG-27);
  - no `.from('inventory_items')` / `.from('v_public_inventory')` / `.from('inventory_movements')` outside central-service;
  - UUID: missing / non-UUID / unknown → notFound; published+in-stock → found; unpublished / qty 0 / archived → notFound;
  - images: empty for canonical rows; no source_key in any public map;
  - ads: `device_id='' link=''` → not a phone link; phone link with unresolvable UUID → non-interactive (no handoff).
- Update `exchange-source.test.ts` + `seed-and-prices.test.ts` for async writes (await); assertions unchanged.
- Manual/owner read-only verifications: re-run `08-post-backfill-verify.sql`; confirm `v_public_inventory` = 0 rows while unpublished; after publish, view = published SKUs only.

---

## 13. Production safety (hard constraints)

- **No Production SQL in §9–§15:** no new migration, no RLS change, no ads change, no `inventory_items` change, no bucket/policy change.
- Deploy is **app-only**. After deploy the owner publishes/unpublishes via the admin UI (RPCs) to run acceptance.
- No destructive ops (no DELETE, no DROP). `02-inventory-rollback.sql` remains the documented abort path only.
- Pre-commit: gates green; `git status`/`git diff` reviewed; file set = §9–§15 scope only; no secrets.

---

## 14. Acceptance criteria (explicit, verifiable)

1. `pnpm typecheck`, `lint`, `build`, `test` green; `sql-migration-gate` max = 19; `p3-stop-write-gate` green with exactly the 2 carve-out paths.
2. `src` tree: zero direct reads of `inventory_items` / `v_public_inventory` / `inventory_movements` outside central-service; zero inventory writes to localStorage.
3. Inventory screens do not depend on localStorage and render **loading/empty until bootstrap completes** (not "before first paint"); connection failure → explicit error, no fallback.
4. Owner publishes the 8 SKUs via the admin toggle; A/B/C snapshots identical on UUIDs, model/variant/condition/color, quantity, prices, status, published, images (all empty).
5. Central change (admin edit) appears on Device B after refresh and Device A after refresh; cache invalidates on focus/visibility.
6. Privacy: public responses contain none of `source_key` / `buy_price` / `total_*` / audit.
7. Ads: 7 rows remain `device_id='' link=''` (Step 7 final N/A); banner via AdSpot; future linking by UUID only; unresolvable phone link → non-interactive.
8. Legacy (non-UUID) deep link → ProductNotFound + similar phones (D-CUT-2 (a)).
9. Images: empty gallery for canonical rows; upload path literally `inventory-images/{recordId}/{uuid}.jpg`.
10. central-service = the only inventory data access point (reads / writes / movements).
11. No DB change at all in §9–§15 (no migration / RLS / ads / `inventory_items`).

---

## 8 (duplicate guard). What this plan does NOT do (gates honored)

- No code executed, no commit, no push without a separate explicit GO.
- No new migration; no RLS/storage/policy change; no `ads` change; no `inventory_items` change.
- No re-execution of `01`/`00019`; only `04`/`05`/`08` run as verification (already done).
- No image upload/migration (0 images today).
- No Phase B (ads multi-image) — Plan P0-2, separate.
- No ad→inventory mapping of any kind (Step 7 N/A final).

---

**Rev 4 ready. Corrections 1–5 applied without scope change; constraints 6–7 reaffirmed. Awaiting: owner confirmation of Rev 4 → then separate GO for execution → then diff review before push. STOP.**
