# FOCUS — Phase 2C: Controlled File Fixes Report (Schema Apply NOT executed)

- **Status:** COMPLETE (FILE-ONLY). Zero SQL executed, zero migrations run, zero Supabase
  changes, zero data touched, zero localStorage writes/deletes.
- **Date:** 2026-08-10
- **Scope:** File fixes only per owner authorization: `01/02/03/04` + `00019_inventory_central.sql`
  + reconcile `F1/F2` + necessary tests. Then HARD STOP awaiting independent approval of the
  Schema Apply phase.
- **Owner decisions locked in:** H13 = researcher has NO inventory-management access
  (admin/super_admin only); H9 = `gen_random_uuid()` (no uuid-ossp dependency); H8 = guarded
  `ALTER PUBLICATION`. All B1–B5, E1/G4, G1/G2, H10/H11, F1/F2 approved as documented in the
  Phase 2B report.

---

## 1) Files changed — complete inventory (the "12 Files Changed")

The reviewer flagged 12 files in the UI. **None of them are Phase 2C.** They belong to the
single unpushed commit `06bdf01 fix(showroom): complete controlled phase 1 fixes`
(branch `deploy/showroom` is ahead of `origin/deploy/showroom` by exactly this 1 commit).

### 1.1 The 12 files (commit `06bdf01` — Phase 1, OUTSIDE Phase 2C scope)

| # | File | Change | Phase |
|---|---|---|---|
| 1 | `docs/audits/controlled-fix-discovery.md` | A | Phase 1 |
| 2 | `docs/audits/controlled-fix-phase-1-report.md` | A | Phase 1 |
| 3 | `src/__tests__/business-intelligence/qr-scan-count.test.ts` | A | Phase 1 |
| 4 | `src/__tests__/campaigns/campaign-service.test.ts` | M | Phase 1 |
| 5 | `src/__tests__/showroom/gallery.test.tsx` | M | Phase 1 |
| 6 | `src/business-intelligence/api.ts` | M | Phase 1 |
| 7 | `src/business-intelligence/pages/CommerceIntelligenceBI.tsx` | M | Phase 1 |
| 8 | `src/business-intelligence/types.ts` | M | Phase 1 |
| 9 | `src/components/showroom/ProductImageGallery.tsx` | M | Phase 1 |
| 10 | `src/hooks/useSmartWhatsApp.ts` | M | Phase 1 |
| 11 | `src/research-console/pages/campaigns/campaign-service.ts` | M | Phase 1 |
| 12 | `src/services/intent-tracking.ts` | M | Phase 1 |

Proof: `git diff --name-status origin/deploy/showroom HEAD` returns exactly these 12 files;
`git log --oneline origin/deploy/showroom..HEAD` returns exactly `06bdf01`. None is an
inventory/supabase file. They were committed in a previous phase and are **unpushed**, which is
why the UI shows them as changed. No action was taken on them in Phase 2C.

### 1.2 Phase 2C files (untracked working-tree additions — the actual scope)

| # | File | Role |
|---|---|---|
| 1 | `supabase/inventory-central/01-inventory-apply.sql` | SSOT apply draft (revised, H-fixed) |
| 2 | `supabase/inventory-central/02-inventory-rollback.sql` | exact reverse (G-fixed) |
| 3 | `supabase/inventory-central/03-pre-apply-evidence.sql` | pre-apply gate (E-fixed) |
| 4 | `supabase/inventory-central/04-post-apply-verify.sql` | post-apply verify (G4/G5/G6) |
| 5 | `supabase/migrations/00019_inventory_central.sql` | the new migration (H11) — body synced with 01 |
| 6 | `src/__tests__/inventory/sql-migration-gate.test.ts` | static gate test (extended this session) |
| 7 | `docs/audits/controlled-fix-phase-2b-pre-apply-report.md` | Phase 2B report (2B deliverable) |
| 8 | `inventory-phase-c/01-export-origin.html` | export tool (pre-2C, read-only) |
| 9 | `inventory-phase-c/02-reconcile.html` | reconcile tool (F1/F2 fixed) |
| 10 | `inventory-phase-c/README.md` | tool documentation |
| 11 | `inventory-phase-c/exports/chrome-pc.json` | pre-existing sample export (evidence, untouched) |
| 12 | `inventory-phase-c/exports/chrome-profile-8.json` | pre-existing sample export (evidence, untouched) |

