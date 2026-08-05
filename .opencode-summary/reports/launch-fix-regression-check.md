# 🔬 Launch Fix #1 — Regression Check Report (QR Analytics · Attribution · Scan Counter · Session · Deep Links · PWA)

- **Status:** NO REGRESSION FOUND
- **Report date:** 2026-08-05
- **Fix under review:** `qrFlowHandledRef` one-time guard in `src/App.tsx` (`InitialRoute`).
- **Method:** (1) code-path analysis of the guard's placement; (2) targeted automated suites re-run; (3) full 860-test suite already green.

---

## 1. Why the guard cannot break these scenarios (code-path analysis)

The guard is placed **inside** the `InitialRoute` effect, **after** the `currentScreen !== 'home'` early-return and **before** the QR/deep-link detection blocks:

```ts
useEffect(() => {
  if (currentScreen !== 'home') return;
  if (qrFlowHandledRef.current) return;   // NEW
  qrFlowHandledRef.current = true;        // NEW
  // ...short-code branch  (/c/XXXXXX)
  // ...deep-link branch  (parseDeepLinkFromCurrentUrl + hasCampaign)
  // ...runSilentCalibration
}, [currentScreen, dispatch]);
```

Consequences:
- **First app load at `home` (the only screen that exists at boot):** the effect body runs and executes the **identical** detection code that existed before the fix — same telemetry `qr_scanned` track, same `setCampaignId`, same `recordScan` (short-code branch only), same `START_QR_FLOW` → `game-intro` → `START_SESSION` chain.
- **Repeat visits to `home`:** the guard short-circuits *only* the re-run that used to restart the game. This is the intended behavioral change (the bug), not a regression.
- **The six scenarios requested are all *first-load* behaviors** → they execute the exact pre-fix code path.

One intended side note: `runSilentCalibration()` now runs on the first home visit only (previously re-ran on every home return). Calibration is still applied on first load; re-calibrating on every home return was redundant and had no user-visible contract.

## 2. Targeted suites (re-run 2026-08-05, after the fix)

Command: `vitest run src/__tests__/qr src/__tests__/session src/__tests__/pwa src/__tests__/supabase/data-service.test.ts src/__tests__/offline src/__tests__/telemetry src/__tests__/events src/__tests__/app/App.test.tsx`

| Scenario (reviewer list) | Automated coverage | Result |
|--------------------------|--------------------|--------|
| QR Analytics (`qr_scanned` event) | `telemetry.test.ts` (9) · `events.test.ts` (10) · App E2E (QR flow fires) | ✅ 20 passed |
| Campaign Attribution (`setCampaignId`/campaign params) | `qr/campaign.test.ts` (17) · `qr/deeplink.test.ts` (12) · `qr/referral.test.ts` (12) | ✅ 41 passed |
| QR Scan Counter (`recordScan`/increment) | `qr/campaign.test.ts` (17) · `supabase/data-service.test.ts` (getCampaignByShortCode, 5) | ✅ 22 passed |
| Session Lifecycle (start → complete/abandon) | `session/lifecycle.test.ts` (23) · `session/session.test.ts` (10) · App E2E (session_created → abandonSession) | ✅ 33 passed |
| Deep Links | `qr/deeplink.test.ts` (12) · `qr/share.test.ts` (12) · `qr/consent.test.ts` (11) · `qr/generate.test.ts` (13) | ✅ 48 passed |
| PWA Launch | `pwa/install-prompt.test.tsx` (2) · `offline/offline.test.ts` (19) | ✅ 21 passed |
| End-to-end QR → game → Stop → home → NO restart | `app/App.test.tsx` (3, incl. the new E2E evidence test) | ✅ 3 passed |

**Targeted total: 14 files / 158 tests — ALL PASSED.**
**Full suite: 78 files / 860 tests — ALL PASSED** (run after the fix, includes the 158 above).

## 3. Explicit per-scenario statement

| Scenario | Conclusion |
|----------|------------|
| QR Analytics | `qr_scanned` still tracked exactly once per load (was: repeated on every home return). First-load behavior identical. ✅ |
| Campaign Attribution | `setCampaignId`/campaign params still applied on first load via both short-code and query-param branches. ✅ |
| QR Scan Counter | `recordScan` still runs once on first load for `/c/XXXXXX` URLs (previously inflated on every home return — the inflation is gone, the counter still records the scan). ✅ |
| Session Lifecycle | `START_QR_FLOW → game-intro → START_SESSION` unchanged; session start/complete/abandon tests green; the E2E observed `session_created`, `abandonSession`, `session_completed`. ✅ |
| Deep Links | `parseDeepLinkFromCurrentUrl` untouched; all 12 deeplink tests green. ✅ |
| PWA Launch | No change to manifest/SW/install logic; PWA + offline suites green. ✅ |

## 4. Conclusion

No regression detected. The guard changes **one** behavior — repeat home visits no longer restart the game — and leaves every first-load QR/campaign/session/PWA behavior byte-identical to pre-fix. Remaining confirmation is the real-device run in `launch-gate-device-verification-protocol.md`.
