# FOCUS — Plan P0-2: Ads Multi-Image Migration (Phase B)

- **Date:** 2026-08-11
- **Revision:** Rev 2 — Phase B SQL **review package** delivered (owner asked for the complete SQL
  before any GO). Reviewed SQL lives in `supabase/ads-multi-image/` (draft, NOT in `supabase/migrations/`);
  it is copied to `supabase/migrations/00020_ads_multi_image.sql` **only at Phase B GO** (and
  `sql-migration-gate.test.ts` max `19 → 20` in the same commit, §8).
- **Parent report:** `docs/release/production-bugs/ad-multi-image-inventory-sync.md` (BUG-AD-001)
- **Phase:** PLAN — FOR OWNER REVIEW. **NOT EXECUTED.**
- **Gate status:** Gate 2 remains **CLOSED / VERIFIED**. Phase B runs **only after** Phase A
  (Plan P0-1) is approved and completed. Nothing below is applied until the owner approves this
  plan separately.
- **Scope limits honored so far:** no SQL applied, no migration executed, no storage-policy
  change, no image moved/deleted, no ads row touched.

---

## 1. Objective

Give every ad placement a real **ordered multi-image gallery**: ad → many images, one cover,
fixed order, stored in Supabase (`ad_images` relation + `ads-images` bucket) so every visitor sees
the same set on mobile and desktop, surviving refresh. This is a capability build-out
(unimplemented today at every layer), not a fix to existing behavior. Single-image ads already
configured must keep working unchanged.

## 2. Acceptance criteria (owner contract — ad X with 3 images)

1. All 3 images are saved and **all linked to ad X only** (no image from ad Y appears).
2. The cover image is correct and the order is fixed.
3. All 3 appear in the gallery on **mobile and desktop**; refresh does not change the set.
4. Realtime invalidation reflects edits across clients.
5. Storage objects follow the `ads-images/{placement}/%` convention; removing an image deletes
   the bucket object too (no orphans). Per **D-ADS-5 (B-1)** the object deletion happens **via the
   Storage API** (client-side), not direct SQL — the RPC returns the removed path, the client calls
   `supabase.storage.from('ads-images').remove([path])`. Orphan objects (e.g. a failed API delete
   after the row commit) remain reconcilable via a storage↔ad_images diff; they never orphan a DB row.
6. Existing single-image ads keep rendering after migration (backward compatible).

## 3. Current state (verified anchors)

| Layer | Finding | Anchor |
|---|---|---|
| DB | `ads` scalar `image_path`/`image_url`, PK = placement; **no `ad_images`** | `supabase/migrations/00015_ads_tables.sql:30-40` |
| Storage | bucket `ads-images` public read / admin write; **no placement-prefix enforcement** | `00015_ads_tables.sql:88-119` |
| Upload | `<input type="file">` single; `files?.[0]` | `src/research-console/pages/ads/AdsManager.tsx:68,213` |
| Service | `AdConfig.image: string` scalar; `rowToConfig` collapses; `uploadAdImage` single Blob; path `ads/{placement}/{ts}-{rand}.jpg` | `src/services/ads-service.ts:31-42,143-152,239-249` |
| Render | `AdBanner` single `<img>`; `AdSpot`/`AdContactBanner` resolve one image | `src/components/ads/AdBanner.tsx:67-81`, `AdSpot.tsx:9-13`, `AdContactBanner.tsx:21-25` |
| Reference impl | `inventory_images` + `inventory_add_image` (ordered, cover, path-guard, object check) | `00019_inventory_central.sql:149-161,861-932` |

## 4. Decision points (owner must answer)

