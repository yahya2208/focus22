# FOCUS v2 — Final Privacy & QR Attribution Audit (READ-ONLY)

- **Date:** 2026-08-08
- **Repository root:** `E:\dll\focus\focus22`
- **Base:** `HEAD = 4d0b61f` (`docs(audit): close CR-00005 as NON-APPLICABLE/NEVER_DEPLOYED, open E-9 reassessment`)
- **Mode:** READ-ONLY evidence audit. No SQL executed. No DDL/DML. No migration. No RLS/RPC change. No code edit. No data delete/restore. No commit/push.
- **Scope discipline:** CR-00005 `CLOSED — NON-APPLICABLE / NEVER_DEPLOYED` and E-9 `OPEN — REASSESSMENT ONLY` are frozen. Repair subsystem, `users` RLS remediation, `system_settings`, `audit_log`, `job_assignments`, `ads`, `inventory`, `catalog`, game architecture are frozen — referenced only where direct evidence touches the QR/privacy flow.

---

## 1. Executive Summary & Verdict

**VERDICT: `PRIVACY CLEAN — REMEDIATION REQUIRED`**

The QR-attribution path in FOCUS v2 carries **no personal identity**: the app-side QR scan flow was removed in P5, the QR module is now share-only, the game runtime is local-only since P4, and no device-fingerprint or geolocation API is reachable from production code. There is **no evidence of identity linkage in the QR attribution pipeline**.

Remediation is nevertheless **required** because the audit found one live app-side PII capture (sticker scan persists `navigator.userAgent` + `document.referrer` to localStorage), a dormant QR/attribution DB schema whose live RLS posture for `placements`/`placement_history` is unverified, an unresolved `trade_requests` table (BI reads a table with no migration), the total absence of retention/TTL mechanisms, and role-gated research/BI identity reads. Every item is addressable app-side and/or by owner decision; none required a SQL change, and none was made.

The verdict does **not** claim "100% clean" — see the Finding Register (§17) and the live-divergence section (§16) for the residual, owner-verifiable items.

---

## 2. Objective & Scope

**Objective.** Produce a privacy + QR-attribution data-minimization audit of FOCUS v2 and deliver `docs/audits/final-privacy-qr-attribution-audit.md` (this file) with 19 sections, a P0–P5 remediation plan, and one of three verdicts (`PRIVACY CLEAN — VERIFIED` / `PRIVACY CLEAN — REMEDIATION REQUIRED` / `PRIVACY STATUS — INCONCLUSIVE`).

**In scope.**
- QR attribution target architecture: Campaign → Placement → QR + Device/Gameplay Analytics **without personal identity**.
- Every reader/writer of QR, placement, campaign, analytics, session, device, calibration, and survey data reachable from `src/`.
- All browser storage (localStorage only), all network calls, all identity/consent surfaces.
- Repository migrations 00001–00018 as **documentation only** — never proof of production state.

**Out of scope (frozen / owner-controlled).** Repair subsystem, `users` RLS remediation, contract tables (00009–00013), inventory (00014), ads (00015) — referenced only as evidence. No SQL was written or executed for any item.

**Report recommendations** use exactly one of: `KEEP` / `AGGREGATE` / `REMOVE` / `NEVER COLLECT` / `NEEDS OWNER DECISION` (`REMOVE` requires evidence the field is unneeded).

---

## 3. Methodology & Evidence Confidence

Read-only methods used:
1. **Static reachability:** grep over `src/` for table names, RPC names, storage keys, fingerprint APIs, and write verbs (insert/upsert/update/delete/`.from('…')`). Every conclusion carries `file:line`.
2. **Migration archaeology:** migrations 00002–00018 read as documentation; their divergence from production is established by `docs/security/production-security-audit.md` (DV-1..DV-10) and the owner-run `supabase/verify-live-schema.sql`.
3. **Live evidence (owner-provided):** `verify-live-schema.sql` (Gate A `ALL_PRESENT — 00012 SAFE`, Gate F `M1_ATTRIBUTION_READY`) and `production-security-audit.md` (v4.0 baseline; LV-5/LV-10/LV-11 closed with production probes).
4. **Prior phase artifacts:** P3 stop-write gate, P4 game-minimization gate, P5 telemetry/QR-removal gate, P5 Independent Review, P6 discovery + red-gates, `scan-count-removal-100pct.md`.

