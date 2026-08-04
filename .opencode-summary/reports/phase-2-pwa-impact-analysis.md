# Phase 2 — PWA: Impact Analysis

**Branch:** `feature/pwa` (from `v2.0-stable-baseline` = `fc101a3`)
**Date:** 2026-08-04
**Gate:** Impact Analysis mandatory before implementation (baseline protection rules §5).

---

## 1. Scope (per approved plan)

1. Enable Service Worker.
2. Fix `manifest.json` (`start_url`/`scope`/`id` → `/focus22/`).
3. Fix install prompt (`beforeinstallprompt`).
4. Verify icons at all sizes.
5. Test install on Android / Windows / Chrome.
6. Success gate: Build ✅ / Typecheck ✅ / ESLint ✅ / Tests ✅ / report proving PWA installable.

## 2. Current State Audit (baseline `fc101a3`)

### manifest.json — ALREADY CORRECT
- `id`, `start_url`, `scope` all `/focus22/` (absolute, matches Vite `base`).
- `display: standalone`, `theme_color`/`background_color` set.
- Icons declared for 16, 32, 48, 72, 96, 128, 144, 152, 192, 256, 384, 512 + maskable-512 + svg.
- **Gap found:** manifest does NOT declare `focus-64.png`, `focus-167.png`, `focus-180.png`, `focus-1024.png` which exist in `public/icons/` and were verified (dimensions match). Chrome only strictly requires 192 + 512; adding the extra sizes improves install surface (esp. Windows Store / Tiles). No correctness bug.

### index.html — MOSTLY CORRECT
- `<link rel="manifest" href="%BASE_URL%manifest.json">` → resolves to `/focus22/manifest.json` in dist. ✅
- `theme-color`, `apple-mobile-web-app-*`, `mobile-web-app-capable` present. ✅
- Icons referenced via `%BASE_URL%icons/...` → `/focus22/icons/...`, verified present in dist. ✅
- Script: `src="/src/main.tsx"` (absolute, fixed in Phase 1 — required for build). ✅

### Service Worker — MISSING
- No `public/sw.js`, no `public/service-worker.js`, no registration anywhere. **This is the core blocker for installability** (Chrome requires a SW with a fetch handler + manifest with 192/512 icons).
- No `beforeinstallprompt` handler → no install prompt UI on eligible browsers.

### 404.html — EXISTS
- SPA fallback with path rewrite for `/focus22/?/route` pattern. ✅

### PWA deps
- No `vite-plugin-pwa` / `workbox`. Decision: **hand-rolled SW** (`public/sw.js`) — zero new dependencies, aligned with the existing architecture (no new tech debt), precaches app shell + hashed assets via cache-first, network-first for navigations.

## 3. Regression Risk Matrix

| Change | Risk | Mitigation |
|---|---|---|
| Add `public/sw.js` (pure static file) | LOW — only active inside SW scope `/focus22/` | SW only caches same-origin GET; Supabase/auth/campaign fetches NOT intercepted (different origin). Offline fallback returns cached `index.html` only for navigations. Versioned cache, cleanup on activate. |
| Register SW in `src/main.tsx` | LOW — guarded by `import.meta.env.PROD` + `'serviceWorker' in navigator` | Production-only; dev/CI (jsdom) unaffected. Registration wrapped in `.catch` (no unhandled rejection). |
| Add `beforeinstallprompt` hook + `InstallPrompt` component | LOW — new additive UI | Renders nothing unless event fires & deferred prompt available; dismiss state persisted in-memory only. No existing screen touched. |
| Extend `manifest.json` icons array | LOW — additive entries only | Re-declares existing files (verified dimensions). Existing declared entries untouched. |
| i18n: add `pwa.*` keys (4 locales) | LOW | Follows existing `TranslationKey` union pattern; en/ar/tr/fr all updated; type-safe. |
| New test for install-prompt hook | LOW — jsdom safe | Hook guards `window.addEventListener('beforeinstallprompt')` behind feature-detect. |

## 4. Protected Baseline Components — Touch List
No protected Phase-1 component is modified except `src/main.tsx` (SW registration — additive one-time block, root-cause of missing installability). `manifest.json`/`index.html` additions are within the PWA scope explicitly approved; no other baseline file (showroom, ads, inventory-service, logging) is touched.

## 5. Decision Record
- **SW strategy:** hand-rolled, zero deps, precache app shell + icons, runtime cache-first for hashed `/focus22/assets/*`, network-first + offline fallback for navigations. Cache name versioned `focus-pwa-v1`; old caches purged on activate.
- **Install prompt:** custom hook `useInstallPrompt` + floating banner `InstallPrompt` shown when `beforeinstallprompt` fires and `prompt()` available; uses `pwa.*` translations.
- **Icons:** add missing declared sizes (64/167/180/1024) to manifest (files verified to exist with matching dimensions).

## 6. Verification Plan (post-implementation)
1. `npm run typecheck` ✅
2. `npm run lint` ✅ (0 errors)
3. `npm run test` ✅ (all suites)
4. `npm run build` ✅
5. Manual/structural PWA verification report: manifest validity, SW registration path `/focus22/sw.js`, icon sizes, `start_url`/`scope`/`id`.
