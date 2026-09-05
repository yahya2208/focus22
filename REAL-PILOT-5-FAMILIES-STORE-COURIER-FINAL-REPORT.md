# REAL PILOT — 5 FAMILIES + 1 STORE + 1 COURIER — FINAL REPORT

**Project:** focus — Neighborhood Pilot storefront
**Environment:** Supabase production (`fmggysdqigtejxbfpgtg`, eu-west-1 pooler, db `postgres`)
**Sessions:** Deployment (00065/00066/00067) ✅ → REAL PILOT build-out + courier migration 00068 + full real-run
**Report date:** 2026-09-05

---
## 1. Executive summary

The REAL PILOT master task was executed end-to-end. The frontend audit (Phase 1) found **9 gaps** (no home/settings entry to the storefront, courier layer entirely missing, no store-operator UI, no per-order items for the store, no product details, no family identity, no family order tracking, admin lacking families/health, dead navigation edges). All gaps were closed:

- New courier layer (SQL `00068` + `courier-service.ts` + `PilotCourierScreen` + store-ops screen).
- Home entry card + settings buttons wired.
- Family selection at checkout, product details, family order tracking, admin families + health, i18n in 4 locales.
- Migration `00068_pilot_courier_delivery.sql` **applied to production** and verified.
- The three-country real run (5 families → 1 store → 1 courier → delivered) executed against production inside atomic rollback transactions with every invariant captured.
- Gate A fully green locally (typecheck, 3465 tests, build) and production state untouched after verification (orders 3 / items 3 / telemetry 938; courier membership = 1 persistent configuration row).

**Verdict: 🟢 READY FOR REAL USERS**

---

## 2. REAL PILOT STATUS TABLE

| # | Gate / phase | Result |
|---|---|---|
| Phase 0 | Production baseline verification | ✅ PASS |
| Phase 1 | Frontend audit + gaps | ✅ 9 gaps identified & closed |
| Phase 2 (front-end build-out) | Builder screens/services | ✅ PASS |
| Gate A | typecheck / lint / test / build | ✅ PASS (see §13) |
| Phase 3 | Apply 00068 + verify | ✅ PASS (see §6) |
| Store ops flows | Store list · confirm · prepare · detail-with-items | ✅ PASS |
| Courier flows | Available · accept · pickup · deliver | ✅ PASS |
| Family journeys | 5 family orders created + tracked | ✅ PASS (5/5) |
| Failure & negatives | Foreign user rows 0 · no-enumeration · 42501 · 22023 | ✅ PASS |
| Data integrity | counts unchanged after verification (3/3/938) | ✅ PASS |
| Admin | Families · health · courier provisioning · reset | ✅ PASS |
| Reset / replay | pilot_reset admin-gated; transactional replay | ✅ PASS |
| UX & observability | Home/Settings entries, i18n 4 locales, telemetry arms | ✅ PASS |
| Final report | this document | ✅ |

---

## 3. Environment & identity

- **Actual stage:** production (not staging). Supabase pooler, PostgreSQL 18 client.
- **Seed baseline at start of REAL PILOT:** neighborhoods 1, stores 1, families 5, store_inventory 5, delivery_zones 3 active, orders 3, order_items 3, telemetry_events 938, users 415, pilot RPCs 16, pilot tables 0.
- **Pilot store:** `pilot-store-1` (`8e1bdb04-dccc-4188-8404-a340be5325b9`) on `pilot-neighborhood-1` (`ffbf7c33-977b-4aee-9a61-d992b76edf90`).
- **Real authenticated actor used for all flows:** `a549a010-3315-4391-b90b-5c41ea3f6fe6` (super_admin in `public.users`) — also provisioned as **the pilot courier** (persistent config, see §7).
- **Order products:** pilot-store-1 inventory, e.g. Galaxy A15 `b49c1167-…` (sell_price 549) → order total 899 (549 + 350 delivery fee), matching the earlier deployment smoke.

---

## 4. Phase 0 — production baseline (read-only)

Verified prior to any change:

```
pilot RPCs (public, pilot_%)  = 16
pilot tables (pilot_%)        = 0     (pilot entities live in neighborhoods/stores/family_groups/…)
orders                        = 3     order_items = 3
telemetry_events              = 938
users                         = 415   (roles: guest | user | super_admin; no courier role — by design)
delivery_zones (active)       = 3
```
✅ PASS — matches the deployed contract from the PRODUCTION-PILOT-DEPLOYMENT-REPORT.

