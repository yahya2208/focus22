# SECURITY HARDENING WAVE — EXECUTIVE REPORT

**Date:** 2026-09-06 **Scope:** Production Supabase (project `fmggysdqigtejxbfpgtg`, PG 17.6) **Execution:** one coordinated security-hardening wave (Gate-1 deferred items) across workstreams A–I.

---

## 1. Verdict

**PASS WITH DEFERRED HARDENING**

Everything this wave set out to fix is applied, verified on production, and covered by replay tests. Five workstreams produced concrete security/performance changes; four are intentionally deferred or documented as no-change (with evidence), none of which block the verdict.

Linter findings went **400 → 356** (net **−44** across 6 rule categories, with exactly **+1** intentional informational finding from the new lock, see §5).

---

## 2. Scope & Objectives

Gate 1 production hardening audit surfaced 400 Splinter findings across 10 rule categories against `public` + storage. The wave organized remediation into workstreams A–I, each either **implemented**, **deferred** (with documentation), or **declared intentional** (no-change):

| WS | Finding surface | Verdict |
|----|-----------------|---------|
| A | `_gcr3_preapply_models` exposed snapshot (RLS off, grants open, no PK) | **FIXED** (00072) |
| B | `function_search_path_mutable` (×2) | **FIXED** (00075) |
| C | `public_bucket_allows_listing` (broad public SELECT/listing on ads-images + category-covers) | **FIXED** (00073) |
| E | `auth_rls_initplan` (public-qual initplan-prone policies) | **FIXED** (00074) |
| D | Leaked Password Protection | **DEFERRED (manual)** — Auth-dashboard config, not in DB |
| F | `multiple_permissive_policies` (×44) | **INTENTIONAL** — OR-semantics by design |
| G | `unused_index` (×39) + `unindexed_foreign_keys` (×27) | **DEFERRED** — no evidence of hot spots |
| H | `verify_claim_token` single-identifier contract | **DEFERRED** — contract by design |
| I | `security_definer_view` (×2) | **NO CHANGE** — INVOKER would break public reads |

---

## 3. Changes Applied (00072 → 00075)

All applied to production **in one `--single-transaction`** (apply-wave, 2026-09-06).

### 00072 — WORKSTREAM A: `public._gcr3_preapply_models` exposure (catalog-gc-r3 snapshot)
- `ENABLE ROW LEVEL SECURITY` (no policies) — closes `rls_disabled_in_public`; table becomes opaque to clients.
- `REVOKE ALL` from `anon` + `authenticated` — privilege-level deny (verified: both get `permission denied for table …` at runtime, see §4 probes).
- `ADD PRIMARY KEY (id)` — closes `no_primary_key`; dedup semantics.
- `GRANT ALL` to `service_role` (+ explicit re-grant) — preserves the internal reconciliation contract.
- Generator hardened: `scripts/catalog-gc-r3-build-apply.ts` now emits the same closes after every future recreation of the snapshot, so re-runs stay locked.

### 00073 — WORKSTREAM C: storage bucket listing exposure
- Dropped `"Public read ads-images"` and `"Public read category-covers"` SELECT policies on `storage.objects`.
- **Kept** `"Public read inventory-images"`: `inventory-central-service.ts centralListImages()` lists folders for anon + authenticated public display (runtime path, verified).
- Public GET-URL access unchanged; all 9 authenticated staff upload/update/delete policies preserved verbatim.

### 00074 — WORKSTREAM E: RLS `auth_rls_initplan` hardening (39 policies)
- Every `auth.uid()/auth.role()/auth.jwt()/auth.email()` call inside the 39 flagged public RLS policies is now evaluated in a `(select …)` initplan (Supabase-documented fix): **once per query instead of once per row**.
- Purely mechanical transform: permissive / roles / cmd / USING / WITH CHECK reproduced verbatim; only the wrapper is added.
- **Instance note:** `CREATE OR REPLACE POLICY` is syntactically rejected by this instance, so each pair is `DROP POLICY IF EXISTS` + `CREATE POLICY` — atomic under the single-transaction apply (no other session can observe a gap).
- Generated fresh from production `pg_policies`; **39/39 vs the Gate-1 lint list** (missing=[], extra=[]).

