# NEIGHBORHOOD PILOT — FINAL REPORT

**Scope:** Neighborhood Pilot Epic — 1 Neighborhood + 1 Store + 5 Families on the canonical FOCUS architecture
**Status:** READY for the SQL gates (structural proofs green; no live-DB deployment performed here)
**Date:** 2026-09-05

---

## 1. Executive summary

The Neighborhood Pilot delivers a complete browse → cart → checkout → real DB order →
delivery → completion journey **without creating a parallel system**. It reuses the
canonical catalog, order, delivery, auth and telemetry contracts, and only *adds* a
thin neighborhood/store/family dimension plus the store-operator service layer:

- **Ordering is canonical**: `delivery_create_order` is extended *additively* (same
  signature/return/legacy behavior) to resolve the owning store + neighborhood
  server-side, capture `user_id`, and reject multi-store baskets (`MULTI_STORE_ORDER`).
  Prices are always server-authoritative. Legacy orders (no store) are null-safe.
- **Security is server-side**: every new RPC is `SECURITY DEFINER` with fixed
  `search_path`; public clients get SELECT-only via RLS; all writes require
  `public.fn_admin_uid()` (admin/super_admin) or `operator_user_id == auth.uid()`.
- **Telemetry is closed-registry**: 9 new events + 2 new domains added through two
  additive migrations following the established 00057/00061 pattern; the off-line
  contract gate ensures client ⇄ server allowlist parity.
- **Deterministic seed + guarded reset**: `pilot_reset()` deletes only `pilot-*` /
  `pilot:` marked rows; the seed is idempotent and re-runnable, so
  reset → re-seed → replay is fully deterministic.

## 2. Before / after architecture

| Dimension | Before | After (Pilot) |
|---|---|---|
| Catalog | `inventory_items` + `v_public_listings` + `category_products` | unchanged; `pilot_store_products` filters the SAME canonical rows (published, in-stock, qty>0) |
| Orders | `orders`/`order_items`, `delivery_create_order` (00052) | additive columns `store_id`/`neighborhood_id`/`user_id`; extended `delivery_create_order` |
| Delivery | `delivery_zones`/`delivery_fees` + `delivery_estimate` | unchanged |
| Telemetry | closed registry (00057/00061) | + `neighborhood`/`order` domains, 9 events (00067) |
| Admin | `fn_admin_uid()` gate (00063/00064 pattern) | reused for pilot admin RPCs + `catalog/write` route gate |
| Auth | `signInAsGuest()` | guests created at submission only (P3) |

No frozen mig place inside `ROLE_PERMISSIONS`, `ROLE_CAPABILITY_MAP`, `runtime-settings`
contracts, marketplace security boundaries, or games were touched.

## 3. Migrations

### `supabase/migrations/00065_neighborhood_store_pilot.sql`
Domain tables (all `IF NOT EXISTS`, all RLS-enabled, SELECT-only grants to
anon/authenticated):
- `neighborhoods`, `stores` (FK → neighborhoods), `family_groups` — filterable personae
- `neighborhood_families` (join), `store_inventory` (join store ↔ canonical `inventory_items`)
- orders: `ADD COLUMN IF NOT EXISTS store_id / neighborhood_id / user_id` (FKs, `ON DELETE SET NULL`)
- RLS policies: public read `status='active'`; admin manage via `public.fn_admin_uid()`
  (`USING` + `WITH CHECK`)
- `delivery_create_order(p_customer jsonb, p_items jsonb)` — additive REPLACE:
  same contract, same return shape, same legacy error codes
  (`CUSTOMER_INFO_REQUIRED`, `ZONE_NOT_ACTIVE`, `ITEMS_REQUIRED`, `ITEM_NOT_FOUND`,
  `ITEM_NOT_ORDERABLE`), plus new `MULTI_STORE_ORDER`; resolves
  `store_id`/`neighborhood_id`/`user_id` server-side
