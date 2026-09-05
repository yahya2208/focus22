# REPORT — LIVE-DERIVED PILOT DEPLOYMENT PROOF

**Project:** focus-production (Supabase project `fmggysdqigtejxbfpgtg`)
**Date:** 2026-09-05
**Scope:** Read-only reconciliation of the Pilot migrations (00065/00066/00067) against the **real production schema**, replayed on two disposable local databases. Zero production writes performed.

---

## 1. Verdict

**READY FOR OWNER APPROVAL.**

All eight verification objectives were met on **two independent disposable replay databases** (`live_replay_a`, `live_replay_b`):

1. Live-derived baseline is faithful to production (public schema 441/441, functions 136/136, storage 39/39, role/ACL mirror).
2. Pilot applies cleanly (EXIT=0 ×3) on both replays; outputs byte-identical across them (0/0/0 diffs).
3. No conflicts, no lost behavior: every pre-existing object either unchanged or only extended additively.
4. Pilot objects appear exactly once (5 tables, 18 indexes, 13 policies, 17 new functions + 1 helper).
5. Production objects intact — the **only** rewritten surfaces are the 3 telemetry/order functions and the `orders` table, all intended 00065/00067 targets; existing ACLs on them are byte-identical.
6. Telemetry divergence resolved (Option B below): live 80 arms → 97, strict additive superset.
7. Order/delivery compatibility additive (+30 lines, all Pilot phase-5 store/neighborhood resolution).
8. RLS/grants: **0 removals**, only strictly-additive pilot rules + new objects.

**One defect was found and repaired (must ship the fix):** the repo's `00067` as-committed is syntactically broken (see §7).

---

## 2. Constraints honored

- **No production write.** Only schema-only `pg_dump` (pooler, read-only) and anonymous `SELECT`s were used against `fmggysdqigtejxbfpgtg`.
- **No migration history fabricated.** Production has **no** `supabase_migrations.schema_migrations`. This proof does NOT create one and does NOT mark 52 historical migrations as applied. Deployment model = **live-derived baseline + Pilot delta (00065→00066→00067 only)**.
- Offline replay infrastructure is entirely local (PG 18.4, `127.0.0.1:55432`).

---

## 3. Baseline provenance (artifacts & hashes)

Capture chain (read-only, `--schema-only --no-owner`):

| Artifact | Size | SHA-256 |
|---|---|---|
| `live-public-g.sql` (public, WITH privileges) | 632,880 B | `185851bb4a907031c5c06c8454b02a87f696365eeddbc9c12048bacbe7a3b5b5` |
| `live-storage-g.sql` (storage, WITH privileges) | 56,420 B | `1328f1980ed5760495d782adb4674f81b801965738a38dd3ef62f64f69fca137` |
| `live-auth-g.sql` (auth, WITH privileges) | 59,088 B | `66296948cf709f655d1841451bbaf6b8d46a34a114fe79b264c83358a4de1318` |
| `live-baseline.sql` (assembled, replay source) | 582,425 B | `379671d91fb2ae60bc849ed2533349f5264cd257da32c1ddbe8994a5f59f49f1` |

Live environment facts captured:
- **PG version:** 17.6 (Supabase pooler, SSL).
- **Extensions:** `pg_cron` (pg_catalog), `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault` (guard-installed as `extensions`), `uuid-ossp`.
- **Roles on live** (mirrored in baseline preamble): `anon, authenticated, service_role, authenticator, dashboard_user, supabase_admin, supabase_auth_admin, supabase_storage_admin, supabase_etl_admin, supabase_privileged_role, supabase_read_only_user, supabase_realtime_admin, supabase_replication_admin, postgres`.
- **Policy roles in use:** `anon`, `authenticated`, `public` (no others).
- Assembly ordering (critical): roles → extensions → `auth` → `public` → `storage` → `CREATE TRIGGER on_auth_user_created` (moved to end so `public.handle_new_user()` exists). `\restrict`/`\unrestrict` and `CREATE SCHEMA public` stripped.

Dumps **include GRANTs/REVOKEs and `ALTER DEFAULT PRIVILEGES`** (earlier `--no-privileges` captures silently dropped ACLs; the video-proof baseline was rebuilt with privileges so RLS/grants fidelity is provable).

---

## 4. Fidelity proofs (baseline == production)

Normalized fingerprints (`fp-live4.sql`: tables+views+functions normalized + policies + indexes; comment/whitespace collapsed so function bodies compare semantically; raw bytes differ only by PG18-vs-PG17 dump formatting).

| Dimension | Live | Baseline A | Baseline B | Match |
|---|---|---|---|---|
| public tables/views/functions/policies/indexes | 441 | 441 | 441 | A✓ B✓ (0 only-LIVE, 0 only-REPLAY) |
| public functions (semantic) | 136 | 136 | 136 | A✓ B✓ (0 semantic diffs) |
| storage schema footprint | 39 | 39 | 39 | A✓ B✓ |
| ACL snapshot (public, objects+grants+RLS+views) | — | 251 | 251 | A==B (0/0/0) |

