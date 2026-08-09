# FOCUS v2 — Final Privacy Cleanup & QR Attribution Hardening (Remediation Report)

- **Date:** 2026-08-08
- **Repository root:** `E:\dll\focus\focus22`
- **Base:** `HEAD = 4d0b61f` (`docs(audit): close CR-00005 as NON-APPLICABLE/NEVER_DEPLOYED, open E-9 reassessment`)
- **Mode:** App-side code + tests + documentation only. **No SQL/DDL/DML/migrations/DB change. No commit/push.** Execution ends in a HARD STOP: this report is the Before/After deliverable awaiting owner review.
- **Scope discipline:** CR-00005 `CLOSED — NON-APPLICABLE / NEVER_DEPLOYED` and E-9 `OPEN — REASSESSMENT ONLY` frozen. Repair subsystem, `users` RLS, `system_settings`, `audit_log`, `job_assignments`, `ads`, `inventory`, `catalog`, and game architecture frozen — no file in any frozen/protected prefix was modified in this execution.

---

## 1. Executive Summary & Verdict

**VERDICT: `FOCUS v2 PRIVACY CLEANUP COMPLETE — HARD STOP`**

The remediation items approved by the owner on 2026-08-08 are executed and verified. The only live app-side PII capture (sticker scan persisting `navigator.userAgent` + `document.referrer`) is removed and replaced with an idempotent sanitizer. Five proven-dead privacy-sensitive modules (and their tests) are deleted under an explicitly recorded P6 gate-01 classification change. On owner-run live evidence (`trade_requests` does not exist; RLS `ALL_RLS_PROTECTED`), the four dead `trade_requests` BI reads are removed and F-03/F-09 are closed. A new P7 privacy-regression gate and a sticker-sanitizer unit suite lock the behavior in. A written retention policy documents the no-TTL posture.

This report does **not** claim "100% clean", "100% secure", "zero historical data", or "GDPR compliant": F-07 retention enforcement stays app-side/deferred (no TTL), F-10 is an in-memory notice with no persistent consent record, and no SQL/DB change was executed. F-03 and F-09 are closed on **owner-run, read-only** live-DB evidence recorded in §9.5/§9.6.

---

## 2. Before → After (Delta)

| Area | Before | After |
|---|---|---|
| Sticker scan write | `logScanWithMetadata(..., ip, userAgent, referrer)` persisted `navigator.userAgent` + `document.referrer` to `localStorage["sticker_scans"]` (`StickerScanHandler.tsx:28`, `sticker-database.ts:62-89`) | Anonymous only: `serialNumber/campaign/cta/scannedAt/location`. `ip/userAgent/referrer` removed from call-site, signature, stored event, and type (`StickerScanEvent`). |
| Legacy persisted PII | Any old localStorage rows still carrying `ip/userAgent/referrer` would be loaded verbatim | `sanitizeStoredScans()` strips the three PII fields on write **and** on load (`sticker-database.ts`); idempotent; safe when key absent/invalid. |
| Device fingerprint module | `src/core/device/index.ts` (UA/pointer/screen collector) + barrel export | Deleted; `parser.ts` (brand/model) retained for BI/Research (P6 red-gate-04 exception). |
| Supabase session writer | `src/core/supabase/data-service.ts` + `PersistenceProvider.tsx` | Deleted (both were already no-op shells). No Supabase writer reachable from runtime. |
| Dormant PII localStorage services | `src/services/customer-memory.ts`, `src/services/device-ledger.ts` + `device-ledger.test.ts` | Deleted under recorded P6 gate-01 PRESERVE→DELETE classification change (§6). |
| Gates | P3/P4/P5/P6 asserted "provider does not collect" (read-from-file) | P3/P4/P5/P6 rewritten to **ABSENCE** assertions (file missing / zero callers). New **P7** regression gate + sticker sanitizer suite added. |
| Docs | audit report only | Retention policy (`privacy-retention-policy.md`) + this remediation report. |

**Net diff:** 16 tracked files touched: `-1423 / +115` lines (verified `git diff --stat`, includes the F-09 `api.ts` dead-read removal). Working tree adds 2 new test files and 2 new docs (all untracked).

---

## 3. Files Changed (tracked)

