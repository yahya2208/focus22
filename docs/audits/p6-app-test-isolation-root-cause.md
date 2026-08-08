# P6 CI FAILURE — ROOT CAUSE REPORT: App.test.tsx lands on Showroom instead of Home

- **Date:** 2026-08-08
- **Mode:** INVESTIGATION ONLY + test-isolation fix. No production code changed, no P6 scope change, no SQL/migration, no commit/push.
- **Base:** `HEAD = d082dadf698840e9696c30092da5f07ef9f633f4` (P6 execution already green in the working tree).
- **Changed files (test-only):** `src/__tests__/setup.ts`, `src/__tests__/app/App.test.tsx`.

---

## 1. Observation

`App.test.tsx` expects the app to boot at Home ("▶ Start Test" buttons). In CI the app boots at **Showroom / "Similar Phones"** instead, so the Home assertions fail.

## 2. Why App boots into Showroom

`src/App.tsx` → `InitialRoute` (App.tsx:114-160) reads `window.location.hash` once per mount and, if it starts with `#/`, dispatches `REPLACE` to that screen (App.tsx:129-150):

```
#/showroom   →   REPLACE screen='showroom'   →   ShowroomScreen ("Similar Phones")
```

So the app shows Showroom **if and only if** `location.hash === '#/showroom'` at mount time. A fresh boot has no hash → Home.

## 3. Why the hash was stale (root cause — confirmed empirically)

- `vitest.config.ts` uses `pool: 'forks'` with `poolOptions.forks.singleFork: true` — **all test files run sequentially in ONE jsdom process**.
- In that mode the jsdom `window` is **reused across test files**: `window.location` (pathname / search / hash) is **not reset** when one file ends and the next begins.
- `src/__tests__/setup.ts` already documented and mitigated DOM bleed (its `afterEach` does `cleanup()` + `document.body.innerHTML = ''`), but it **never reset `window.location`**.
- **Polluter:** `src/__tests__/showroom/useScrollPreservation.test.tsx` sets `window.history.replaceState(null, '', '#/showroom')` in `beforeEach` (line 24) and `#/phone-details?device=d-1` (line 91), and its `afterEach` does **not** restore the URL. Other location-touching files (`back-provider`, `navigation-url-mirror`, `error-boundary-reset`, `phase3-exits`) reset their URL in `afterEach`/`beforeEach` — only `useScrollPreservation` leaves it dirty.
- Therefore, whenever `useScrollPreservation` (or any file ending on a non-empty hash) runs immediately before a file that mounts `<App />`, the next app boot reads the leftover `#/showroom` and REPLACEs into Showroom.

### Empirical proof (probe files, since deleted)

With `00-probe-leak-source.test.ts` (sets `#/showroom`, no reset) + `01-probe-leak-victim.test.ts` (`expect(location.hash).toBe('')`):

| State | Result |
|---|---|
| Before the fix | victim **FAILED** — `received '#/showroom'` |
| After the setup.ts fix | victim **PASSED** — hash starts empty |

## 4. Why it is test-isolation, not an app regression

- `App.tsx`, `InitialRoute`, routing, Home and Showroom are all **unchanged approved behavior** (P3 comment at App.tsx:123-125 documents that campaign/QR boot handling was removed; nothing re-added).
- The app code cannot route to Showroom from a clean URL — it only does so from an explicit `#/showroom` deep link (kept behavior, asserted by `navigation-url-mirror.test.tsx`).
- No feature was re-enabled; no `START_QR_FLOW`, telemetry, or campaign/QR code touched.
- Root cause is **single-fork jsdom environment reuse** leaking `window.location` between test files — a test-environment isolation defect.

## 5. Fix (test-only)

1. **`src/__tests__/setup.ts`** — systemic isolation: the global `afterEach` now also does `window.history.replaceState({}, '', '/')`, clearing pathname/search/hash after every test so every file starts from a clean URL. This matches the file's existing single-fork rationale.
2. **`src/__tests__/app/App.test.tsx`** — defensive: top-level `beforeEach` resets the URL to `/` so App always boots from a clean URL regardless of suite ordering.

No production file changed. No feature re-added. The polluter file itself was left untouched (its per-test `beforeEach` re-sets its own URL, so with the global reset it is now harmless).

## 6. Verification (all green)

| # | Command | Result |
|---|---|---|
| 1 | Probe ordering test (leak source → victim) | leak **eliminated** |
| 2 | App + navigation + showroom files together (6 files) | **29/29 passed** |
| 3 | P6 privacy gates (inside full suite) | **10 files / 87 tests passed** |
| 4 | Full suite `vitest run` | **114 files / 1089 tests passed (21.1s)** |
| 5 | `tsc --noEmit` | **clean — 0 errors** |
| 6 | `eslint src/ --report-unused-disable-directives` | **0 errors** (4782 design-system baseline warnings) |
| 7 | `tsc -b && vite build` | **✓ built in 4.34s** |

## 7. Diff (test-only, 2 files)

```
src/__tests__/setup.ts          +7 lines  — afterEach now resets window.location to '/'
src/__tests__/app/App.test.tsx  +8 lines  — beforeEach resets URL to '/' before every test
```

---

**HARD STOP — INVESTIGATION COMPLETE. No commit, no push. Pending owner review of this report and the diff.**
