# P3-A Implementation Report

**Date:** 2026-08-17
**Parent:** P2 checkpoint `3d29392`
**Status:** ✅ COMPLETE — LOCAL ONLY (not applied to DB, not committed)

---

## Summary

P3-A adds the SQL RPC foundation for catalog management operations: reopen (rejected→draft), variant spec editing, model audit history, and enhanced variant listing with model filter. All changes are backward-compatible with P2.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/catalog-central/19-catalog-p3-management-foundation.sql` | ~380 | Migration: 1 index, 1 CHECK expansion, 4 RPCs |
| `supabase/catalog-central/19-catalog-p3-management-foundation-rollback.sql` | ~100 | Full rollback to P2 baseline |
| `supabase/catalog-central/20-catalog-p3-verify.sql` | ~270 | 22 verification checks |
| `src/__tests__/catalog/p3-reopen-rpc.test.ts` | ~170 | 11 tests |
| `src/__tests__/catalog/p3-variant-specs-rpc.test.ts` | ~220 | 15 tests |
| `src/__tests__/catalog/p3-model-history-rpc.test.ts` | ~200 | 10 tests |
| `src/__tests__/catalog/p3-model-list-rpc.test.ts` | ~160 | 15 tests |
| `docs/audits/p3-a-implementation-report.md` | This file | Report |

## Objects Created in Migration 19

### Index
- `catalog_models_approval_status_idx ON catalog_models(approval_status)` — enables efficient admin list filtering

### CHECK Constraint Expansion
- `catalog_model_history_action_check` expanded from `('CREATE','UPDATE','APPROVE','REJECT')` to `('CREATE','UPDATE','APPROVE','REJECT','REOPEN')`
- Safe: 0 rows in `catalog_model_history` at baseline

### RPCs

| # | Function | Signature | Returns | Volatility | Security |
|---|----------|-----------|---------|------------|----------|
| 1 | `catalog_admin_list_variants` | `(text DEFAULT NULL, uuid DEFAULT NULL)` | `SETOF catalog_variants` | STABLE | DEFINER |
| 2 | `catalog_admin_reopen_model` | `(text, timestamptz DEFAULT NULL)` | `catalog_models` | VOLATILE | DEFINER |
| 3 | `catalog_admin_update_variant_specs` | `(text, integer, integer, text, text, timestamptz DEFAULT NULL)` | `catalog_variants` | VOLATILE | DEFINER |
| 4 | `catalog_admin_get_model_history` | `(text, integer, integer)` | `TABLE(id, action, before, after, actor_user_id, actor_email, created_at)` | STABLE | DEFINER |

### RPC Details

#### 1. catalog_admin_list_variants (MODIFIED)
- **Change:** Added optional `p_model_id uuid DEFAULT NULL` parameter
- **Backward compatible:** Old callers passing only `p_status` continue to work
- **DROP required:** PostgreSQL requires DROP+CREATE for parameter addition (no callers outside SQL verification scripts)

#### 2. catalog_admin_reopen_model (NEW)
- **Transition:** `rejected → draft` ONLY
- **Blocked:** `draft→draft`, `approved→draft` (must reject first)
- **Guards:** admin auth, canonical_id validation, approval_status='rejected', optimistic concurrency
- **Audit:** `catalog_model_history` action='REOPEN'

#### 3. catalog_admin_update_variant_specs (NEW)
- **Edits:** `ram_mb`, `storage_gb`, `region`, `status`
- **Recalculates:** `canonical_variant_id` via `catalog_variant_id()` function
- **Collision check:** New `canonical_variant_id` must not conflict with another variant
- **Guards:** admin auth, archived variant blocked, at least one field must change, positive integers, valid status CHECK
- **Audit:** `catalog_variant_history` (NOT `catalog_model_history`)

#### 4. catalog_admin_get_model_history (NEW)
- **Returns:** Model history with actor email (JOIN to `users`)
- **Pagination:** `p_limit` (1-200, default 50), `p_offset` (≥0, default 0)
- **Ordering:** `created_at DESC` (newest first)
- **Read-only:** STABLE, no mutations

## Security

All 4 RPCs follow the P2 security pattern:
- `SECURITY DEFINER` — bypasses RLS
- `SET search_path = public` — prevents search_path injection
- `REVOKE ALL FROM PUBLIC` + `REVOKE EXECUTE FROM anon` + `GRANT EXECUTE TO authenticated`
- `catalog_is_admin()` authorization gate

## Data Safety

- **Zero table modifications:** No rows in `catalog_models`, `catalog_variants`, or any other table are modified by this migration
- **Zero existing data risk:** `catalog_model_history` and `catalog_variant_history` both have 0 rows at baseline
- **No FK changes:** No foreign keys added or modified
- **No RLS changes:** No RLS policies added or modified

## Regression Results

| Check | Result |
|-------|--------|
| TypeScript | 0 errors ✓ |
| ESLint | 0 errors (5441 warnings, pre-existing) ✓ |
| Tests | 1797 passed, 1 failed (pre-existing QR routing flake) ✓ |
| Build | PASS (4.02s) ✓ |
| New tests | 51 tests across 4 files, all passing ✓ |

## Not Applied

This migration has **NOT** been applied to the live database. It must be applied manually via the Supabase SQL Editor before P3-B can proceed.

## Not Committed

These files exist on the working tree but are **NOT committed**. Commit requires explicit user instruction.

## Next Step

**STOP — awaiting owner instruction to commit and/or apply migration 19 to the live database.**