---

## 5. Phase 1 — REAL PILOT frontend audit (gaps closed)

| # | Gap | Closing change |
|---|---|---|
| G1 | No home entry to `pilot-storefront` (dead navigation edge despite reachability claims) | New live-store card on HomeScreen → `pilot-storefront`; Settings buttons for storefront/store-ops/courier/admin |
| G2 | Courier missing entirely (backend + frontend) | `00068` courier tables/RPCs + `courier-service.ts` + `PilotCourierScreen` |
| G3 | No store-operator UI; `pilot_orders_for_store` returns no items | `PilotStoreOpsScreen` (my stores selector, orders, detail-with-items) |
| G4 | No product details | Expandable product detail (description / city / source_key) in storefront |
| G5 | No family identity | Family Select in storefront, passed to checkout; `family_id` in order telemetry |
| G6 | No family order tracking | `pilot_order_status_for_user` + success-screen live status + refresh |
| G7 | Admin lacks families + health | AdminOps now lists families and shows `pilot_admin_pilot_health` snapshot |
| G8 | Legacy WhatsApp "request" = separate business feature | Documented as out-of-scope (not an order path), no second order system built |
| G9 | Discrepant navigation docs | back-matrix/reachability/route-map updated with `pilot-store-ops` + `pilot-courier` |

Journey coverage after Phase 1: Neighborhood → Store → Products → Family → Cart → Checkout → Delivery-fee → Store-confirm/manage → **Courier pick-up/drop** → Family tracking → Admin health — **full loop, no dead ends.**

---

## 6. Phase 3 — migration 00068 applied to production

Applied with `psql -v ON_ERROR_STOP=1 --single-transaction`; every statement succeeded (CREATE TABLE/FUNCTION, RLS, policies, grants/migration post-check DO). Verified read-only:

```
pilot RPCs (public, pilot_%)         = 25   (16 + 9 new)
pilot_couriers table                 = 1
pilot_couriers ROW LEVEL SECURITY    = true
orders new columns                   = 2   (courier_user_id, courier_assigned_at)
index idx_orders_courier_status      = 1
authenticated EXECUTE grants (9 RPCs)= 9
```

Migration design (additive only — **no published object replaced**): new `public.pilot_couriers` join table; `orders.courier_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL`; **canonical 6-status invariant untouched**; courier transitions strictly `confirmed|preparing → out_for_delivery → delivered`; courier streams **never include `customer_phone`** (operator/admin detail does); every RPC SECURITY DEFINER with fixed `search_path=''` and double-grant (`REVOKE … FROM PUBLIC` then `GRANT … TO authenticated`); admin health only READS telemetry. Offline structural gate tests assert all of the above (see §13).

---

## 7. Courier provisioning (persistent configuration)

`pilot_admin_set_courier(pilot-store-1, a549a010…, true)` → membership row `active`. This is configuration (not test data). It owns the store and is the pilot courier; store operator (`stores.operator_user_id`) remains NULL so store ops are authorized via admin until a fleet user is designated.

---

## 8. Real 5-family + store + courier run (transactional, evidence captured)

Executed against production in an atomic transaction (rolled back — no production mutations). Every value below is the captured output.

```
F1 create=FC-000034 pending → confirm: confirmed → prepare: preparing
F2 create=FC-000035 pending → confirm: confirmed → prepare: preparing
F3 create=FC-000036 pending → confirm: confirmed → prepare: preparing
F4 create=FC-000037 pending → confirm: confirmed → prepare: preparing
F5 create=FC-000038 pending → confirm: confirmed → prepare: preparing

store: orders_for_store = 5
store: detail_F1 items = 1, phone_present = true, total = 899.00

courier: available = 5
courier: accept (5/5, race-safe single UPDATE)  → mine = 5
courier: pickup   → out_for_delivery (5/5)
courier: deliver  → delivered (5/5)

family: track → delivered (5/5)
```
All 5 families completed the full loop to *delivered*.

---

## 9. Failure & security negatives (all PASS)