**Evidence-strength ladder (from the production security audit):** 🟢 Production SQL Verified > 🟦 Runtime Live Verified > 🟡 Repository Verified > 🟠 Inferred > ⚪ Unverified (owner/staging). This audit is predominantly 🟡 (repository) with the live-owner evidence 🟢 cited where applicable.

---

## 4. Baseline & Frozen-State Declaration

- Git root `E:\dll\focus\focus22`, `HEAD = 4d0b61f`. Working tree contains only untracked audit/gate artifacts; nothing staged. No commit/push performed by this audit.
- **CR-00005** `CLOSED — NON-APPLICABLE / NEVER_DEPLOYED` (drafts preserved untracked at `docs/audits/cr-00005-sql-draft.sql`, `docs/audits/cr-00005-verification.sql`). Not applied, not executed.
- **E-9** `OPEN — REASSESSMENT ONLY`. No action taken.
- **P4** (2026-08-08): game runtime local-only; `PersistenceProvider` reduced to a documented no-op shell (`src/core/supabase/PersistenceProvider.tsx:1-23`).
- **P5** (2026-08-08): app-side QR telemetry/campaign flow removed; `qr/campaign.ts` deleted; scan-count poisoning decision `INC-2026-08-03-D2` (`scan-count-removal-100pct.md`).
- **P6** (2026-08-08): discovery + red-gate design; 7/7 red-gates GREEN post-execution intent; full suite 114 files / 1089 tests; tsc/eslint/build clean; zero SQL executed; DB untouched.
- This audit adds **no new production changes** — one new documentation file only.

---

## 5. QR Attribution System Inventory (target vs current)

**Target architecture (documented intent):**
```
Campaign ──1:N── Placement ──1:N── QR code ── (scan) ──> Session / Analytics Event
   ▲                                                                 │
   └──────────────── Attribution (no personal identity) ◄────────────┘
```

**Current reality:**
| Layer | Repository artifact | App code | Live DB | Status |
|---|---|---|---|---|
| Campaigns | migrations 00007/00011/00012 | **zero references** | table exists; `lookup_campaign_by_short_code` v1 live (Gate D) | DORMANT in app |
| Placements | 00016 (`placements`, `placement_history`) | **zero references** | tables exist (Gate F tables) | DORMANT in app |
| Placement FKs | 00017 (`placement_id` on qr_codes/sessions/analytics_events) | **zero references** | columns exist (Gate F columns) | DORMANT in app |
| Scan RPC | 00018 (`lookup_scan_context(text,text)`) | **zero references** | RPC exists (Gate F RPC) | DORMANT in app |
| QR codes | live table (repo silent per DV-3) | **zero references** | exists; `scan_count` poisoned dormant | DORMANT in app |
| Analytics events | live table | **zero references** | exists; insert closed to anon (LV-5 v4.0) | DORMANT in app |
| Ads | 00015 (`ads`) | `ads-service.ts` ACTIVE | table exists | ACTIVE (feature) |
| Share URLs | `src/core/qr/share.ts` | ACTIVE (WhatsApp/Telegram/X/Facebook/email/copy) | — | ACTIVE, local-only |

**Grep proof (P5 + this audit):** `lookup_scan_context`, `lookup_campaign_by_short_code`, `qr_codes`, `placements`, `placement_history`, and `analytics_events` have **zero occurrences in `src/`**. The only remaining `.rpc()` artifact is a library-behavior test mock (`maybe-single-behavior.test.ts`) flagged by P6 R-15.

---

## 6. QR App Flow — Share-Only

- `src/core/qr/index.ts` re-exports `./share` only. `src/core/qr/campaign.ts` deleted (P5).
- `src/core/qr/share.ts`: `buildShareUrl` / `createShareHandler` for platforms `whatsapp`, `telegram`, `x`, `facebook`, `email`, `copy`; default domain `https://focus.app`.
- No `App.tsx` route for `qr`, `campaign`, or `scan` (only `sticker-scan` exists). Navigation graph confirms `sticker-scan` reaches only from `deep-link` (`src/core/navigation/reachability.ts:59`).
- P3 gate `FORBIDDEN` list (`p3-stop-write-gate.test.ts:151`) blocks `lookupScanContext`, `START_QR_FLOW`, `hasCampaign`, `qr_scanned`, `parseDeepLinkFromCurrentUrl`, `setCampaignId`, `setPlacementId`, `increment_qr_counter` from the app runtime.