| ID | Question | Options | Default recommendation |
|---|---|---|---|
| D-ADS-1 | New **migration `00020_ads_multi_image.sql`** (additive) — required because multi-image is unimplemented (owner said: create one only if the flow does NOT already support it — it does not). | Approve / Decline | **Approve** |
| D-ADS-2 | Canonical storage path for new uploads: `ads-images/{placement}/{uuid}.jpg` (enforced in RPC + storage policy) | Yes / No | **Yes** — mirrors `inventory-images/{id}/%` |
| D-ADS-3 | Keep `ads.image_path` / `image_url` as **read-only legacy mirror** (never dropped) for backward compatibility during rollout | Yes / No | **Yes** — defined precisely in §5.7 (single-writer, ad_images wins) |
| D-ADS-4 | Gallery component: new lightweight `src/components/ads/AdImageCarousel.tsx` (carves pattern from `ProductImageGallery`) | New / reuse | **New** — showroom carousel is full-screen/counter-oriented |
| D-ADS-5 | **B-1:** file deletion for `ad_remove_image` / `ad_replace_images` must NOT use direct `DELETE FROM storage.objects` (Supabase guidance: SQL metadata deletion does not guarantee physical removal and can orphan objects). Storage files are deleted **client-side via the Storage API** (`supabase.storage.from('ads-images').remove([...])`) after the RPC commits | Storage API / direct SQL | **Storage API** — RPCs delete DB rows only and return the affected path(s); the caller removes the physical files. Row-first ordering: a failed API delete leaves an orphan object (reconcilable), never a DB row referencing a deleted file |
| D-ADS-6 | **B-2:** bucket `ads-images` is **public** (`public = TRUE` since `00015:87-89`) — RLS on `ad_images` is NOT the boundary for direct file access. Is a public bucket acceptable as the access model? | Accept public / make private | **Accept public** — matches existing production behavior since 00015; gallery listing is DB-gated (`Public read enabled ad images`). If unpublished-ad images must be unreachable, that needs a private bucket + signed URLs: a separate decision, out of scope here |
| D-GATE-ADS | Approve a narrow **exact-path carve-out** of PG-57 adding: new `src/components/ads/AdImageCarousel.tsx` + modified `src/components/ads/AdBanner.tsx`/`AdSpot.tsx` (AdBanner/AdSpot already authorized V-1; the new file is a new entry) | Yes / No | **Yes** |

## 5. Migration design — SQL review package (`supabase/ads-multi-image/`, DRAFT)

Additive, idempotent, directly reversible. Mirrors the proven inventory pattern
(`00019_inventory_central.sql`). **NOT YET a migration** — the reviewed files are:

| File | Purpose |
|---|---|
| `01-ads-multi-image-apply.sql` | Complete apply SQL (review this file; this section is its reference) |
| `02-ads-multi-image-rollback.sql` | Exact reverse (drop order, storage policy restored verbatim from 00015) |
| `03-pre-apply-evidence.sql` | Run BEFORE apply — proves additivity (7 checks incl. legacy count) |
| `04-post-apply-verify.sql` | Run AFTER apply+backfill — 14 checks incl. mirror invariant |
| `05-ad-images-backfill.sql` | Existing single-image ads → `ad_images` (one tx, guarded, idempotent) |

At **Phase B GO** the apply SQL is copied verbatim to `supabase/migrations/00020_ads_multi_image.sql`
— the **only** new migration number. The rollback file is **NOT numbered and NOT copied to
`supabase/migrations/`** (Supabase applies every `*.sql` there in numeric order; a `00021` rollback
would run immediately after `00020` and drop everything). Rollback stays as
`supabase/ads-multi-image/02-ads-multi-image-rollback.sql`, executed manually on abort only —
the same convention as `inventory-central/02-inventory-rollback.sql`.

### 5.1 Table

```sql
CREATE TABLE IF NOT EXISTS public.ad_images (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_placement TEXT NOT NULL REFERENCES public.ads(placement) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  is_cover     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ad_images_unique_path UNIQUE (ad_placement, path)
);

CREATE INDEX IF NOT EXISTS idx_ad_images_ad
  ON public.ad_images (ad_placement, position, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_images_cover
  ON public.ad_images (ad_placement) WHERE is_cover = TRUE;
```

### 5.2 RLS + grants

```sql
ALTER TABLE public.ad_images ENABLE ROW LEVEL SECURITY;

-- Public: images of ENABLED ads only.
CREATE POLICY "Public read enabled ad images"
  ON public.ad_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ads a
    WHERE a.placement = ad_placement AND a.enabled = TRUE
  ));

REVOKE ALL ON public.ad_images FROM anon, authenticated;
GRANT SELECT ON public.ad_images TO anon, authenticated;
```

### 5.3 RPCs (SECURITY DEFINER, admin-gated)

