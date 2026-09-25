# MASTER BASELINE REPORT — Family Invitation → Notifications → E2E
Date: 2026-09-24. HEAD = origin/main = `85614bc` (branch `main`). Worktree: 17 classified entries.

## Current state
- Family Preferences member paths: committed (`7e00c8a`), admin display committed (`85614bc`), DB 00117 applied (user-probed).
- Produce pilot: cards UI + engine + artwork committed; 10 veg rows + links: DATA STATUS UNKNOWN (probe/SQL pack delivered, awaiting user execution).
- Settlement decrement 00113: file in repo untracked; Production application UNCONFIRMED.
- Invite lane: client + Edge committed (`ec10531`); DB chain (00088/00110) HOLD; Edge deploy state unknown.

## Already completed (this project)
G3 advance, 00105 record, security repair 00112/00114, family foundation/read paths, V1.4, V-UX1, produce cards/artwork, preferences member+admin UI, catalog link/fruit files (unapplied), price-editor UI (uncommitted).

## Missing
1. Produce data writes (user-executed SQL).
2. 00113/00115/00116/00117 Production record-or-apply decisions (00117 applied per user probe; record pending).
3. Invite DB chain (policy-held).
4. Notification stack (G-N1..N4, this work order).
5. Price-editor commit gate; parked OpsAdmin invite/ledger/create UI gates.

## Blockers (Production-approval only)
- Any Production SQL/migration apply. - 00088/00089/00110 holds. - RBAC/Auth/App/Login changes.

## Safe next actions
Phase 1 invitation code-prep + tests; G-N1 banner/listener; G-N2 permission flow; G-N3 files (migration/Edge/SW, unapplied); E2E harnesses running against staging-legal paths only.

## Exact files/migrations/RPCs/Edge
- Migrations: 00115/00116/00117 (files, unapplied); 00088/00089/00110 (HOLD); 00113 (UNCONFIRMED).
- RPCs: preferences trio (live per probe); invite reserve/bind/mark (absent); push (nonexistent).
- Edge: `pilot-invite` (file committed, deploy unknown); `order-push` (nonexistent).
- SW: `public/sw.js` cache-only, registered PROD-only.
