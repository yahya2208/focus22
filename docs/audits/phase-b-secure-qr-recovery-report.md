# PHASE B — SECURE QR RECOVERY — REPORT

- **Scope**: Restore the QR entry point, not the old QR system.
- **Owner explicit approval**: YES (Phase B approved for implementation).
- **Verdict**: `PHASE B PASS — AWAITING OWNER REVIEW`
- **Date**: 2026-08-09
- **Environment**: `E:\dll\focus\focus22` (win32, PowerShell 5.1, Node)

## Principle

The owner approved re-enabling the minimum QR entry point on the existing,
unchanged `lookup_campaign_by_short_code` RPC. No attribution, no telemetry,
no analytics, no device identity, no old navigation state, no DB change, no
commit. Phase B touches 1 runtime module + 1 screen-branch + 2 test files.

## A. Files changed

| File | Change |
|---|---|
| `src/services/campaign-lookup.ts` | NEW — `extractCampaignShortCode(pathname)` (regex `/\/c\/([a-zA-Z0-9]{6})(?:\/)?$/` on the pathname; base-path agnostic, optional trailing slash, rejects 5/7-char codes, special chars, and `/campaign/`) and `lookupCampaign(shortCode)` (format guard `^[a-zA-Z0-9]{6}$`; single RPC `lookup_campaign_by_short_code` via `.maybeSingle()`; returns `CampaignEntry {id, shortCode, name} | null`; no row / inactive / RPC error / network failure all resolve to `null`). No fallback, no retry, no mock, no direct table access, no persistence. |
| `src/App.tsx` | +13 lines — import (line 15) + `/c/<code>` branch in `InitialRoute` (after `initialRoutingHandledRef`, before hash handling). Valid + active entry → `dispatch({type:'REPLACE', screen:'game-intro'})`. Invalid / inactive / error → silent no-op, normal routing continues. No state, no tracking. |
| `src/__tests__/qr/campaign-lookup.test.ts` | NEW — 23 tests: parser (7), query-param ignored (1), RPC behavior (6 incl. no-crash on empty/inactive/network), static security-regression scans (9). |
| `src/__tests__/app/qr-routing.test.tsx` | NEW — 5 tests: valid → game-intro; invalid → home; `?campaign=`, `?source=`, `?ref=` are ignored. |

Totals: **+28 tests, +2 files** over baseline (113 → 115 test files; 1081 → 1109 tests; zero removed, zero failures).

## B. Database

Executed SQL: **NO** · Migrations: **NO** · Schema: **NO** · RLS: **NO** · RPC: **NO** · Grants: **NO** · Policies: **NO**.