| Case | Expected | Observed |
|---|---|---|
| Foreign (non-courier, non-admin) `pilot_orders_available` | no rows | `0` |
| Foreign `pilot_orders_for_courier` | no rows | `0` |
| Foreign `pilot_order_status_for_user` (not the order owner) | no enumeration | raised `P0002` (ORDER_NOT_FOUND), no data leak |
| Foreign `pilot_order_accept` | denied | raised `42501` (PERMISSION_DENIED) |
| `courier_set_status(delivered → confirmed)` | rejected | raised `22023` (TRANSITION_NOT_ALLOWED) |
| `courier_set_status(delivered → out_for_delivery)` | rejected | raised `22023` |
| Non-admin `pilot_reset` | denied | raised `42501` |
| Admin health | includes families/stores/orders/telemetry | ✅ |

---

## 10. Admin observability

`pilot_admin_pilot_health()` (admin-only) returns neighborhoods / stores / families / couriers / per-status order counts / telemetry counts — rendered on `PilotOpsAdminScreen`. Verified callable and correct.

---

## 11. Reset / replay

`pilot_reset()` is admin-gated; it removes only `pilot-*` slugs/source keys and pilot-store orders (legacy 3 orders preserved — observed `orders = 3` after admin reset). Replay of the full scenario in new transactions re-ran clean (order numbers advanced `FC-000023…FC-000038` across runs due to PostgreSQL sequence non-rollback, leaving no rows). This is the designed replay path for future pilot drills.

---

## 12. Data integrity

After all verification transactions were rolled back:

```
orders          = 3
order_items     = 3
telemetry       = 938     (unchanged from baseline)
pilot_couriers  = 1       (intentional persistent config)
```
No production data was deleted or fabricated; no migration history was modified.

---

## 13. Gate A — local quality

- `pnpm typecheck` → ✅ 0 errors
- `pnpm test` → ✅ **3465/3465 passed** across 280 files (incl. new `pilot-courier-services.test.ts` — 16 tests — and extended `pilot-migration-gate.test.ts` with the 00068 suite; back-matrix snapshot bumped 56→58 for the two new screens)
- `pnpm build` → ✅ `vite build`, ~5 s
- `pnpm lint` → ✅ **0 errors** on all files touched by this task. The repo-wide lint has **7 pre-existing errors** in untouched legacy files (`src/__tests__/telemetry/…`, `src/core/tic-tac-toe/ai.test.ts`, `src/screens/tic-tac-toe/…`) — unrelated to this pilot, left untouched.

---

## 14. UX & observability assets delivered

- HomeScreen live-store card; Settings buttons: Pilot store / Store operations / Courier / Admin.
- Storefront: family selector (defaults to first family), expandable product details, checkout hand-off with `storeId/familyId/familyName`.
- Checkout: "ordering for {family}" label, `family_id` in `checkout_submit`/`order_created` telemetry, post-success live status (`pilot_order_status_for_user`) + refresh.
- Courier screen: claimable orders (customer phone withheld), My deliveries, strict action buttons, detail without phone.
- Store-ops screen: my stores, orders with expandable items + totals, operator action buttons.
- Admin: families list + health snapshot.
- i18n added to **en / ar / fr / tr** (all `pilot.*`, `home.liveStore*`, `settings.*` keys).

---

## 15. Security posture recap

- No RLS weakening; courier table RLS on; orders read stays admin/operator via RPCs only.
- Least privilege: courier payloads omit `customer_phone`; family tracking is owner/admin-only with no enumeration.
- No service-role usage in client; all writes SECURITY DEFINER + fixed search_path; grants are explicit `REVOKE`+`GRANT`.
- Central RBAC (`ROLE_PERMISSIONS`/`ROLE_CAPABILITY_MAP`) and telemetry privacy contract untouched (00068 only reads telemetry for admin health).

---

## 16. Known notes (non-blocking)

- `stores.operator_user_id` is NULL today: store-ops screen works via admin until a non-admin operator is designated.
- Couriers are modeled via `pilot_couriers` membership (no new `user` role), consistent with the no-RBAC-change rule.
- Telemetry events (`order_created`, `order_status_changed`, `order_completed`, …) are emitted **client-side** by the app (verified by unit tests + the earlier production smoke that raised the telemetry baseline to 938); the DB layer does not self-emit, by design.

---

## 17. Final verdict

> ## 🟢 **READY FOR REAL USERS**

All Gates A–E equivalent checks and the 5-family + store + courier real run passed against production; the courier layer is live (00068 applied), the courier membership is provisioned, and production data integrity is intact.

_Signed: focus software engineering team — REAL PILOT close-out, 2026-09-05._

---