Reuse the inventory pattern but name them `ad_*` so the **14 `inventory_%` functions** pin in
`04-post-apply-verify-unified.sql` and `sql-migration-gate.test.ts` is untouched.

```sql
CREATE OR REPLACE FUNCTION public.ad_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin')
  );
$$;

-- ad_add_image: validate placement exists, enforce prefix 'ads-images/{placement}/%'
-- (D-ADS-2) OR the legacy 'ads/{placement}/%' convention (criterion #6 — existing
-- single-image ads attach as-is), verify the object already exists in the bucket,
-- lock the ad row, auto-position, demote the previous cover.
CREATE OR REPLACE FUNCTION public.ad_add_image(
  p_ad_placement text, p_path text, p_position integer DEFAULT NULL, p_is_cover boolean DEFAULT FALSE
) RETURNS public.ad_images ...;  -- exact mirror of inventory_add_image (00019:861-932)

-- ad_remove_image: delete the row, RETURN the removed storage path so the caller
-- deletes the physical file via the Storage API (B-1 — no direct storage delete).
CREATE OR REPLACE FUNCTION public.ad_remove_image(p_image_id uuid) RETURNS text ...;

-- ad_replace_images: atomic replace of a placement's full set (paths[], covers[])
-- — upload happens client-side first, then one call commits the ordered set. DB
-- rows only (B-1): the caller deletes previous − new files via the Storage API.
CREATE OR REPLACE FUNCTION public.ad_replace_images(
  p_ad_placement text, p_paths text[], p_covers boolean[] DEFAULT NULL
) RETURNS SETOF public.ad_images ...;
```

Grants: `GRANT EXECUTE ... TO authenticated` then `REVOKE ALL ... FROM PUBLIC` for all four
(mirroring `00019:966-988`).

### 5.4 Storage policy hardening (defense in depth)

Replace the generic `00015` INSERT policy for `ads-images` with one that enforces the canonical
prefix **and** keeps legacy uploads working during the transition (`ads/{placement}/%` is today's
convention — `src/services/ads-service.ts:240`), both gated to a real placement:

```sql
DROP POLICY IF EXISTS "Staff upload ads-images" ON storage.objects;
CREATE POLICY "Staff upload ads-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads-images'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','super_admin'))
    AND (name LIKE 'ads-images/%' OR name LIKE 'ads/%')
    AND EXISTS (
      SELECT 1 FROM public.ads a
      WHERE name LIKE 'ads-images/' || a.placement || '/%'
         OR name LIKE 'ads/' || a.placement || '/%'
    )
  );
```

UPDATE/DELETE policies stay as 00015 (admin-only). Rollback restores the 00015 version verbatim.

### 5.5 Realtime

Add `ad_images` to `supabase_realtime` (guarded `ALTER PUBLICATION` like `00015:124-132`).

### 5.6 Backfill (existing single-image ads)

Full file: `supabase/ads-multi-image/05-ad-images-backfill.sql`. One transaction, guard against
partial state, idempotent (`ON CONFLICT DO NOTHING`):

```sql
INSERT INTO public.ad_images (ad_placement, path, position, is_cover, created_at)
SELECT placement, image_path, 0, TRUE, COALESCE(updated_at, now())
FROM public.ads
WHERE image_path IS NOT NULL AND image_path <> ''
ON CONFLICT (ad_placement, path) DO NOTHING;
```

### 5.7 Canonical / mirror rule (D-ADS-3, precise)

- **Canonical = `ad_images`.** It is the single source of truth for ad images: order, cover,
  full set. After Phase B, app code reads **only** `ad_images` for images.
- **`ads.image_path` / `ads.image_url` = compatibility mirror of the cover**, kept for legacy
  consumers during rollout and **never dropped**.
  - **Single-writer:** the mirror is written ONLY inside the apply transaction — by the
    `sync_ads_image_mirror()` AFTER-trigger on `ad_images` (fires per change, recomputes the
    cover = `is_cover` row, else first by `position, created_at`). The app never writes it, and
    the RPCs never write it independently.
  - **`image_url` is derived, not stored.** The trigger sets it to `''`; it is computed at render
    from `image_path` via `publicImageUrl` (`src/services/ads-service.ts:143-152` already has this
    fallback). One stored value → no second source of truth to drift.
  - **Conflict rule: `ad_images` wins.** Any divergence is corrected by the trigger on the next
    change; if a placement has no `ad_images` rows the trigger does nothing (legacy fields left
    untouched during the transition). Verified by `04-post-apply-verify.sql` check 13
    (mirror invariant: expected 0 mismatches).

