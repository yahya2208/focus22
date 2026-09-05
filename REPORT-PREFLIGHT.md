# PRODUCTION PREFLIGHT REPORT — READ-ONLY

Date: 2026-09-05 · Project ref: `fmggysdqigtejxbfpgtg` (host `fmggysdqigtejxbfpgtg.supabase.co`) · Target DB: `postgres` via Supabase IPv4 pooler `aws-0-eu-west-1.pooler.supabase.com:5432` (PG **17.6**, SSL on).

> **Nothing in this report was executed as a write.** All captures were read-only: `SELECT` over `pg_catalog`/`pg_proc`/`pg_policies`/`pg_index`/`storage.*`/`app_settings` etc. via the existing read-only `dbq.cjs` helper (password read only from the temp pw file). No `db pull`, `db push`, `migration repair`, `db reset`, DDL, or DML was run against production. The CLI was never invoked against the remote.

---

## 1. LINKED PROJECT & TARGET — VERIFIED (no ambiguity)

- `VITE_SUPABASE_PROJECT_ID` = `fmggysdqigtejxbfpgtg`; URL host = `fmggysdqigtejxbfpgtg.supabase.co`.
- Live connection identity probe: `current_database()=postgres`, `current_user=postgres`, `server_version_num=170006` (PG 17.6), `ssl=on`, `inet_server_addr` ∈ eu-west pooler space, `information_schema.schemata` = 67 (Supabase platform footprint).
- Pooler user `postgres.fmggysdqigtejxbfpgtg` matches the project ref → target is unambiguous. **PASS.**

## 2. MIGRATION HISTORY — **NOT FOUND (STOP)**

- `SELECT` shows **no `supabase_migrations` schema** (`count(*)` over `pg_namespace` = 0) and **no `supabase_migrations.schema_migrations`** (0). Only `auth.schema_migrations`, `realtime.schema_migrations`, and `storage.migrations` exist — the Supabase-internal tables, not a CLI migration ledger.
- **Consequence:** the CLI's history model that the six-file set (00000→00067) presupposes **does not exist on the live database**. Live was evidently built by a different (non-CLI, manually/semi-manually applied) lineage. A real `db push` against this project would create the history table from scratch and treat every repo file as pending — it cannot reconcile with "52 applied / 14 absent" which was a *repository-lineage* model, not a live record.
- This is an **unexpected migration history** → ABSOLUTE STOP CONDITION TRIGGERED.

## 3. MIGRATION TARGET SET — SIX FILES EXACT **LOCALLY**, NOT EXECUTABLE ON LIVE (STOP)

- The hardened local project (`cli-proof/supabase/migrations/`) contains **exactly these six files**, in this order, sha-verified byte-identical to the repo:
  - `00000_baseline.sql` = full public-schema **recreate** (`baseline_clean.sql` lineage)
  - `00001_storage_policies.sql` = hardening companion
  - `00002_pre_pilot_seed_carry_forward.sql` = hardening companion
  - `00065_neighborhood_store_pilot.sql`
  - `00066_pilot_seed.sql` (repaired)
  - `00067_telemetry_pilot_events.sql` (repaired)
- Local dry-run proof: exactly these six pending, in order; 00068 hypothetical → exactly one extra; post-push → nothing pending. **PASS for the artifact definition.**
- **On the live project:** `00000_baseline.sql` is a full `CREATE SCHEMA`/`CREATE TABLE …` recreate proven on an *empty* target. Live is **not empty** (all tables, 69 `inventory_items`, storage, RLS, data present). Applying `00000` to live would attempt to re-create objects that already exist → conflict. The six-file set, as written, is **only applicable to a fresh/empty target**. Therefore the approved target set is not executable against the existing linked database → **STOP** ("any migration outside the approved six-file set" / unexecutable set).

## 4. REPAIRED 00066 / 00067 — EXACT FILES PROVEN LOCALLY (PASS)

sha256 (repo file == copy pushed in the double-reset proofs):