`inventory-phase-c/exports/*` predate Phase 2C (timestamps 14:10, before the 2B report at 23:00);
they are stored-out-of-scope evidence and were **not** touched by 2C.

### 1.3 Proven non-changes (explicitly verified this session)

- **00016/00017/00018 untouched:** `git status --porcelain
  supabase/migrations/00016_placements.sql supabase/migrations/00017_placement_columns.sql
  supabase/migrations/00018_lookup_scan_context_rpc.sql` → empty (no modification).
- **00014 not an executable reference:** grep of `00014` in 01/02/03/04/00019 filtered to
  non-comment lines → zero matches. The gate test enforces this for every migration file.
- **00019 is the new inventory migration (H11):** 00016–00018 are reserved by
  placements/placement_columns/lookup_scan_context_rpc; 00019 is the highest number and is the
  only inventory migration. Body of `00019_inventory_central.sql` == body of `01-inventory-apply.sql`
  (verified by diff; only the header comment differs).
- **No SQL execution:** all five `.sql` files carry explicit `NOT EXECUTED / NOT MIGRATED`
  headers; no `supabase`/`psql`/DB command was run in this phase; no migration file was applied.
- **No Supabase data/schema change:** zero live-DB statements (file edits only).
- **No backfill / no cutover / no localStorage deletion:** no localStorage read/write exists in
  the inventory tooling (`01-export-origin.html` is export-only; `02-reconcile.html` is read-only).
- **No UI change:** no `src/` file other than the gate test under `src/__tests__/inventory/`.

---

## 2) Logical diff per approved fix (old → new)

Old patterns below are as documented in the Phase 2B report (section + line refs).

### B1 — INSERT storage policy key (`using` → `WITH CHECK`) — CRITICAL/FUNCTIONAL
- **Old:** raw `INSERT INTO storage.policies` writing the INSERT policy with a `using` key
  (storage requires `check` for INSERT) → upload would be rejected. (2B: B1, 01 §9 940-954)
- **New:** `CREATE POLICY "Staff upload inventory-images" ON storage.objects FOR INSERT TO
  authenticated WITH CHECK (…)` (01:1015-1026). Also adds UPDATE/DELETE (B4) and public SELECT
  read policy (01:1010-1013).

### B2 — storage write policies missing admin role check — CRITICAL/SECURITY
- **Old:** write policies enforced no role; any authenticated user could upload. (2B: B2)
- **New:** every write policy (INSERT/UPDATE/DELETE) requires
  `EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN
  ('admin','super_admin'))` (01:1020, 1033/1037, 1050).

### B3 — arbitrary path upload — HIGH/SECURITY
- **Old:** `inventory_add_image` accepted any `p_path` with no prefix/ownership/existence check.
- **New (RPC):** prefix check `p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%'`
  (01:889-892) + object must already exist in the bucket (01:902-908) + parent row locked
  `FOR UPDATE` (01:895, also fixes B8 position race).
- **New (policies):** `name LIKE 'inventory-images/%'` (01:1021) AND the folder segment must be a
  real `inventory_items.id` via `name LIKE 'inventory-images/' || i.id::text || '/%'`
  (01:1022-1025, 1039-1042).

### B4 — missing storage UPDATE/DELETE policies — MEDIUM
- **Old:** admin could not replace/delete bucket objects → guaranteed orphans.
- **New:** `"Staff update inventory-images"` (01:1028-1043) and `"Staff delete inventory-images"`
  (01:1045-1051), both admin/super_admin gated. `inventory_remove_image` now has a real object
  delete path backed by policy (01:933-962).

### B5 — stock RPCs silently reviving archived/deleted items — HIGH/DATA INTEGRITY
- **Old:** `inventory_add_stock` / `inventory_remove_stock` / `inventory_adjust_stock` rewrote
  `status = inventory_calc_status(...)` with no guard on inactive states.