## 6. Service changes — `src/services/ads-service.ts` (authorized V-4 + carve-out)

```ts
export interface AdImage { path: string; url: string; position: number; isCover: boolean; }

export interface AdConfig {
  enabled: boolean;
  image: string;                 // LEGACY cover — kept for back-compat + PG-50 checks
  link: string;
  alt: string;
  deviceId: string;
  images: AdImage[];             // NEW: ordered set
}
```

- `rowToConfig` also fetches `ad_images` per placement (ordered by position, created_at) and
  attaches `images`; `image` stays the cover (`is_cover` row, else first image) so existing
  renderers and `AdSpot`/`AdContactBanner` keep working untouched.
- `uploadAdImage` → `uploadAdImages(placement, blobs: Blob[]): AdImage[]` — loops the existing
  compress/upload flow, path `ads-images/{placement}/{Date.now()}-{rand}.jpg` (D-ADS-2).
- New `replaceAdImages(placement, paths[], covers[])` calls `ad_replace_images`; single-image
  path still writes `image_path`/`image_url` for legacy consumers.
- `saveAd` unchanged (still upserts the `ads` row); image set is committed via the RPC.
- `resetAd` additionally deletes `ad_images` rows + bucket objects.
- **PG-50 preserved:** `from('ads')` and `ads-images` must still appear in the source
  (`p3-stop-write-gate.test.ts:288-294`).

## 7. UI changes

### 7.1 Upload UI — `src/research-console/pages/ads/AdsManager.tsx` (NOT protected)

- `<input type="file" multiple>` (line 213) + `files[]` (replace `files?.[0]`, line 68).
- Per-placement `pendingUploads: Blob[]` / `pendingPreviews: string[]`.
- Cover selector (radio per preview) + reorder (up/down) + remove-per-image.
- Save: compress each → `uploadAdImages` → `replaceAdImages` → `saveAd`; delete image →
  `ad_remove_image` + remove preview + revoke object URLs.

### 7.2 Renderer — new `src/components/ads/AdImageCarousel.tsx` (carve-out D-GATE-ADS)

Lightweight carousel (adapted from `ProductImageGallery`:
`src/components/showroom/ProductImageGallery.tsx:31-427`): slides, prev/next, dots/thumbnails,
no fullscreen/counter needed for ads. Same adaptive frame rules as `AdBanner` (loading /
loaded / failed collapse).

### 7.3 Consumers

- `AdBanner` (`src/components/ads/AdBanner.tsx`, authorized V-1): accepts optional
  `images: AdImage[]`; when > 1 renders the carousel, else current single-frame behavior.
- `AdSpot` (`src/components/ads/AdSpot.tsx`, authorized V-1): passes `ad.images` through.
- `AdContactBanner` (`src/components/ad-contact/AdContactBanner.tsx`): passes `ad.images`
  through; overlay-button behavior unchanged.

## 8. Tests to update

| Test | Change |
|---|---|
| `src/__tests__/inventory/sql-migration-gate.test.ts` | `max` migration **19 → 20** (line ~90) — the only inventory-gate change; `01↔02` and RPC-count 14 checks stay green because `ad_*` functions are excluded by the `inventory_%` filter |
| `src/__tests__/ads/ads-service.test.ts` | `AdConfig` now includes `images`; assert ordered fetch + legacy `image` = cover |
| `src/__tests__/ads/AdsManager.test.tsx` | multi-file flow, cover selection, remove-image |
| `src/__tests__/ads/AdBanner.test.tsx` | carousel with 3 images; single-image fallback |
| `src/__tests__/ads/AdSpot.test.tsx` | placement maps to `images`; no mixing across placements |
| `src/__tests__/ad-contact/AdContactBanner.test.tsx` | images passed through; overlay unchanged |
| `src/__tests__/privacy/p3-stop-write-gate.test.ts` | **only** `AUTHORIZED_CHANGES` gains the exact path `src/components/ads/AdImageCarousel.tsx` (D-GATE-ADS) — no other edit |
| New `src/__tests__/ads/ad-images.test.ts` | SQL migration surface: `ad_images` table, RPC signatures, prefix guard, backfill from `ads.image_path` |