**Conclusion (§18 classification):** the QR share surface is `KEEP` — anonymous, local, no data collection.

---

## 7. QR / Attribution DB Schema Inventory (documentation only)

Migrations read for this audit — **none was executed, none reflects production on its own**:

| Migration | Objects | Notes |
|---|---|---|
| 00007 | `lookup_campaign_by_short_code(text)` + partial unique index on active short codes | v1; **live per Gate D**; parameterized, `SET search_path` |
| 00011 | `lookup_campaign_by_short_code_v2(text)` | **not live** (DV-4) |
| 00012 | backfill: `campaigns.status`, `campaign_version`, `sessions.campaign_snapshot` | Gate A `ALL_PRESENT — 00012 SAFE` |
| 00015 | `ads` — public SELECT only enabled rows | ACTIVE feature |
| 00016 | `placements`, `placement_history` (immutable change log; roles via job_assignments) | live tables (Gate F) |
| 00017 | `placement_id` FKs on `qr_codes`, `sessions`, `analytics_events` | live columns (Gate F) |
| 00018 | `lookup_scan_context(text,text)` — statuses `NOT_FOUND/ENDED/SCHEDULED/PAUSED/FOUND/PLACEMENT_*/QR_NOT_ASSIGNED`; returns campaign+placement+qr_version to anon; **"notes are NEVER exposed"** | live RPC (Gate F) |

**No `enable row level security` / `create policy` exists in 00007, 00011, 00015, 00016, 00017, 00018.** Live RLS for `qr_codes`/`analytics_events`/`sessions`/etc. was hand-created (DV-3, production audit §III.1) and partially hardened (LV-10/LV-11/LV-5 closed). RLS for `placements`/`placement_history`/`ads` on the live DB is **not evidenced in any owner artifact** → owner-verify item (§16, §17 F-03).

---

## 8. Telemetry / Analytics Inventory

- `analytics_events`: **zero app references** in `src/` (P5). Live policy history: anon INSERT closed v4.0 (LV-5); authenticated reads with no row filter remain per v4.0 baseline (LV-4). Data is ~95% `user_id NULL`.
- `scan_count`: poisoned to 999,999,999 in 8 rows (INC-2026-08-03-D2), column stays dormant, no UPDATE/restore path, `CampaignStore.recordScan()` → `increment_qr_counter` RPC removed. **Zero app-code dependency on `scan_count`** (`scan-count-removal-100pct.md`).
- `increment_qr_counter`: live RPC, strict column whitelist (no injection, UV-1 resolved), **no app callers** since P5. Direct `UPDATE qr_codes.scan_count` closed v3.9 (LV-11).
- `structured-log` (`src/core/obs/structured-log.ts`): in-memory only, `MAX_EVENTS=50`, live-diagnostics, never persisted.

---

## 9. Data-Flow Map (what touches the network)

| Source | Destination | Payload | Identity? |
|---|---|---|---|
| `auth/index.ts` | Supabase Auth (`supabase.auth.*`) | credentials, JWT | yes (auth-managed, not app tables) |
| `auth/index.ts:50-62` | `users` SELECT `role` WHERE `id = auth.uid()` | single role value | minimal (self only) |
| `ads-service.ts:86` | `ads` SELECT (public, enabled rows only) | ad content | no |
| `repair-data-service.ts` | `repair_*` tables + localStorage | customer PII (name/phone/GPS/photos/IP/UA) | **yes** — FROZEN, out of scope, **tables NOT live** (LV-7) |
| Research console (`api-supabase.ts`) | `sessions`/`devices`/`calibrations`/`users`/`surveys` SELECT | measurements + device fingerprint + role; `display_name` only in BI staff profile | role-gated (`scientific:read`), minimized P6 |
| BI center (`api.ts`) | `sessions`/`users`/`devices`/`trade_requests` SELECT | aggregates + single-column `user_agent` for brand/model + staff `display_name` | role-gated (analyst+), minimized P6 |
| Share (`qr/share.ts`) | external URLs (wa.me/t.me/x/fb/mail) | share text only | no |
| Sticker scan (`sticker-database.ts:62-89`) | `localStorage["sticker_scans"]` | serial, campaign, cta, timestamp, **userAgent, referrer** | **userAgent + referrer persisted — finding F-01** |
| Game runtime | — | local-only since P4 | no network |