### 00075 — WORKSTREAM B: function search_path hardening (×2)
- `SET search_path = ''` on `public.update_updated_at()` (plpgsql trigger) and `public.inventory_calc_status()` (sql immutable).
- Both bodies reference only `pg_catalog` (`now()`) or row/param values — no non-pg_catalog, no user schemas, no table references → pure hardening, resolution provably unchanged. Signatures and behavior identical (body preserved, confirmed by tests).

---

## 4. Verification & Evidence

| Check | Result |
|-------|--------|
| Replay 00072/00073/00074/00075 in `BEGIN/ROLLBACK` | **PASS ×4** (`A-OK: rls=t pk=yes anon/auth grants=0 service_role_allowed rows=866`; `C-OK: ads-images dropped, category-covers dropped, inventory-images kept, staff=9`; `E-OK: initplan-prone=0, expr-semantic-mismatch=0, roles/cmd/permissive-mismatch=0, total policies unchanged (85=85)`; `B-OK: search_path empty, inventory bands identical, trigger sets updated_at`) |
| Apply to production `--single-transaction` | **Applied cleanly**, no errors (ON_ERROR_STOP=1) |
| POST-APPLY state (live DB) | `_gcr3`: rls=t, pk=t, rows=866, anon/authenticated grants=0, service_role=7 privilege rows; storage: ads-images/category-covers public-read=**false**, inventory-images public-read=**true**, staff=**9**; `public` policies: **85/85**, initplan-prone=**0**; both functions `proconfig={"search_path=\"\""}` |
| Runtime probes (live, role-based) | `anon`/`authenticated` → `permission denied` on `_gcr3_preapply_models` (cannot even SELECT 0 rows); `anon` listing `ads-images`=**0**, `category-covers`=**0**, `inventory-images`=**65** (kept path works); `service_role` reads `_gcr3`=**866** (reconciliation contract intact) |
| Semantic identity (E) | 39/39: after normalizing the initplan wrapper and streaming parens/whitespace, expressions are byte-identical to pre-apply (PG re-formats `(select …)` as `( SELECT auth.<fn>() AS …)` at store time, so text-strict compare is invalid; structural/semantic compare passes) |
| Test suite | **3502/3502 passed** (281 files), incl. pilot-migration gate **53/53** (00072–00075 structure/wrapper/body assertions) |
| Typecheck | `tsc --noEmit` **0 errors** |
| Lint (touched files) | gate test **clean**; generator change adds no errors (file pre-exists with unrelated legacy `any` errors, outside `eslint src/` scope) |

---

## 5. Linter Delta (Splinter, live production, BEGIN/ROLLBACK)

| Rule | Before | After | Δ |
|------|-------:|------:|--:|
| `anon_security_definer_function_executable` | 85 | 85 | 0 |
| `authenticated_security_definer_function_executable` | 145 | 145 | 0 |
| `auth_rls_initplan` | 39 | 0 | **−39** |
| `function_search_path_mutable` | 2 | 0 | **−2** |
| `multiple_permissive_policies` | 44 | 44 | 0 |
| `no_primary_key` | 1 | 0 | **−1** |
| `public_bucket_allows_listing` | 3 | 1 | **−2** |
| `rls_disabled_in_public` | 1 | 0 | **−1** |
| `rls_enabled_no_policy` | 12 | 13 | **+1** ⚠️ |
| `security_definer_view` | 2 | 2 | 0 |
| `unindexed_foreign_keys` | 27 | 27 | 0 |
| `unused_index` | 39 | 39 | 0 |
| **TOTAL** | **400** | **356** | **−44** |

⚠️ The `+1` is **intentional and expected**: `public._gcr3_preapply_models` now has RLS enabled with **zero policies** by design (service_role-only; no client-facing policy should ever exist on the snapshot). It replaces the two worse flags it previously carried in the same table family (`rls_disabled_in_public` −1, `no_primary_key` −1). Documented in the migration header and below.

