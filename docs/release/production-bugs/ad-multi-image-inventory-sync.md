# FOCUS — Production Bugs: Ad Multi-Image + Inventory Sync (Discovery Report)

- **Date:** 2026-08-11
- **Phase:** DISCOVER → EVIDENCE → ROOT CAUSE → FIX PLAN → APPROVAL → FIX → VERIFY
- **Status:** DISCOVERY COMPLETE. **No fixes applied. Awaiting owner approval.**
- **Scope limits honored:** no migration, no schema change, no data deletion, no inventory object
  recreation, no RLS/storage-policy change, no hard-code, no cross-device data copy, no cache
  deletion as a "fix", no hiding workaround. Gate 2 untouched (CLOSED/VERIFIED).

---

## Executive summary

1. **BUG-INV-001:** Published inventory is served **entirely from `localStorage`** — there is
   **no Supabase read/write path for inventory in `src/`**. Two devices on the same environment
   can show different inventory because the data lives per-browser/per-origin and is only merged
   (never reconciled) by hand. The Supabase central inventory (`inventory_items`, `v_public_inventory`)
   is **built and verified but not wired to the app** (Data Reconciliation + cutover = NOT STARTED).

2. **BUG-AD-001:** Multi-image per ad **does not exist at any layer** — schema, service, upload UI,
   and renderer are all single-image. It is **unimplemented, not broken**. The exact reference
   implementation (ordered image set with position/is_cover) already exists for **inventory**
   (`inventory_images` + `inventory_add_image`) but is not wired to Supabase from the app either.

3. Both fixes converge on the same architectural step: **connect the app to the Supabase central
   tables** (inventory + a new ad-images relation) and use the existing carousel/uploader components
   (already written for inventory) on the ads side.

---

## BUG-INV-001 — Inventory source of truth is localStorage (device divergence)

### Current source of truth

- **localStorage keys (per-origin, browser-local):**
  - `catalog_inventory` — `src/services/inventory-service.ts:126`
  - `catalog_inventory_transactions` — `src/services/inventory-service.ts:127`
  - `catalog_inventory_movements_v2` — `src/services/inventory-service.ts:128`
  - `inventory_timeline_v3` — `src/services/inventory-service.ts:139,147`
- `loadAll()` reads and writes `catalog_inventory` on every access
  (`src/services/inventory-service.ts:152,166`). **No cross-tab/devicesync: last writer wins.**
- Supabase central tables exist and are verified (Gate 2, 36/36 PASS) but are **not referenced
  anywhere in `src/`**: zero `from('inventory_items')`, zero `from('v_public_inventory')`, zero
  `inventory_management_list` call sites in app code.

### Fetch path

- `InventoryService.loadAll()` → `localStorage.getItem(INVENTORY_KEY)` →
  `JSON.parse` → returns `InventoryRecord[]` (`src/services/inventory-service.ts:150-167`).
- Supabase reads for inventory: **none in `src/`** (confirmed by grep across all ts/tsx).
  The only inventory-related Supabase artifacts are the SQL files in `supabase/inventory-central/`
  and the untracked migration `00019_inventory_central.sql`.

### Cache path

- **localStorage IS the cache and the source of truth at the same time** (single layer).
- `inventory-seed.ts` (`src/services/inventory-seed.ts`) writes default/seed records into
  `catalog_inventory` — a per-browser seed that diverges if it runs on different devices/origins.
- No Service Worker, no IndexedDB, no React Query/SWR for inventory (agent sweep + dep check).

### State path

- `InventoryService` is a module-level singleton used directly by screens/hooks
  (`useProductDetails.ts:23`, `PhoneShowroom.tsx`, `HomeScreen`, detail screens). Data flows
  local → service → component state → render. No central context/provider that re-syncs from a
  shared source.

### UI path

- Listing/cards: `PhoneShowroom.tsx` (`primary = images[0]`, multi-indicator badge) —
  `src/components/showroom/PhoneShowroom.tsx:22,50-68`.