**The game, session persistence, and QR attribution send no personal data over the network.** Session write to `sessions` (`data-service.ts:31-55`) has **zero production importers** (test-only; `p3-stop-write-gate.test.ts:158` asserts `App.tsx` does not reference `data-service`).

---

## 10. Identity & Personal-Data Surfaces

- **Register** (`RegisterScreen.tsx`): `email` + `displayName` + `password` → `signUpWithEmail`. Stored in Supabase Auth; `public.users` is created by DB trigger `handle_new_user` only (role forced to `guest`, CV-1 closed v3.7). App has **no writer** to `public.users`.
- **Guest flow**: `ProtectedRoute` passes for authenticated OR anonymous (`src/components/shared/ProtectedRoute.tsx`); guests play the local-only game; resource gates via `permissionGuard.can`.
- **Auth session**: `client.ts` `persistSession: true`, `autoRefreshToken: true`; JWT+refresh+email in localStorage (`sb-…-auth-token`). No cookies.
- **Consent** (`ConsentScreen.tsx`): agree → `message`, decline → `home`. **No consent record is persisted.** The consent object is in-memory only — flagged in production audit §II.5 as a compliance risk (GDPR / Algerian 18-05) for a measurement platform. **Needs owner decision** (§18 C-07).

---

## 11. Local Storage Inventory

Verified by agent sweep + direct reads. **No `sessionStorage`, no IndexedDB, no `document.cookie`, no `sendBeacon` anywhere in `src/`.**

| Key | Content | PII |
|---|---|---|
| `focus_settings`, `focus_theme` | preferences | none |
| `focus_daily_challenge`, `focus_daily_completed` | challenge state | none |
| `focus_achievements` | achievements | none |
| `focus_sessions` / `focus_sessions_v2` | local gameplay records | measurements only |
| `showroom_view_counts` | anonymous counters | none |
| `bi_*` (branch_data, trade_prices, staff, smart_offers, automation_rules, notifications, inventory, ai_feedback) | BI sandbox cache | staff identities (admin tooling) — §12/C-08 |
| `sticker_scans`, `sticker_serial_counter` | scan events + serial counter | **userAgent + referrer — F-01** |
| `sb-…-auth-token` | JWT + refresh + email | auth-managed |
| `focus_calibration_profile` (per production audit §II.4) | calibration | spoofable, non-PII |

---

## 12. Device Fingerprinting Surfaces

- `src/core/device/index.ts` defines a full profile (UA, screen, pixelRatio, refreshRate=60 fixed, touch, pointer, `hardwareConcurrency`, `deviceMemory`, language, timezone) and a djb2 `device_id` over `UA|width|height|language`.
- **`collectDeviceProfile` has zero production callers** — only tests and the `core` barrel export (`src/core/index.ts:52`). P4 gate asserts `PersistenceProvider` no longer invokes it (`p4-game-minimization-gate.test.ts:32-34`). The device row write path was removed with P4.
- **No** `navigator.geolocation`, `sendBeacon`, `document.cookie`, battery API, canvas/WebGL fingerprint, or advertisingId anywhere in `src/`.
- The only remaining production fingerprint capture is the sticker scan `navigator.userAgent` (F-01), which stays **on-device** in localStorage (never sent to Supabase).

**Classification:** the device-profile module is effectively dead code (`REMOVE` optional); production never collects it. Sticker `userAgent`/`referrer` → `REMOVE`.

---

## 13. Reachability — Dead / Dormant Code

| Artifact | Status | Evidence |
|---|---|---|
| `src/core/qr/campaign.ts` | DELETED (P5) | — |
| `src/core/supabase/data-service.ts` (`saveSession`/`loadSession`) | test-only | imports only in `__tests__/supabase/data-service.test.ts`, `no-key-warnings.test.tsx` |
| `src/core/supabase/PersistenceProvider.tsx` | no-op shell (P4) | header comment + body |
| `src/core/device/index.ts` (`collectDeviceProfile`) | test-only | grep callers = tests only |
| `src/core/obs/structured-log.ts` | in-memory | MAX_EVENTS=50 |
| `customer-memory.ts`, `device-ledger.ts` | DEAD (P6 R-01/R-02) | zero importers; IMEI/serial PII |
| `live-sessions.ts`, `session-repository.ts` | DEAD/DORMANT (P6 R-20) | no production importer |
| QR/attribution tables + RPCs | DORMANT (P5) | zero `src/` references |
| `trade_requests` | unresolved (F-09) | BI reads, no CREATE TABLE migration |

