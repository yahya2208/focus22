# FOCUS — Phase: Schema Apply PLAN (REVIEW ONLY — NOT AN EXECUTION ORDER)

- **Status:** **Schema Apply (00019) = APPLIED — VERIFIED — DATA RECONCILIATION NOT STARTED** (owner-declared).
  - Gate 0 (`03-pre-apply-evidence.sql`): owner-declared PASS (2026-08-10 22:08:44, `postgres`).
    **Evidence caveat:** the raw SQL Editor output has not yet been saved to this repo
    (`inventory-phase-c/evidence/03-pre-apply-evidence_*.sql.txt` = `PENDING_RAW_OUTPUT`).
  - Gate 1 (`00019_inventory_central.sql`): owner-declared APPLIED via Supabase SQL Editor
    (BEGIN → full file → COMMIT) + post-apply basic verification PASS (tables/view/14 RPCs/RLS/
    bucket/realtime membership present; `inventory_central` publication absent = expected by
    design; rows items=0, images=0, movements=0 — expected, reconciliation not started).
  - **Gate 2 = CLOSED / VERIFIED** (owner decision, 2026-08-11).
    - Apply: **SKIPPED intentionally** — see reason below.
    - Post-Apply Verification (`04-post-apply-verify-unified.sql`): **15/15 PASS**.
    - Constraint & Data Reconciliation (`05-constraint-data-reconciliation.sql`): **36/36 PASS**
      (5 FK incl. cascade; FK/PK type compatibility; all CHECK constraints; PK/UNIQUE; 6 required
      indexes + 2 partial UNIQUE; no orphan rows; publish gating / no unauthorized exposure;
      rows 0/0/0 expected pre-reconciliation).
    - **Reason for skip:** Inventory was already applied manually via
      `00019_inventory_central.sql`; current DB state matches `01-inventory-apply.sql`,
      therefore re-application was intentionally skipped.
  - **Hold:** awaiting explicit owner GO for the next Gate (Data Reconciliation is NOT started).
    No backfill / cutover / rollback / storage image moves / app writes until authorized.
- **Date:** 2026-08-10 (plan) / status update 2026-08-11 (owner-declared)
- **Nature:** A reviewable execution plan for the future Schema Apply phase. It is **not** an
  authorization to run anything. Execution requires a separate, explicit owner approval.
- **Chain so far (all green):** Phase 2B audit ✅ → Phase 2C file fixes ✅ → Verification Gate
  (31/31, 1340/1340, lint 0 errors, typecheck clean, static audits PASS) ✅ → **Apply Plan Review
  (we are here)**.

---

## 0) Mandatory execution order (with review stops, never automatic)

```
[Gate 0] 03-pre-apply-evidence.sql
    ↓
REVIEW STOP #1 — owner inspects the saved evidence, then issues an explicit GO
    ↓
[Gate 1] Apply 00019_inventory_central.sql
    ↓
REVIEW STOP #2 — owner inspects the apply output/errors, then issues an explicit GO
    ↓
[Gate 2] 04-post-apply-verify.sql
    ↓
REVIEW STOP #3 — owner inspects verification results
    ↓
[Gate 3] Rollback = available ONLY on owner decision to abort (never automatic)
[Gate 4] Application Safety = constant invariants throughout
```

Each stop is a hard gate: **no automatic chaining** `03 → 00019 → 04`. The plan author will not
advance past a stop without your explicit instruction.

---

## Gate 0 — Pre-Apply Evidence (`03-pre-apply-evidence.sql`)

**How it runs:** execute the whole file **as `postgres`** in the Supabase SQL Editor (or `psql` as
the postgres role). Save the raw output **before** reading anything.

**What it checks and the GREEN expectation:**

| # | Check (03) | Must be GREEN when |
|---|---|---|
| context | `current_database / current_user / now()` | prints db + role + timestamp (sanity) |
| 1 | tables `inventory_items / inventory_images / inventory_movements` + view `v_public_inventory` | **all four `to_regclass` = NULL** (additivity proof) |
| 2 | `public.inventory_%` functions | **0 rows** |
| 3 | bucket `inventory-images` | **count 0** |
| 4 | storage policies referencing `inventory-images` | **0 rows** |
| 5 | realtime pre-condition: `inventory_items` / `inventory_images` NOT yet members of the EXISTING `supabase_realtime` publication (`pg_publication_tables`) | **0 members**. A publication named `inventory_central` is **never created** in this design — absence is by design, not a requirement |
| 6 | `users` with `role IN ('admin','super_admin')` | **count >= 1** |
| 7 | `gen_random_uuid` available | **row present** |
| 8 | `users.id` column type | **`uuid`** |