- **New:** all three add `AND status NOT IN ('archived','discontinued','deleted')` to the UPDATE
  (01:504, 555, 604) with an explicit `RAISE EXCEPTION` when the row is inactive
  (01:513-514, 564-565, 613-614). `inventory_set_published` was already guarded (01:838).

### H8 — realtime via guarded ALTER PUBLICATION — ROBUSTNESS
- **Old:** raw inserts into internal `supabase_realtime.publication(_table)` (fails on other
  instances). (2B: H8, 01 963-988)
- **New:** idempotent `DO` block checking `pg_publication_tables` then
  `ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items / inventory_images`
  (01:1057-1071). Rollback mirrors with guarded DROP (02:10-24).

### H9 — consistent UUID generation — ROBUSTNESS
- **Old:** `extensions.uuid_generate_v4()` (uuid-ossp) mixed with `gen_random_uuid()`.
- **New:** `gen_random_uuid()` everywhere (01:90, 96, 150, 167). Zero `uuid_generate_v4` and zero
  extension dependency in the plan.

### H10 — no PUBLIC EXECUTE on RPCs — HARDENING
- **Old:** `GRANT EXECUTE TO authenticated` without `REVOKE EXECUTE FROM PUBLIC`.
- **New:** dedicated section 8.14 with exactly 14 `REVOKE ALL ON FUNCTION … FROM PUBLIC`
  statements (01:969-988), one per inventory function/helper. Verified at apply time by
  `04:14_no_public_exec`.

### E1/E2/E3 — 03-pre-apply-evidence.sql — DIAGNOSTIC
- **E1 (old fatal):** queried `FROM public.inventory_items` before the table existed (aborted the
  script). **New:** `to_regclass('public.inventory_items')`-style absence probes for all 4 objects
  (03:20-26).
- **E2:** added absence checks for inventory functions (03:31-35), bucket (03:38-39), storage
  policies (03:42-46), publication (03:49-50), `gen_random_uuid` availability (03:57-59), and
  `users.id` type (03:62-64).
- **E3:** `>= 1 admin/super_admin` baseline (03:53-54).

### G1/G2/G3 — 02-inventory-rollback.sql — ROLLBACK
- **G1 (old):** dropped the bucket without clearing objects first. **New:**
  `DELETE FROM storage.objects WHERE bucket_id='inventory-images'` precedes the bucket delete
  (02:27 → 02:32).
- **G2/H12 (old):** policy names fixed as `Public read inventory images` / `Admin write inventory
  images`, mismatching 01. **New:** names synced to the final four
  (`Public read / Staff upload / Staff update / Staff delete inventory-images`) (02:28-31).
- **G3:** rollback header explicitly warns it erases central data (02:5-6).

### G4/G5/G6 — 04-post-apply-verify.sql — VERIFY
- **G4 (old):** admin check used `auth.uid()` (NULL in SQL Editor → permanently FALSE/misleading).
  **New:** admin counter against `public.users` (04:45-46).
- **G5:** storage policy presence (04:52-60) and no-PUBLIC-EXECUTE leak check (04:64-69).
- **G6:** RPC count pinned to exactly 14 (04:28-31); realtime membership check (04:72-75).

### H13 — ownership model (owner decision)
- **Confirmed as decided:** `inventory_management_list()` raises unless
  `role IN ('admin','super_admin')` (01:386-404); `researcher` is NOT in the management path.
  Researcher keeps read-only analytics access to `inventory_movements` only
  (01:294-299). Comment on 01:385 states it; the static gate now pins it.

### F1/F2 — inventory-phase-c/02-reconcile.html — BACKFILL SAFETY
- **F1 (old):** `normRecord` dropped `imagesData` and unlisted fields → canonical dataset could
  not be rebuilt from the report. **New:** the full raw record is embedded as `raw: r`
  (line 134) and every report item carries `origins[].rec = raw` with a top-level note stating the
  canonical dataset must come from these raw records + decisions, never a summary (lines 273-307).
- **F2 (old):** SKU key `modelId|variant|condition|color` (no ram/storage → risky merges).
  **New:** `skuKey` prefers `code` when present, otherwise
  `modelId|ram|storage|variant|condition|color` (lines 162-168).