---

## 14. Research / BI Identity Reads (role-gated)

- `getCommandCenter` (`api.ts:30-45`): `sessions` (id, user_id, device_id, status, created_at, scientific_results), `trade_requests`, `users` (`id, role, created_at` — **no `display_name` post-P6**), `devices.user_agent` (lines 66, 103) → brand/model derivation.
- `getCustomerProfile` (`api.ts:147-151`): explicit `users.display_name` + session detail + `devices.user_agent/os/browser` — **intentional staff exception** per P6 red-gate-04.
- Research `api-supabase.ts`: `users` (`id, role`; lines 211, 424, 545, 801), `sessions` (aggregates; lines 212-216, 360, 476, 528, 633, 652), `devices` full fingerprint columns (lines 548, 627), `calibrations` (lines 312, 659). All behind `scientific:read` gate.
- `surveys`: read-only aggregate dashboard (`getSurveyAnalytics`); **no writer/collector** in app; schema holds demographic PII (§17 F-08).

**Conclusion:** P6 red-gate-04 retained exactly two identity reads (staff `display_name` in BI customer profile; single-column `user_agent` for brand/model), both role-gated. `KEEP` (documented exception) with the note that these read **live tables** that the app no longer writes.

---

## 15. RLS / RPC Posture (QR / attribution tables)

| Object | Repo RLS | Live RLS (evidence) | Status |
|---|---|---|---|
| `qr_codes` | none in migrations | hand-created; UPDATE closed v3.9 (LV-11); `Admins manage qr codes` remains | hardened |
| `analytics_events` | none in migrations | insert closed v4.0 (LV-5); authenticated read w/o row filter remains | partially hardened |
| `placements` / `placement_history` | none in migrations (00016) | **no evidence in owner artifacts** | ⚪ verify live |
| `ads` | 00015: public SELECT enabled only | **no live evidence** | ⚪ verify live |
| `sessions` | none in migrations | insert closed v3.8 (LV-10); authenticated read w/o row filter remains | partially hardened |
| `users` | 00002 (divergent, DV-9) | `Authenticated read users` w/o row filter (LV-1) — **FROZEN owner item** | open (frozen) |
| `devices`/`calibrations`/`surveys` | none in migrations | `Authenticated read …` w/o row filter (LV notes) | open (frozen) |
| RPCs | 00007/00018 | `lookup_campaign_by_short_code` live; `lookup_scan_context` live; `increment_qr_counter` live allowlist | OK |

**Finding F-03:** the dormant QR/attribution tables `placements`/`placement_history` have no repo RLS and no evidenced live RLS. If M1 attribution is ever reactivated, RLS must be defined in an **authorized DB phase** (not here). `NEEDS OWNER DECISION`.

---

## 16. Live-Database Divergence & Latent Contradictions

From `production-security-audit.md` (v4.0, 🟢) and owner-run `verify-live-schema.sql`:

1. **`trade_requests` (F-09):** read by BI (`api.ts:37,151,235,292`) but **no `CREATE TABLE` migration exists in the repo**; the table is **absent** from `verify-live-schema.sql` gates and from the owner live inventory. Reads resolve to empty if the table does not exist live. `NEEDS OWNER DECISION`.
2. **`repair_*` tables are NOT live** (LV-7, 🟢 404). Their repo-only DDL carries public RLS reads (`00005:38-40,53`). PII currently local-only. FROZEN, out of scope, contradiction documented.
3. **`surveys` has no collector**; dashboard reads `SELECT *` (full PII rows). `REMOVE` app-side is safe; DB-side needs separate authorization.
4. **Migrations ≠ production** for RLS (DV-9), functions (DV-4), and table definitions (DV-1/DV-3/DV-5/DV-7). Migrations are documentation only.
5. **No retention/TTL anywhere** (F-10): the only mention is a TODO comment `00013:56` ("retention jobs") in a migration that is itself never applied. Sessions/devices/analytics_events/surveys/placements/placement_history/qr_codes have no lifecycle. LocalStorage keys are unbounded.
6. `increment_qr_counter` (live) has no app callers; `scan_count` poisoned-dormant (INC-2026-08-03-D2). No restore/UPDATE path exists. Consistent with removal posture.

---