Reused contract as-is (migration `00007`, unchanged):
`public.lookup_campaign_by_short_code(p_code TEXT)` — `LANGUAGE sql`, `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, returns `id/short_code/name/is_active`, filters `is_active = true`, granted to `anon` + `authenticated`. See `supabase/migrations/00007_lookup_campaign_by_short_code.sql`. The unused v2 (`00011`, `lookup_campaign_by_short_code_v2`) is untouched and remains unused by the app.

## C. Runtime

- `/c/<short_code>` supported: YES (pathname-based, trailing-slash tolerant, base-path tolerant).
- Active campaign → `game-intro`: YES.
- Invalid code: YES, safe (no crash, stays on normal route, no RPC call for malformed input).
- Inactive / missing code: YES, safe (RPC returns no row → `null` → normal route).
- `?campaign=` / `?source=` / `?ref=` attribution: IGNORED (unchanged P3 behavior).
- Deployment prerequisite (no repo change): the host must serve `index.html` for `/c/*` (SPA rewrite). `public/sw.js` is already network-first with index.html shell fallback, so online navigations resolve once the host rewrites.

## D. Security — static sweeps (production `src`, tokens zero in runtime)

| Surface | Count |
|---|---|
| `.from('campaigns' / 'qr_codes' / 'placements' / 'placement_history' / 'analytics_events')` | 0 |
| `lookup_scan_context` | 0 |
| `START_QR_FLOW` | 0 |
| `campaignId` / `placementId` / `qrId` navigation state | 0 (only pre-existing `core/qr/share.ts` optional share payload + a pre-existing comment) |
| query attribution reads (`params.get('campaign'|'source'|'ref'|'p')`) | 0 |
| localStorage / sessionStorage / cookies / beacon / fingerprinting / IP / referrer in new module + App.tsx | 0 |

## E. Regression

- Vitest: **115 files / 1109 tests PASS** (baseline 113/1081; +28 new, 0 failures).
- TypeScript: `tsc --noEmit` EXIT=0.
- ESLint: **0 errors** (4782 pre-existing design-system warnings, unchanged).
- Build: PASS (`tsc -b` then `vite build`).
- Privacy gates P3/P4/P5/P6/P7 and Auth/RBAC gates: all PASS within the full suite.

## F. Device test

NOT executable from this environment (no live DB access, no phone). Owner must run on the hosted production URL:

1. `<PRODUCTION_BASE>/c/kq7Iej` → expects `game-intro` (live RPC resolves active campaign).
2. `<PRODUCTION_BASE>/c/XXXXXX` → expects safe fallback to normal home route (no crash, no attribution).
3. RPC status unchanged on the live DB via the companion read-only verification script `supabase/phase-b-qr-recovery-read-only-verification.sql`.

## G. Git

commit: NO · push: NO · tag: NO · deploy: NO. Phase B delta is exactly the four files in §A. All other `git status` entries are pre-existing uncommitted work from earlier privacy phases (CR-00006, P3–P7 reports) — untouched.

## H. Verdict

`PHASE B PASS — AWAITING OWNER REVIEW`

Owner decisions still required before any release:
1. Approve Phase B code.
2. Run the device test (§F) on the hosted URL.
3. Run the read-only verification SQL (or equivalent) and confirm the RPC + LV-3/CR-00006 posture is as shipped.
4. Confirm intent to commit/deploy (Phase B itself performed no commit).

## I. Addendum — GitHub Pages deep-link fix (final phase)

**Root cause (device test):** GitHub Pages does no server-side SPA rewrite. A raw
`/focus22/c/kq7Iej` navigation returns the custom `public/404.html` (HTTP 404),
whose inline JS rewrites the URL to `/focus22/?/c/kq7Iej`. At app runtime that
means `pathname=/focus22/` and `search=?/c/kq7Iej` — the short code survived only
in the query-encoded path, which the Phase B parser did not inspect.

**Fix (commit `90f4517`, `fix(qr): recover GitHub Pages campaign deep links`):**
`src/services/campaign-lookup.ts` now exposes `extractCampaignShortCodeFromQuery`
(parses the GitHub Pages `?/c/<code>` encoding only, never name=value attribution)
and `extractCampaignShortCodeFromLocation` (pathname first, then encoded query).
`src/App.tsx` `InitialRoute` uses the combined extractor. `public/404.html` was
NOT redesigned. RPC, DB, RLS, and all frozen systems untouched.

**Evidence:** 115 files / 1119 tests PASS (+10 new; unit 29, routing 9). TSC, ESLint
(0 errors), Build PASS. GitHub Actions run `31285932643` (head `90f4517`) success
→ deploy-pages PASS. Live bundle `assets/index-CvY-9cTx.js` contains
`lookup_campaign_by_short_code` (Phase B live). Hosting chain re-verified live:
raw `/c/kq7Iej` → 404 custom 404.html (redirect JS present) → `/focus22/?/c/kq7Iej`
→ 200 app index.html.

**Remaining:** real-device test (owner): open `https://yahya2208.github.io/focus22/c/kq7Iej`
on a phone → GameIntro → game → 7 trials → results, no Home, no login, no telemetry.
Until then: `PHASE B — AWAITING DEVICE TEST`.