- Storefront RPCs (anon+granted): `pilot_active_neighborhoods`, `pilot_active_stores`,
  `pilot_store_products`, `pilot_neighborhood_families`
- Admin RPCs (admin-only, `fn_admin_uid()` re-checked in-body):
  `pilot_admin_upsert_neighborhood`, `pilot_admin_upsert_store`,
  `pilot_admin_set_store_inventory`, `pilot_admin_upsert_family`,
  `pilot_admin_link_family`, `pilot_admin_list_neighborhoods/stores/families`,
  `pilot_admin_require`
- Store-operator RPCs (authenticated-only, owner-or-admin):
  `pilot_orders_for_store`, `pilot_order_set_status` (closed status vocabulary:
  pending → confirmed → preparing → out_for_delivery → delivered | cancelled)
- `pilot_reset()` (admin-only): deletes ONLY `pilot-*` slugs / `pilot:` source_keys
  and orders belonging to pilot stores; no TRUNCATE, no blanket deletes
- Post-check DO blocks fail loudly if tables/columns/RPCs are missing

### `supabase/migrations/00066_pilot_seed.sql`
Idempotent (guarded `WHERE NOT EXISTS` + `ON CONFLICT DO NOTHING`): 1 neighborhood,
1 store, 5 families, 5 canonical `inventory_items` (`source_key pilot:*`),
`store_inventory` links, linkage to the first ACTIVE category if present,
and a post-check verifying the 5 families + store exist.

### `supabase/migrations/00067_telemetry_pilot_events.sql`
Additive re-creates (00061 precedent):
- `record_telemetry_event` with 9 new event→domain branches + 9 event→property
  allowlists (all existing branches byte-identical to 00061)
- `get_telemetry_analytics` registry extended: `v_dom_ok` gains
  `'neighborhood'`, `'order'`; `v_ev_ok` gains the 9 pilot event names
- NO DROP, NO table/index/RBAC change; rollback = re-CREATE from 00057/00061

## 4. Models

No new *systems* — only an additive dimension:
- `Neighborhood ⇄ Store ⇄ inventory_items` via `store_inventory(store_id, inventory_id)`
- `Neighborhood ⇄ FamilyGroup` via `neighborhood_families`
- `orders.store_id / neighborhood_id / user_id` FKs with `ON DELETE SET NULL`
  (legacy orders remain null and behave byte-identically)

## 5. Telemetry events (client + server registered)

| Event | Domain | When |
|---|---|---|
| `neighborhood_view` | neighborhood | storefront auto-selects first active neighborhood |
| `store_view` | neighborhood | store selected in storefront |
| `family_view` | neighborhood | families loaded for the neighborhood |
| `checkout_start` | order | checkout screen opens |
| `checkout_submit` | order | order submission begins (after guest gate) |
| `order_created` | order | canonical RPC succeeds (channel `pilot_order`) |
| `order_failed` | order | submission throws (classified `error_code`) |
| `order_status_changed` | order | store operator moves an order |
| `order_completed` | order | status set to `delivered` |

Privacy: no PII properties; allowlists verified equal client/server by the off-line gate.

## 6. Admin

- **Routes**: Home → Settings → “Neighborhood Pilot Storefront” and “Pilot Ops (admin)”.
- **Screen**: `PilotOpsAdminScreen`, mounted only under
  `<ProtectedRoute requiredResource="catalog" requiredAction="write">`
  (reuses existing admin role caps — no `ROLE_PERMISSIONS` change).
- **Capabilities**: list neighborhoods/stores, upsert led by admin RPCs,
  assign `store_inventory`, manage families + links, per-store order status
  progression (terminal `delivered` fires `order_completed`), deterministic reset.
- Store operators use the two operator RPCs (authenticated, owner-or-admin).

## 7. Replay, security and failure results