- Detail gallery: `ProductImageGallery` (`src/components/showroom/ProductImageGallery.tsx:31-427`).
- Detail data source: `useProductDetails` → `getExchangeableDevices().find(id)`
  (`src/hooks/useProductDetails.ts:23`) → `device.images ?? []` (`ProductDetailsScreen.tsx:177`).

### Device differences (every divergence surface)

| Surface | Mechanism | Diverges? |
|---|---|---|
| `localStorage` (`catalog_inventory` etc.) | per-browser per-origin | **YES — primary** |
| seed/fallback | `inventory-seed.ts` writes to localStorage | **YES** |
| auth vs guest | service is auth-agnostic (local only) | Indirect (no shared sync) |
| query params / campaign/ref | not part of inventory read | No |
| filters | client-side filters applied after load | No (same data, different view) |
| images/order | base64 data-URLs stored inside each record in localStorage (`inventory-service.ts:575-583`) | **YES** |

### Root cause (BUG-INV-001)

> **The app's inventory read path never touches Supabase.** The published inventory is read and
> written 100% client-side from `localStorage`, which is per-browser and per-origin. Two devices
> on the same environment therefore see whatever their own `catalog_inventory` contains — the
> Supabase central tables (`inventory_items` / `v_public_inventory`) built and verified in Gate 2
> are not connected to the app at all. This is the cutover/reconciliation step (Phase D/E) that is
> documented as **NOT STARTED**.

Evidence anchors:
- `src/services/inventory-service.ts:126-192` (localStorage-only CRUD)
- `src/services/inventory-seed.ts` (per-browser seeding)
- `src/hooks/useProductDetails.ts:23` (reads local singleton)
- Gate 2 evidence: `docs/audits/phase-2c-schema-apply-plan.md` (36/36 PASS, reconciliation NOT STARTED)

### Fix plan (BUG-INV-001)

> **Note:** fixes are NOT authorized yet; this is the proposal for owner approval. Data
> Reconciliation/cutover remain on hold.

1. **Add a Supabase-backed inventory read service** (`inventory-supabase-service.ts`):
   - Public read → `v_public_inventory` (the owner-designed customer-facing projection — never
     buy_price/totals/source_key/internal audit; this is what both users must see identically).
   - Staff read → `inventory_management_list()` RPC (admin/super_admin only).
   - Subscribe to realtime on `inventory_items` / `inventory_images` (publication verified in Gate 2,
     check 15 = 2 members) to invalidate the in-memory cache on change.
2. **Keep localStorage as a legacy read-only fallback only**, never a write source, and only until
   cutover proves the Supabase copy is correct (per 00019 header contract: localStorage retired to
   read-only backup AFTER cutover).
3. **State path:** replace the module singleton's source with the Supabase fetch first; render path
   unchanged (same components), so the A/B/C device test becomes trivially consistent.
4. **Image mapping:** inventory images move from base64-array-in-record to `inventory_images`
   (path/position/is_cover), resolved via the existing `inventory-images` bucket convention
   (`00019:1002-1056`) + `inventory_add_image` RPC (`00019:866-932`).

### Verification plan (BUG-INV-001)

Acceptance test A/B/C as specified by owner:
1. Device A, B, C → each captures an inventory snapshot (IDs, fields, images, order).
2. Change inventory from the authorized source (Supabase).
3. Refresh Device B → verify change appears.
4. Refresh Device A → verify the same result.
5. **All three devices must converge to identical output.**

Additional gates: realtime invalidation works on edit; guest and authenticated see the same
published set; `v_public_inventory` projection never leaks internal fields.

---

## BUG-AD-001 — Multi-image ads unimplemented (single image everywhere)

### Current multi-image architecture

**None exists for ads.** Every layer is single-image:

| Layer | Finding | Anchor |
|---|---|---|
| DB relation | `ads` has scalar `image_path` / `image_url TEXT`, PK = `placement` (one ad per placement, one image) | `supabase/migrations/00015_ads_tables.sql:30-33` |
| Storage | bucket `ads-images` (public read, admin write) | `00015_ads_tables.sql:88-119` |
| Upload | `files?.[0]` only; `<input type="file">` without `multiple` | `src/research-console/pages/ads/AdsManager.tsx:68,213` |
| Service | `AdConfig.image: string` (scalar); `uploadAdImage(placement, file: Blob)` single Blob; `rowToConfig` collapses to one `image` | `src/services/ads-service.ts:31-42,143-152,239-249` |
| Rendering | `AdBanner` single `<img>`; no gallery/carousel/array | `src/components/ads/AdBanner.tsx:67-81` |

### DB relation (ads → images)

- **No `ad_images` table, no `ad_id` anywhere, no ad-image RPC.** grep for `ad_images` /
  `ad_image` / `adImage` / `ads_images` over `src/**` + `supabase/**` = zero matches.
- The reference **ordered** image relation exists only for inventory and is not executed/wired:
  `inventory_images(id, inventory_id FK CASCADE, path, position, is_cover)` +
  `uq_inventory_images_cover` (one cover per item) — `00019_inventory_central.sql:154-166`.
  Note 00019 is a file-only migration whose DB objects were applied manually (Gate 1) but the app
  never reads `inventory_images` (zero `from('inventory_images')` in `src/`).

### Storage

- Upload path convention: `ads/${placement}/${Date.now()}-${Math.random()...}.jpg`
  (`src/services/ads-service.ts:240`). **No ad/entity id in the path** — safe only while `placement`
  is the PK with one ad each. A latent collision/mixing risk if ads-per-placement or campaigns are
  added.
- Replace image → `upsert: true` writes a new object; old object is orphaned (deleted only via
  `resetAd`, `ads-service.ts:251-284`) — a leak, not a mix.

### Fetch

- `from('ads').select('*')` → maps each row to `Record<AdPlacement, AdConfig>` keyed by placement
  (`ads-service.ts:154-166`). No join, no `.order()`, no image subquery.
- `sort_order` exists in schema (`00015:36`) but is **never read** (`ads-service.ts:157`).
- Realtime subscription on `ads` events clears cache + refresh (`ads-service.ts:181-195`).

### Mapping

- `rowToConfig` collapses `image_path`/`image_url` into a single `image` string
  (`ads-service.ts:143-152`). No array shape exists.

### Rendering

- `AdBanner` renders one `<img>` (`src/components/ads/AdBanner.tsx:67-81`); all ad call sites use
  `<AdContactBanner placement=.../>` (HomeScreen:341, PhoneServicesScreen:9, RepairHomeScreen:47,
  CustomerPhoneFlow:333, ProductDetailsScreen:241, ShowroomScreen:48) — all single-image.
- **A real multi-image carousel already exists for inventory:** `ProductImageGallery`
  (autoplay, prev/next, thumbnails, fullscreen, counter) — `src/components/showroom/ProductImageGallery.tsx:31-427`.
  And a multi-file picker exists: `PhoneImageUploader` (`<input multiple>`,
  `src/components/showroom/PhoneImageUploader.tsx:98-100`).

### Ordering

- No ordering concept for ad images (one image). `sort_order` defined but unused. For inventory,
  order = array index in localStorage (`inventory-service.ts:575-583`) — client-side only, not
  server-ordered. DB would provide stable order via `idx_inventory_images_item (inventory_id,
  position, created_at)` (`00019:164`), unwired.

### Image mixing risk

- Currently **no cross-ad mixing** because `placement` is the PK and cache is placement-keyed
  (`ads-service.ts:105,216-222`).
- **Latent risks:** storage path has no ad identity (`ads-service.ts:240`); orphaned objects on
  replace (`ads-service.ts:251-284`).

