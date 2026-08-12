# FOCUS — Plan P0-1: Inventory Cutover (Phase A) — EXECUTION REPORT

- **Date:** 2026-08-11
- **Parent plan:** `docs/release/production-bugs/plan-p0-1-inventory-cutover.md` (Rev 2)
- **Parent report:** `docs/release/production-bugs/ad-multi-image-inventory-sync.md` (BUG-INV-001)
- **Status:** PHASE A SQL EXECUTION **COMPLETE** — backfill VERIFIED; Step 7 **N/A / BLOCKED**
  (no source mappings exist). Application facade cutover (plan §9-§15) = **NOT STARTED**, separate GO.

---

## 1. Execution protocol honored

- All SQL executed manually as **postgres** in the Production Supabase SQL Editor by the owner.
- Every write ran only after explicit owner GO for that specific step; evidence reviewed between steps.
- No credential/connection secret was requested or handled by tooling.
- No migration, no schema recreation, no DROP, no Gate 2 modification, no re-apply of
  `01-inventory-apply.sql`.

## 2. Gate / Step status

| Gate / Step | Artifact | Type | Status | Evidence |
|---|---|---|---|---|
| Gate 2 | `00019_inventory_central.sql` applied state | (already applied) | **CLOSED / VERIFIED** | `04` = 15/15 PASS; `05` = 36/36 PASS (records in `docs/audits/phase-2c-schema-apply-plan.md`) |
| Step 1 | `04-post-apply-verify-unified.sql` | read-only | **PASS (15/15)** | owner-reviewed grid |
| Step 2 | `05-constraint-data-reconciliation.sql` | read-only | **PASS (36/36)** | owner-reviewed grid |
| Step 3 | Canonical 8 SKUs cross-check | read-only | **PASS** | `chrome-pc.json` ↔ `evidence/canonical-dataset.json` (§3) |
| Step 4 | `06-inventory-backfill-canonical.sql` (Guard 2 approved; total=8 added) | **WRITE** | **COMPLETE — 8/8 committed, COMMIT** | owner-approved Guard 2; COMMIT output |
| Step 5 | Verify 8/8 after backfill | read-only | **PASS** | owner review |
| Step 6 | `08-post-backfill-verify.sql` | read-only | **PASS** — row_items=8/8, row_movements=8/8, row_images=0/0, source_key_unique=8/8, published_none=0/0, pub_view_consistent=0/0, pub_published_not_inactive=0/0, fk_total=5/5, RLS on all 3 tables PASS, all base constraints PASS | owner-reviewed grid |
| **Step 7** | `07-remap-ad-phone-links.sql` | WRITE (UPDATE) | **N/A / BLOCKED — NOT EXECUTED** | §3 below |
| Step 8+ | App facade cutover (plan §9-§15) | code | **NOT STARTED** | separate owner GO required |

## 3. STEP 7 — `07-remap-ad-phone-links.sql`: **N/A / BLOCKED**

**Decision (owner-approved, adopted formally 2026-08-11):** no UPDATE is executed.

**Reason:**
> `No existing ad→inventory source mapping exists in Production; no rows require remapping.`

**Verified facts:**
- `public.ads.device_id` **exists** in Production (column present).
- Pre-check = **0 rows** (passes only vacuously — no non-empty `device_id` exists to evaluate).
- Production snapshot captured **before any change** (owner-reviewed, full `public.ads`).
- All **7** `public.ads` rows have `device_id = ''` and `link = ''`.
- No reliable legacy relationship exists to drive a remap.
- There is **no automatic ad→phone mapping in the architecture**; linking is done exclusively by
  Admin selection (AdsManager → `InventoryService.getExchangeableDevices()` → `saveAd`).
- Therefore **no synthetic/ordered mapping between the 7 ads and the 8 canonical inventory items
  may be invented.**

**Consequences / mandates:**
1. Step 7 recorded as **N/A / BLOCKED** — this is **not a technical failure** of `07` or the
   migration; it is the correct outcome given zero source mappings.
2. Reason recorded verbatim: `No existing ad→inventory source mapping exists in Production; no rows
   require remapping.`
3. Snapshot retained as **baseline for rollback/evidence**.
4. `public.ads` is **NOT modified**.
5. `07-remap-ad-phone-links.sql` is **NOT executed**.
6. **No automatic mapping** is created.
7. **No additional migration** is executed to address this.

**Future path (when the owner needs an ad linked to a phone):** performed explicitly in Ads Manager
by selecting the appropriate central inventory item, then verify the resulting `device_id` and
`link`.

### 3.1 Evidence artifact note (baseline snapshot)

- The owner reviewed the full `public.ads` snapshot in the SQL Editor (7 rows; `device_id=''`,
  `link=''` on all rows) **before any change**.
- The evidence file `docs/release/production-bugs/evidence/ads-links-pre-remap.json` does **not yet
  exist** in the repository. It is retained as the baseline source of truth; it should be saved from
  the owner's SQL Editor output to that path so the rollback/evidence trail is self-contained.
  **No tooling fabricated or wrote this file** — it must contain the actual Production rows.

## 4. Phase A outcome

- **Canonical inventory backfill: VERIFIED / PASS** — 8/8 central rows committed, structurally and
  data-wise sound (constraints, FKs, RLS, publish gating, movements, uniqueness all PASS).
- **Step 7 (ads phone-link remap): N/A / BLOCKED** — no data to remap; no ads touched; no synthetic
  mapping created.
- **Not yet started (requires separate owner GO):** application facade cutover to Supabase central
  tables (plan §9), localStorage retirement (§10-§11), cross-device acceptance (§12-§13),
  regression (§14), final report (§15).