All three pilot suites pass (54 tests). Highlights:
- **Security gate** — RLS enabled per table; public gets SELECT-only; every
  `FOR ALL TO authenticated` policy includes `USING`+`WITH CHECK fn_admin_uid()`;
  operator RPCs are authenticated-only and check `operator_user_id = auth.uid()`;
  `pilot_reset` requires admin.
- **Failure gate** — `classifySubmissionError` maps server codes
  (`UNAUTHENTICATED → NEEDS_AUTHENTICATION`, `ITEM_NOT_FOUND → ITEMS_NOT_FOUND`,
  `MULTI_STORE_ORDER`, `ZONE_NOT_ACTIVE`, …) with `SERVER_ERROR` fallback;
  empty baskets are rejected before transport; failures emit `order_failed`.
- **Replay gate** — every seeded `pilot-` slug / `pilot:` source_key matches the
  reset predicates; seed inserts are guard-rerunnable.
- **Scale gate** — no numeric special-casing in the model; unique-slag constraints
  permit Neighborhood #2 / Store #2 / Family #6 as pure data; `store_inventory` is
  store-generic so Store #2 reuses canonical inventory.

## 8. Reset procedure (deterministic replay)

1. Admin calls `pilot_reset()` (or re-runs it any time).
2. Re-run `00066_pilot_seed.sql` (fully idempotent).
3. Optional repeat run of the same seed yields identical state.

## 9. Test / build / lint

- **TypeScript**: `tsc --noEmit` exits 0.
- **Full vitest suite (chunked runs)**: 281 files / 3454 tests — all green.
  (Caveat below re: monolithic run.)
- **Pilot suites**: `pilot-migration-gate`, `pilot-services`, `pilot-security-scale` — 54 tests green.
- **Telemetry gate**: 00057/00061/00067 client ⇄ server contract parity — green.
- **ESLint** on all changed files: 0 errors (152 existing design-system style warnings in the new screens — informational only).
- **DB gates**: structural verification via the migration-gate suites; a live
  `supabase db reset`/RLS smoke run was NOT executed in this environment (no
  connected project/credentials).

## 10. Files changed (pilot scope)

New: `supabase/migrations/00065_neighborhood_store_pilot.sql`,
`supabase/migrations/00066_pilot_seed.sql`,
`supabase/migrations/00067_telemetry_pilot_events.sql`,
`src/services/neighborhood-service.ts`, `src/services/order-service.ts`,
`src/screens/pilot/{PilotStorefrontScreen,PilotCheckoutScreen,PilotOpsAdminScreen}.tsx`,
`src/__tests__/pilot/{pilot-migration-gate,pilot-services,pilot-security-scale}.test.ts`.

Modified: `src/core/telemetry/{types,events}.ts` (closed registry union additions),
`src/core/navigation/{back-matrix,reachability}.ts`, `src/store/navigation.tsx`,
`src/App.tsx`, `src/screens/settings/SettingsScreen.tsx`,
`src/i18n/translations/{en,ar,fr,tr}.ts`,
`src/__tests__/navigation/back-matrix.test.ts` (56 entries),
`src/__tests__/telemetry/migration.test.ts` (contract now spans 00057+00061+00067).

## 11. Limitations / notes

- **Guests**: created only at order submission (`signInAsGuest()`), per P3; browsing
  never fabricates accounts. Live submit requires an authenticated/anonymous session.
- **Seed users**: the seeded operator is `NULL` (admins only); assigning an operator
  requires an existing auth user id.
- **Inventory images**: not broadly publicly readable under existing RLS; the storefront
  shows text products only — unchanged from the legacy catalog posture.
- **Analytics summaries**: per-domain analytic blocks for the new domains aren’t added;
  generic filtered/aggregate queries work because `v_dom_ok`/`v_ev_ok` were extended.
- **`ensureOrderSession`** is exported and used by the P3 gate; direct callers are
  the UI gate, while `submitPilotOrder` relies on the server’s `UNAUTHENTICATED`
  mapping — a small future cleanup could unify the two paths.