# ACCOUNT ARCHITECTURE RECONCILIATION + PLATFORM-READY ORDER FLOW — CLOSE-OUT

Scope: architecture re-check (store acceptance vs platform-ready orders) + independent operator/courier accounts with admin approval. Production report, 2026-09-05.

## CURRENT STATE

**Production (`fmggysdqigtejxbfpgtg`) at re-check, read-only verified:**
- Pilot store `pilot-store-1` (`8e1bdb04-…`): `stores.operator_user_id` = **NULL** (no independent operator account).
- `pilot_couriers`: **1 row** — user `a549a010-…` (yahyamanouni2@gmail.com, **super_admin**). The admin account *is* the courier; no independent courier identity.
- Courier statuses binary (`active|inactive`); no onboarding/approval lifecycle; no provisioning/approval UI anywhere (no `pilot_admin_set_courier` UI).
- Orders RLS: `Staff manage/read` only (admin|super_admin via `users.role`); stores admin-gated + public-read-active; couriers admin + self-read. Only helper RPC `fn_admin_uid()`.
- Data baseline: orders 4, order_items 6, beneficial telemetry 1204 (client-emitted only, rising across real use 938→1144→1204), pilot_couriers 1, users (guest 408 / user 6 / super_admin 1).

## AGREED ARCHITECTURE

1. **Store = fulfilment point, not a marketplace seller.** Platform **pre-builds** the order as `confirmed`; the store's job is `confirmed → preparing` only. No per-order manual store acceptance; no `pending` on the happy path.
2. **Independent identities:** Store operator (per-store membership) and Courier (per-store membership) are real user accounts, **provisioned by an admin** (`Pending → Admin Approval → Active`). No admin acting as courier/operator in the target model.
3. Enforcement without RBAC changes: membership tables + `SECURITY DEFINER` RPCs + the existing `stores.operator_user_id` / courier-assignment gates; no new global roles, no `ROLE_PERMISSIONS`/`ROLE_CAPABILITY_MAP` edits, no RLS weakening.
4. No real human accounts were created; structure + approval workflow only. (The single persistent courier row = the pre-existing admin-as-courier configuration, deliberately left untouched.)

## GAP

| # | Gap (CURRENT vs AGREED) |
|---|---|
| G-A | `delivery_create_order` created orders as `pending` and required 3 store clicks (pending→confirm→prepare), a marketplace-acceptance model applied to a fulfilment model. |
| G-B | No operator account at all (`operator_user_id` NULL) and no approval lifecycle for operator/courier memberships (courier status binary). |
| G-C | No admin provisioning/approval UI; courier membership is the admin account. |

## CHANGES ALREADY COMPLETED

- **00069 platform-ready orders** (additive redefinition): `INSERT` status `'pending'→'confirmed'` and `RETURN` `'pending'→'confirmed'` — the *only* two deltas vs 00065. Happy path is now born `confirmed`; store prepares directly; `storeActionsFor('pending')` kept for legacy rows. 00065 neither modified nor re-run.
- **00070 account approval** (additive): `pilot_store_operators` ledger (status `pending|active|suspended`, approved_by/at, UNIQUE(store,user)) + RLS (Operator read own / Admin read all / Admin manage) + `SELECT` grant `authenticated`; `pilot_couriers` status vocabulary extended to `pending|active|inactive|suspended`; 4 new admin RPCs (`pilot_admin_set/list_operator_status`, `pilot_admin_set/list_courier_status`) — SECURITY DEFINER, `search_path=''`, admin-gated, `REVOKE`+`GRANT`; `active` syncs `stores.operator_user_id`, downgrade clears it.
- **Hardened `pilot_courier_set_status`** (redefinition inside 00070): authorization now requires **ACTIVE membership** (or admin) instead of mere `courier_user_id` assignment → suspension revokes authority instantly with `42501`. Strict transition matrix unchanged.
- Frontend: `PilotOpsAdminScreen` gained **Store operators** + **Couriers** management sections (approve/suspend); `neighborhood-service.ts`/`courier-service.ts` gained approval RPC clients + types; i18n keys added to **en/ar/fr/tr**.

## NEW CHANGES REQUIRED

None outstanding. The transactional smoke (single round) surfaced the suspended-courier authorization flaw (22023 instead of 42501) which was fixed by the 00070 hardening above and re-verified in the same smoke. The `cli-proof` copy of 00067 mentioned in earlier reports is an **owner-side action on another machine** (not present in this workspace); the repo copy already carries the repaired `ELSE`-positioned function (verified against the live production definition).