**Anything that blocks continuation (any of these → STOP, do not apply):**
- any table/view/function/bucket/policy already exists (migration would not be additive);
- admin count = 0 (no operator would exist after apply);
- `gen_random_uuid` missing (plan depends on it);
- `users.id` is not `uuid` (FK `created_by/updated_by/actor_user_id` depend on it);
- any integrity warning or file mismatch in the export backups.

**Evidence saving (mandatory):** write the full raw output to
`inventory-phase-c/evidence/03-pre-apply-evidence_<YYYY-MM-DD>_<HHMMSS>.sql.txt` (exact filename
recorded in the apply log), plus a screenshot/CSV of the result set if using the Editor. The file is
**immutable evidence** and must be preserved; the review at STOP #1 is conducted against it.

**Explicitly out of scope in Gate 0:** nothing is created or modified; the file is SELECT-only.

---

## Gate 1 — Migration (`00019_inventory_central.sql`)

**How it applies:** as `postgres` in the SQL Editor (or `psql --single-transaction --set
ON_ERROR_STOP=1`). Recommended hardening for review: run inside a single explicit `BEGIN;
… COMMIT;` session with `ON_ERROR_STOP=1` so any mid-script failure rolls back cleanly; the script
contains no `CREATE INDEX CONCURRENTLY`, so a transaction wrapper is safe. (This is a
recommendation for the apply operator; no file change is proposed here.)

**Additivity confirmation:** the script is `CREATE TABLE/VIEW/FUNCTION IF NOT EXISTS`,
`INSERT … ON CONFLICT DO UPDATE`, `DO`-block-guarded — additive. It **does not reference 00014**
(verified: 0 executable references). 00014 is excluded/never applied and must remain untouched;
applying 00019 does not require, invoke, or conflict-resolution with 00014. `00016/00017/00018`
are untouched.

**Objects that will be created:**

- **Tables (3):** `inventory_items`, `inventory_images`, `inventory_movements` (all
  `IF NOT EXISTS`, additive) + CHECK constraints (quantity/price/battery/condition/status enums,
  unique SKU `(model_id,variant,condition,color)`), partial unique index on `source_key`, plus
  model/status/published indexes and images indexes (incl. partial unique cover).
- **Triggers (2) + trigger functions (2):** `trg_inventory_items_updated_at` (BEFORE UPDATE →
  `set_inventory_updated`), `trg_inventory_items_audit` (AFTER INSERT OR UPDATE →
  `audit_inventory_change`, SECURITY DEFINER, `search_path=public`).
- **RLS:** `ENABLE ROW LEVEL SECURITY` on all three tables.
- **Row-level policies (2):** `"Public read inventory images"` (images of published/visible items →
  anon/authenticated), `"Staff read inventory movements"` (authenticated, roles
  admin/super_admin/researcher).
- **View (1):** `v_public_inventory` (`security_invoker=false`, customer-facing columns only,
  visibility gate = published ∧ quantity>0 ∧ status not archived/discontinued/deleted).
- **Functions (14):** `inventory_is_admin()`, `inventory_calc_status(integer)`,
  `inventory_management_list()`, `inventory_add_item(...)`, `inventory_add_stock(...)`,
  `inventory_remove_stock(...)`, `inventory_adjust_stock(...)`, `inventory_update_prices(...)`,
  `inventory_update_details(...)`, `inventory_set_status(...)`, `inventory_restore(...)`,
  `inventory_set_published(...)`, `inventory_add_image(...)`, `inventory_remove_image(uuid)`.
- **Grants/Revokes:** `REVOKE ALL` on `inventory_items` from anon/authenticated; `REVOKE ALL` on
  `inventory_movements` from anon; `GRANT SELECT (columns)` on `inventory_images` to
  anon/authenticated; `GRANT SELECT` on `inventory_movements` to authenticated; `GRANT SELECT` on
  `v_public_inventory` to anon/authenticated; **14× `GRANT EXECUTE … TO authenticated`** AND
  **14× `REVOKE ALL ON FUNCTION … FROM PUBLIC`** (defense in depth).