## 17. Finding Register

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| F-01 | **Sticker scan persists `navigator.userAgent` + `document.referrer` to localStorage** (`sticker_scans`) | MEDIUM (PII-capable; on-device only, never sent) | `StickerScanHandler.tsx:28` → `sticker-database.ts:62-89` |
| F-02 | **QR scan flow removed from app (P5)** — share-only; zero `src/` references to QR/placement/analytics tables & RPCs | INFO (positive) | grep + `p6-red-gate-06` |
| F-03 | **`placements`/`placement_history`/`ads` live RLS unverified**; no repo RLS in 00016/00017 | MEDIUM (dormant schema) | migrations grep; owner artifacts silent |
| F-04 | **`scan_count` poisoned dormant**; `increment_qr_counter` has no app callers | INFO | `scan-count-removal-100pct.md` |
| F-05 | **Device fingerprint collector dead in production** (test-only) | INFO (positive) | `core/device/index.ts` + grep callers |
| F-06 | **`data-service.ts` session writer dead** (test-only); game local-only since P4 | INFO (positive) | grep + `PersistenceProvider.tsx` |
| F-07 | **No retention/TTL for any telemetry/attribution table or localStorage key** | MEDIUM | grep (only `00013:56` TODO) |
| F-08 | **Research/BI identity reads are role-gated and P6-minimized**, but read live tables (`devices.user_agent`, staff `display_name`) | LOW (documented exception) | `api.ts:66,103,149,169`; `api-supabase.ts:548,627`; `p6-red-gate-04` |
| F-09 | **`trade_requests` read by BI with no CREATE TABLE migration and absent from live inventory** | MEDIUM (latent contradiction) | `api.ts:37,151,235,292`; migration grep |
| F-10 | **Consent is in-memory only**; no consent record persisted for a measurement platform | MEDIUM (compliance) | `ConsentScreen.tsx`; production audit §II.5 |
| F-11 | Repair subsystem PII: **tables not live**, repo-only DDL with public RLS reads; localStorage PII | FROZEN (owner) | LV-7; `00005` |
| F-12 | **No geolocation / cookies / sendBeacon / battery / canvas fingerprint / advertisingId** anywhere | INFO (positive) | full `src/` grep |

---

## 18. Classification Matrix (KEEP / AGGREGATE / REMOVE / NEVER COLLECT / NEEDS OWNER DECISION)

| # | Surface | Classification | Rationale |
|---|---|---|---|
| C-01 | QR share URLs (`qr/share.ts`) | **KEEP** | anonymous, local, no collection |
| C-02 | Sticker scan: serial/campaign/cta/timestamp | **AGGREGATE** | needed for campaign analytics; no identity |
| C-03 | Sticker scan: `userAgent`, `referrer`, `ip` | **REMOVE** | not required for scan counting; F-01 |
| C-04 | Device fingerprint module (`core/device/index.ts`) | **REMOVE** (dead code) / keep as doc | zero production callers |
| C-05 | `data-service.ts` session writer, `PersistenceProvider` shell | **REMOVE** (dead code) | test-only / no-op |
| C-06 | Dormant QR/attribution DB schema (placements, placement_history, qr_codes, placement_id FKs, lookup RPCs) | **NEEDS OWNER DECISION** (REMOVE vs. reactivate) | no app consumers; DB RLS unverified (F-03) |
| C-07 | Consent affordance | **NEEDS OWNER DECISION** | compliance gap (F-10); recommend non-PII notice |
| C-08 | Research/BI identity reads | **KEEP** (role-gated, minimized) | P6 red-gate-04 documented exception |
| C-09 | `trade_requests` BI reads | **NEEDS OWNER DECISION** | table presence unknown (F-09) |
| C-10 | Retention/TTL for telemetry + localStorage | **NEEDS OWNER DECISION** (introduce) | none exists (F-07) |
| C-11 | Surveys dashboard + `surveys` schema | **REMOVE** app-side (P6 R-12) | no collector; DB-side separate |
| C-12 | Geolocation / cookies / battery / canvas / ad-ID | **NEVER COLLECT** | confirmed absent; do not add |
| C-13 | Repair subsystem PII | FROZEN / owner decision (R-08) | feature legit; columns/RLS owner-owned |
| C-14 | `users` role gate read | **KEEP** | minimal self-scoped read |

---

## 19. Remediation Plan P0–P5