## 9. Rollback (exact)

- **SQL:** `supabase/ads-multi-image/02-ads-multi-image-rollback.sql` (reviewed, idempotent) —
  drops `ad_images` (+ mirror trigger), drops the 4 `ad_*` RPCs, restores the 00015 storage INSERT
  policy **verbatim** (`00015_ads_tables.sql:97-103`), removes `ad_images` from realtime. This is a
  manual abort file executed as postgres on demand; it is **NOT a numbered migration** and **NOT
  applied by the migration runner**. `ads` rows and all existing bucket objects are untouched.
- **App:** `git revert` the Phase B commit(s); `AdConfig` returns to scalar and the manager
  reverts to single-file.
- Ads keep working with `image_path`/`image_url` throughout (D-ADS-3).

## 10. Files affected (exact list)

**SQL (review package, new, NOT yet migrations):**
- `supabase/ads-multi-image/01-ads-multi-image-apply.sql`
- `supabase/ads-multi-image/02-ads-multi-image-rollback.sql` (manual abort file — never numbered)
- `supabase/ads-multi-image/03-pre-apply-evidence.sql`
- `supabase/ads-multi-image/04-post-apply-verify.sql`
- `supabase/ads-multi-image/05-ad-images-backfill.sql`

**SQL (copied verbatim at Phase B GO — ONE migration number only):**
- `supabase/migrations/00020_ads_multi_image.sql` (from 01-apply; the sole migration in this phase)

**App (new, carve-out):**
- `src/components/ads/AdImageCarousel.tsx`

**App (modified, exact):**
- `src/services/ads-service.ts` (authorized V-4)
- `src/components/ads/AdBanner.tsx`, `src/components/ads/AdSpot.tsx` (authorized V-1)
- `src/components/ad-contact/AdContactBanner.tsx` (not protected)
- `src/research-console/pages/ads/AdsManager.tsx` (not protected)

**Tests (updated/added):** as §8.

## 11. What this plan does NOT do (gates honored)

- Does **not** touch `src/catalog/`, `src/components/catalog/`, `src/services/inventory-service.ts`,
  `src/services/inventory-seed.ts`, `src/services/price-memory.ts`.
- Does **not** alter `00015_ads_tables.sql` or the frozen inventory-central files (only adds a new
  additive migration + replaces the `ads-images` upload policy inside that migration).
- Does **not** delete any existing `ads` rows or bucket objects.

---

## 12. Phase C — client-side gallery implementation (EXECUTED, all gates green)

- **Date:** 2026-08-14. **Status:** implemented + verified. App layer only — the Phase B SQL
  package (`supabase/ads-multi-image/`) is still DRAFT, `00020_ads_multi_image.sql` is NOT applied.

### 12.1 Service (`src/services/ads-service.ts`)

- `AdImage { id, path, url, position, isCover }`; `AdConfig.images: AdImage[]` (ordered gallery;
  legacy scalar `image` remains the cover mirror for back-compat).
- `rowToConfig(row, images = [])`; `fetchAds()` calls the new `loadGalleries()` (reads `ad_images`
  ordered by position/created_at; **tolerates the pre-apply schema** — missing `ad_images` table
  yields an empty map and ads fall back to the single `image_path` mirror).
- `uploadAdImage` uploads to `ads-images/{placement}/` (D-ADS-2 canonical prefix).
- `saveAd` is metadata-only (placement, enabled, link, alt, deviceId) — the image set is committed
  via the RPC, never `image_path`/`image_url` directly.
- New RPC wrappers: `replaceAdImages(placement, paths, covers)` → `ad_replace_images`,
  `addAdImage(placement, path, covers?)` → `ad_add_image`, `removeAdImage(id)` → `ad_remove_image`
  (returns the removed path; caller deletes the object via the Storage API — B-1).
- `resetAd` now removes the gallery rows plus all legacy+`ads-images` storage paths (collected by
  internal `collectAdImagePaths`). Every write clears the module cache and refreshes subscribers.

