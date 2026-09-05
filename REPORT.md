# OPTION A — FINAL HARDENING REPORT

Date: 2026-09-05 · Scope: **local-only** pre-production hardening of the Option A deployment set (baseline + storage companion + seed carry-forward + `00065`/`00066`/`00067`).

> **NO PRODUCTION WRITE WAS PERFORMED.** No `db pull`, `db push`, `migration repair`, `db reset`, DDL, or DML was executed against the live database during this hardening cycle. All proofs run on disposable local databases on `127.0.0.1:55432` (local PostgreSQL 18.4), recreated from zero.

---

## 1. EXACT FILES CHANGED

| File | Change |
|---|---|
| `supabase/migrations/00066_pilot_seed.sql` | **REPAIRED** — inserted one idempotent statement at top (section 0): `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_sku ON public.inventory_items (model_id, variant, condition, color);`. No other statement altered. |
| `supabase/migrations/00067_telemetry_pilot_events.sql` | **REPAIRED** — relocated exactly the 9 misplaced `v_ok_domain` WHEN-arms (neighborhood/store/family/checkout/order events) into the correct `CASE v_name` expression, placed before its `ELSE … v_ok_domain := false;`. No existing telemetry branch or allowlist arm was modified; the 9 matching `v_allowed` arms stay in place. |
| `supabase/hardening/storage-policies.sql` | **NEW** — storage companion (3 bucket ensures + 12 policies, verbatim from `00015`/`00019`/`00050`) + self post-check. |
| `supabase/hardening/pre-pilot-seeds.sql` | **NEW** — pre-pilot data carry-forward (see §5), no secrets, no user data, all `ON CONFLICT DO NOTHING`. |
| `REPORT.md` | **REPLACED** — this report. |

No other file in the repository was touched (verified with `git status --short supabase/`). The two pilot migration files remain untracked, matching their pre-session state.

---

## 2. EXACT MIGRATION ORDER (CLI-verified)

```
00000_baseline.sql                      (schema-only baseline, public schema; \restrict + CREATE SCHEMA meta stripped)
00001_storage_policies.sql              (hardening companion)
00002_pre_pilot_seed_carry_forward.sql  (hardening companion)
00065_neighborhood_store_pilot.sql
00066_pilot_seed.sql                    (repaired)
00067_telemetry_pilot_events.sql        (repaired)
```

`supabase db push --db-url … --include-all --dry-run` printed **exactly this 6-file set, in this order**. After the real push, `supabase_migrations.schema_migrations` contains exactly:

```
00000
00001
00002
00065
00066
00067
```

Re-running the dry-run afterwards returns **nothing pending**. Adding a hypothetical `00068_*.sql` to the project makes the dry-run list **exactly one** extra file (and nothing else).

---

## 3. EXACT STORAGE POLICIES (12/12 parity)

All three buckets present: `ads-images`, `inventory-images`, `category-covers`. The 12 `storage.objects` policies applied by the companion (names, commands, roles recorded from the target catalogs, matching the previously observed production inventory):

| Bucket | Policy | Command | Role |
|---|---|---|---|
| ads-images | Public read ads-images | SELECT | public |
| ads-images | Staff upload ads-images | INSERT | authenticated |
| ads-images | Staff update ads-images | UPDATE | authenticated |
| ads-images | Staff delete ads-images | DELETE | authenticated |
| inventory-images | Public read inventory-images | SELECT | public |
| inventory-images | Staff upload inventory-images | INSERT | authenticated |
| inventory-images | Staff update inventory-images | UPDATE | authenticated |
| inventory-images | Staff delete inventory-images | DELETE | authenticated |
| category-covers | Public read category-covers | SELECT | public |
| category-covers | Staff upload category-covers | INSERT | authenticated |
| category-covers | Staff update category-covers | UPDATE | authenticated |
| category-covers | Staff delete category-covers | DELETE | authenticated |

Bodies (USING/WITH CHECK) are byte-for-byte the authored definitions from `00015` (ads-images), `00019` (inventory-images, incl. object-path containment), `00050` (category-covers). `storage.objects` policy count on both hardened resets: **12** (was **0** after a bare baseline). No policy invented, no RLS weakened, no grant broadened.

---

## 4. EXACT CARRY-FORWARD SEED CONTENTS / COUNTS

Verbatim transcription of the authored seed statements (idempotent):