- **Test environment**: `vitest run` (single fork) OOM-crashes under Node v24.18 on
  Windows during transform of the largest graphs (reproduces on untouched suites).
  Verified green by running suites in chunks with
  `NODE_OPTIONS=--max-old-space-size=4096`.

## 12. Verdict

**READY (structural). External validation STOPPED at the auth boundary — NOT PROVEN.**

All code-level gates pass (types, lint, full chunked suite, telemetry parity,
migration/security/replay/scale structural proofs).

## 13. External validation (2026-09-05) — result: BLOCKED (deployment deferred to owner)

Attempted live validation against the linked remote project
`focus` (`fmggysdqigtejxbfpgtg`, West EU) with Supabase CLI v2.30.4.
**No production write was performed at any point in this session.**

**Verified live, read-only (public anon key + direct Postgres, superuser role):**
- `delivery_create_order` as anon → `UNAUTHENTICATED` (canonical server gate live ✓).
- `telemetry_events` as anon → `permission denied` (telemetry RLS live ✓);
  `orders` as anon → empty (no leak ✓). RLS enabled on both (`relrowsecurity=true`).
- `pilot_active_neighborhoods` does **not** exist ("Could not find the function … in the
  schema cache") and `public.neighborhoods` does **not** exist — pilot not deployed ✓ reported.
- Postgres password provided by the owner **authenticated successfully** (the former
  28P01 blocker is resolved).

**New finding that supersedes the old 'only 00064–00067 are pending' assumption:**
- `supabase_migrations.schema_migrations` does **not exist** in the remote (history table
  was never created). Consequently `supabase db push --dry-run` lists **all 69 local files**
  (00001–00067 + legacy `003`/`004`) as "would push" — a blank `db push` would replay the
  whole chain onto the manually-built live DB. That is unsafe without a baseline decision.
- The owner therefore directed **STOP: no `migration repair`, no baseline, no `db push`,
  no replay**, pending a read-only reconciliation (§13.1) and an explicit deployment decision.

**Required to resume (no code changes needed):**
1. Owner decision on the baseline strategy in §13.1 (targeted vs replay vs none).
2. Either targeted baseline of the verified-applied versions then `db push` (applies
   exactly 00065+00066+00067), or owner-approved replay, or explicit skip.
3. Re-run the read-only pilot RPC/table checks, then the authenticated smoke.

Per the validation rule, nothing was masked with fallback changes: the verdict stays
**READY** and will be upgraded to **PROVEN / READY FOR SCALE** only after the steps
above succeed. Pilot verdict: **READY / NOT PROVEN — deployment BLOCKED (owner decision).**

---

### §13.1 Migration-state reconciliation (READ-ONLY — 2026-09-05, no production write)

Method: direct Postgres (read-only, table-owner role) via a local `pg` client + the CLI.
For each local migration, `history status` = recorded in remote `schema_migrations`
(**NONE — table absent for all**); `expected objects` = first meaningful object the file
creates (parsed); `actual` = live `to_regclass`/`pg_proc`/`pg_policies`/
`information_schema.columns` presence; pilot-relevant dependencies cross-checked live.

| Migr. | History | Expected objects | Actual (live) | Dependency status (pilot) |
|---|---|---|---|---|
| 00001 | none | `repair_requests` | ABSENT | independent (legacy repair) |
| 00002 | none | `users` | PRESENT | required — 00065 operator ref |
| 00003 | none | `sessions.last_activity_at` | ABSENT (sessions missing) | independent |
| 00004 | none | idx on `analytics_events`/`sessions` | ABSENT (tables absent) | independent (index-only) |
| 00005 | none | `repair_requests.condition` | ABSENT | independent |
| 00006 | none | `repair_status_history` | ABSENT | independent |
| 00007 | none | `lookup_campaign_by_short_code` | PRESENT | independent |
| 00008 | none | `definitions` | ABSENT | independent (contract glue) |
| 00009 | none | `system_settings` | ABSENT (superseded by `app_settings` 00059) | independent |
| 00010 | none | `campaigns.abandon_timeout_minutes` | ABSENT | independent |
| 00011 | none | `lookup_campaign_by_short_code_v2` | ABSENT (v1 name 00007/00042 live) | independent |
| 00012 | none | campaigns status/campaign_version backfill | INERT (contract cols absent; UPDATE is idempotent) | independent |
| 00013 | none | (documentation-only) | N/A | independent |
| 00014 | none | `inventory_items` | PRESENT | required — 00065 `store_inventory` FK |
| 00015 | none | `ads` | PRESENT | independent |
| 00016 | none | `placements` | PRESENT | independent |
| 00017 | none | `qr_codes.placement_id` | PRESENT | independent |
| 00018 | none | `lookup_scan_context` | PRESENT | independent |
| 00019 | none | `inventory_items` (central restructure) | PRESENT (table; file's bucket/policy subset not individually confirmed) | required — inventory provider |
| 00020 | none | `ad_images` | PRESENT | independent |
| 00021 | none | `ad_add_image_devices` | PRESENT | independent |
| 00022 | none | `ads.destination_type` | PRESENT | independent |
| 00023 | none | constraint `ads_enabled_requires_link` | PRESENT | independent |
| 00024 | none | `ad_replace_images_destinations` | PRESENT | independent |
| 00025 | none | `catalog_approved_models_for_inventory` | PRESENT | independent |
| 00026 | none | `inventory_add_item` | PRESENT | independent |
| 00027 | none | `create_challenge_claim` | PRESENT | independent |
| 00028 | none | policy `Staff read all ad images` (ads_images) | ABSENT | independent (residual gap) |
| 00029 | none | `phone_view_counts` | PRESENT | independent |
| 00030 | none | `phone_search_events` | PRESENT | independent |
| 00031 | none | `get_phone_intelligence` | PRESENT | independent |
| 00032 | none | `record_search_selection` | PRESENT | independent |
| 00033 | none | `get_phone_intelligence` (recreate; joins v2) | PRESENT | independent |
| 00034 | none | `recover_my_challenge_state` | PRESENT | independent |
| 00035 | none | `inventory_items.category` | PRESENT | independent |
| 00036 | none | `car_details` | PRESENT | independent |
| 00037 | none | `v_public_listings` | PRESENT | required — listing view source |
| 00038 | none | `listing_car_payload` | PRESENT | independent |
| 00039 | none | `listing_my_listings` | PRESENT | independent |
| 00040 | none | `v_public_inventory` | PRESENT | independent |
| 00041 | none | `record_scientific_session` | PRESENT | independent |
| 00042 | none | `link_campaign_to_challenge` / v1 lookup | PRESENT | independent |
| 00043 | none | `admin_list_challenges` | PRESENT | independent |
| 00044 | none | `record_scientific_session` (device_id) | PRESENT | independent |
| 00045 | none | `record_scientific_session` (uuid fix) | PRESENT | independent |
| 00046 | none | `record_scientific_session` (fingerprint) | PRESENT | independent |
| 00047 | none | `record_tic_tac_toe_session` | PRESENT | independent |
| 00048 | none | `record_tic_tac_toe_session` (9x9 redesign) | INCONCLUSIVE (prosrc lacks `9x9` literal; 9x9 events believed live per prior closeouts) | independent |
| 00049 | none | `ttt_games` | PRESENT | independent |
| 00050 | none | `categories` / `orders` / `order_items` / `delivery_zones` / `delivery_fees` | PRESENT (all 5) | **required — 00065 alters `orders`; delivery order path** |
| 00051 | none | `category_products` | PRESENT | required — canonical product/family link |
| 00052 | none | `delivery_create_order` | PRESENT (proacl: anon+auth OK) | **required — core order RPC** |
| 00053 | none | `produce_details` | PRESENT | independent |
| 00054 | none | `listing_product_payload` | PRESENT | independent |
| 00055 | none | `categories_admin_create` | PRESENT | independent |
| 00056 | none | `create_listing_for_category` | PRESENT | independent |
| 00057 | none | `telemetry_events` | PRESENT (+RLS) | **required — telemetry write target** |
| 00058 | none | `get_telemetry_analytics` | PRESENT | independent |
| 00059 | none | `app_settings` | PRESENT | required — settings system |
| 00060 | none | `set_setting` (telemetry bounds) | PRESENT | independent |
| 00061 | none | `record_telemetry_event` (phase-8 events) | PRESENT | **required — 00067 extends it** |
| 00062 | none | ACL: anon EXECUTE removed on analytics | VERIFIED (anon EXECUTE = false) | independent |
| 00063 | none | `app_settings_changes` | PRESENT | required — admin audit |
| 00064 | none | `get_settings_audit` | PRESENT | **ALREADY DEPLOYED** (owner note confirmed) |
| 00065 | none | `neighborhoods`, `stores`, `family_groups`, `neighborhood_families`, `store_inventory`, `fn_admin_uid`, orders ADD `store_id`/`neighborhood_id`/`user_id` | **ABSENT** | **PILOT — all referenced dependency objects live ✓** |
| 00066 | none | seed INSERTs (guarded `ON CONFLICT DO NOTHING` / `IF NOT EXISTS`) | **NOT APPLIED** (target tables absent) | **PILOT — depends on 00065** |
| 00067 | none | `record_telemetry_event` + `neighborhood`/`order` domain+event registries | **NOT APPLIED** (prosrc lacks `neighborhood`/`order` markers) | **PILOT — depends on 00057/00061 + telemetry_events (all live)** |
| 003 | none | guarded idx `idx_sessions_last_activity` | ABSENT (sessions missing) | independent (legacy dup of 00003 topic) |
| 004 | none | guarded idx set on `analytics_events` | ABSENT (table absent) | independent (legacy dup of 00004 topic) |

**Why the history is divergent (established):**
- `schema_migrations` was never created in this project; production has been built
  **out-of-band** (SQL-Editor / owner-applied slices), which matches the repo's own
  architecture map ("the DB was built manually") and the closeout docs for 00057–00064
  ("applied via SQL Editor" / gate notes). Today's replica probes confirm every
  marketplace/telemetry/admin object (00050–00064) is present, including 00064's
  `get_settings_audit` and 00062's ACL — i.e. the recent chain WAS applied, but never
  recorded in migration history.
- The legacy pre-contract subsystems (repair / contract columns / `sessions` /
  `system_settings`, versions 00001–00013 plus 003/004 and the 00028 policy) were never
  part of the production build. They are **not** required by the Pilot.

**Is a proposed repair safe? (analysis only — nothing executed):**
- A **targeted baseline** (mark `applied` only the verified-present versions above, then
  `db push`) would apply exactly **00065 + 00066 + 00067**. All objects they reference
  are live (orders, delivery, inventory, listings, telemetry, settings, users). 00065 is
  fully guarded (`IF NOT EXISTS`/`CREATE OR REPLACE`), 00066 seed is `ON CONFLICT DO
  NOTHING`-protected, 00067 re-defines the RPC harmlessly and its grants are idempotent.
  Result stream = precisely the Pilot: **safe for the Pilot slice**.
- A **blanket baseline** (all 00001–00064 as applied) would *falsely* bless the absent
  legacy subsystems as deployed — not recommended without an explicit owner decision to
  either replay them (00001–00013/003/004/00028 would CREATE the legacy stack in
  production) or officially discontinue them as production scope.
- Residual unknowns to resolve before any baseline: 00019's bucket/policy sub-effects,
  00048's content marker (inconclusive), and the deliberately-skipped 00028 policy.
- **Decision deferred to the owner** (option 4 selected this session: no production write).
  Pilot verdict remains **READY / NOT PROVEN — deployment BLOCKED.**