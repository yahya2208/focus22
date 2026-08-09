# FOCUS v2 — Privacy Data-Retention & Minimization Policy (Documentation Only)

- **Date:** 2026-08-08
- **Repository root:** `E:\dll\focus\focus22`
- **Base:** `HEAD = 4d0b61f` (`docs(audit): close CR-00005 as NON-APPLICABLE/NEVER_DEPLOYED, open E-9 reassessment`)
- **Mode:** Documentation only. **No TTL job, no SQL/DDL/DML, no migration, no DB change** was made or is proposed by this document. Owner approved retention as a documented policy; runtime enforcement stays app-side.
- **Frozen scope:** repair subsystem, `users` RLS, `system_settings`, `audit_log`, `job_assignments`, `ads`, `inventory`, `catalog`, and the `users`/`profiles`/auth identity tables are out of scope of this policy (owner-controlled, separate remediation tracks).

---

## 1. Purpose

Define how long FOCUS v2 keeps personal data and what it keeps at all. The policy implements the audit recommendation `R-04 (retention)`: a written retention posture for every storage location the app runtime owns, without introducing server-side TTL infrastructure.

## 2. Data Inventory & Retention Posture (App Runtime)

| Location | Content (after FOCUS v2 cleanup) | Retention | Minimization status |
|---|---|---|---|
| In-memory session service (`core/session/service.ts`) | Transient session lifecycle (no `user_id`, no device identity) | Ephemeral — lives only for the process/component lifetime | `KEEP` (P4-minimal) |
| In-memory calibration cache + `silent.ts` | Refresh-rate/display-lag platform detection | Ephemeral — never persisted | `KEEP` (P4) |
| `localStorage["sticker_scans"]` | Anonymous sticker scan aggregates: `serialNumber`, `campaign`, `cta`, `scannedAt`, `location` only | App-side; no TTL — cleared by `sanitizeStoredScans()` of PII; no identity payload | `AGGREGATE` (F-01 remediated) |
| `localStorage["sticker_serial_counter"]` | Monotonic counter for sticker printing | App-side; functional state, no PII | `KEEP` |
| `localStorage["catalog_favorites"]` / `catalog_most_used` / `price_memory_v1` | Catalog interaction state (model-level, no person identity) | App-side | `KEEP` (out of F-01 scope) |
| `localStorage["catalog_inventory"]` | Warehouse stock seed flag | App-side; no PII | `KEEP` |
| `localStorage["focus_settings"]` | App settings | App-side; no PII | `KEEP` |
| `document.cookie` / `sendBeacon` / geolocation / battery / canvas-fingerprint | — none — | n/a — banned by P7-01 | `NEVER COLLECT` |
| Persistent visitor/device identifiers | — none — (device fingerprint module deleted) | n/a — banned by P7-02 | `NEVER COLLECT` |

## 3. Retention Principles

1. **Never collect identity.** The runtime never collects a person identifier: no visitor/device/anonymous ID, no fingerprint, no persistent cookie.
2. **Transient by default.** Every runtime data structure is in-memory unless a functional feature (sticker studio, catalog, inventory seed) explicitly requires persistence.
3. **Aggregate, don't attribute.** Sticker scans are anonymous aggregate events; `ip` / `userAgent` / `referrer` are stripped on write and on load (`sanitizeStoredScans()`).
4. **Documentation, not DDL.** No TTL column, cron, or Supabase trigger is introduced. If a future retention job is desired, it is a **new, separately approved** engineering task with its own migration.
5. **Identity boundary.** The QR/privacy model never joins a scan to a person; server-side identity (`users`/auth) is out of this policy's scope.

## 4. Why No TTL (Owner Decision, 2026-08-08)

Adding server-side TTL requires SQL/migrations and touches infrastructure the owner froze for this execution. The audit's retention recommendation is therefore satisfied by this written policy plus the app-side sanitizer, keeping FOCUS v2 runtime **identity-free and TTL-free**. Residual items are tracked in the final remediation report (§ F-03 = CLOSED — LIVE VERIFIED, F-07 = OPEN — POLICY DEFINED / ENFORCEMENT DEFERRED, F-09 = CLOSED — LIVE ABSENCE VERIFIED, F-10 = documented design decision).

## 5. Future QR Commercial Design Constraint

Any future commercial QR pipeline must preserve the anonymous model:

```
Campaign → Placement → QR → (anonymous scan) → (anonymous start/completion aggregates)
```

- Never person-tracking; no per-person join, no hash-of-identifier as a "safe" replacement (hashing ≠ anonymization).
- Reads/writes only through role-gated BI/research paths; never from the runtime path (P7-03).
- Any change must pass P7 privacy-regression gate before landing.

## 7. F-07 — QR/Sticker Attribution Retention (Explicit)

**Status: `OPEN — POLICY DEFINED / ENFORCEMENT DEFERRED`.** The retention posture for QR/sticker attribution is defined in this document; server-side TTL enforcement is intentionally deferred (no TTL job, cron, pg_cron, trigger, DELETE, or migration — see § 4). This status does NOT claim that TTL exists or that data is auto-expired.

Explicit attribution-retention rule:

- **Retained (only these fields, on the anonymous sticker-scan aggregate in `localStorage["sticker_scans"]`):**
  - `serialNumber`
  - `campaign`
  - `cta`
  - `scannedAt`
  - `location`
- **Never retained** for a QR/sticker scan, under any circumstance:
  - `ip` / IP address
  - `userAgent` / UA string
  - `referrer`
  - `device_id` / device identifier
  - `IMEI` / phone serial
  - persistent visitor/device ID or any persistent identifier
  - any hash-of-identifier used as an anonymization stand-in (hashing ≠ anonymization)
- Enforcement today is the app-side `sanitizeStoredScans()` (strips PII on write and on load, idempotent) plus P7-02/P7-03 absence gates. No server-side retention timer exists or is claimed.

## 8. Verification

- `src/__tests__/privacy/p7-privacy-regression-gate.test.ts` enforces the `NEVER COLLECT` and no-persistent-ID rules.
- `src/__tests__/sticker/sticker-database.test.ts` enforces anonymous write + PII-stripping + idempotent sanitizer.
- Gates P3/P4/P5/P6 assert absence of persistence layers and QR-attribution runtime access.