Storage: baseline == live except the **3 bucket DATA rows** (read-only captured separately — not replayed, this is a schema-only replay): `ads-images`, `category-covers` (public, no limits), `inventory-images` (public, 5 MB, MIME allowlist `image/jpeg,png,webp,avif,heic,heif`). These live bucket settings are unchanged by the Pilot and require no migration.

---

## 5. Telemetry divergence — quantified and resolved

### 5.1 The divergence
Production `record_telemetry_event` has **80 domain arms**. The repo contract (00061 + 00067) expects **97**. Difference = **17 repo-only arms**, strictly additive (0 live-only):

- **8 Phase-8 (00061 contract):** `game_round_complete`, `game_result_view`, `auth_login_success`, `auth_login_failed`, `auth_register_success`, `auth_register_failed`, `auth_guest_gate_seen`, `auth_guest_upgrade_cta`
- **9 Pilot (00067 contract):** `neighborhood_view`, `store_view`, `family_view`, `checkout_start`, `checkout_submit`, `order_created`, `order_failed`, `order_status_changed`, `order_completed`

The same 17 appear as new allowlist conditions (`CASE v_name WHEN ...`) — **81 live → 98 post**, missing-live = **0** (strict superset proven line-by-line).

### 5.2 The "missing events" claim checked against facts
| Event name | In any migration? | In any client `*.ts/*.tsx`? | In repo contract? |
|---|---|---|---|
| `game_result_view` | YES (00061, 00067) | YES (25 refs) | **YES — genuinely missing from live; closed by 00067** ✓ |
| `round_complete_victory` | NO | NO | **NO** (0 matches repo-wide) |
| `round_complete_draw` | NO | NO | **NO** (0 matches repo-wide) |
| `scientific_session_complete` | NO | NO | **NO** (0 matches repo-wide) |

The three named events exist nowhere in the repository — they are **not part of the repo contract**, so it is factually correct only to say `game_result_view` (plus `game_round_complete` and the 6 auth events) is missing from live. Production `record_telemetry_event` is currently a **no-op** (closed allowlist) for Phase-8 and Pilot events — the reason 00067 matters.

### 5.3 Decision — **Option B: apply 00067 as-repaired (reconcile to repo contract)**
- **Pro:** closes the Phase-8 + Pilot telemetry gaps permanently; is exactly additive (superset proof); matches client sources which already emit these events.
- **Con:** none observed on either replay (all 136 functions still compile, RLS intact, storage untouched).
- Option A (leave live as-is) was rejected: it would keep Phase-8/Pilot telemetry permanently silently dropped in production, while the shipped repo contract already expects them.

Post-state proven on replay: arms 80→**97** (added exactly the 17), allowlist 81→**98**, and `game_result_view` present in the allowlist.

---

## 6. Before → after (production baseline → + Pilot)

`fp-live4` (public schema, normalized): **441 → 494** entries.

- **Removed (4):** `FN delivery_create_order`, `FN record_telemetry_event`, `FN get_telemetry_analytics`, `TAB orders` — the intended 00065/00067 rewrite targets.
- **Added (57):**
  - Functions (20): 3 rewritten above + `fn_admin_uid` + 16 Pilot functions (`pilot_active_neighborhoods`, `pilot_active_stores`, `pilot_admin_*` ×8, `pilot_neighborhood_families`, `pilot_order_set_status`, `pilot_orders_for_store`, `pilot_reset`, `pilot_store_products`).
  - Indexes (18): PK/unique/foreign on the 4 new tables + `orders.store_id/neighborhood_id/user_id` + inventory/store lookups.
  - Policies (13): 5× Admin manage / 3× Admin read / 3× Public read active / 2× Public read pivot — all on new objects only.
  - Tables (6): `family_groups`, `neighborhood_families`, `neighborhoods`, `stores`, `store_inventory`, and revised `orders` (13 → 16 cols: + `store_id`, `neighborhood_id`, `user_id`).

**ACL / grants / RLS (`acl-fp.sql`): 251 → 286 entries. Removed: 0. Added: 35** = 17 new functions (owner-only default ACL) + 13 policies + 5 new tables. **Critically, the 3 rewritten functions do NOT appear in the ACL diff** → their `proacl` (including the REVOKE/GRANT set in 00065/00067) is **byte-identical** before/after. No grant regressions.

**Storage schema: 39 → 39, removed 0, added 0.** untouched by Pilot.

### 6.1 Order / delivery compatibility (additive-only proof)
`delivery_create_order`: live 137 ws-normalized lines → post 167. **30 added lines, all Pilot phase-5**: store/neighborhood resolution via `store_inventory ⋈ stores(status='active')`, single-store basket guard (`RAISE EXCEPTION 'MULTI_STORE_ORDER' USING ERRCODE = 'P0002'`), order header `store_id/neighborhood_id/user_id`, response metadata `'store_id'/'neighborhood_id'`. **Every live line is preserved in order; the remainder set is empty.** Deterministic across both `--no-privileges` and `--privileges` replay builds.