| File | sha256 |
|---|---|
| `migrations/00065_neighborhood_store_pilot.sql` | `e250ddfe8165613552a04738d2acfdea7ad163203544d1694c44d9a9e50f4f65` |
| `migrations/00066_pilot_seed.sql` | `0b8e0b9edbfd11aa5dbfc1db325940dc619e122ab7828e2e8f12c04e17ccc0b5` |
| `migrations/00067_telemetry_pilot_events.sql` | `1fdbefeebe4e0f4581eec92fb693d440f84190aa56787729a154bc29f846818e` |
| `hardening/storage-policies.sql` | `8fbc67ed88eaf3806c83235d0289c82549abd7ce87e33d1b1a1517f1c9bcb0b2` |
| `hardening/pre-pilot-seeds.sql` | `6c8a873cf18abff9cedb69c0ca7ad5d8711e0ecc3002318cd06337cee300c06d` |

**PASS** — the repaired 00066/00067 are the exact artifacts proven in the double-reset.

## 5. REQUIRED DEPENDENCIES — PRESENT (PASS/partial)

- Tables (all exist, all `relrowsecurity = true`): `inventory_items`, `categories`, `category_products`, `delivery_zones`, `delivery_fees`, `orders`, `order_items`, `telemetry_events`, `app_settings`. **PASS.**
- Required RPCs present, SECURITY DEFINER, signature-matched: `record_telemetry_event(jsonb)`, `delivery_create_order(jsonb,jsonb)`, `delivery_estimate(uuid,numeric)`, `get_telemetry_analytics(...)`, `get_settings()`, `category_products_for_category(uuid)`. **PASS.**
- Storage: buckets = `ads-images, category-covers, inventory-images` (3). `storage.objects` policies = **12**, names/commands/roles match the hardened target exactly (Public read ×3 → `public`; Staff upload/update/delete ×9 → `authenticated`). **PASS (storage-policy parity).**
- Pilot objects (`neighborhoods`, `stores`, `family_groups`, `neighborhood_families`, `store_inventory`, `fn_admin_uid`, `pilot_*`): **absent** on live → confirms 00065–00067 never applied. **Expected.**

## 6. SEEDS / DATA ASSUMPTIONS — MISMATCHES (STOP)

| Check | Live | Proven base (local) | Verdict |
|---|---|---|---|
| `categories` | 17 | 17 | ✓ |
| `delivery_zones` | 3 | 3 | ✓ |
| `delivery_fees` | 3 | 3 | ✓ |
| `app_settings` | **38** | 33 carried | **MISMATCH** |
| `category_products` | 0 (pre-pilot) | 0 → 5 after pilot | ✓ |
| `inventory_items` | **69** (real data) | 0 → +5 pilot | data-present, idempotent |

- `app_settings=38` vs 33 carried: the 5 extras are `ads.internal_allowlist`, `ads.placements`, `catalog.admin_page_size`, `catalog.search_result_limit`, `inventory.max_images` — authored in `00064_admin_control_center_pass2`. Live has these settings **but lacks 00064's `audit_logs` table and `record_admin_action`/`get_admin_audit_trail` RPCs** → live is in a **partial/divergent 00064 state** not reproducible by any clean migration chain. **Seed/data assumption mismatch → STOP.**

## 7. SCHEMA DIFF — LIVE vs PROVEN OPTION A BASE (STOP)

Whitespace-normalized canonical fingerprint over public schema (tables by columns, views by def, functions by `md5(regexp_replace(prosrc,'\s','','g'))`, policies incl. roles+qual+with_check, indexes by `pg_get_indexdef`):

- Live entries: **441** · Proven A entries: **315**
- **Exact matches: 198**
- **Semantic drift (non-pilot): 57** = 39 functions + 14 tables (+ `orders` which differs only by the pilot columns `store_id/neighborhood_id/user_id` → expected) + 1 view (`v_public_listings`) + 2 catalog pkey index defs.
- **Live-only objects: 183** (present on live, absent from the proven base) — dominated by `catalog_*`, `challenge_*`, `qr_codes/placements/sessions` extensions, `admin_*`/security helpers.
- **A-side-only fingerprints: 15** = 12 pilot artifacts (`idx_inventory_items_sku`, `idx_orders_neighbor/store/user`, pilot tables + family/store policies) + 3 `users` RLS policies (live instead carries `Users read own profile`, `Admins update user roles`, `Researchers read all users`).

Notable table-level evidence:

| Table | Live | Proven base | Nature |
|---|---|---|---|
| `campaigns` | 34 cols (venue, materials, timeline, qr_config, state/city… ) | 11 cols (owner, short_code, …) | live far richer |
| `sessions` | 16 cols (calibration_id, plugin_id, measurements, scientific_results, metadata, finished_at, version …) | 8 cols | live = scientific-version |
| `ads` | 14 cols (+`title`, −`device_id`) | 13 cols (`device_id`, no `title`) | divergent |
| `users` | 11 cols (+`referral_code`) | 10 cols (no `referral_code`) | divergent |
| `catalog_brands` | `id,slug,display_name,aliases,created_at` | `slug,display_name,name,aliases,created_at` | different schema |
| `orders` | pre-pilot 13 cols | same 13 + 3 pilot cols | expected pilot-only |

**Interpretation:** live was built by a **different lineage** than the repo migration set — it is simultaneously *ahead* of the repo (campaigns/sessions/ads/catalog/QR/challenge/admin feature sets, 183 extra objects) and *behind* it (`record_telemetry_event` lacks the Phase-8 arms that the repo base carries; see §8). The locally proven base is **not a faithful representation of live**. **Any push whose baseline derives from the local sim would NOT reproduce production.** → **STOP** ("any unexpected production schema difference").

## 8. THE THREE BODIES 00065/00067 OVERWRITE — 1 OF 3 MISMATCH (STOP)

Direct fetch of live `prosrc` vs the proven pre-pilot base, whitespace-normalized:

| Function | LIVE == base | Detail |
|---|---|---|
| `delivery_create_order(jsonb,jsonb)` | **EQUAL** | ✓ 00067's overwrite-base assumption holds |
| `get_telemetry_analytics(...)` | **EQUAL** | ✓ holds |
| `record_telemetry_event(jsonb)` | **DIFFERS** | live lacks `game_result_view`, `round_complete_victory`, `round_complete_draw`, `scientific_session_complete` (Phase-8 arms that the repo/base version includes); live is ~1 238 ws-chars shorter |

Applying 00067 as written would `CREATE OR REPLACE` live's `record_telemetry_event` with the base-derived body, **silently injecting the Phase-8 arms into live** — a behavioral expansion beyond the pilot. That is an assumption mismatch on a function the pilot directly extends. → **STOP.**

## 9. COMPLIANCE NOTE

- `db push --dry-run` was **not** run against production (per instructions). Target-set verification was done locally on the exact artifact project (`cli-proof`), plus read-only live inspection as above.
- No file outside §1–§4 was authored; this report is the only new artifact.

## 10. GATE RESULT

| Preflight check | Result |
|---|---|
| Linked project / target identity | PASS |
| Repaired 00066/00067 = proven files | PASS |
| Dependency tables + RLS | PASS |
| Required RPCs present | PASS |
| Storage bucket/policy parity (12) | PASS |
| Pilot objects absent (00065–67 unapplied) | PASS |
| Migration history present (CLI ledger) | **FAIL** |
| Target six-file set executable on live | **FAIL** |
| app_settings / seed parity | **FAIL** (33 vs 38; partial-00064 live state) |
| Schema equivalence with proven base (non-pilot) | **FAIL** (56 drift + 183 live-only) |
| record_telemetry_event base assumption | **FAIL** (missing Phase-8 arms) |

## 11. VERDICT

> ## **BLOCKED**

The live project `fmggysdqigtejxbfpgtg` cannot accept the proven six-file Option A set as-is. Absolute stop conditions are triggered by: **(a) an unexpected migration-history model** (no `supabase_migrations.schema_migrations` on live), **(b) unexpected production schema differences** (56 semantic drifts + 183 live-only objects + divergent `users` RLS), **(c) a seed/data assumption mismatch** (`app_settings` 33 vs 38, partial-00064 state, live inventory data), **(d) an unexecutable target set** (full-schema baseline recreate on a non-empty DB), and **(e) a `record_telemetry_event` base mismatch** (Phase-8 arms would be silently injected).

### What un-blocks (GO prerequisites, none executed, none authorized here)
1. Capture the **real** read-only live baseline (`pg_dump --schema-only` of the live project per the approved procedure) and rebuild `00000_baseline.sql` from **it** — not from the local simulation.
2. Re-validate 00065/00066/00067 (sha-identity preserved) against that live-derived baseline on a disposable replay before any push.
3. Resolve the live/app `record_telemetry_event` divergence explicitly (Phase-8 arms) with an owner decision.
4. Decide and document **which database the push addresses**: the existing live project (only a *trio* 00065–67 delta, not the six-file set) or a **new/empty** target project (the six-file set).
5. Re-run this preflight on the chosen target and on the live-derived baseline after (1)–(4).

**No production write of any kind was performed.**