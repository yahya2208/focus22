# TELEMETRY-WAVE-A-REPORT.md
## Wave A — Canonical Telemetry Contract Hardening & Normalization

- **Status:** ✅ **PASS WITH DEFERRED ITEMS**
- **HEAD == origin/main:** `01e9c24` `docs(telemetry): add Wave A contract hardening report` — pushed to `origin/main` (`955125d..01e9c24`)
- **Implementation commit (incl. migration 00076):** `79a7d0e` `feat(telemetry): harden canonical event contract (Wave A)`
- **Docs commit (this report):** `01e9c24` (`79a7d0e..01e9c24` adds only `TELEMETRY-WAVE-A-REPORT.md`)
- **Migration applied to production:** `supabase/migrations/00076_telemetry_contract_hardening.sql` (single transaction, THEN verified read-only)
- **Baseline HEAD:** `955125d security(hardening): close Gate-1 RLS/storage/search_path gaps (00072-00075)`

---

## 0. Executive summary

Wave A hardens the canonical telemetry contract end-to-end without changing any
architectural boundary (RBAC, guest policy, order lifecycle, courier/store/pilot
approval, privacy contract, RLS, anonymity). It:

1. Makes the **97-event / 14-domain closed registry** the single source of truth on
   both client and server, now including an explicit `emitted` (producer) status
   (88 emitted / 9 defined-but-unemitted).
2. Adds **closed `entity_type` validation on BOTH sides** (`track()` drops
   out-of-union values on the client; the server RPC now raises
   `INVALID_ENTITY_TYPE` for any non-empty value outside the 13-value union).
3. **Fixes the `family_id` data-hole (M1):** `checkout_submit` / `order_created`
   producers already sent `family_id`, but the per-event allowlist silently
   rejected it — it is now allowlisted and verified stored in production replay.
4. Adds executable contract tests that pin the registry counts, naming, parity,
   allowlist semantics, migration 00076 guarantees, and client identity rules.

Everything was verified against **production** (apply + post-apply read-only
checks; the migration was first fully replayed inside rolling-back transactions).

---

## 1. Baseline (before)

| Area | Value |
|---|---|
| Branch / HEAD | `main` @ `955125d` |
| Lint baseline | 8131 problems (7 errors, 8124 warnings) — pre-existing, NOT Wave A |
| Full test baseline | 3502 tests passing |
| Prod `telemetry_events` rows | 1419 (grew to 1470 live during the session) |
| Prod RLS | enabled |
| Prod grants (EXECUTE) | anon, authenticated, postgres, service_role |

## 2. Canonical registry (client) — AFTER

- `97` events across exactly `14` domains, pinned by test (`event-schema.test.ts`).
- Names are unique `snake_case` (`^[a-z][a-z0-9_]*$`), versions ≥ 1 (default 1).
- New `emitted?` status in `TelemetryEventSchema`:
  - `EMITTED_TELEMETRY_EVENT_NAMES` = **88**
  - `UNEMITTED_TELEMETRY_EVENT_NAMES` = **9** (defined-but-unemitted, no producers added):
    `app_error`, `app_update_detected`, `game_pause`, `game_resume`, `listing_share`,
    `navigation_exit`, `product_details_expand`, `product_favorite`, `product_variant_select`.
- New helpers exported: `isEventEmitted()`, `EMITTED_TELEMETRY_EVENT_NAMES`,
  `UNEMITTED_TELEMETRY_EVENT_NAMES`.

## 3. Client-side runtime validation — AFTER

`client.ts track()` now rejects (drops, no throw):
- unknown event names (already), and
- **any non-empty `entity_type` outside `TELEMETRY_ENTITY_TYPES`** (13-value union).

`entity_type` remains optional: `null`/absent is allowed and stored as `NULL`
(stead of valid-within-union producers; 0 producers out-of-union were found in
the codebase audit, so the guard is non-breaking).

## 4. `family_id` fix (M1 hole)

- **Before:** `checkout_submit`/`order_created` producers sent `family_id`
  (`src/services/order-service.ts:122-148`) but the server allowlist raised
  `UNALLOWED_FIELD` — the value was **silently dropped**.
- **After:** `family_id` is allowlisted on `family_view`, `checkout_submit`,
  `order_created` (client schemas + server migration 00076, tested in lockstep).