- **Categories (00050) — 17 rows total:** 5 roots (`phones`, `fresh-market`, `groceries`, `desserts`, `games`) + 12 children (`smartphones`, `accessories`, `vegetables`, `fruits`, `meat-poultry`, `bakery`, `dairy-eggs`, `pantry-staples`, `cakes`, `ice-cream`, `brain-games`, `tic-tac-toe`), children parented via `(SELECT id … WHERE slug=…)`. `ON CONFLICT (slug) DO NOTHING`.
- **Delivery zones (00050) — 3 rows:** `City Center`, `Suburbs`, `Outskirts`.
- **Delivery fees (00050) — 3 rows:** one per zone, `fee = 350.00`, `delivery_minutes 30–45`. `WHERE NOT EXISTS` guard.
- **app_settings (00059/00060/00063) — 33 keys:** 17 game/offers/inventory/rules/cache defaults + 3 `telemetry.*` (max_batch=10, flush_ms=5000, max_buffer=50) + 13 A-class keys (`commerce.currencies`, `comm.*`, `marketplace.*`, `ads.*`, `experience.*`). All `value` = `jsonb_build_object('value', <int>)`, `ON CONFLICT (key) DO NOTHING` (preserves any admin override).

Post-checks inside the artifact verify every slug/zone/key present and the City Center fee = 350.00. Result on both hardened resets: `categories=17, delivery_zones=3, delivery_fees=3, app_settings=33`, and the pilot's `category_products` binding now produces **5 links** (was 0 without carry-forward).

---

## 5. TWO INDEPENDENT RESET RESULTS

Two targets (`hardening_reset_a`, `hardening_reset_b`) created from zero (DROP → CREATE → `search_path=public, extensions` → scaffold) and pushed with the identical 6-file chain. Both results, byte-identical:

| Check | Reset A | Reset B |
|---|---|---|
| Migrations applied | 00000→00067 (6) | 6, same |
| neighborhoods / stores | 1 / 1 | 1 / 1 |
| family_groups / neighborhood_families | 5 / 5 | 5 / 5 |
| pilot inventory_items / store_inventory | 5 / 5 | 5 / 5 |
| category_products | 5 | 5 |
| storage buckets | ads-images, category-covers, inventory-images | same |
| storage.objects policies | 12 | 12 |
| categories / zones / fees / app_settings | 17 / 3 / 3 / 33 | 17 / 3 / 3 / 33 |
| RLS enabled (8 core+pilot tables) | true ×8 | true ×8 |
| anon grants on pilot tables | SELECT only (no DML) | SELECT only |
| `idx_inventory_items_sku` | unique, on (model_id,variant,condition,color) | identical |
| `pilot_reset()` present | 1 | 1 |
| Object fingerprint (345 lines incl. bodies/policies) | identical to reset B (diff empty) | identical to reset A |

Fingerprint diff **A vs B = empty** → the build is fully reproducible run-to-run.

---

## 6. SCHEMA / OBJECT / POLICY / GRANT DIFF

Full object fingerprint (tables, views+def npf, functions md5(prosrc, LF-normalized), policies incl. qual/with_check md5, indexes, triggers, sequences, RLS) — **prod_sim (pre-pilot) vs hardened target**:

- **Added (all intended):** +5 tables (`neighborhoods`, `stores`, `family_groups`, `neighborhood_families`, `store_inventory`), +16 functions (`fn_admin_uid` + 15 `pilot_*`), +11 public RLS policies (pilot tables), +12 storage policies (companion), +1 unique index `idx_inventory_items_sku`, +pilot indexes/PKs for the new tables.
- **Modified (all intended, authored by `00067`):** bodies of `record_telemetry_event` (9 domain arms + 9 allowlist arms), `delivery_create_order` (store/neighborhood resolution, `MULTI_STORE_ORDER` guard, `store_id`/`neighborhood_id` header + response keys), `get_telemetry_analytics` (domain whitelist adds `neighborhood`/`order` + the 9 pilot event names).
- **Nothing dropped, nothing else altered.** The only earlier full-tree differences were CRLF artifacts from the simulation pipeline; after LF-normalization every non-pilot function/view/trigger/index matches the pre-pilot baseline exactly.

