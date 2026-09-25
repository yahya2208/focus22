# OWNER FIRST ACTION — single starting step
Date: 2026-09-25. HEAD = origin/main = `6d4bf82` (verified this round).

## The one action
Run **B1 produce preflight** (read-only SELECTs, Supabase SQL Editor on
Production). It costs nothing, changes nothing, and every later step branches
on its four numbers. Paste the full result back before anything else.

## Why this one
- All downstream writes (seed/links) are conditional on veg_rows/veg_dupes.
- Safe to run blind; determines whether Block 1 writes are even needed.
- Every other step (migrations, Edge, renames) is independent of it and waits
  behind approvals anyway.

## Step table (review verdicts)
| Step | Where | Risk | Expected success | STOP if |
|---|---|---|---|---|
| B1 preflight | SQL Editor | none (SELECT) | `0/0/0/5` (or current truth) | dupes>0 or phone_links≠5 → investigate, no writes |
| B2 seed+links | SQL Editor | LOW (guarded INSERTs; replace-RPC banned in pack) | 10/0/10/5, بلدي unchanged | any deviation |
| B3–B5 migrations | SQL Editor | LOW (additive, idempotent, DO-guarded) | objects present, guards silent | precheck shows present → SKIP (do not reapply) |
| B6 00118 | SQL Editor | LOW (new tables only) | tables + RLS + guards | only after Edge file re-review sign-off |
| B7 renames | SQL Editor | LOW (count=1 guarded, category-scoped) | 3 rows renamed | any count≠1 → skip that rename |
| C/D Edge+VAPID+webhook | Dashboard+terminal | MEDIUM (secrets handling) | smoke: 401/NO_SUBSCRIPTIONS | never commit secrets; frontend rebuild needed for VAPID public key |
| E browser E2E | App | LOW (trial order, reversible by design) | 10-step chain green | any money/stock mismatch → stop, report |

## Corrections to the checklist (applied to this file's guidance, not repo files)
1. **VAPID public key needs a frontend rebuild**: `subscribePush` reads it from
   build-time config — after setting it, Pages must rebuild+redeploy before
   closed-app push can work. Added to step C.
2. **No duplicate-creating SQL found**: seed (source_key NOT IN + ON CONFLICT),
   links (NOT EXISTS + ON CONFLICT), renames (count=1 + category guard) are
   all guarded. Verified by re-reading each statement.
3. **Migration order is safe in any sequence** (disjoint objects, confirmed by
   file inspection); listed order kept for readability.
4. **00118 ↔ Edge schema match confirmed**: user_id/endpoint/p256dh/auth
   selected; push_log(order_id, endpoint) upserted; revoked_at honored.
   Client upsert path valid under owner-only RLS (FOR ALL covers update).
5. **Do NOT reapply 00115–00117 on postcheck-present** (already stated; kept).

## Still unconfirmed (do not assume)
- Live Production contents of veg rows/links (B1 answers).
- Whether 00115–00117 effects are already present (their prechecks answer).
- CI status of recent commits (unobservable here).
- Real-device push delivery, latency numbers, invite chain (all held/open).
