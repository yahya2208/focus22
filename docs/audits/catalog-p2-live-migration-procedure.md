# P2 Live Migration Procedure

## Prerequisites

- Supabase SQL Editor access to project `fmggysdqigtejxbfpgtg`
- Role: `postgres` (owner)
- Current state: 2178 models (all draft/active), 1816 variants (all known)

## Preflight

Before applying any migration, run this query in SQL Editor to confirm baseline:

```sql
SELECT
  (SELECT count(*) FROM catalog_models) AS models,
  (SELECT count(*) FROM catalog_variants) AS variants,
  (SELECT count(*) FROM catalog_models WHERE approval_status = 'draft') AS draft,
  (SELECT count(*) FROM catalog_models WHERE approval_status = 'approved') AS approved;
```

Expected: `models=2178, variants=1816, draft=2178, approved=0`

## Migration Order

Apply in strict order: **14 → 15 → 16 → 17 → 18**

Each file is a separate paste-and-run in the SQL Editor.

### Step 1: File 14 — ACL Hardening

**File:** `supabase/catalog-central/14-catalog-p2-acl-fix.sql`

**What it does:**
- REVOKEs anon EXECUTE on `catalog_admin_approve_model(text,boolean)` (old 2-param)
- REVOKEs anon EXECUTE on `catalog_admin_update_variant(text,text)`
- These REVOKEs on the old approve_model signature become moot after File 15 drops it
- The update_variant REVOKE is the **sole** ACL fix for that function

**Expected result:** SELECT verification queries at bottom of file return `PASS` for A1–A3

**Rollback:**
```sql
GRANT EXECUTE ON FUNCTION public.catalog_admin_approve_model(text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.catalog_admin_update_variant(text, text) TO anon;
```

### Step 2: File 15 — Transition Guard + Concurrency for approve_model

**File:** `supabase/catalog-central/15-catalog-p2-transition-guard.sql`

**What it does:**
- DROPs old 2-param `catalog_admin_approve_model(text, boolean)`
- CREATEs new 3-param `catalog_admin_approve_model(text, boolean, timestamptz DEFAULT NULL)`
- Adds: admin gate, active status gate, draft-only transition guard, variant gate, optimistic concurrency
- REVOKEs/GRANTs on new 3-param signature

**Expected result:** Function exists with 3 params. Old 2-param is gone.

**Rollback:**
```sql
DROP FUNCTION public.catalog_admin_approve_model(text, boolean, timestamptz);
-- Then re-apply file 12 to restore original 2-param version
```

### Step 3: File 16 — Concurrency Guard for update_model

**File:** `supabase/catalog-central/16-catalog-p2-concurrency-guard.sql`

**What it does:**
- DROPs old 7-param `catalog_admin_update_model`
- CREATEs new 8-param `catalog_admin_update_model` with `p_expected_updated_at`
- Preserves all existing field immutability, name uniqueness, rename reset logic
- REVOKEs/GRANTs on new 8-param signature

**Expected result:** Function exists with 8 params. Old 7-param is gone.

**Rollback:**
```sql
DROP FUNCTION public.catalog_admin_update_model(text, text, text, integer, text[], text[], text, timestamptz);
-- Then re-apply file 12 to restore original 7-param version
```

### Step 4: File 17 — Snapshot RPC

**File:** `supabase/catalog-central/17-catalog-p2-snapshot-rpc.sql`

**What it does:**
- CREATEs `catalog_export_snapshot()` returning all models + variants as JSONB
- Single SQL statement for consistent snapshot (READ COMMITTED)
- REVOKEs/GRANTs: anon=NO, authenticated=YES

**Expected result:** Function exists. Test: `SELECT jsonb_array_length((catalog_export_snapshot()->>'models')::jsonb);` should return `2178`

**Rollback:**
```sql
DROP FUNCTION public.catalog_export_snapshot();
```

### Step 5: File 18 — Verification

**File:** `supabase/catalog-central/18-catalog-p2-verify.sql`

**What it does:**
- READ-ONLY verification of all P2 changes
- 26 checks: ACL (A1–A10), Security (S1–S6), Signatures (G1–G5), Data (D1–D6), Snapshot (T1–T3)

**Expected result:** 26 total | 26 PASS | 0 FAIL

**If any check FAILs:** Do NOT proceed. Investigate the specific failure.

**If all PASS:** P2 SQL migrations are verified.

## Post-Migration Verification

After all 5 files are applied, run these probes:

### Probe 1: Anon ACL (CRITICAL)
```sql
-- Must return: false (function not executable by anon)
SELECT has_function_privilege('anon', 'public.catalog_admin_approve_model(text,boolean,timestamptz)', 'EXECUTE');
SELECT has_function_privilege('anon', 'public.catalog_admin_update_model(text,text,text,integer,text[],text[],text,timestamptz)', 'EXECUTE');
SELECT has_function_privilege('anon', 'public.catalog_admin_update_variant(text,text)', 'EXECUTE');
SELECT has_function_privilege('anon', 'public.catalog_export_snapshot()', 'EXECUTE');
```

### Probe 2: Snapshot Exists
```sql
-- Must return: 2178
SELECT jsonb_array_length((catalog_export_snapshot()->>'models')::jsonb);
-- Must return: 1816
SELECT jsonb_array_length((catalog_export_snapshot()->>'variants')::jsonb);
```

### Probe 3: Live Recon Script
```bash
npx tsx scripts/catalog-p2-live-recon.ts
```
Expected: `catalog_export_snapshot(): OK` (no longer PGRST202)

### Probe 4: Full Verification
Run `18-catalog-p2-verify.sql` again — all checks must PASS.

## Critical Notes

1. **File 14 is essential for `update_variant`.** No other file fixes its ACL.
2. **Files 15 and 16 change function signatures.** Old callers passing wrong param count will fail.
3. **All REVOKEs happen in the same transaction as CREATE.** There is no window where anon can access the new function.
4. **Zero approved models is correct.** The pipeline will produce zero eligible models until an admin approves models via the new RPC.
5. **DO NOT mass-approve models.** The 0-approved state is intentional and expected.

## After Verification

Once File 18 passes and probes confirm:
1. Run `scripts/catalog-p1-generate.ts --snapshot` — should produce zero-model output (expected)
2. Run `scripts/catalog-p1-generate.ts --snapshot --force` — should write zero-model JSON with legacy safety warning
3. The P2 approval UI will be functional in the app for admin users