**RLS / grant invariants:** pilot tables + `orders` + `telemetry_events` + `inventory_items` all `relrowsecurity = t`; `anon` holds **SELECT-only** on every pilot table (no INSERT/UPDATE/DELETE); no `PUBLIC`/`authenticated` DML grants were introduced on pilot tables beyond the authored policies.

---

## 7. TELEMETRY REGISTRY PARITY (role of 00067)

For each of the 9 pilot events the repaired `record_telemetry_event` contains **exactly 1 domain WHEN-arm and exactly 1 allowlist WHEN-arm** (verified via `regexp_count` on `prosrc`):

```
event                | domain_when | allowlist_when
checkout_start       |     1      |      1
checkout_submit      |     1      |      1
family_view          |     1      |      1
neighborhood_view    |     1      |      1
order_completed      |     1      |      1
order_created        |     1      |      1
order_failed         |     1      |      1
order_status_changed |     1      |      1
store_view           |     1      |      1
```

The allowlist VALUES are the authored ones (empty allowlist for view/order_completed events; `items_count`/`with_delivery`/`channel`/`error_code`/`status` where authored). The known-events registry array includes the 9 names. Phase 8 and earlier branches are untouched.

---

## 8. TEST / BUILD / LINT SUITE

| Suite | Result |
|---|---|
| `pnpm typecheck` | **PASS** (clean) |
| `pnpm test` (vitest run) | **PASS** — 279 files, **3,441/3,441 tests passed** (97.6s) |
| `pnpm build` (tsc -b + vite build) | **PASS** — built in 4.95s |
| `pnpm lint` (eslint src/) | **7 errors / 8,035 warnings** — ALL pre-existing and **unrelated to this change**: the 7 errors originate in `src/components/shared/ErrorBoundary.tsx` (unmodified, no git diff) and the warnings are design-system token-style advisories. No lint issue references `supabase/`.

---

## 9. REMAINING LIMITATIONS

1. **Simulation fidelity.** Proof runs on a local PostgreSQL 18.4 cluster, not the hosted Supabase managed stack. Auth tokens (`auth.uid()`), storage push/download, and Realtime are structurally stubbed; runtime behavior parity is not claimed.
2. **No live pull executed in this cycle.** The baseline is a faithful schema-only dump of the locally reconstructed post-52 state. A real `db pull` at deployment time may surface version-specific dump artifacts (e.g., `\restrict` meta-lines, which were reproduced and handled here).
3. **Docker unavailable.** Official `db reset`/`db pull` container semantics could not be exercised; CLI `db push --db-url` was used on local targets instead and matches the intended `schema_migrations` mechanics.
4. **Deployment is a separate act.** This cycle proves the artifact set and its gates; the actual push to production remains a distinct, owner-authorized operation.
5. **Lint baseline.** The repository already carries 7 lint errors in `ErrorBoundary.tsx` and a large warning backlog; this hardening change introduces none.

---

## 10. GATE RESULT

| Gate | Result |
|---|---|
| Baseline applies cleanly (×2) | PASS |
| Storage companion applies + restores 12 policies | PASS |
| Seed carry-forward applies + all counts | PASS |
| 00065 applies | PASS |
| 00066 (repaired) applies | PASS |
| 00067 (repaired) compiles + applies | PASS |
| Exact order + exact schema_migrations | PASS |
| Two independent resets identical | PASS |
| Pilot counts + pre-pilot seed counts | PASS |
| Storage policy parity (12) | PASS |
| RLS/policy/grant invariants | PASS |
| Telemetry registry parity | PASS |
| No unintended object changes | PASS |
| Hypothetical 00068 → exactly one pending | PASS |
| typecheck / tests / build | PASS |
| lint | PASS* (pre-existing ErrorBoundary errors only) |

---

## 11. VERDICT

> **PRODUCTION GO** — the hardened Option A artifact set passes every gate of this local pre-production proof.

Contingencies attached to the GO (non-negotiable):
1. The deployment operation itself (a real `db pull` + controlled `db push` of exactly the §2 order) is executed only upon the owner's explicit authorization — it was **not** performed here.
2. The artifacts pushed must be exactly the files listed in §1 (repaired `00066`, repaired `00067`, `storage-policies`, `pre-pilot-seeds`).
3. Any discrepancy between the real pulled baseline and the local simulation must re-run this gate procedure before the push is approved.

**Re-affirmation:** at the time this report was produced, **no write of any kind had been executed against the production database.**