# FOCUS — Phase 2C Verification Report

- **Status:** VERIFICATION COMPLETE — ALL GATES GREEN.
- **Date:** 2026-08-10 (post memory-relief rerun)
- **Nature:** Verification ONLY. No SQL executed, no Supabase connection/apply, no migration run,
  no backfill, no cutover, no localStorage mutation, no 00014 deletion, no commit/push.
- **Decision boundary:** This report ends with a HARD STOP. Even though every gate below is green,
  the Schema Apply phase (03 → 00019 → 04) is NOT authorized by this report and requires a separate,
  explicit owner approval.

---

## 1) Execution environment note

All runs below were executed after the machine's memory was freed. Node V8 would not start under
heavy memory pressure (exit 127, silent); with available memory restored it ran every command to
completion. This was an environmental constraint, not a project failure. Every PASS below is a real
execution with the stated exit code and output captured to logs.

---

## 2) Results table (Gate 2)

| Gate | Requirement | Result | Evidence |
|---|---|---|---|
| Expanded static gate | 31/31 PASS | **PASS (31/31)** | `pnpm vitest run src/__tests__/inventory/sql-migration-gate.test.ts --reporter=verbose` → `Tests 31 passed (31)`, exit 0 (23:47) |
| Full test suite | `pnpm test` green | **PASS** | `Test Files 130 passed · Tests 1340 passed (1340)`, exit 0 (23:48) |
| ESLint | 0 errors | **PASS** | `✖ 5229 problems (0 errors, 5229 warnings)`, exit 0 — all warnings are pre-existing `design-system` rules, unchanged from prior baseline |
| Typecheck | clean | **PASS** | `tsc --noEmit` produced no diagnostics, exit 0 |
| 01 ↔ 00019 body | MATCH | **MATCH** | diff of `01-inventory-apply.sql` body vs `00019_inventory_central.sql` → only the header comment block differs; all executable lines identical (gate test also pins it) |
| 01 ↔ 02 signatures | MATCH | **MATCH** | gate test "every function created in 01 is dropped in 02 with an identical signature" PASS (14/14, same arity) |
| Migration-number audit | no duplicates; 00019 highest | **PASS** | `ls supabase/migrations/`: 00001–00019 sequential unique; legacy pair 003/004 confirmed known-only |
| 00014 references | 0 executable | **PASS** | non-comment grep of `00014` across 01/02/03/04/00019 → NONE; gate test enforces 0 references in every migration file |
| 00016–00018 modifications | 0 | **PASS** | `git status --porcelain supabase/migrations/` → only untracked `00019_inventory_central.sql`; 00016/00017/00018 untouched |
| SQL execution | 0 | **PASS** | no DB/SQL command was run at any point in verification |
| Supabase changes | 0 | **PASS** | no connection/apply/query against Supabase |
| Backfill | 0 | **PASS** | no data migration tooling executed |
| Cutover | 0 | **PASS** | no cutover step executed |
| localStorage mutation | 0 | **PASS** | inventory tooling is read-only/export-only; no `setItem`/`removeItem` executed |

There are **no FAIL results**. Every item is PASS via actual execution (or MATCH via diff for the
pairwise checks). Nothing is marked PASS that was not run.

---

## 3) Expanded gate detail — 31/31

`src/__tests__/inventory/sql-migration-gate.test.ts` (286 lines) — full list of groups:

| Group | Tests | Status |
|---|---|---|
| Migration numbering (zero-padded unique; legacy 003/004 only; 00019 highest; 00019 body == 01 body) | 4 | PASS |
| 00014 exclusion (frozen but never executed/referenced) | 1 | PASS |
| 01 ↔ 02 consistency (function signatures identical; reversed order) | 2 | PASS |
| Phase 2C security invariants ×2 files (01 + 00019): CREATE POLICY+WITH CHECK, no raw `storage.policies`/`supabase_realtime.publication`, admin-gates ≥4, `inventory-images/%` path rule, add_image prefix+existence+FOR UPDATE, stock-inactive guards ≥3, exactly 14 `REVOKE ... FROM PUBLIC`, guarded `ALTER PUBLICATION`, `gen_random_uuid()` only | 14 | PASS |
| 02 rollback (objects deleted before bucket; 4 policy names synced; erase-warning) | 3 | PASS |
| 03 evidence (to_regclass absence probes; E2 checks; admin baseline) | 3 | PASS |
| 04 verify (admin via public.users, no `auth.uid()`; storage policies + no-PUBLIC-EXECUTE; exact-14 count) | 3 | PASS |
| H13 ownership (management list delegates to single gate `inventory_is_admin()`; gate is admin/super_admin only, no researcher; researcher only in movements read path) | 1 | PASS |
| **Total** | **31** | **31 PASS / 0 FAIL** |

