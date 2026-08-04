# Phase 4 — Performance: Impact Analysis

**Branch:** `feature/performance` (from `v2.1-pwa-stable`)
**Date:** 2026-08-04
**Gate:** Impact Analysis mandatory before implementation (baseline protection rules §5).
**Scope source:** Deferred items documented in `.opencode-summary/reports/phase-2-pwa-verification.md` §3/§4 — main chunk 1.15MB > 500kB warning; flaky `live-contract-runtime.test.tsx`.

---

## 1. Scope

1. Reduce initial-bundle main chunk (`index-*.js`, currently **1,157 kB min / 294 kB gzip**) below the 500 kB warning threshold by splitting vendor dependencies and lazy-loading the Research Console.
2. Fix flakiness of `src/__tests__/research-console/live-contract-runtime.test.tsx` (real-time `waitUntil(..., 5000)` bound fails under CPU load).

## 2. Current State Audit (baseline `v2.1-pwa-stable`)

### Main chunk composition (measured)
| Contributor | Size (source) | Notes |
|---|---|---|
| `react-dom` client (React 19) | 523 kB (prod CJS, already minified) | Single largest vendor dep; alone exceeds 500 kB |
| `react` | 17 kB | — |
| `@supabase/*` (supabase-js + postgrest + gotrue + realtime + storage + phoenix) | 203 kB source | Pulled by `PersistenceProvider`/`AuthProvider`/telemetry |
| Research Console (24 dashboards) | 454 kB source | **Statically imported in `App.tsx:46`** — biggest app-level contributor |
| i18n translations (en/ar/tr/fr) | 181 kB source | Statically imported in `src/i18n/index.ts` |
| Rest of app code + providers + design-system | ~200 kB | — |

### Flaky test audit
- `live-contract-runtime.test.tsx` test 1 uses real timers and `waitUntil(cond, 5000)` at 5 spots. Under parallel test-worker CPU load the polling loop can exceed 5 s even though the **documented contract is ≤10 s** (test name + logged bound `10000ms`). Proven pre-existing at baseline `fc101a3` (PASS, PASS, FAIL on clean tree). The 5 s hard assertions are stricter than the contract.
- Test 2 (poll fallback) uses fake timers → deterministic, not flaky.

## 3. Proposed Changes

### 3.1 Vendor chunk splitting (`vite.config.ts`)
- Add `build.rollupOptions.output.manualChunks`:
  - `react-vendor` → `react`, `react-dom`, `react-dom/*`, `scheduler`
  - `supabase-vendor` → `@supabase/*`, `@supabase/postgrest-js`, `@supabase/gotrue-js`, `@supabase/realtime-js`, `@supabase/storage-js`, `@supabase/functions-js`, `@supabase/supabase-js`
- Set `chunkSizeWarningLimit: 600` with rationale: `react-dom` prod build alone is ~523 kB — no code split can shrink a single already-minified vendor file below 500 kB; the warning then guards the app/vendor chunks, all of which stay well under 500 kB.
- **No dependency change, no build tooling change** (Vite already used). This only affects `dist` chunk layout + long-term browser caching. Dev unaffected.

### 3.2 Lazy-load Research Console (`src/App.tsx`)
- Convert the static `import { ResearchConsole } from './research-console/ResearchConsole'` (line 46) to `lazy(() => import('./research-console/ResearchConsole').then(m => ({ default: m.ResearchConsole })))`.
- It is only rendered for the `research` route, already inside `<Suspense>` (ScreenRouter) and `<ProtectedRoute>`; the pattern is identical to the 24 other lazy screens. Removes ~454 kB source (~160 kB min) from the initial bundle. `DASHBOARD_RESOURCE_MAP`/`DASHBOARD_IDS`/`dashboardComponents` stay inside `ResearchConsole.tsx` — no change to its API (`ResearchConsole` named export preserved).

### 3.3 Flaky test fix (`src/__tests__/research-console/live-contract-runtime.test.tsx`)
- Raise the `waitUntil` polling bounds in test 1 from `5000` → `10000` (matches the documented ≤10 s contract), so the helper no longer throws before the assertion can measure.
- Replace the two hard `expect(...).toBeLessThan(5_000)` with the contract bound `10_000`; keep the 5 s figures as logged informational targets.
- **No change to test 2** (deterministic fake-timer test).

## 4. Regression Risk Matrix

| Change | Risk | Mitigation |
|---|---|---|
| `manualChunks` in vite.config | LOW — build-output layout only | Dev server unchanged; hashed asset names keep SW cache working (cache-first on `/focus22/assets/*` matches any hash). Verify `dist` after build. |
| Lazy `ResearchConsole` | LOW — identical to existing lazy pattern | Route is inside `Suspense`; named export preserved; tests that render `ResearchConsole` import it directly from its file (unaffected). Sidebar-navigation test imports from component files, not `App.tsx`. |
| Test bound change | LOW — test-only | Contract intent preserved (≤10 s hard, 5 s logged as typical). |
| SW / installability | NONE | `public/sw.js` precaches app shell + hashed assets by URL prefix — unaffected by chunk re-naming (cache-first matches new hashes; runtime cache fills on demand). |

## 5. Protected Baseline Components — Touch List
- **Not touched:** showroom, ads system, InventoryService, `src/core/logging.ts`, manifest/icons, install prompt, `src/main.tsx`, SW.
- **Touched (outside protected set):** `vite.config.ts` (build config — not a protected Phase-1/2 component), `src/App.tsx` (lazy import — App routing layer, RC not a protected component), one test file.

## 6. Verification Plan
1. `npm run typecheck` ✅ / `npm run lint` ✅ (0 errors) / `npm run test` ✅ (incl. 3 consecutive runs of `live-contract-runtime.test.tsx` to prove the flake is gone).
2. `npm run build` — confirm `index-*.js` entry chunk < 500 kB and no "larger than 500 kB" warning (or only on the documented react-dom vendor chunk).
3. Confirm `dist/sw.js` still present + `manifest.json` valid (PWA regression check).
4. Verification report `phase-4-performance-verification.md` with before/after numbers.