- **Storage:** bucket `inventory-images` (public, `file_size_limit=5242880`, allowed mimes
  jpeg/png/webp/avif/heic/heif) + **4 storage policies** on `storage.objects` (`Public read`,
  `Staff upload` WITH CHECK admin+`inventory-images/%`+real-id folder, `Staff update`,
  `Staff delete` — all admin/super_admin gated).
- **Realtime:** guarded `DO` block → `ALTER PUBLICATION supabase_realtime ADD TABLE
  public.inventory_items` and `...inventory_images` (only if not already members).

**Transaction/rollback risks:**
- DDL is transactional in Postgres; a transaction wrapper makes the apply all-or-nothing.
- The single non-idempotent surface is the `ON CONFLICT DO UPDATE` on the bucket (idempotent by
  design) and the guarded publication additions (idempotent via `pg_publication_tables` check).
- If the apply fails mid-way without a transaction wrapper, run `02-inventory-rollback.sql`
  **only with owner authorization** (Gate 3) to return to a clean state, then investigate before
  retrying.
- No `CREATE INDEX CONCURRENTLY` / `ALTER TYPE` / `REINDEX` — no non-transactional blockers.

---

## Gate 2 — Post-Apply Verification (`04-post-apply-verify.sql`)

**How it runs:** as `postgres` in the SQL Editor, immediately after Gate 1, in the same session
context. Save the full output as dated evidence
(`inventory-phase-c/evidence/04-post-apply-verify_<YYYY-MM-DD>_<HHMMSS>.sql.txt`).

**Expected GREEN values per assertion:**

| # | Check | Expected GREEN |
|---|---|---|
| 01_objects | 3 tables exist | **3** |
| 02_view | `v_public_inventory` exists | **1** |
| 03–05_rls | RLS enabled on items/images/movements | **1** each |
| 06_triggers | 2 triggers exist | **2** |
| 07_rpcs | `inventory_%` functions | **exactly 14** |
| 08_policies | 2 row-level policies | **2** |
| 09_bucket | `inventory-images` exists | **1** |
| 10_no_inventory_central_pub | no publication named `inventory_central` | **0 — by design (SUCCESS)**, see note |
| 11_admin | `users` admins | **>= 1** |
| 12_public_empty | `v_public_inventory` rows | **0** (nothing published yet) |
| 13_storage_policies | 4 storage policies | **4** |
| 14_no_public_exec | inventory functions with PUBLIC EXECUTE | **0 leaked** |
| 15_realtime_tables | 2 tables in `supabase_realtime` | **2** |

**Note — check 10 (corrected contract):** the approved design adds the central tables to the
**existing** `supabase_realtime` publication via a guarded `ALTER PUBLICATION`; it **never creates**
a new publication. Therefore check 10 (`pg_publication.pubname = 'inventory_central'`) is expected
to be **0 = SUCCESS by design** (absence is the correct outcome). The **authoritative** realtime
assertion is check 15 (`pg_publication_tables` → both `inventory_items` and `inventory_images`
members of `supabase_realtime`, expected **2**). Evidence file 03 check 5 verifies the matching
pre-condition (0 members before apply). The old `10_realtime` check on
`supabase_realtime.publication(name='inventory_central')` has been removed from 03/04; no SQL
schema change was needed for this correction.

**Admin gate / public view / grants:** admin gate = 11_admin ≥ 1; public view = 12_public_empty = 0
(no accidental exposure); grants = 14_no_public_exec = 0 leaks (each of the 14 functions has an
explicit REVOKE PUBLIC and a GRANT to authenticated only).

**STATUS — GATE 2: CLOSED / VERIFIED** (owner decision, 2026-08-11)

| Evidence | Reference | Result |
|---|---|---|
| Pre-Apply Evidence (unified) | `supabase/inventory-central/03-pre-apply-evidence-unified.sql` | PASS — proved Inventory already present |
| Drift Analysis | `docs/audits/phase-2c-schema-apply-plan.md` (Drift Analysis above) + `git diff` of 00019 vs 01 | current DB state matches `00019_inventory_central.sql` / `01-inventory-apply.sql` |
| Apply | `01-inventory-apply.sql` | **SKIPPED intentionally** (not a failure) |
| Post-Apply Verification | `04-post-apply-verify-unified.sql` | **15/15 PASS** |
| Constraint & Data Reconciliation | `05-constraint-data-reconciliation.sql` | **36/36 PASS** |