## MIGRATIONS

| Migration | SHA (blob) | Status |
|---|---|---|
| `00069_platform_ready_orders.sql` | `afa8c325138e3444f4bb00677160fef235c344b7` | Applied, EXIT 0 |
| `00070_pilot_account_approval.sql` | `5e6ad2820101a3faad819ae9071ca1ef7e21012c` | Applied (idempotent re-apply after hardening), EXIT 0 |

Both additive; 00065/00066/00067/00068 untouched. Structural gate asserts: no `ALTER TABLE users/roles/orders/stores`, no `INSERT INTO ROLE_PERMISSIONS/ROLE_CAPABILITY_MAP`, no `record_telemetry_event` edits, no `service_role`, grants explicitly `REVOKE … FROM PUBLIC` + `GRANT … TO authenticated`.

## TESTS

- `tsc --noEmit` → 0 errors · `vite build` → ✅ · lint on touched files → 0 errors.
- Full suite → **3484/3484 passed** (281 files). Pilot suite 97 tests/5 files, incl. 00069 gate (confirmed-first, no pending, protections verbatim, additive-only, grant contract), 00070 gate (ledger+RLS, courier vocab, admin-gated SECURITY DEFINER, operator_user_id sync, grants, no weakening, workflow end-to-end, courier set-status ACTIVE hardening), and `pilot-approval-services` (operator/courier approve-suspend-list) tests.

## PRODUCTION

- **Disposable replay** (BEGIN…ROLLBACK): 00069+00070 applied + invariant DO-block verification → REPLAY_OK; verified true rollback.
- **Apply:** 00069 EXIT 0 → 00070 EXIT 0 (only benign NOTICE/CREATE IF NOT EXISTS). Post-apply: `insert_confirmed`=t, `return_confirmed`=t, courier status check = pending/active/inactive/suspended, RLS on new ledger, 6 EXECUTE grants = 1 each, 5 RPCs SECURITY DEFINER, legacy orders untouched.
- **Transactional smoke (21 checks, all PASS, then ROLLBACK):** A confirmed-first (pending never produced) · B unapproved operator 42501 · C no-membership + pending courier blocked 42501 · D pending→active approval with `operator_user_id` sync · E store sees `confirmed` immediately + prepares · F cross-store isolation 42501 both directions (store B) · G courier C1 active accepts `out_for_delivery`→`delivered` · H courier C2 cannot see/claim · I family tracks delivered · J suspension: 42501 + store unlink + courier blocked · K pending=0, legacy untouched, in-txn (+1/+1).
- **Post-rollback proof:** orders 4 / order_items 6 / pilot_store_operators 0 / pilot_couriers 1 / smoke users 0 / store B 0 / smoke order 0; legacy rows `8a20ae85·4e259196·20fca116` pending + `277d3a61` delivered — unchanged. RLS policy sets on orders/order_items/stores/pilot_couriers identical to the pre-00070 surface (+3 policies on the new ledger only). No RLS/RBAC/grants downgrade.

## GIT

- Commit `0d9ec4d` (43 files, +8467/−7) → pushed `368b72f..0d9ec4d main -> main` (https://github.com/yahya2208/focus22.git).
- Scoped to REAL PILOT only: migrations 00065–00070, `src/screens/pilot/`, `src/services/*`, `src/__tests__/pilot/`, pilot screens/nav telemetry-event registry (`events.ts`/`types.ts`/`migration.test.ts` — pilot-event deltas only), i18n en/ar/fr/tr, reports. Unrelated epics (settings/ads/catalog/inventory, `runtime-settings.ts`, 00064, `supabase/verify/*`, `settings-00064-consumers.test.ts`) **excluded** and remain uncommitted working changes.

## FINAL VERDICT

> ## 🟢 **READY — PLATFORM-READY ORDER FLOW + ACCOUNT ARCHITECTURE = PASS**

Confirmed-first order lifecycle verified on production (`pending` never produced); independent operator/courier identities with admin approval enforced (Pending → Approval → Active, instant revocation on suspension with 42501); cross-tenant isolation, strict transitions and legacy data integrity proven in a 21-check transactional smoke that rolled back cleanly; full suite green (3484); delivery committed and pushed. No remaining production or test gaps in scope for this phase.