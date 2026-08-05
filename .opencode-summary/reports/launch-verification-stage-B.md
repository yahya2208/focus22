# Launch Verification — Stage B: Sticker Studio Gating

Date: 2026-08-05
Status: PASS (all gates green)

## Decision Context
- Sticker Studio is an internal asset generator. Per approved plan it must be
  restricted to `researcher / admin / super_admin` (App roles).
- Enforcement is defense-in-depth: route guard + hidden home card + single
  permission matrix (ADR-001 A7 — no duplicate role maps).

## What Changed
- `src/core/research/permissions.ts` — added `sticker` resource
  (`['read','write','export']`) to `research_admin` and `analyst`
  (covers App `admin` and `researcher`). `super_admin` already has `*`.
  `viewer`/`none` remain denied — no other matrix changes.
- `src/App.tsx` — `sticker-studio` now routed through
  `ProtectedRoute requiredResource="sticker" requiredAction="write"`
  (same pattern as `research` / `repair-*`). Unauthorized users get
  `<AccessDeniedScreen />`, not the studio.
- `src/screens/home/HomeScreen.tsx` — Sticker card is rendered only when
  `permissionGuard.can(researchRole, 'sticker', 'write')`.

## Access matrix after change
| ResearchRole (App role) | Sticker Studio |
|---|---|
| super_admin (super_admin) | ✅ |
| research_admin (admin) | ✅ |
| analyst (researcher) | ✅ |
| viewer (user/guest) | ❌ (card hidden, route denied) |

## Gates (evidence)
| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` | PASS, 0 errors |
| Lint | `npm run lint` | PASS, 0 errors (pre-existing design-system warnings only) |
| Tests | `npm test` | PASS, 77 files / 855 tests |
| Build | `npm run build` | PASS, 405 modules |

## Notes
- First `npm test` run showed 1 failure in
  `research-console/live-contract-runtime.test.tsx` ("Found multiple elements
  with the text: running") — an environment/timing flake from cross-test
  realtime-session leakage, **unrelated to this stage** (no touched file is
  involved in that test). Re-run of that file in isolation: 2/2 pass; full
  suite re-run: 855/855 pass.
- `sticker-analytics` and `sticker-scan` remain ungated (they are player-facing
  features; only the Studio generator is restricted). Flag for confirmation.