Verified: 5 FKs (incl. ON DELETE CASCADE), FK/PK type compatibility, all CHECK constraints,
PK/UNIQUE constraints, 6 required indexes, 2 partial UNIQUE indexes, no orphan rows, publish
gating / no unauthorized exposure, current data state 0 items / 0 images / 0 movements (expected
before entering Inventory data).

**Reason for skipping Apply (recorded verbatim):**
> Inventory was already applied manually via `00019_inventory_central.sql`; current DB state
> matches `01-inventory-apply.sql`, therefore re-application was intentionally skipped.

**Constraints honored:** no DB modification; no Inventory modification; no replacement migration
created; no object dropped/recreated. Next step is on hold awaiting explicit owner instruction.

---

## Gate 3 — Rollback (`02-inventory-rollback.sql`)

**When allowed:** only by explicit owner decision to abort the Schema Apply (e.g., Gate 1 failure,
Gate 2 unexpected red, or a discovered blocker). Rollback is **never automatic**.

**Precondition before running rollback:** confirm the export backups are intact and that **no
central data worth preserving** exists yet. In the apply flow, Gate 2 check 12_public_empty=0 and
no backfill has run, so the central tables are expected to be empty; the operator must confirm zero
unpreserved rows before rolling back (any rows created since apply are LOST — the header warns
exactly this).

**What it deletes (exact, reversed order):**
- Removes `inventory_items`/`inventory_images` from `supabase_realtime` (guarded DROP, keeps the
  publication itself).
- **Storage:** first `DELETE FROM storage.objects WHERE bucket_id='inventory-images'`
  (bucket contents are wiped **before** the bucket is dropped — no orphan objects), then drops the
  4 storage policies, then `DELETE FROM storage.buckets WHERE id='inventory-images'`.
- Drops the 14 functions (identical signatures to apply).
- Drops `v_public_inventory`.
- Drops the 2 row-level policies, the 2 triggers, the 2 trigger functions.
- Drops tables `inventory_movements → inventory_images → inventory_items`.

**Shared-object safety (explicit):** rollback **does not** drop any extension (no
`DROP EXTENSION` anywhere), **does not** drop the `supabase_realtime` publication (only removes the
two tables from it), and **does not** touch `storage` buckets other than `inventory-images`, the
`public.users` table, or any migration 00001–00018 object. It is idempotent (`IF EXISTS`).

---

## Gate 4 — Application Safety (constant invariants)

The apply phase is **database-only**. Nothing in the application changes:

- **No app code change:** zero `src/` modifications (the only `src/` artifact is the gate test under
  `src/__tests__/`, already verified).
- **No backfill in this phase:** no data import/merge from exports; central tables stay empty
  (12_public_empty = 0).
- **No image transfer:** bucket remains empty after apply; no object upload/move.
- **No localStorage deletion:** `catalog_inventory` and related keys are **untouched**; the app
  keeps reading its current local source.
- **No cutover:** the application is **not switched** to the canonical central inventory; no route,
  service, or UI reads/writes the new tables. The central DB is created and dormant.
- **No canonical-inventory activation:** nothing in the app enables/publishes central rows; the
  view stays empty.
- **No RLS/grants change to existing app tables** outside the inventory namespace.

---

## Explicit prohibitions (still in force for the PLAN author)

❌ No SQL execution · ❌ No Supabase apply · ❌ No running 03 · ❌ No running 00019 · ❌ No running 04 ·
❌ No deleting 00014 · ❌ No backfill · ❌ No cutover · ❌ No localStorage mutation · ❌ No image
transfer · ❌ No commit/push related to the apply.

---

## HARD STOP

- **Now:** the owner reviews THIS plan. Any objection to the order, the GREEN expectations, the
  check-10 note, or the operator hardening goes into the final approved version.
- **After approval:** each gate is executed one at a time with the review stops above; no step is
  chained automatically.
- **This plan document is a plan, not a permission.** Only your explicit, separate approval unlocks
  Gate 0.