All actions below are **app-side and/or owner decisions**. P3/P4 items are **DB-side and require their own authorized phase** — none was executed by this audit.

- **P0 (app-side, zero-risk, immediate)** — Remove the PII capture in the sticker scan path: stop passing `navigator.userAgent` and `document.referrer` at `StickerScanHandler.tsx:28`; drop `ip`/`userAgent`/`referrer` from the `StickerScanEvent` write (keep `serialNumber`, `campaign`, `cta`, `scannedAt`). Purge existing `sticker_scans` entries (owner-authorized) or leave localStorage-only data unreachable by the app.
- **P1 (app-side, low-risk)** — Delete dead code: `data-service.ts` writers, `PersistenceProvider` shell, `core/device/index.ts` if unconsumed, `customer-memory.ts`, `device-ledger.ts`, `live-sessions.ts`, `session-repository.ts` (aligns with P6 R-01/R-02/R-20). Update gates/tests accordingly.
- **P2 (owner verification, read-only)** — Confirm whether `trade_requests` exists in the live DB (one SELECT). If absent: remove the four BI reads (`api.ts:37,151,235,292`) or add the definition in an authorized phase (F-09).
- **P3 (DB-side, authorized phase — NOT here)** — If QR/attribution is reactivated: define RLS for `placements`/`placement_history`/`qr_codes`/`ads`; otherwise decommission the dormant schema (drop `placement_id` FKs, `scan_count`, lookup RPCs) with a documented decision on `scan_count`'s 999,999,999 rows.
- **P4 (DB-side, authorized phase)** — Introduce retention/TTL jobs for `analytics_events`/`sessions`/`devices`/`surveys`/`placement_history` (closes F-07; references `00013` Phase F TODO).
- **P5 (owner decision)** — Resolve the consent gap (F-10): non-PII notice/consent affordance consistent with GDPR / 18-05, or an explicit documented exemption for the anonymous telemetry path.

---

## Verification Commands (read-only, reproducible)

```powershell
git rev-parse HEAD                                        # expect 4d0b61f
git status --porcelain                                    # expect only untracked audit/gate artifacts

# No app reference to QR/attribution DB objects (expect zero hits)
rg -n "lookup_scan_context|lookup_campaign_by_short_code|qr_codes|placements|placement_history|analytics_events" src

# No app reference to QR scan RPC / counters (expect zero hits)
rg -n "increment_qr_counter|scan_count|START_QR_FLOW|setCampaignId|setPlacementId|qr_scanned" src

# No banned fingerprint APIs (expect zero hits)
rg -n "navigator\.geolocation|sendBeacon|document\.cookie|getBattery|webgl|canvas\.toDataURL|advertisingId" src

# Production callers of session/device writers (expect tests only)
rg -n "from '.*data-service'|from '.*core/device'|collectDeviceProfile|saveSession" src

# Migration absence of trade_requests (expect zero CREATE TABLE)
rg -n "CREATE TABLE.*trade_requests" supabase/migrations

# Suite baseline
node node_modules/vitest/vitest.mjs run               # P6 baseline: 114 files / 1089 tests
node_modules/.bin/tsc --noEmit                        # expect exit 0
```

---

## References

- `docs/security/production-security-audit.md` (v4.0 baseline, LV-1..LV-11, DV-1..DV-10) — live RLS/RPC/trigger evidence.
- `supabase/verify-live-schema.sql` — owner-run Gates A–F (`ALL_PRESENT — 00012 SAFE`, `M1_ATTRIBUTION_READY`).
- `.opencode-summary/reports/scan-count-removal-100pct.md` — INC-2026-08-03-D2 scan_count dormancy.
- `docs/audits/p6-discovery-report.md`, `docs/audits/p6-dependency-reachability-matrix.md`, `p6-red-gate-*.test.ts` — surface reachability + identity-read rationale.
- `docs/audits/p5-independent-closure-review.md` — KEEP/REASSESS surface confirmation.
- Source: `src/core/qr/*`, `src/core/supabase/*`, `src/core/device/*`, `src/services/sticker/*`, `src/screens/stickers/StickerScanHandler.tsx`, `src/business-intelligence/api.ts`, `src/core/research/api-supabase.ts`, `src/core/auth/index.ts`.

---

**HARD STOP — AUDIT COMPLETE — READ-ONLY — NO CHANGES EXECUTED — REPORT READY FOR OWNER REVIEW.**
