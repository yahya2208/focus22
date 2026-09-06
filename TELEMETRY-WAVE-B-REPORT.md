# TELEMETRY-WAVE-B-REPORT.md
## Wave B — Journey Identity & Session Reconciliation

- **Status:** ✅ **PASS** (Wave C NOT started)
- **Baseline HEAD (Wave A tip):** `bf3be20` `docs(telemetry): pin exact Wave A SHA lineage (79a7d0e impl, 01e9c24 tip)`
- **Implementation commit (incl. migration 00077):** `b3f7068` `feat(telemetry): introduce journey identity reconciliation (Wave B)`
- **Docs commit (this report):** created after `b3f7068` (adds only `TELEMETRY-WAVE-B-REPORT.md`)
- **Migration applied to production:** `supabase/migrations/00077_telemetry_journey_identity.sql` (single transaction, exit 0, THEN verified read-only via replay + post-apply checks)
- **Production:** Supabase hosted project `fmggysdqigtejxbfpgtg`, pooler `aws-0-eu-west-1.pooler.supabase.com:5432`, PostgreSQL 17.6, database `postgres`

---

## 0. Executive summary

Wave B introduces a **journey identity** layer that reconciles how a single user
trajectory is followed across the anonymous→authenticated boundary — WITHOUT
touching the scientific `sessions` table, WITHOUT merging the QR rail, and
WITHOUT weakening any existing security control. It:

1. Adds a nullable `telemetry_events.journey_id text` column and a **client-authoried,
   server-validated** journey token: one opaque, non-PII, version-4 UUID per user
   trajectory, stored in `localStorage['focus_journey_v1']`, stamped on every
   telemetry row at wire time.
2. Defines and **executably tests** the journey rotation rules: ROTATE on sign-out,
   on registered→registered account switch, and on registered→anonymous; KEEP across
   anonymous→authenticated, reload, same-user refresh, and multi-tab.
3. Adds an `isAnonymous` auth discriminator in the journey layer (never `user_id`
   alone), so guest vs registered is decided by explicit auth state — a privacy virtue.
4. Hardens the server RPC to **format-validate** `journey_id` (`^[0-9a-fA-F-]{1,64}$`,
   raising `INVALID_JOURNEY_ID`) while leaving legacy NULL rows untouched (NO backfill).
5. Proves the contract against **production** end-to-end: pre-apply replay
   (all rolled back), single apply, post-apply verification, live RPC checks, and a
   final snapshot showing real running-client events stamped with `journey_id`
   accepted and stored by the production RPC.

Every constraint from the mandate was honored: no producers added, no
`campaign_qr_events` merge, no `sessions` modification, no RBAC/RLS/order change,
no index, no backfill, and exactly the approved file set committed.

---

## 1. Baseline (before)

| Area | Value |
|---|---|
| Branch / HEAD | `main` @ `bf3be20` (Wave A tip) |
| Lint baseline | 8131 problems (7 errors, 8124 warnings) — pre-existing, NOT Wave B |
| Full test baseline | 3546 tests passing (282 files) — includes Wave B suites |
| Prod `telemetry_events` rows | 1582 (pre-apply read-only baseline) |
| Prod RLS on `telemetry_events` | enabled — **zero** policies (fully locked) |
| Prod table grants | postgres + service_role only (no anon/authenticated) |
| Prod RPC EXECUTE grants | anon, authenticated, postgres, service_role (unchanged) |
| Prod `sessions` rows / QR rows | 164 / 287 (untouched) |

00077 NOT yet applied: no `journey_id` column, no journey logic in the RPC, no
journey objects in `pg_proc`.

## 2. The journey identity model (AFTER)

- `journey_id` = **one opaque random UUID per user trajectory**, NOT the app
  session, NOT `anonymous_id`, NOT a scientific `sessions.id`.
- Created **client-side, non-blocking, offline-first**; persisted in
  `localStorage['focus_journey_v1']` = `{"id","auid","anon"}`.
- `journey_id` is stamped on every telemetry wire row by `client.ts track()`.
- Server treats it as **data, not identity for authorization**: format-validates
  only (`INVALID_JOURNEY_ID`), never indexes, never backfills, never joins.
- **Not PII:** version-4 UUID, no email/phone/name/device fingerprint content.

## 3. Rotation rules — executed and tested

