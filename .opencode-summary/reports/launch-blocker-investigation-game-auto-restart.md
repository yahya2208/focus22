# 🚨 Launch Blocker — Investigation Report: Game Auto-Restart

- **Status:** READ-ONLY forensic investigation — COMPLETE (no code changed, no commit, no migration)
- **Priority:** 🔴 Critical (top)
- **Report date:** 2026-08-05
- **Scope:** Issue 1 — game auto-restarts after stop / save & exit / home; user trapped in game loop, cannot reach Showroom or Repair.

---

## 1. Symptoms (as reported)

1. Pressing **Stop** pauses the game for a moment, then it restarts.
2. **Save & Exit** from Results brings the game back.
3. After a match ends, pressing **Home** starts the game again.
4. The user is effectively trapped — cannot reach **Showroom** or **Repair** screens.

---

## 2. Root Cause (confirmed)

> **The QR/deep-link flow is re-triggered on EVERY return to the Home screen, because the campaign params in the URL are never consumed/cleared, and `InitialRoute` re-dispatches `START_QR_FLOW` every time `currentScreen` becomes `'home'`.**

`START_QR_FLOW` resets the whole app state and forces navigation to `game-intro` → `game`. So any path that leads back to Home is immediately hijacked back into the game.

### The exact loop

```
App loads with campaign params in URL (?campaign=…&source=… or /c/XXXXXX)
  └─ InitialRoute (App.tsx:117-175) runs because currentScreen === 'home'
       └─ dispatch START_QR_FLOW (App.tsx:163 / 141)
            └─ reducer resets state → screen='game-intro' (navigation.tsx:134-135)
                 └─ GameIntroScreen auto-navigates to 'game' after 1s (GameIntroScreen.tsx:24-26)
                      └─ game plays…

User presses Stop / Save & Exit / Home
  └─ dispatch NAVIGATE 'home' (GameScreen.tsx:297 / ResultsScreen.tsx:163,331)
       └─ currentScreen === 'home' → InitialRoute effect RE-RUNS (deps: [currentScreen, dispatch])
            └─ URL still has campaign params (never cleared)
                 └─ dispatch START_QR_FLOW again → game-intro → game RESTARTS ♻️
```

### Evidence (file:line)

| # | File:line | Role in the loop |
|---|-----------|------------------|
| 1 | `src/App.tsx:117-175` | `InitialRoute` effect, deps `[currentScreen, dispatch]` — re-runs on every visit to Home; **no one-time guard**, params never cleared from URL. |
| 2 | `src/App.tsx:128-149` | `/c/{shortCode}` branch → `START_QR_FLOW` (line 141) |
| 3 | `src/App.tsx:151-165` | `parseDeepLinkFromCurrentUrl()` + `hasCampaign` branch → `START_QR_FLOW` (line 163) |
| 4 | `src/store/navigation.tsx:134-135` | `START_QR_FLOW` reducer: `return { ...initialState, screen:'game-intro', isQrFlow:true, campaignId }` — resets state AND forces game-intro. |
| 5 | `src/screens/game-intro/GameIntroScreen.tsx:24-26` | 1s timer → `NAVIGATE 'game'` |
| 6 | `src/screens/game/GameScreen.tsx:286-298` | `confirmStop()` → `NAVIGATE 'home'` (line 297) |
| 7 | `src/screens/results/ResultsScreen.tsx:149-164` | `saveAndExit()` → `NAVIGATE 'home'` (line 163) |
| 8 | `src/screens/results/ResultsScreen.tsx:331` | Home button → `NAVIGATE 'home'` |

### Why "pauses briefly then restarts"

Stop opens a confirm modal (pause), then `NAVIGATE 'home'` → Home renders for a fraction of a second → `InitialRoute` fires → `START_QR_FLOW` → `game-intro` (1s intro = the "seconds" the user sees) → game restarts. Matches symptom 1.

### Secondary side-effects of the bug

- `START_QR_FLOW` resets to `initialState`, **discarding in-memory sessions/results** each time the loop fires.
- `recordScan` is called again on each re-entry (`App.tsx:142-144`) → **inflated scan counters** in analytics.

### Non-factors examined (ruled out)

- `PersistenceProvider.tsx`: no navigation dispatch — only DB persistence + heartbeats + beforeunload/visibilitychange beacons. ✅ not a cause
- `GameScreen.tsx` mount effect: starts a session once; unmount cleanup abandons it. No self-restart timer. ✅
- `React.StrictMode` (main.tsx:26): double-invokes effects in **dev** only; production build is unaffected. Not the deployed cause. ✅
- `ResultsScreen`/`CountdownScreen`/`CalibrationScreen` auto-navigation: only reachable via explicit "play again"/calibration flow, not automatic. ✅

---

## 3. Proposed Fix (for user approval — NOT executed)

**Minimal, low-risk fix — make the deep-link/QR handling run ONCE per app load:**

- **Option A (recommended):** Add a one-time guard in `InitialRoute` (module-level flag or ref) so the effect body runs only on the first mount — the deep-link detection (short code / campaign params / `runSilentCalibration`) must not re-run on subsequent `currentScreen === 'home'` visits.
- **Option B (complementary):** After consuming the deep link, clear the campaign params from the URL via `history.replaceState(url path)` so the params don't persist for the session. This also fixes the repeated `recordScan` inflation.
- **Option C (belt & braces):** Change the `START_QR_FLOW` reducer to preserve in-memory `sessions`/`results` (spread `state` instead of `initialState`) so no data is discarded on re-entry.

Estimated blast radius: `App.tsx` (+ optional `navigation.tsx`). Fully covered by existing navigation tests.

---

## 4. Verification plan (after fix, to be run by user)

1. Open app via a QR campaign URL → game starts. ✅
2. Press Stop → confirm → land on Home, **stay on Home** (no restart).
3. Finish a full match → Save & Exit → land on Home, stay there.
4. From Home: navigate to Showroom and Repair — must be reachable.
5. Confirm scan counter increments only once per QR open.