- Verified in production replay: `checkout_submit` with `{"items_count":2,
  "family_id":"fam-7"}` is accepted and stored **with** `family_id`.
- `family_id` on any other event is still rejected (`UNALLOWED_FIELD` server-side;
  also stripped client-side) — verified unchanged.
- **Deferred (Wave B/E):** `family_view` is fired on neighborhood change with
  `entityType:'neighborhood'` (its own entity), not a canonical family id; the
  trigger semantics belong to the family/journey work.

## 5. Migration 00076 — verified server contract

- One new migration (operator-style, single transaction, applied to production):
  `supabase/migrations/00076_telemetry_contract_hardening.sql`.
- Re-creates ONLY `public.record_telemetry_event(jsonb)`; does not touch
  `get_telemetry_analytics`, tables, indexes, policies.
- New block **2c**: closed entity-type enforcement raising `INVALID_ENTITY_TYPE`.
- **Grants unchanged:** `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE TO
  authenticated, anon` — identical to prior state (verified in routine_privileges:
  anon, authenticated, postgres, service_role all retained).
- **SECURITY DEFINER + `SET search_path=''` preserved** (verified in pg_proc).
- Full 97-event body carried over from 00067 (authoritative), parity-tested.

## 6. Production verification (before apply)

Replay of 00076 inside `BEGIN;…ROLLBACK;` transactions with simulated
`request.jwt.claim.sub`, all rolled back, zero rows persisted:

| Scenario | Result |
|---|---|
| Authenticated valid `app_open` with `anonymous_id` | ACCEPTED, row landed (then rolled back) |
| `entity_type = 'not_a_union_member'` | **REJECTED `INVALID_ENTITY_TYPE`** |
| Unknown event `bogus_event` | **REJECTED `UNKNOWN_EVENT_OR_DOMAIN`** |
| No auth claim | **REJECTED `UNAUTHENTICATED`** |
| `checkout_submit` with `family_id` | ACCEPTED, `family_id` stored |
| `product_view` with `family_id` | REJECTED `UNALLOWED_FIELD` (unchanged strictness) |
| Row-count sanity | 1470 before and after all replays |

## 7. Production apply + post-apply (AFTER)

- Applied with `ON_ERROR_STOP=1`; `CREATE FUNCTION / REVOKE / GRANT / DO / COMMIT` clean.
- Post-apply read-only:
  - function is `SECURITY DEFINER`, volatile, `search_path=''` ✅
  - function body contains `INVALID_ENTITY_TYPE` + all 13 union values ✅
  - `family_view`/`checkout_submit`/`order_created` allowlists include `family_id` ✅
  - EXECUTE grants: anon, authenticated, postgres, service_role ✅ (no change)
  - RLS on `telemetry_events` still enabled ✅
  - `uidx_telemetry_dedupe` still present ✅
  - `telemetry_events` count still **1470** (no loss) ✅

## 8. Tests (AFTER)

| Suite | Result |
|---|---|
| Telemetry + events + pilot suites | **326 passed** |
| **Full suite** | **3522 passed** (baseline 3502 → +20 new tests, all green) |
| `tsc --noEmit` | 0 errors |
| `npm run build` | OK |
| `npm run lint` | 8131 problems (7 errors, 8124 warnings) — **identical to baseline, no new findings** |

New contract tests added:
- `migration.test.ts` — 00076 reads FIRST as the authoritative RPC; INVALID_ENTITY_TYPE
  present; server union **exactly** equals client `TELEMETRY_ENTITY_TYPES`; grants;
  SECURITY DEFINER/search_path; `family_id` ONLY on the 3 family events; verify script.
- `event-schema.test.ts` — pins 97/14; naming regex; emitted/unemitted 88/9;
  `family_id` contract (exactly 3 events).
- `client.test.ts` — unknown event dropped; out-of-union `entity_type` dropped;
  optional entity_type; guest (user null → `user_id` null + anonymous_id sent); auth
  path; canonical domain override ignored; session/version stamped; `family_id`
  reaches the wire on `checkout_submit`.

## 9. What was deliberately NOT done (and why)

- No `journey_id`, no binding `telemetry_events.session_id` ↔ `sessions.id`, no merge
  of `campaign_qr_events` — scope belongs to Wave B.