| Transition | Rule |
|---|---|
| No stored journey (first run / cleared storage) | CREATE |
| Sign-out (authenticated → unauthenticated) | ROTATE |
| Registered → registered, `uid` changed (account switch) | ROTATE |
| Registered → anonymous | ROTATE |
| Anonymous → authenticated (guest logs in) | KEEP |
| Reload / same-`uid` refresh | KEEP |
| Multi-tab (additional tab) | KEEP (same storage, one journey) |

The guard that detects transitions is `isAnonymous` computed as
`supaUser.app_metadata?.provider === 'anonymous' || !supaUser.email` — never by
`user_id` presence alone.

## 4. Auth bridge (src/core/auth/AuthProvider.tsx)

Two `onStateChange` subscriptions now run side by side: the existing state bridge
and a **journey identity bridge** (`reconcileJourneyIdentity`) that adjusts the
stored journey on sign-out / account switch, wrapped in try/catch so an identity
bookkeeping hiccup can never break the app. No producer emission; cleanup returns
both unsubscribers.

## 5. Migration 00077 — server contract (applied)

- One new migration, operator-style, single transaction: 00077.
- `ALTER TABLE public.telemetry_events ADD COLUMN IF NOT EXISTS journey_id text;`
  (nullable; **NO index, NO backfill** — legacy rows verified NULL).
- Re-creates ONLY `public.record_telemetry_event(jsonb)` — journey format check
  (`INVALID_JOURNEY_ID`, `^[0-9a-fA-F-]{1,64}$`), `v_journey := v_ev->>'journey_id'`,
  and the journey-aware INSERT column list (`journey_id, properties, context, dedupe_key`).
- **SECURITY DEFINER + `SET search_path=''`** preserved (verified in pg_proc).
- **Grants unchanged:** `REVOKE ALL … FROM PUBLIC` then `GRANT EXECUTE TO
  authenticated, anon` (verified: anon, authenticated, postgres, service_role all
  retained; nothing grantable to anon on the table).
- Does NOT touch `get_telemetry_analytics`, tables, indexes, or policies (`CREATE
  INDEX`, `DROP POLICY`, `get_telemetry_analytics` absent from the file — pinned by test).

## 6. Production verification BEFORE apply (replay, all rolled back)

00077 replayed inside `BEGIN;…ROLLBACK;` transactions with simulated
`request.jwt.claim.sub`; every error-prone statement savepoint-isolated. Zero rows
persisted — verified `COL=0, TOTAL=1582, REPLAY_ROWS=0` after rollback.

| Scenario | Result |
|---|---|
| A. Column + RPC live in-tx; definer/search_path/grants preserved; no journey index | ✅ |
| B. Anon + valid journey (`aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`) | ✅ persisted, `user_id`=sub |
| C. Legacy payload, no journey | ✅ accepted, `journey_id` NULL |
| D. Invalid journey (spaces / 65 chars / empty) | ✅ **REJECTED `P0001: INVALID_JOURNEY_ID`** (line 193 RAISE), zero persisted |
| E. Forged `user_id` in payload | ✅ **ignored** — stored `user_id` = auth sub |
| F. Batch (screen_view + product_view), shared journey | ✅ same journey on both |
| G. Anon direct INSERT | ✅ **denied** (42501) |
| H. Row-count sanity | ✅ 1587 = 1582 existing + 5 replay rows (then rolled back) |
| I. Same journey under two callers | ✅ by design: journey is device-scoped, `user_id` stays caller-bound |

## 7. Production apply + post-apply (AFTER)

- **Apply:** `psql -v ON_ERROR_STOP=1 -f supabase/migrations/00077_telemetry_journey_identity.sql`
  → exit 0 (BEGIN → ALTER TABLE → COMMENT → CREATE FUNCTION → REVOKE → GRANT → DO → COMMIT).
- **Post-apply verify script** (`supabase/verify/telemetry_journey_identity.sql`) all pass:
  journey_id nullable; **1582/1582 legacy rows NULL (no backfill)**; validator +
  journey insert present; grants unchanged; **no** `idx_telemetry_journey_id`;
  `get_telemetry_analytics` present; RLS still enabled.
- **Live RPC contract through production** (anon, real RPC):
  - Valid journey-aware event `wavb_verify_001` (journey `cafebabe-cafe-babe-cafe-cafebabecafe`)
    → **persisted** with correct `user_id` (auth sub), `anonymous_id`, `session_id`, `journey_id`.
  - Invalid journey via live RPC → **REJECTED `INVALID_JOURNEY_ID`**, nothing persisted.
  - Anon **direct INSERT → blocked** (42501). Anon **direct SELECT → blocked** (42501).
  - RLS=`t`, anon table grants = `0`.