| File | Change |
|---|---|
| `src/screens/stickers/StickerScanHandler.tsx` | F-01: drop `navigator.userAgent`/`document.referrer` args from `logScanWithMetadata` |
| `src/services/sticker/sticker-database.ts` | F-01: drop PII params; add `sanitizeStoredScans()` + `sanitizeList()`; sanitize on write and load |
| `src/services/sticker/sticker-types.ts` | Remove `ip`/`userAgent`/`referrer` from `StickerScanEvent` |
| `src/core/index.ts` | Remove barrel re-export of deleted device module |
| `src/core/device/index.ts` | **DELETED** |
| `src/core/supabase/data-service.ts` | **DELETED** |
| `src/core/supabase/PersistenceProvider.tsx` | **DELETED** |
| `src/services/customer-memory.ts` | **DELETED** |
| `src/services/device-ledger.ts` | **DELETED** |
| `src/__tests__/device/device.test.ts` | **DELETED** |
| `src/__tests__/device-ledger.test.ts` | **DELETED** |
| `src/__tests__/supabase/data-service.test.ts` | **DELETED** |
| `src/__tests__/session/lifecycle.test.ts` | Remove deleted-module imports; replace PersistenceProvider/live-sessions simulation blocks with absence + in-memory behavior + self-contained Android UA parser tests |
| `src/__tests__/research-console/no-key-warnings.test.tsx` | Drop `resetDataService` import/call (module deleted); keep `resetSupabaseClient`/`resetRepairDataService` |
| `src/__tests__/privacy/p3-stop-write-gate.test.ts` | PG-02 asserts `PersistenceProvider.tsx`+`data-service.ts` ABSENT; importers must be empty |
| `src/__tests__/privacy/p4-game-minimization-gate.test.ts` | PG-03/32/33 rewritten to file-absence + no-fingerprint-persistence + in-memory-session assertions |
| `src/__tests__/privacy/p5-telemetry-qr-removal-gate.test.ts` | PG-56 → data-service ABSENT + no callers |
| `src/__tests__/privacy/p6-red-gate-01-localstorage-pii-removal.test.ts` | PROTECT/PRESERVE flipped to ABSENCE (records the P6 gate-01 classification change) |
| `src/business-intelligence/api.ts` | F-09: removed the four dead `trade_requests` reads (was lines 37, 151, 235, 292); downstream aggregate logic preserved with an empty source, matching the verified live state (table absent) |

**Files added (untracked):** `src/__tests__/privacy/p7-privacy-regression-gate.test.ts`, `src/__tests__/sticker/sticker-database.test.ts`, `docs/audits/privacy-retention-policy.md`, `docs/audits/final-privacy-qr-remediation-report.md`.

---

## 4. Removed — Dead-Code Proof (per module)

Reachability audit evidence: zero production importers existed for every deleted module before deletion.

| Module | Removed lines | Reachability evidence |
|---|---|---|
| `src/core/device/index.ts` | 182 | No production import of `collectDeviceProfile`/`DeviceProfile` (only `__tests__/session/lifecycle.test.ts`, updated). `core/index.ts` re-export removed. `parser.ts` retained (BI `business-intelligence/api.ts:3`, Research `core/research/api-supabase`). |
| `src/core/supabase/data-service.ts` | 94 | Only importer was `__tests__/research-console/no-key-warnings.test.tsx` (updated). Production Supabase usage goes through `client.ts`/`repair-data-service.ts` only. |
| `src/core/supabase/PersistenceProvider.tsx` | 23 | No-op shell; zero production importers (P3 gate scans whole src). |
| `src/services/customer-memory.ts` | 201 | Dormant since P6 (REASSESS/PRESERVE); zero production importers — proven by the P6 gate's own caller scan. |
| `src/services/device-ledger.ts` | 369 | Dormant; zero production importers. Only remaining textual reference is a **stale comment** in the frozen `src/services/inventory-service.ts:14` (protected file — intentionally not edited; excluded by gates via comment-stripping). |
| `src/__tests__/device/device.test.ts`, `src/__tests__/device-ledger.test.ts`, `src/__tests__/supabase/data-service.test.ts` | 54 / 178 / 104 | Tests of deleted modules removed with them. |

## 5. P6 Gate-01 Classification Change Record (owner-approved 2026-08-08)