`public_bucket_allows_listing` keeps 1 finding because `inventory-images` intentionally retains a listing policy for the public image-list runtime path (§3 C).

---

## 6. Deferred / Intentional Register

| ID | Item | Rationale (evidence) | Owner action |
|----|------|----------------------|--------------|
| D | Leaked Password Protection (depending on the auth dashboard flag) | Not a DB exposure: `auth.config` has no such table; feature is a **Project Settings → Authentication** dashboard toggle, applied by the Auth service, not SQL | Manual: enable "Enforce leaked password protection" in the Auth dashboard |
| F | 44 `multiple_permissive_policies` groups | Every group is deliberate OR-semantics (public-read + staff-manage + own-row + admin); converting to a single policy would be a functional rewrite with zero security gain | Keep; treat as documentation |
| G | 39 `unused_index` + 27 `unindexed_foreign_keys` | All candidate tables are tiny (catalog_variants=1816, campaign_intents=812, sessions=134/430, campaign_qr_events=243, ≤170 elsewhere or unanalyzed), with **no production evidence of hot paths**; index drops are explicitly not permitted without evidence | Re-evaluate on real workload telemetry |
| H | `verify_claim_token` accepts a single identifier (code **or** token hash) | QR-scan/manual-entry P3 challenge flow (`challenge-service.ts`) — verify flow sends **one** of code or token by design; requiring both would break the valid P3 contract | Keep as designed; no change |
| I | `v_public_inventory` / `v_public_listings` remain SECURITY DEFINER | Used only for public reads/customer projection (`inventory-central-service.ts`, `listing-service.ts:505`, `listing_search`); invoker-mode would break (no direct table grants) | Keep as designed; no change |
| — | `rls_enabled_no_policy` on `_gcr3_preapply_models` | Intentional zero-policy lock (see §5) | Keep; do not add policies |

---

## 7. Scope Integrity

- **Applied migrations 00068–00071: untouched** (never edited; new migrations only).
- **Unrelated workstreams untouched and not committed** with this wave: settings / ads / catalog / inventory epics, `00064_admin_control_center_pass2.sql`, `supabase/verify/*`, `docs/audits/migration-reconciliation-telemetry-desync.md`, settings tests.
- **Hard rules preserved:** RLS enabled everywhere it was, no `SECURITY DEFINER` changed, P3 guest policy intact, pilot architecture/telemetry/RBAC/`ROLE_PERMISSIONS`/`ROLE_CAPABILITY_MAP` untouched.
- Only files changed by this wave: 4 migrations (00072–00075), `scripts/catalog-gc-r3-build-apply.ts` (generator durability), `src/__tests__/pilot/pilot-migration-gate.test.ts` (gate tests), this report.

## 8. Risk & Rollback

- All migrations are additive/hardening only; they change the deny surface, not the allow surface, so no privileged path is lost.
- Rollback path (if ever needed): re-grant anon/authenticated on `_gcr3` (recreate `Public read ads-images`/`category-covers` policies), and `CREATE OR REPLACE … SET search_path = pg_catalog` on the two functions. 00074 is intentionally left in place (initplan wrapping is the recommended end state).
- Remote risk from 00074: any hand-written policy that relied on per-row evaluation semantics is negated by the documented one-per-query behavior — covered by the semantic-identity replay (39/39) and the live parameter bounds.

## 9. Evidence Files

`supabase/migrations/00072|00073|00074|00075_secwave_*.sql` · replay scripts (replay-0007{2,3,4,5}.sql) · `post-verify.sql` · Splinter before/after captures (`lints-clean.txt` / `lints-after2.txt`) · `wave-tests.log` (3502 passed) · `wave-tsc.log` (clean).

## 10. Next Steps

1. Manual dashboard action: enable **Leaked Password Protection** (§6 D).
2. Re-run Splinter after the Auth change to confirm the final board.
3. Revisit §6 G on scaled telemetry (watch rows/heat, then index).
4. Continue the Gate-2 review backlog with the reduced baseline (356).