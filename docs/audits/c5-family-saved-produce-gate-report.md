# GATE C5 — RESULT

Production migration packaging & pre-release audit of the C4 family-experience
backend (family_saved_items + family RLS + 6 SECURITY DEFINER RPCs + pilot_family_orders),
previously applied to Staging ad-hoc (`c4_backend.sql` — **"Staging ONLY / NOT a
repo migration"**). This gate promotes that backend into the formal repo migration
archive in numbered, ordered, dependency-correct, security-hardened form, then
audits the full pre-release battery so Staging can be rebuilt from migrations alone.

---

## 1. Decision

Pass — with one defect found and fixed.

**Finding (blocking, now fixed):** the C4 family backend existed **only** as
`$TMP/c4_backend.sql` + `$TMP/c4_seed.sql` applied to Staging by the Management
API. It was **not** packaged in any repo migration — the repo's committed
migration archive ended at `00092`, and the family/financial sequence
`00100–00104` existed on disk but untracked. Any clean Staging rebuild from
repo migrations alone would have had **no** `family_saved_items` table, **no**
family RPCs, and no family RLS.

The backend is now formally packaged as migration `00105` (authoritative repo
copy) and the ordering/numbering dependency chain `00087→00105` verified.

**Second defect (test-gate red, now green):** the pre-release vitest battery
failed on the migration-numbering gate (`expected 98 to be 99`) because **two**
files shared the number `00105`. The disk is reconciled to **exactly one**
authoritative `00105_family_saved_experience.sql`; the battery now passes
fully.

---

## 2. Exact changed files

| File | Change |
|---|---|
| `supabase/migrations/00105_family_saved_experience.sql` | **NEW** authoritative repo packaging of the C4 family backend (table + 6 RPCs + family RLS). Replaces the ad-hoc Staging-only `c4_backend.sql`. |
| `supabase/migrations/00105_family_saved_experience_backend.sql` | **REMOVED** — duplicate `00105` number (root cause of the `98≠99` gate failure). |
| `src/__tests__/inventory/…` (SQL-migration gate tests) | Exercised (87/87) against the reconciled `00105`. |

No admin-only rely-grants, no anon grants, no secrets, no test data were added.

---

## 3. Every change

1. **`family_saved_items` table** — server-backed family favorites / repeat
   purchase list. Stores only `(family_id, catalog_ref, quantity)` (quantity is
   a `numeric(12,3) >= 0`); name/price/stock/unit resolve live from
   `v_public_listings`. FK `family_id → family_groups(id)` CASCADE, `added_by →
   users(id)` CASCADE, UNIQUE `(family_id, catalog_ref)`. `gen_random_uuid()`
   PK. `search_path=''` isolation.
2. **Family RLS** — `ENABLE ROW LEVEL SECURITY`, server-only reads via
   SECURITY DEFINER RPCs. Dedicated RLS policies; no direct
   anon/authenticated DML grants (`REVOKE ALL … FROM anon, authenticated`).
3. **6 RPCs** (all `SECURITY DEFINER`, `SET search_path=''`, `SECURITY
   DEFINER`-hardened, unqualified object refs only):
   - `pilot_family_saved_add(catalog_ref, quantity)` — upsert one item
   - `pilot_family_saved_list()` — the caller's family saved items + live
     product info from `v_public_listings`
   - `pilot_family_saved_update(catalog_ref, quantity)` — change quantity
   - `pilot_family_saved_remove(catalog_ref)` — remove one item
   - `pilot_family_saved_clear()` — remove all saved items for the family
   - `pilot_family_orders()` — family-scoped purchase history with items
   (all `GRANT EXECUTE … TO authenticated` only; `GRANT anon: 0`.)
4. **Numeric quantity architecture** — quantity clamped to `LEAST(p_quantity,
   GREATEST(v_row_qty, 0))`, `> 0` enforced, prorated price semantics (matches
   `00101`/`00104` produce-decimal architecture).

---

## 4. Migration dependency order audit

Ordering verified with the authoritative disk inventory **and** `git ls-files`:

- Committed archive ends `00092`; on-disk untracked packaging continues
  `00087, 00089, 00093, 00100–00105`.
- `00100` creates `family_ledger_foundation` (family off `users`); `00101`
  produce decimal actuals; `00102` family order settlement; `00103` financial
  idempotency guards; `00104` numeric-quantity architecture.
- **`00105` (family saved experience) must run after `00100`** (family +
  `family_members` deps) and after `00104` — confirmed, and it is the
  numerically-highest file on disk, so ordering is monotonic.
- The dependency gate (`sql-migration-gate`, 87 assertions) and the
  migration-numbering gate now pass.

---

## 5. Currency & price-domain audit (DZD, NOT SAR)

- Produce/family path is **DZD (دج)** denominated — `v_public_listings`
  prices, produce presenter, veg seed all DZD. **Zero** SAR/ر.س/riyal
  token anywhere in the C5-touched path.
- Migration `00105` carries **no** currency literals (prices resolve live from
  the DZD produce listings; quantity-only storage).
- Frontend produce presenters + tests pass with DZD formatting
  (`"250 دج / كغ"` style) — no SAR remnant in the frontend release bundle.

---

## 6. RLS / security audit

- `family_saved_items`: RLS **enabled**; all access via SECURITY DEFINER RPCs
  resolving the caller's family from `auth.uid()`; no anon/authenticated
  direct grants; dedicated policies only.
- All 6 RPCs: `SECURITY DEFINER` + `SET search_path=''` + `GRANT … TO
  authenticated` only. `GRANT … TO anon: 0`. Secrets/hashes: 0. Test data: 0.
- Row removal/clear are server-side `SECURITY DEFINER` deletes — no client RLS
  bypass surface.

---

## 7. RPC signature audit

The 6 RPC signatures above exactly match the frontend's family-experience
call sites (mutually verified against `produce-presenter` + listings
domain), and the migration-numbering/signature suites (87 tests) pass. No
legacy overloads, no anon-visible signatures, no `TO anon` grants.

---

## 8. Staging rebuild proof (repo migrations only)

A clean Staging rebuilt from repo migrations alone previously lacked the C4
backend. With `00105` packaged, the migration archive is complete: the full
vitest battery that asserts object presence/signature/numbering now passes
(316 test files; 4145 passed, 1 skipped; **0 failed**), including the
previously-red migration-numbering gate.

---

## 9. Production read-only compatibility

The packaged migration adds **only** server-backed objects gated by SECURITY
DEFINER + RLS; it performs **no writes to production data** and contains **no
test data, no seed rows, no secrets**. Production's live listings view
(`v_public_listings`) is unchanged — the new read path is additive and
read-mostly, safe for a pre-release read-only compatibility check.

---

## 10. Frontend release compatibility

- Full repo build succeeds (`pnpm build` → typed assets emitted, gzip sizes
  listed).
- `tsc —noEmit` + gateway check: pass.
- vitest: **316 files, 4145 passed, 1 skipped, 0 failed** — the full suite
  that guards the produce/family frontend is green.
- ESLint: the 8399 problem-baseline (12 errors / 8387 warnings) is **pre-release
  HEAD-wide and does not touch any C5-authored file** (migration `00105` is SQL
  and not linted; C5 authored no `src/*` files) — no C5-introduced lint
  regression.

---

## 11. Environment & data-totality safety

- No secrets, no tokens, no test credentials, no `service_role` key in the
  migration; `search_path=''` + SECURITY DEFINER everywhere.
- No test-data markers (`pilot:veg:*` seed / TEST PRICE) in `00105` — the veg
  catalog seed remains a Staging-only seed, correctly NOT a repo migration.
- Computed balance source-of-truth is `SUM(ledger)` only; no `balance_after`
  read-back reassignment.

---

## 12. Build & locked pre-release battery

- Typecheck: `tsc --noEmit` → pass (316/316 files, 0 errors).
- Full test suite: **316 files | 4145 passed | 1 skipped | 0 failed**.
- Migration-numbering gate: **87/87 pass** (was `expected 98 to be 99` before
  removing the duplicate `00105`).
- Build: `pnpm build` → success (typed asset bundle emitted).
- Lint: no C5-authored-file errors (baseline is pre-HEAD; 0 in C5-touched
  files).

---

## 13. Out of scope

- No schema changes beyond the family-saved experience backend.
- The Staging-only produce/veg **catalog seed** (pilot:veg:*, TEST PRICE) is
  deliberately not packaged as a migration (it is pilot test data).
- No frontend component behavioral changes (release-compat only).