- **Change:** `customer-memory.ts` and `device-ledger.ts` reclassified **PRESERVE → DELETE**.
- **Why allowed:** The owner's P6 decision kept them "unless independently proven removable". FOCUS v2's reachability audit provided that independent proof — zero production importers (verified by the P6 gate's own `walkProductionSrc` caller scan before deletion) and no runtime wiring.
- **Affected files:** `src/services/customer-memory.ts`, `src/services/device-ledger.ts`, `src/__tests__/device-ledger.test.ts` (+ the two `__tests__/device`/`__tests__/supabase` tests covering already-shell modules).
- **Gate impact:** `p6-red-gate-01` flipped from PROTECT (files must exist) to ABSENCE (files must not exist, zero callers). Other gates' semantics unchanged; the runtime-path gates (P3/P7) still guarantee no persistence layer is wired.
- **No reversal of any other PRESERVE protection:** repair subsystem, golden-audit `device_ledger_v1` read-only query, `core/qr/share.ts`, `core/device/parser.ts`, `core/storage/repository` (in-memory/localStorage repository, exported from `core/index.ts:40`) all retained.

## 6. Retained (KEEP) — with reason

| Item | Reason |
|---|---|
| `src/core/device/parser.ts` | Live production consumer (`business-intelligence/api.ts:3`, `core/research/api-supabase`); brand/model derivation, P6 red-gate-04 role-gated exception |
| `src/core/qr/share.ts` + `index.ts` | Generic share helper (wa.me/telegram/x/facebook links); no attribution, no table access, no PII |
| `src/core/supabase/repair-data-service.ts` + repair subtree | Frozen repair subsystem (never create/restore `repair_*`) |
| `src/core/supabase/client.ts`, `schema.ts`, `live-diagnostics.ts` | Supabase client/schema/in-memory diagnostics — no session/device writer |
| `src/core/storage/repository/index.ts` | In-memory/localStorage repository; preserved infrastructure (barrel export) |
| `src/business-intelligence/api.ts` (post-F-09) | Dead `trade_requests` reads removed (was lines 37, 151, 235, 292); BI functionality preserved — `trades` stays empty, `tradeCount = 0`, `tradeDeviceIds` empty — matching the verified live state where the table does not exist |
| `CommerceIntelligenceBI.tsx:9` (`qr_scanned` label) | Read-only BI dashboard label for an aggregate column; not QR runtime (P7 scope is runtime path) |
| `CalibrationScreen.tsx:43-45`, `core/calibration/silent.ts:34-36` `navigator.userAgent` | Transient, in-memory platform detection; never persisted (P7-02 allowlist) |
| `StickerStudio.tsx`, `image-service.ts` canvas | Legitimate rendering/compression; not fingerprinting (P7-01 explicitly scopes to `WEBGL_debug_renderer_info`/`getImageData`) |

## 7. QR Privacy Model (current)

```
QR runtime (sticker scan) ──► localStorage["sticker_scans"] ──► anonymous aggregate
                              { serialNumber, campaign, cta, scannedAt, location }
                                                  │
                       sanitizeStoredScans() ─────┘  (strips any legacy PII, idempotent)

BI/Research (role-gated, read-only): device_id / user_agent aggregate columns (P6 red-gate-04)
```

- **Identity boundary:** A sticker scan is **never joinable to a person**. No visitor/device/anonymous ID, no fingerprint, no cookie, no referrer. Server-side identity (`users`/auth) is out of this runtime's scope.
- **Future commercial constraint (documented in retention policy):** any future Campaign→Placement→QR pipeline must stay anonymous; hashing an identifier is explicitly **not** anonymization.

## 8. Frozen Items (untouched, restated)

- **CR-00005** `CLOSED — NON-APPLICABLE / NEVER_DEPLOYED`. No change.
- **E-9** `OPEN — REASSESSMENT ONLY`. No change.
- **P4** preserved: game runtime local-only, in-memory sessions.
- **P5** preserved: telemetry/QR-attribution removed; `core/qr` share-only.
- `users` RLS, repair subsystem, `system_settings`, `audit_log`, `job_assignments`, `ads`, `inventory`, `catalog`, scan-count removal, `increment_qr_counter` — untouched.

## 9. Verification (all PASS)

| Check | Result |
|---|---|
| Full Vitest suite | **113 files / 1081 tests PASS** (P3, P4, P5, P6-01..07, P7, sticker sanitizer included) |
| `tsc --noEmit` | PASS (0 errors) |
| `npm run lint` (`eslint src/ --report-unused-disable-directives`) | 0 errors (4782 pre-existing design-system warnings, unchanged) |
| `npm run build` (`tsc -b && vite build`) | PASS (`✓ built`) |
| Sweep 1 — PII APIs (geolocation/cookie/sendBeacon/battery/canvas-fingerprint/advertisingId/IMEI) | No production usage; only the P7 gate itself references the names |
| Sweep 2 — QR-runtime names (`lookup_scan_context`/`increment_qr_counter`/`scan_count`/`START_QR_FLOW`/`setCampaignId`/`setPlacementId`/`qr_scanned`) | Runtime path clean; matches only in gates/tests + BI label (`CommerceIntelligenceBI.tsx:9`) + comment (`App.tsx:125`) |
| Sweep 3 — `qr_codes`/`placements`/`placement_history`/`analytics_events` | No production reader/writer; matches only in gates + `App.tsx:125` comment |
| Sweep 4 — deleted modules (`collectDeviceProfile`/`saveSession`/`data-service`/`device-ledger`/`customer-memory`/`live-sessions`/`session-repository`) | Production: none. `saveSession` hits are the preserved in-memory/localStorage `core/storage/repository`; `repair-data-service` is the frozen repair facade; `inventory-service.ts:14` is a stale doc comment in a frozen file; rest are gate assertions |
| Sweep 5 — `trade_requests` (F-09) | **0 production references.** Remaining textual hits: `metrics.ts` formula strings (31/43/113 — not DB reads) and the P6 gate-04 test's own name/description. `metrics.ts` is a metrics-formula catalogue, not a reader/writer |

## 9.5 F-03 + F-09 — Owner-Run Read-Only Live-DB Verification (RESULT)

The owner ran **`supabase/f-03-f09-privacy-read-only-verification.sql`** (SELECT-only, safe) against the production database on 2026-08-08. Recorded results:

**Live evidence (verbatim):**

- `F-03 → ALL_RLS_PROTECTED`
- `F-09 → trade_requests exists = false`

| Check | Result | Verdict |
|---|---|---|
| F-03 RLS posture — `placements` / `placement_history` / `ads` (plus attribution set) | `relrowsecurity`/`relforcerowsecurity` + `pg_policies` confirmed enabled | **`ALL_RLS_PROTECTED`** |
| F-09 — `public.trade_requests` exists live (`to_regclass`) | Table does **not** exist | **`F-09: trade_requests exists = false`** |

**Decision (per the approved closure plan):** because the table does not exist live, the four `trade_requests` BI reads in `src/business-intelligence/api.ts` (was lines 37, 151, 235, 292) were **dead reads** and were **removed** in this execution. **No table was created, no migration, no fallback, no RLS/schema change** — the reads were deleted so the runtime can never reference a nonexistent table.

## 9.6 Final Closure Verification

| Finding | Status | Evidence |
|---|---|---|
| F-01 sticker PII capture | **CLOSED** | `ip`/`userAgent`/`referrer` removed from write path, stored event, and type; `sanitizeStoredScans()` idempotent on write + load; `sticker-database.test.ts` green |
| F-03 RLS | **CLOSED — LIVE VERIFIED** | Owner-run SQL: `ALL_RLS_PROTECTED`; no RLS change made or needed by this execution |
| F-07 retention policy | **OPEN — POLICY DEFINED / ENFORCEMENT DEFERRED** | `privacy-retention-policy.md` §7: QR/sticker attribution retains only `serialNumber`/`campaign`/`cta`/`scannedAt`/`location`; never IP/UA/referrer/`device_id`/IMEI/persistent ID. No TTL/cron/trigger/DELETE/migration exists or is claimed |
| F-09 dead `trade_requests` reads | **CLOSED — LIVE ABSENCE VERIFIED** | Live evidence: `trade_requests exists = false`; all four BI reads removed; sweep 5 = 0 production refs |
| F-10 consent | **CLOSED AS DOCUMENTED DESIGN DECISION** | Consent is an in-memory user notice/choice only; no persistent consent record is stored. This is documented as a design decision, **not** claimed as GDPR compliance; no "GDPR compliant" / "100% legally compliant" claim is made without independent legal evidence |
| QR privacy model | Anonymous / Share-only | Sticker scan is anonymous aggregate (`serialNumber/campaign/cta/scannedAt/location`), never joinable to a person; QR runtime never touches `lookup_scan_context`/`lookup_campaign_by_short_code`/`qr_codes`/`placements`/`placement_history`/`analytics_events`/`increment_qr_counter`/`scan_count`/`START_QR_FLOW`/`setCampaignId`/`setPlacementId`/`qr_scanned` (sweeps 2–3 clean) |
| Frozen items | Untouched | CR-00005 (CLOSED — NEVER_DEPLOYED), E-9 (OPEN — REASSESSMENT), repair subsystem, `users` RLS/Auth/RBAC, inventory/ads/catalog, QR dormant DB schema |
| SQL / migrations | **NONE executed** | No SQL run by this execution; only the read-only verification package was created (for the owner to run), and no DDL/DML/migration exists in the working tree |

## 10. Remaining Owner Decisions (not closed by this execution)

- **F-07** enforcement: runtime TTL / server-side retention job remains **deferred** (policy defined; enforcement requires a separate, approved engineering task — `privacy-retention-policy.md` §4/§7).
- **F-10** consent: no persistent consent record — documented as a design decision; a durable consent mechanism (if ever required) is a separate decision.
- **F-03 / F-09**: closed as verified above; no further action unless the owner wants a future schema reconciliation (never `trade_requests` reads in runtime).

## 11. Hard Stop

This execution **does not commit, push, or touch the database**. All changes are staged in the working tree only. After owner review of this Before/After report, explicit approval is required before any commit.