### 12.2 Admin manager (`src/research-console/pages/ads/AdsManager.tsx`)

- Per-placement gallery editor: multi-file `<input type="file" multiple>`, pending object-URL
  previews (revoked on remove/unmount), cover selection, up/down reorder, per-image remove
  (a gallery never drops below one image), «🗑 إزالة» clears the ad entirely.
- Save flow (one click, atomic): upload pending files → `saveAd` (metadata) →
  `replaceAdImages(paths, covers)` → revoke object URLs → refresh from `getAds()`. No partial state
  is ever committed: a failed upload or RPC aborts the whole save.
- Known RLS limitation: the `ad_images` SELECT policy is **enabled-only** (`a.enabled = TRUE`), so a
  disabled ad's gallery reads back empty in the manager (mirror cover still comes from `ads.image_path`).

### 12.3 Renderers (D-GATE-ADS carve-out)

- **New `src/components/ads/AdImageCarousel.tsx`**: lightweight carousel carved from
  `ProductImageGallery` — stacked crossfading slides, prev/next arrows, thumbnail strip. NO
  fullscreen, NO visible counter, NO autoplay (ads stay static, BATCH 2). Same adaptive frame rules
  as `AdBanner`: loading placeholder, loaded adaptive ratio, **failed → collapse** (the parent
  collapses its interactive wrapper; never a broken ad frame). Starts on the cover slide.
- `AdBanner` accepts optional `images: AdImage[]`; when `images.length > 1` it renders the carousel,
  otherwise the existing single-frame path (unchanged).
- `AdSpot` / `AdContactBanner` pass the placement's `images` through — the gallery is scoped to the
  placement, never mixed across placements. The WhatsApp handoff still uses the cover
  (`ad.image`) in the click message.

### 12.4 Tests (all green — full suite 1455/1455 across 136 files)

| File | Coverage added |
|---|---|
| `src/__tests__/ads/ads-service.test.ts` | per-table chains `{ ads, ad_images }` + `.order`; `mockRpc`; Phase C describe (5 tests: ordered gallery load, missing-table tolerance, `replaceAdImages` + stale-object removal, no-op on empty paths, add/remove RPCs) |
| `src/__tests__/ads/AdsManager.test.tsx` | upload → `uploadAdImage` + `saveAd` + `replaceAdImages`; gallery reorder → `replaceAdImages('home', [...], [false, true])` |
| `src/__tests__/ads/AdBanner.test.tsx` | carousel with 3 images (cover start, arrows, thumbnails), single-image fallback, loaded/adaptive, failed collapse |
| `src/__tests__/ads/AdSpot.test.tsx` | placement maps to its gallery images; no cross-placement mixing |
| `src/__tests__/ad-contact/AdContactBanner.test.tsx` | gallery carousel beneath the overlay; handoff message uses the cover |
| **New** `src/__tests__/ads/ad-images.test.ts` | SQL migration surface: table/columns/unique+partial-cover index, SELECT-only RLS, `ad_is_admin`, prefix+object guards, EXECUTE grants/revokes (4 RPCs), guarded publication, idempotent all-or-nothing backfill |
| `src/__tests__/inventory/sql-migration-gate.test.ts` | max migration 19→20; `00020` body ≡ `01-apply`; `01↔02` rollback symmetry; security invariants; evidence/verify/backfill checks |

`pnpm typecheck` clean; `pnpm lint` 0 errors (only pre-existing design-system warnings).
`src/__tests__/privacy/p3-stop-write-gate.test.ts` `AUTHORIZED_CHANGES` gained exactly
`src/components/ads/AdImageCarousel.tsx` (D-GATE-ADS).

### 12.5 Remaining before production (out of scope for Phase C app work)

1. Owner GO on Plan P0-2 (Phase B): run `03-pre-apply-evidence.sql` → `01-apply` →
   `05-backfill` → `04-post-apply-verify.sql`, then copy `01-apply` verbatim to
   `supabase/migrations/00020_ads_multi_image.sql`.
2. Deploy the Phase C app code **with** the migration (both must ship together — the service
   tolerates the old schema, so order of deploy is safe either way).

---

**Ready for owner review. Decision points: D-ADS-1..4, D-GATE-ADS.**