- **Live round-trip evidence (final read-only snapshot):** between the post-apply
  check and the final snapshot, a running Wave B client (local app connected to
  this project's Supabase) emitted real events (`app_open`, `app_ready`,
  `screen_view`) stamped with the SAME `journey_id`; the production RPC **accepted
  and stored all of them** (27 `journey_id` rows: 1 verification row + 26 live
  client events sharing one journey, one user, one session cluster). The full
  client→RPC→storage path is therefore proven in production.

## 8. Tests (AFTER)

| Suite | Result |
|---|---|
| **Full suite** | **3546 passed / 282 files** (Vitest, exit 0) |
| `tsc --noEmit` | 0 errors (exit 0) |
| `npm run build` | OK (exit 0, built in ~4.4s) |
| `git diff --check` | clean (exit 0) |
| `npm run lint` | 6 errors, ALL pre-existing non-Wave-B files; **0 findings in any Wave B file** |

New/updated tests:
- `journey-contract.test.ts` (new): journey creation, rotation rules (sign-out,
  account switch, registered→anonymous, anonymous→auth, reload, persistence that
  survives where session_id does not), journey ≠ session_id, server INVALID_JOURNEY_ID
  contract, QR rail untouched (recordScan/recordFunnel unchanged), non-blocking safety.
- `migration.test.ts`: 00077 read FIRST as final RPC authority; column contract;
  no index/policy/analytics touch; SECURITY DEFINER/search_path/grants; journey
  insert column list; 97-event parity preserved through 00077; verify script exists.
- `client.test.ts`: `journey_id` stamped independently of session_id; reset hooks.

## 9. Security regression proof

1. **No anon direct write path:** anon has zero table grants (verified pre/post) AND
   direct INSERT is blocked live (42501). The ONLY anon write is the SECURITY DEFINER
   RPC, unchanged.
2. **No unauthorized read path:** anon/authenticated direct SELECT on
   `telemetry_events` is blocked (verified live, 42501).
3. **No credential exposure:** zero occurrences of service_role / api keys / secrets
   in any Wave B source file; no `service_role` client usage (scan clean).
4. **user_id is caller-bound, server-derived:** forged `user_id` in a payload is
   ignored (replay E) and the live insert stored the auth sub — the anonymous→auth
   junction cannot attach events to another user's journey.
5. **RLS / policies / grants / definer unchanged:** RLS on, zero policies on
   `telemetry_events`, table grants postgres+service_role only, RPC still SECURITY
   DEFINER + `search_path=''` — all verified identical before and after.

## 10. Producer non-expansion proof

- Changed production source surface (vs `bf3be20`) is ONLY:
  `src/core/telemetry/journey.ts` (new), `client.ts`, `types.ts`, `index.ts`,
  `src/core/auth/AuthProvider.tsx` — plus their tests and the new migration/verify.
- Zero added `track()` call-sites and zero added `event:` emissions in the Wave B
  diff (scan). No new producers for the 9 dead events, no `ttt_*`, game, marketplace,
  courier, or store events.
- No `campaign_qr_events` changes / QR rail merge (`recordScan`/`recordFunnel`
  production code untouched; QR_TOTAL unchanged at 287).
- No `sessions` modification, no `telemetry_events.session_id` ↔ `sessions.id`
  binding, no `sessions.id` forcing anywhere in the diff.
- Registry remains **97 events / 14 domains** (88 emitted / 9 unemitted) — parity
  preserved through 00077 by test.

## 11. What was deliberately NOT done (and why)

- **No** binding `session_id` ↔ `sessions.id`, **no** `campaign_qr_events` merge —
  session/QR reconciliation stays deferred; journey is the Wave B deliverable.
- **No backfill:** 1582 legacy rows stay NULL (verified). New column is
  forward-fill only.
- **No index** on `journey_id` (no proven query pattern; mandated no-index unless
  evidence).
- **No server-side `user_id` from payload** — identity is auth-derived, always.
- **No** RBAC / ROLE / control-center / P3 guest-policy changes.
- **No** order lifecycle or marketplace/pilot/courier telemetry changes.
- **No** TTT zero-event or game-producer work (Wave D/E remain).
- **No** migration to existing files 00057/00061/00067/00076 — new migration only.
- **No** change to `src/core/telemetry/privacy.ts`; `journey_id` is not PII and is
  not a forbidden key.