- No producers added/removed for the 9 un-emitted events (registry status only);
  TTT `ttt_*=0` gap and game producers belong to Wave D.
- No `event_version` server enforcement: all events are v1 and the server defaults
  v1; per-major-version policy enforcement is deferred and documented as a decision.
- No `screen`/`entity_id` server-side value validation (format-check only): deferred.
- Dedupe architecture unchanged (no proven bug; replay-safe `event_id`/`dedupe_key`
  unique handling kept from 00057–00067).
- No mass renaming; legacy `analytics_events` untouched.
- No RLS / grants / table / index changes (RLS and grants verified identical).
- No change to `src/core/telemetry/privacy.ts` (`family_id` is not a forbidden key).

## 10. Compliance — 17 questions (explicit answers)

1. **Client↔server parity re-verified?** ✅ Yes — 97/97 events, 14/14 domains,
   now tested against the authoritative 00076 RPC.
2. **`entity_type` validation added server-side?** ✅ Yes — closed 13-value union,
   `INVALID_ENTITY_TYPE` (and client-side drop in `track()`).
3. **`family_id` data-hole fixed?** ✅ Yes — allowlisted on the 3 family-context
   events, verified stored; `family_view` producer trigger itself deferred (B/E).
4. **`journey_id` introduced?** ❌ No.
5. **`session_id` bound to sessions table?** ❌ No.
6. **`campaign_qr_events` merged into telemetry?** ❌ No.
7. **Producers added for the dead events?** ❌ No — they are explicitly
   `emitted:false` (88/9) in the registry.
8. **Order lifecycle changed?** ❌ No.
9. **RBAC / ROLE tables / control-center utilities changed?** ❌ No.
10. **P3 guest policy changed?** ❌ No — anonymous telemetry preserved (grants to
    anon kept; guest client test `user_id` stays null).
11. **RLS or grants weakened?** ❌ No — verified identical post-apply.
12. **`service_role` used in client?** ❌ No.
13. **Dedupe improved?** ❌ No — unchanged by design (replay-safe).
14. **TTT zero-event gap solved?** ❌ No — deferred to Wave D.
15. **Migrations 00068–00075 modified?** ❌ No — only a new 00076 added.
16. **Unrelated dirty files touched?** ❌ No — staged exactly the Wave A files
    (1 commit, 10 files).
17. **DB changes shipped via a new migration?** ✅ Yes — 00076, applied to
    production in a single transaction and verified.

## 11. Deferred items → next waves

| Item | Wave |
|---|---|
| Session identity reconciliation / journey / guest-membership / `campaign_qr_events` | B |
| Navigation / product / category producer completions (`family_view` trigger, screen entropy, navigation_exit, product_*, listing_share) | C |
| Game telemetry producers + TTT zero-event gap (`ttt_*`, game_pause/resume) | D |
| Marketplace / order / pilot / courier telemetry + QR→order attribution | E |
| Offline queue / retry / connection-loss preservation | F |
| Advanced analytics (event_version enforcement, screen/entity value validation, dedupe policy) | G |

## 12. Validation matrix (before → after)

| Dimension | Before | After |
|---|---|---|
| Registry | 97 events / 14 domains | 97 / 14 (unchanged)+ `emitted` status (88/9) |
| Client entity_type guard | none (TS only) | runtime drop in `track()` |
| Server entity_type guard | free text accepted | closed 13-value union, `INVALID_ENTITY_TYPE` |
| `family_id` on order events | rejected (silent data loss) | allowlisted, stored (verified) |
| Tests | 3502 | 3522 (all pass) |
| typecheck / build | clean | clean |
| lint | 8131 (7E/8124W) | 8131 (7E/8124W) — no delta |
| Prod RPC definition | SECURITY DEFINER, search_path='' | identical |
| Prod grants / RLS | anon+auth+sr / on | identical |
| Prod rows | 1419→1470 | 1470 (no loss) |

## 13. Conclusion

Wave A is complete and verified: the canonical telemetry contract is hardened on
both sides, the `family_id` hole is closed and proven in production, the 9 dead
events are explicitly declared, and every guard is covered by executable tests
with zero lint/type/build deltas. Items intentionally out of scope are tracked for
Waves B–G above.

**Verdict: PASS WITH DEFERRED ITEMS.** Wave B is NOT started.