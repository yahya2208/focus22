# FOCUS v2.0 — Transition Report: Phase 1 (Extended)

**Date:** 2026-08-04
**Branch/base:** `main` @ `c0e618bbcfa70ae5be0c65909820a3d9874205cd`
**Scope:** 6 mandatory deliverables for Phase 1 extended scope. No DB migrations.
**Status:** ✅ **APPROVED — Phase 1 Extended is now the project BASELINE** (user confirmation 2026-08-04). The 6 completed components are protected: no modification/deletion/redesign except for documented root-cause fixes.
**Versioning:** NOT COMMITTED / NOT PUSHED. Commit/Push only after the current phase is fully complete AND all quality gates pass.

---

## 1. Deliverable Summary

| # | Deliverable | Status |
|---|---|---|
| 1 | Phone gallery (used-phones showroom) with image upload/storage | DONE |
| 2 | In-app ads system (6 placements) + Ads Manager in Research Console | DONE |
| 3 | Single source of truth for inventory (buy/sell/exchange) | DONE |
| 4 | No console.* output in production bundle | DONE |
| 5 | Fix PWA 404 icons | DONE |
| 6 | `session_abandoned_auto` & similar events not printed to user | DONE |

---

## 2. Changes Made

### 2.1 Showroom (Deliverable 1)
- **New:** `src/screens/showroom/ShowroomScreen.tsx` — glass card with title, `AdSpot placement="phone-details"`, `PhoneShowroom` fed by `InventoryService.getExchangeableDevices()`, back button.
- **New:** `src/components/showroom/{PhoneImageUploader,PhoneGallery,PhoneShowroom}.tsx`.
- **New:** `src/services/image-service.ts` — client-side canvas compression → `data:image/jpeg;base64` (900px/0.72 for phones).
- **Wiring:** `src/store/navigation.tsx` (`'showroom'` in ScreenName), `src/App.tsx` (lazy route + map), `src/components/navigation/HomeMenu.tsx` (menu button), `src/screens/home/HomeScreen.tsx` (Showroom card before Sticker Studio).
- **Inventory modals:** `AddInventoryModal.tsx` adds `PhoneImageUploader` (max 6) → `InventoryService.updateImages(record.id, images)` after `addStock`; `EditInventoryModal.tsx` edits/previews up to 12 images and persists before `onSave`.

### 2.2 Ads System (Deliverable 2)
- **New:** `public/ads.json` — 6 placements, all `enabled:false` by default.
- **New:** `src/services/ads-service.ts` — `AdPlacement`/`AdConfig` types, `AD_PLACEMENTS`, `getAdsFile` (cached) + localStorage override `focus_ads_override_v1` via `getAdOverride/saveAdOverride/resetAdOverride`, `resolveAd`.
- **New:** `src/components/ads/AdSpot.tsx` — CSS Ken Burns animation, lazy `<img>`, optional link, `role="banner"`, aspect 16/5.
- **Placements:** HomeScreen (before Statistics), PhoneServicesScreen (top), CustomerPhoneFlow (exchange step), RepairHomeScreen (after header), ResultsScreen (before Quick Stats), ShowroomScreen (`phone-details`).
- **New:** `src/research-console/pages/ads/AdsManager.tsx` — image upload via `compressImage(maxDimension:1280, quality:0.8)`, Ken Burns preview, save/reset per placement.
- **Registered:** `ResearchConsole.tsx` (import, `ads: AdsManager`, `DASHBOARD_IDS`, `DASHBOARD_RESOURCE_MAP['ads']='overview'`), `ResearchLayout.tsx` (DashboardId type + 📢 entry), `src/__tests__/research-console/sidebar-navigation.test.tsx` (ALL_DASHBOARDS).
- **i18n:** `research.nav.ads` + `showroom.*` + `home.showroom` keys added in ar/en/tr/fr, type-safe with `TranslationKey`.

### 2.3 Single Source of Truth (Deliverable 3)
- Confirmed `InventoryService` drives buy/sell/exchange via `getExchangeableDevices()` in `CustomerPhoneFlow.tsx`; protected by `src/__tests__/inventory/exchange-source.test.ts`.

### 2.4 No console.* in Production (Deliverable 4)
- **New:** `src/core/logging.ts` — `devLog/devInfo/devWarn/devError/devDebug` no-ops outside `DEV`.
- All remaining `console.*` in browser bundle routed through `dev*` (`structured-log.ts` imports `devInfo/devError`; `PersistenceProvider.tsx`/`data-service.ts`/`whatsapp-service.ts` etc. updated).
- Residual `console.*` only in `src/database/*` (Node CLI/seed scripts) and `__tests__`.

### 2.5 PWA Icons 404 Fix (Deliverable 5)
- `index.html` switched from `%BASE_URL%src/main.tsx` → `/src/main.tsx` (absolute under `base`; `%BASE_URL%` variant breaks `vite build`).
- `public/icons/` verified complete (`apple-touch-icon.png`, `focus-*.png/svg`); `manifest.json` + icons + `ads.json` land in `dist`; all hrefs resolve under `/focus22/`.

### 2.6 Events not printed to user (Deliverable 6)
- `session_abandoned_auto` does not exist as an event name in `src`. Observed `[obs]` structured-log events recorded in-memory (`recentEvents`) but **printed only via `devInfo/devError`** → silent in production.

### 2.7 Supporting
- `index.html`: added `@keyframes kenburns` (kept existing `scaleIn`).
- `src/i18n/translations/{ar,en,fr,tr}.ts` updated (4 files).

---

## 3. Verification Results

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS (2 fixes during work: unclosed `div` in PhoneShowroom line 56; unused `idx`; unused `useRef` in AdsManager) |
| Lint | `npm run lint` | PASS — 0 errors (pre-existing `design-system/no-inline-styles` warnings only) |
| Tests | `npm run test` | PASS (all suites incl. live-contract-e2e) |
| Build | `npm run build` | PASS (after `/src/main.tsx` fix; only dynamic+static-import warnings) |

Note: `rg` unavailable in this environment; checks run via `cmd /c "npm run <script>"` (npm.ps1 blocked by Execution Policy).

---

## 4. Important Notes
- **No DB / Supabase migrations** were executed — all persistence is client-side (localStorage).
- **Restore point:** `c0e618b` — work is uncommitted. Per workflow, **do NOT commit/push** until user approves the report.
- After approval, next: commit these changes (respecting repo conventions) — then proceed to Phase 2/3/4 (currently frozen).

## 5. Baseline Protection Rules (binding)
1. The 6 Phase-1-Extended components (Showroom+image pipeline, Ads system + AdsManager, InventoryService single-source, `src/core/logging.ts` dev-gating, PWA icon/manifest fix, structured-log DEV-gating) are **protected baseline**. Do not modify/delete/redesign except for a documented root-cause fix.
2. **Impact Analysis is mandatory** before every new phase: verify no regression against the completed functionality, and no technical debt (no temporary workarounds, no code duplication, no architecture drift).
3. **Quality gates re-run after every phase:** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` — each phase produces a fresh verification report.
4. **No commit/push** until the current phase is fully complete AND all quality gates pass. All new changes must comply with the existing architecture.