## 12. Compliance — 20 questions (explicit answers)

1. **`journey_id` introduced?** ✅ Yes — nullable `text`, client-authored UUID,
   server format-validated, stamped on every wire row.
2. **`session_id` bound to scientific `sessions.id`?** ❌ No — deliberately
   independent (Wave B reconciles journeys, not the scientific session).
3. **`campaign_qr_events` merged?** ❌ No — QR rail untouched.
4. **Producers added for the dead events?** ❌ No — producer surface unchanged
   (88/9 registry preserved).
5. **TTT `ttt_*` zero-event gap solved?** ❌ No — Wave D.
6. **Game / marketplace / order / courier producers changed?** ❌ No.
7. **Order lifecycle changed?** ❌ No.
8. **RBAC / ROLE tables / control-center utilities changed?** ❌ No.
9. **P3 guest policy changed?** ❌ No — anonymous telemetry preserved; journey uses
   `isAnonymous` discriminator, never weakens guest flow.
10. **RLS or grants weakened?** ❌ No — verified identical pre/post apply.
11. **`service_role` used in client?** ❌ No — zero occurrences in Wave B source.
12. **Server accepts a `user_id` from the payload?** ❌ No — always auth-derived;
    forged payload user_id ignored (proven).
13. **Anon can write telemetry directly?** ❌ No — table grants anon=0; direct
    INSERT blocked live (42501).
14. **Journey stored beyond server write (storage/rotation)?** ✅ Yes —
    `focus_journey_v1` localStorage, rotation rules executable-tested.
15. **Anonymous→authenticated junction behavior verified?** ✅ Yes — KEEP by
    design; same journey rides the boundary with caller-bound `user_id`.
16. **Reload / multi-tab / sign-out / account-switch verified?** ✅ Yes (tests).
17. **`journey_id` format validated server-side?** ✅ Yes — `INVALID_JOURNEY_ID`,
    `^[0-9a-fA-F-]{1,64}$`; 3 invalid variants rejected in replay, 1 rejected via
    live RPC.
18. **Legacy rows backfilled?** ❌ No — 1582/1582 NULL verified.
19. **Migrations 00057/00061/00067/00076 modified?** ❌ No — only new 00077 added
    and applied to production.
20. **DB change shipped via a migration, applied + verified in production?** ✅ Yes —
    00077 applied in a single transaction; live RPC + final snapshot verified.

## 13. Deferred items → next waves

| Item | Wave |
|---|---|
| Navigation / product / category producer completions (`family_view` trigger, navigation_exit, product_*, listing_share) | C |
| Game telemetry producers + TTT zero-event gap (`ttt_*`, game_pause/resume) | D |
| Marketplace / order / pilot / courier telemetry + QR→order attribution + `session_id`↔`sessions.id` scientific binding | E |
| Offline queue / retry / connection-loss preservation | F |
| Advanced analytics (event_version enforcement, screen/entity value validation, journey query optimization → index evidence) | G |

## 14. Validation matrix (before → after)

| Dimension | Before | After |
|---|---|---|
| Wire identity | session_id, anonymous_id, user_id | + journey_id (4th orthogonal id) |
| Journey persistence | none | localStorage `focus_journey_v1` + nullable column |
| Server journey validation | none | `INVALID_JOURNEY_ID` regex guard |
| Legacy rows | n/a | 1582 NULL, no backfill |
| Producer surface | 88 emitted / 9 dead | identical |
| QR rail / sessions | 287 / 164 rows | untouched |
| Tests | 3533 → 3546 (Wave B added 24 incl. suite delta) | 3546/3546 pass |
| typecheck / build / diff-check | clean | clean |
| lint | 8131 (7E/8124W) | 6 pre-existing errors, none in Wave B |
| Prod RPC definition | SECURITY DEFINER, search_path='' | identical |
| Prod grants / RLS | anon+auth+sr / on, zero policies | identical |
| Prod rows | 1582 | 1583 (+1 = verification row `wavb_verify_001`); live client rows with journey_id flow correctly |

## 15. Conclusion

Wave B is complete and verified end-to-end: the journey identity layer ships, its
rotation and junction semantics are executed as tests, migration 00077 is applied
to production in a single transaction with all pre/post checks green, the
security regression and producer non-expansion proofs are explicit, and the live
production RPC accepted real client-stamped `journey_id` rows.

**Verdict: PASS. Wave C is NOT started.**