### 6.2 `get_telemetry_analytics` — additive-only proof
live 302 → post 305 ws-lines. **5 added lines**: closed registries extended with `'neighborhood','order'` domains and the 17 event names; all existing registry values unchanged; live remainder set empty.

---

## 7. Defect found and repaired (ACTION REQUIRED before production use)

**Repo `00067` as-committed is syntactically broken:** the allowlist `CASE` contained an `ELSE` line **before** the 9 Pilot `WHEN` branches → `ERROR: syntax error at or near "WHEN"` (file line 379 / `LINE 283`).

- Broken sha (repo AND the `cli-proof` copy — both identical, both broken): `1fdbefeebe4e0f4581eec92fb693d440f84190aa56787729a154bc29f846818e`
- **Repaired sha (ELSE moved after the final WHEN):** `fdf2124547b8cd124d61c6d3c6ccfa8e59e18f5f8d76be44abbec0b3d9d7eca2`
- Repaired version applied cleanly (EXIT=0) on both replays.

**Owner action:** adopt `00067` with sha `fdf21245…` and refresh the `cli-proof` copy (still carries the broken sha). Files `00065`, `00066`, `00067` are currently **untracked** in git (`??`) — recommend committing them post-approval.

---

## 8. Two independent disposable replays — determinism

| Pair | fp | ACL | storage |
|---|---|---|---|
| baseline A vs B | 0/0 | 0/0 | 0/0 |
| post-pilot A vs B | 0/0 | 0/0 | 0/0 |
| A-post vs live | onlyA 57 / onlyLIVE 4 | — | 0/0 |

Both replays: baseline == production and post == (production + exactly the intended pilot delta). Byte-identical fingerprints certify reproducibility, not coincidence.

---

## 9. Repository checks (migration edits do not disturb the app)

| Check | Result |
|---|---|
| `pnpm typecheck` (`tsc --noEmit`) | **EXIT=0** |
| `pnpm test` (vitest) | **EXIT=0** — 279 files / 3441 tests passed |
| `pnpm build` (`tsc -b && vite build`) | **EXIT=0** |
| `pnpm lint` (eslint) | **FAILS — pre-existing, unrelated:** `src/__tests__/telemetry/t3-1-category-wiring.test.tsx:33` (unused eslint-disable), `t4-3-phase8-game-auth.test.ts:135,136` (`require()`). Both files are **untracked-modified** by us (verified via `git diff --stat` list) — they were failing before this work and are untouched by it. |

---

## 10. Production commands that WOULD be used (NOT executed)

Given live has no migration history, the correct deployment is the **Pilot delta over live**, applied transactionally per file (each migration is already wrapped in `BEGIN;…COMMIT;`):

```
# 1) Ship the REPAIRED 00067:
#    ensure supabase/migrations/00067_telemetry_pilot_events.sql sha == fdf21245…

# 2) Apply the trio against production (order fixed):
psql "postgresql://postgres.fmggysdqigtejxbfpgtg:@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  -v ON_ERROR_STOP=1 -f supabase/migrations/00065_neighborhood_store_pilot.sql
psql "postgresql://postgres.fmggysdqigtejxbfpgtg:@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  -v ON_ERROR_STOP=1 -f supabase/migrations/00066_pilot_seed.sql
psql "postgresql://postgres.fmggysdqigtejxbfpgtg:@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  -v ON_ERROR_STOP=1 -f supabase/migrations/00067_telemetry_pilot_events.sql
```

Alternatives: `supabase db push --include-all` is **not** recommended (would replay 49 historical migrations against an already-populated live schema with no record of them). If a CLI workflow is preferred, use `supabase db push` scoped to the three files after refreshing the `cli-proof` copy — never while it carries the broken `00067`.

Post-deploy verification (re-run the replay fingerprints against production): expect public schema key count 441→494, ACL 251→286, storage 39→39, telemetry arms 80→97.

---

## 11. Residual risks / notes (for the owner decision)

1. **No migration history on live** — applies as of this date. Future migrations should be appended normally; the 49 historical files must never be replayed on production.
2. `00067` broken-as-shipped must be replaced everywhere (repo + cli-proof) with sha `fdf21245…`. **Do not run the old sha.**
3. Pilot migrations are forward-only (no down migration provided) — rollback would require manual reverse DDL, as usual for this project.
4. Seed data in 00066 was not re-validated against live catalog content (schema-only scope). Table-level integrity re-verified.
5. All results are reproducible from `C:\Users\lenovo\AppData\Local\Temp\opencode\` artifacts (`live-baseline.sql`, `assemble-baseline.mjs`, `fp-live4.sql`, `acl-fp.sql`, `fp-storage2.sql`, replay logs).

---

*Report generated from live-derived empirical replay (PG 17.6 source / PG 18.4 local replay). No production mutation was performed.*