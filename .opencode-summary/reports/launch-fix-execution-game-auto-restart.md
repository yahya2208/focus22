# 🚀 Launch Fix — Execution Report: Game Auto-Restart (QR deep link)

- **Status:** EXECUTED + verified (code, typecheck, lint, 860-test suite, production build, E2E evidence test)
- **Priority:** 🔴 Critical (blocked access to phone browsing, repair, sell, buy)
- **Report date:** 2026-08-05
- **Predecessor:** `launch-blocker-investigation-game-auto-restart.md` (read-only root-cause proof)

---

## 1. Root cause (recap)

`InitialRoute` in `src/App.tsx` re-ran its `useEffect` every time `currentScreen` became `'home'`. The QR/campaign parameters stay in the URL for the whole app session, so **every return to home** (Stop button, Save & Exit, Home after a finished match) re-detected them and re-dispatched `START_QR_FLOW` → `game-intro` → `game`. The game therefore auto-restarted every time the user tried to leave it.

Secondary effect that also disappears with this fix: `recordScan` was inflated on every return home.

## 2. Fix (single guard, one-time per app load)

| File | Change |
|------|--------|
| `src/App.tsx:1` | `useRef` added to the react import. |
| `src/App.tsx:120` | `const qrFlowHandledRef = useRef(false);` inside `InitialRoute`. |
| `src/App.tsx:129-130` | In the `useEffect` (deps `[currentScreen, dispatch]`), after the `currentScreen !== 'home'` early-return: `if (qrFlowHandledRef.current) return; qrFlowHandledRef.current = true;` |

Behavior after fix:
- QR/deep-link detection (short-code branch **and** `parseDeepLinkFromCurrentUrl` branch) runs **exactly once per app load**.
- Returning home via Stop / Save & Exit / Home button: stays on home, **no** `START_QR_FLOW`, **no** game restart, **no** repeated `recordScan`.
- The game still starts normally via Play Again / an explicit deliberate start.

Scope: 3 lines in one component. No navigation reducer change, no screens changed, no migration.

## 3. Automated evidence (recorded run)

New E2E test added: `src/__tests__/app/App.test.tsx` → *"starts the game from a QR deep link, and returning home does not auto-restart it"* (30s timeout, real timers, full `<App/>` with all providers).

| Step | What the test drives | Observed result |
|------|----------------------|-----------------|
| 1 | `history.pushState` to `/?campaign=test-campaign&source=qr`, render App | ✅ `game-intro` appears ("Test Your Focus") — QR flow fired |
| 2 | game-intro auto-advances | ✅ `GameScreen` mounts ("Stop Test" button visible, "Game round 1 of 7") |
| 3 | Click **Stop** → **Yes, Stop** | ✅ navigates home |
| 4 | Assert home restored ("▶ Start Test") | ✅ home visible |
| 5 | Wait 2.5s with QR params still in the URL | ✅ game does **not** restart — no "Test Your Focus", no "Stop Test", home persists |

Result: **PASS** (4.3s) — proves the exact reported scenario (QR → stop → home → no auto-restart) end-to-end.

## 4. Full verification matrix

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `tsc --noEmit` | ✅ exit 0 |
| Lint (changed files) | `eslint ... src/App.tsx ...` | ✅ 0 errors (pre-existing design-system style warnings only) |
| Full test suite | `vitest run` | ✅ **78 files, 860/860 passed** (855 baseline + 5 new) |
| Production build | `tsc -b && vite build` | ✅ built in 4.66s (pre-existing chunk-split warnings only) |

## 5. Manual device checklist (for the user — cannot be automated in jsdom)

Real QR / PWA on a phone:

1. Open the app **from the QR code** (or URL with `?campaign=...&source=qr`).
2. Game auto-starts once. ✅ expected
3. Press **Stop** → confirm. → Must land on **home**, game must **not** restart.
4. Play a full match → on results press **Home / Save & Exit**. → Must land on **home**, game must **not** restart.
5. Browse **Showroom**, then **Repair**, then back home. → Home stays, no game.
6. Confirm the game only starts again via an explicit **Play Again** / start button.

Report back: any of these steps that still auto-starts the game would indicate a regression.

## 6. Outcome

The one-time `qrFlowHandledRef` guard in `InitialRoute` removes the launch blocker with minimal scope. Full automated suite is green and the dedicated E2E reproduces the user's exact flow with the correct post-fix behavior. **Stage C remains frozen** — no migration, no Supabase change.