### Root cause / gap (BUG-AD-001)

> **The capability does not exist, so nothing is "broken" to patch.** Multi-image ads are
> unimplemented at the schema, service, upload, and render layers. The infrastructure to do it
> correctly (ordered image set with cover + position, per-entity path guard, and a working
> carousel/multi-file-upload UI) already exists in this codebase in the inventory context and is
> the exact pattern the owner wants for ads.

### Fix plan (BUG-AD-001)

> **Not authorized yet.** Proposal, subject to owner approval. Since current architecture is
> single-image and the requirement is multi-image, a minimal additive schema change is required —
> **only if the owner authorizes it.** The owner said: *"If the current architecture supports
> multiple images, do not create a new migration; fix the flow."* The evidence shows it does NOT
> support multiple images, so a small additive migration + flow wiring is the correct path
> (documented here, executed only after approval).

1. **Additive schema (new migration, on approval):** `ad_images` table mirroring the proven
   `inventory_images` pattern:
   - `ad_images(id, ad_placement TEXT NOT NULL REFERENCES ads(placement) ON DELETE CASCADE,
     path TEXT NOT NULL, position INTEGER NOT NULL, is_cover BOOLEAN NOT NULL DEFAULT FALSE,
     created_at)`
   - `UNIQUE (ad_placement, path)`; partial unique index `uq_ad_images_cover` (one cover per ad);
   - index `(ad_placement, position, created_at)` for stable ordering.
   - RLS: public SELECT on images of enabled ads; write via SECURITY DEFINER RPC gated to
     admin/super_admin (mirror `inventory_add_image` in `00019:866-932`), enforcing path prefix
     `ads-images/{placement}/%` and verifying the storage object exists.
2. **Service:** extend `AdConfig` to `images: AdImage[]` (path/url/position/is_cover); add
   `fetchAdImages(placement)`, `uploadAdImages(placement, files[])` (loop existing uploader with
   per-file path `ads-images/{placement}/{ts}-{rand}.jpg`), and `rowToConfig` to attach ordered
   images; keep `image`/`image_url` for backward compat during rollout.
3. **Upload UI (`AdsManager.tsx`):** add `multiple` to the file input (line 213), replace
   `files?.[0]` (line 68) with `files[]` + previews list + set-cover + reorder, reuse the
   `PhoneImageUploader` pattern (`PhoneImageUploader.tsx:98-100`).
4. **Rendering:** upgrade `AdBanner`/`AdContactBanner` to render the cover + additional images via
   the existing `ProductImageGallery` carousel (`ProductImageGallery.tsx:31-427`) or a lightweight
   equivalent, so mobile and desktop show the same ordered set; no image from another ad can mix
   because paths are placement-scoped and rows are ad-scoped.
5. **Cache:** keep placement-keyed cache, extend to array; realtime on `ad_images` invalidates.

### Verification plan (BUG-AD-001)

Owner acceptance test — one ad `X` with 3 images:
- All 3 images saved; all linked to ad X only; cover correct; order fixed.
- All 3 appear in gallery; no image from ad Y appears.
- Refresh does not change the set; mobile and desktop render the identical set.
- Realtime invalidation reflects edits across clients; storage objects follow the
  `ads-images/{placement}/%` convention; replace deletes the old object (no orphans).

---

## Decision points for owner (approval required)

1. Approve the **inventory cutover wiring** (BUG-INV-001 fix plan) — connects app reads to
   `v_public_inventory` + RPCs + realtime, with localStorage demoted to read-only legacy backup.
2. Approve the **additive ad-images migration + flow** (BUG-AD-001 fix plan) — a new migration is
   required because multi-image is unimplemented; the owner explicitly said don't create one only
   *if* the flow already supports multi-image (it does not).
3. Any data reconciliation / backfill / image moves remain gated behind a separate explicit GO.

**No SQL, no migration, no code change was made in producing this report.**