### H11 — migration numbering
- `supabase/migrations/00019_inventory_central.sql` created and body-synced with the fixed 01.
  00016/00017/00018 untouched; 00014 stays excluded and unreferenced.

---

## 3) Static gate test — what it pins

`src/__tests__/inventory/sql-migration-gate.test.ts` (286 lines, expected 31 tests after this
session's extension):

| Area | Tests | Asserts |
|---|---|---|
| Migration numbering | 4 | zero-padded unique numbers; only legacy pair 003/004; 00019 highest & exists; 00019 body == 01 body |
| 00014 exclusion | 1 | 00014 present but never referenced by executable SQL in ANY migration/01/02 |
| 01 ↔ 02 consistency | 2 | every created function dropped with identical arity; apply/rollback order reversed |
| Security invariants (×2 files: 01 & 00019) | 14 | CREATE POLICY+WITH CHECK (no raw `storage.policies`/`supabase_realtime.publication`); admin-role gates ≥4; `inventory-images/%` path rule; add_image prefix+existence+FOR UPDATE; stock-inactive guards ≥3; exactly 14 REVOKE FROM PUBLIC; guarded ALTER PUBLICATION; `gen_random_uuid()` only |
| 02 rollback G1/G2/G3 | 3 | objects deleted before bucket; 4 policy names synced; erase-warning present |
| 03 evidence E1/E2/E3 | 3 | to_regclass absence probes (no `FROM public.inventory_items`); all E2 checks; admin baseline |
| 04 verify G4/G5/G6 | 3 | admin via public.users (no `auth.uid()`); storage policies + no-PUBLIC-EXECUTE; exact-14 count |
| H13 ownership | 1 | management list admin/super_admin only, no `researcher`; researcher only in movements read |

---

## 4) Test results — PASS / FAIL / NOT RUN (honest, per tree state)

| Check | Tree state | Result | Evidence |
|---|---|---|---|
| Gate test `sql-migration-gate.test.ts` | **original 207-line version (21 tests)** | **PASS (21/21)** | run 23:08 this session: `Test Files 1 passed · Tests 21 passed` |
| Gate test (with this session's +10 tests, expect 31) | **post-edit 286-line version** | **NOT RUN — RESOURCE CONSTRAINT** | `node` cannot start any JS process (exit 127, silent) — system free RAM ~490MB/7.9GB, commit ~87% of 28.4GB (4 OpenCode processes + Chrome + WizTree) |
| `pnpm lint` | pre-edit tree (original gate test) | **PASS — 0 errors, 5229 pre-existing warnings** | earlier this session |
| `pnpm lint` | post-edit tree | **NOT RUN — RESOURCE CONSTRAINT** | same node blocker |
| `pnpm typecheck` | any | **NOT RUN — RESOURCE CONSTRAINT** | same node blocker |
| `pnpm test` (full suite) | any | **NOT RUN — RESOURCE CONSTRAINT** | same node blocker |

No failure was observed. The NOT RUN items are purely environmental (resource starvation), not
project/test failures. They MUST be executed and green before the Schema Apply phase is approved;
no claim of success is made for them.

---

## 5) HARD STOP — next required step

- **Done:** Phase 2C file fixes verified present in 01/02/03/04/00019 + reconcile F1/F2 + gate
  test extended. Zero SQL executed; zero Supabase changes; zero data touched; zero
  backfill/cutover/localStorage changes; no commits made (all Phase 2C files remain untracked).
- **Not done / still required before ANY apply:**
  1. Free system memory, then run the full static gate (31 tests), `pnpm lint`, `pnpm typecheck`,
     and the Phase 2B-listed regression gates — all green.
  2. Independent owner review of THIS report and the 2B report.
  3. Explicit, separate approval of the **Schema Apply** phase. Phase 2C grants NO automatic
     right to execute the migration.
- **Schema Apply, if approved later, is a distinct phase:** run `03` evidence → `00019` migration →
  `04` verify, on a verified database, only after 00014 is removed/disabled from the migrations
  folder and exports are confirmed intact.

**Completion of Phase 2C grants NO authorization to execute anything on Supabase.**