H13 was the single item corrected during this gate cycle. Correction was **test-assertion only**
(no SQL/RPC/RLS/Storage file was modified): the assertion was changed from demanding an inline
`u.role IN (...)` inside `inventory_management_list` (which the design deliberately centralizes in
`inventory_is_admin()`) to verifying the actual architectural contract: management list → single
authorization gate → admin/super_admin-only, researcher absent from admin path and present only in
the read-only movements policy. This preserves the single-authorization-gate design instead of
forcing duplicated role checks.

---

## 4) Full suite detail

- `pnpm test` → **130 test files passed (130), 1340 tests passed (1340)**, exit 0, duration 38.28s.
- Includes the expanded static gate (31), the privacy gates (p3/p5/p7), catalog/exchange inventory
  gates, seed-and-prices, Add/EditInventoryModal, and the full scientific/navigation/i18n/ads/BI
  suites. One pre-existing informational `stderr` note about unused `repair.*` i18n keys was printed
  by a passing test; it is a cleanup hint, not a failure (test itself PASS, suite exit 0).

## 5) Lint / typecheck detail

- `pnpm lint` → exit 0. `5229 problems (0 errors, 5229 warnings)`. All 5229 warnings are
  pre-existing `design-system` style rules across the app; none relate to the Phase 2C files or the
  gate test, and the count matches the pre-2C baseline exactly.
- `pnpm typecheck` → exit 0, `tsc --noEmit` no diagnostics.

---

## 6) Static audits (independent of tests)

- **01 ↔ 00019:** `diff <(sed -n '/^-- ===/,$p' 01-inventory-apply.sql) 00019_inventory_central.sql`
  shows differences only in the leading comment header (title / status / source-of-truth note). All
  executable SQL is identical. **MATCH.**
- **01 ↔ 02 signatures:** gate test asserts every one of the 14 functions created in 01 is dropped
  in 02 with identical argument count (incl. the 15-arg `inventory_update_details`), and that no
  function is dropped that 01 does not create. **MATCH (14/14).**
- **Migration numbers:** 00001→00019 sequential, unique; `003_/004_` legacy pair is the only
  non-padded entry and is the known historical pair. **PASS.**
- **00014 references:** non-comment grep across `supabase/inventory-central/*.sql` and
  `00019_inventory_central.sql` for `00014` → **NONE.** The gate test additionally asserts zero
  executable references in every migration file. **PASS.**
- **00016/00017/00018 untouched:** `git status --porcelain supabase/migrations/` lists only
  untracked `00019_inventory_central.sql`. No modification to 00016/00017/00018. **PASS.**

---

## 7) Git status / diff summary

```
## deploy/showroom...origin/deploy/showroom [ahead 1]
?? docs/audits/controlled-fix-phase-2b-pre-apply-report.md
?? docs/audits/controlled-fix-phase-2c-report.md
?? inventory-phase-c/
?? src/__tests__/inventory/sql-migration-gate.test.ts
?? supabase/inventory-central/
?? supabase/migrations/00019_inventory_central.sql
```

- `git diff` (tracked working tree) → **empty**. No tracked file was modified by any phase.
- All Phase 2C artifacts are **untracked** (nothing committed, nothing pushed).
- Branch is **ahead of origin by 1** = commit `06bdf01` (Phase 1 showroom/ads/BI fixes), which is a
  prior-phase deliverable unrelated to Phase 2C and awaiting a separate push decision.
- No commit was created for this verification, per the strict constraint.

---

## 8) Explicit zero-change confirmation

| Item | Count |
|---|---|
| SQL executed against any database | **0** |
| Supabase connection / apply / query | **0** |
| Migration executed (00019 or any) | **0** |
| 03 / 04 scripts run on a database | **0** |
| Backfill | **0** |
| Cutover | **0** |
| localStorage read/write/delete mutation | **0** |
| Image transfer/delete | **0** |
| UI modification | **0** |
| 00014 deletion or modification | **0** |
| Commit / push | **0** |

---

## 9) HARD STOP

- **Done:** all Verification Gates green — expanded gate 31/31, full suite 130 files / 1340 tests,
  lint 0 errors, typecheck clean, all static audits PASS.
- **Not authorized by this report:**
  - Schema Apply (run `03-pre-apply-evidence.sql` → apply `00019_inventory_central.sql` →
    run `04-post-apply-verify.sql`) is **NOT approved**.
  - Deleting/removing `00014_inventory_tables.sql` from the migrations folder is **NOT approved**.
    Any future removal requires the owner-mandated evidence: 00014 never applied on the target DB,
    no operational references, no dependency chain, 00015–00018 independent of its objects, no
    migration-history divergence, and no separate production/staging environment needing its own
    handling.
- **Next step (owner):** independent review of this report and the Apply Plan, then a **separate,
  explicit approval** for the Schema Apply phase. Verification green ≠ apply authorization.

**Completion of the Verification Gate grants NO authorization to execute anything on Supabase.**
