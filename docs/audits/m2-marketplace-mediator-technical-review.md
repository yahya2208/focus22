# M2 — Campaign Intent Counters · Technical Review Record

**Model:** Marketplace Mediator (`docs/audits/marketplace-mediator-model-audit.md`)
**Phase:** M2 — owner-approved 2026-08-09 (N4/N5/N6)
**Status:** ⏳ **UNDER OWNER REVIEW — no decision taken (A/B/C still open)**
**Document type:** review record only — **no code changes, no commit, no SQL execution**
**Scope:** the M2 package as of this review (SQL + client wiring + tests + gate report)

> This document captures the line-by-line technical review of the M2 package.
> It records findings for the owner's independent decision. Nothing here was
> auto-fixed; any required change waits for the owner's explicit decision.

---

## 1. SQL — `supabase/m2-campaign-intents/01-campaign-intents-apply.sql`

### 1.1 Table — `public.campaign_intents` (lines 52–61)
| Column | Type | Constraint |
|---|---|---|
| `id` | UUID | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `kind` | TEXT NOT NULL | `CHECK IN ('view','click','whatsapp_intent')` |
| `cta_type` | TEXT | `CHECK IN ('buy','exchange','installment','inquiry','ad_click')` — NULL allowed (view) |
| `campaign_id` | UUID | `REFERENCES public.campaigns(id) ON DELETE CASCADE` (read-only dependency on campaigns) |
| `ad_placement` | TEXT | `CHECK IN ('home','phones','repair','results','exchange','phone-details')` |
| `device_id` | TEXT | `CHECK (device_id IS NULL OR char_length BETWEEN 1 AND 32)` |
| `visitor_hash` | TEXT NOT NULL | `CHECK ~ '^[a-f0-9]{16,64}$'` |
| `created_at` | TIMESTAMPTZ NOT NULL | `DEFAULT now()` |

### 1.2 Indexes (lines 64–73)
- `idx_campaign_intents_dedup` (visitor_hash, kind, cta_type, created_at DESC) — dedup support
- `idx_campaign_intents_visitor_time` (visitor_hash, created_at DESC) — hourly rate-limit support
- `idx_campaign_intents_research` (created_at DESC) — M3 read-only UI reads by time

### 1.3 RLS (lines 81–88)
- `ENABLE ROW LEVEL SECURITY`
- Exactly one policy, SELECT-only, `TO authenticated`:
  `"Research roles read campaign intents" USING (public.is_research_role())`
- **No INSERT/UPDATE/DELETE policies.** Writes exist only through the guarded RPC.
- `is_research_role()` is an existing helper (`security-hardening/phase1/02-LV1-LV2-LV4-owner-read-policies.sql:28-40`,
  SECURITY DEFINER STABLE, returns true iff `public.users.role IN ('researcher','admin','super_admin')`).

### 1.4 Grants / revokes (lines 94–96, 199–201)
- Table: `REVOKE ALL FROM PUBLIC, anon, authenticated`; `GRANT SELECT TO authenticated` only. No anon table access.
- Function: `REVOKE ALL FROM PUBLIC`; `GRANT EXECUTE TO anon, authenticated`.

### 1.5 RPC (lines 103–197)
`record_campaign_intent(p_kind TEXT, p_visitor_hash TEXT, p_cta_type TEXT, p_campaign_id UUID, p_ad_placement TEXT, p_device_id TEXT) RETURNS void`
— `LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = public`.

Server-side validation (all in the RPC; JS is never the protection):
1. `p_kind` in allowlist (line 121)
2. kind/cta_type matrix (lines 125–137): `click → ad_click`; `whatsapp_intent → buy/exchange/installment/inquiry`; `view → cta_type NULL`
3. `visitor_hash ~ '^[a-f0-9]{16,64}$'` (line 140)
4. `device_id` ≤ 32 chars (line 145); `ad_placement` in allowlist (lines 148–151)
5. at least one target required (line 154)
6. campaign must exist and `is_active = TRUE` (lines 159–166) — consistent with M7 (`lookup_campaign_by_short_code` filter)

Anti-spam (lines 168–190):
- Hourly rate limit: ≤ 60 rows / visitor_hash / 1 hour, else raise
- Dedup windows: `view` = 3600 s; `click`/`whatsapp_intent` = 300 s; matched on
  (kind, cta_type, campaign_id, ad_placement, device_id) with `IS NOT DISTINCT FROM`
  under the same visitor_hash → silent `RETURN` on duplicate

Direct-write prevention: three layers — (1) no INSERT/UPDATE/DELETE grants for any role;
(2) no write policies; (3) RLS enabled. Live probe E1 in `04` proves it (`42501`).

`visitor_hash` tampering — honest statement: format and per-hash caps are validated, but a
malicious client holding the anon key can rotate hashes and defeat the per-hash hourly cap.
This is an **intentional design property** matching the anon-RPC pattern (`increment_qr_counter`);
the caps are abuse heuristics, not a security boundary. The value carries no PII. (Finding F1.)

Frozen systems: apply touches only `campaign_intents` + `pgcrypto` (idempotent) + a read of
`campaigns` (existence/is_active) inside the RPC. No DML/DDL on `analytics_events`, `qr_codes`,
`placements`, `placement_history`, `sessions`, `users`.

## 2. Pre/Post verification

### `03-pre-apply-evidence.sql` (read-only; no DML/DDL/SET ROLE)
- A1–A3: dependencies present — `is_research_role()`, `public.campaigns`, `gen_random_uuid`
- B: M2 objects ABSENT (`to_regclass`/`to_regproc` → NULL) — fresh apply, not a re-run
- C: frozen baseline row counts for `analytics_events`/`qr_codes`/`placements`/`placement_history`/`sessions`/`users`/`campaigns`

### `04-post-apply-verify.sql` (sections A–D, F read-only; E transaction-wrapped BEGIN;ROLLBACK with SET LOCAL ROLE)
- A: the 7 expected columns (information_schema)
- B: `rls_enabled=true` + exactly one SELECT policy, no write policies
- C1: table-grant matrix — anon none; authenticated SELECT only
- C2: EXECUTE on RPC true for anon + authenticated
- D: RPC contract — VOLATILE, SECURITY DEFINER, `search_path=public`
- E: behavior probes (rolled back, nothing persists):
  - E1 anon direct INSERT → blocked (`42501`)
  - E2 valid anon RPC → exactly 1 row
  - E3 duplicate within window → stays 1 row
  - E4 `click+buy` / kind `nonsense` / `visitor_hash='NOT_HEX!'` → rejected
  - E5 campaign-bound active → 1 row (or SKIP if no active campaign)
  - Section E fails fast (`RAISE EXCEPTION 'FAIL:…'`) on any deviation
- F: frozen row counts — compared manually to the 03 baseline

Finding F2: sections A–D/F are evidence SELECTs with expectations stated in comments (owner
compares); only E fails automatically. This matches the repo's established verification
convention. A machine-checkable PASS/FAIL column per section would be an optional change
requiring owner decision. The frozen before/after comparison is by row count; the apply script
does no DML on those tables at all (proven by script text).

## 3. Client wiring — `src/services/intent-tracking.ts`

- Only call sites (grep-verified): `AdContactBanner.tsx:78` (view), `AdContactBanner.tsx:112`
  (click), `ProductDetailsScreen.tsx:104` (whatsapp_intent).
- Payload: `p_kind`, `p_visitor_hash` (`getVisitorHash()`), `p_cta_type` (null for view),
  `p_campaign_id` (**always null today** — no caller passes `campaignId`), `p_ad_placement`, `p_device_id`.
- RPC failure: `recordIntent` is synchronous void; network dispatched via
  `void sendIntent(event).catch(() => {})`; a throwing `getSupabaseClient` (missing env) is
  caught by the outer try/catch. Never throws (two tests prove it).
- WhatsApp never waits on tracking: `recordIntent` is never awaited; in `handleAction` the
  message is built by the pure `sendPhoneActionWhatsApp` and `whatsapp.send` runs immediately
  after; in the banner `openPhoneAdWhatsApp` runs synchronously right after the intent call.
- Duplicate prevention:
  - view: `viewedRef` (once per mount) + observer/timer cleanup on unmount + 1 h server dedup.
    StrictMode (`main.tsx:31`) double-mounts effects in dev only; the first mount's 1 s timer is
    cleared at cleanup before it can fire, so only the real mount records; server dedup is a
    second layer.
  - click / whatsapp_intent: user-gesture event handlers (never double-invoked by StrictMode)
    + 5 min server dedup.
- PII: `visitor_hash` is crypto-random, in-memory only, never persisted (P7-02); `deviceId` is a
  listing id (e.g. `rec_…`); `placement`/`cta_type` are enums; no email/phone/name/city is sent.
  The WhatsApp message uses device data locally only.

## 4. AdContactBanner

- `ad_click` fires only on overlay click; the overlay renders only when the ad resolves to a
  phone (`device ?` at line 106). Click path: `recordIntent({kind:'click', ctaType:'ad_click',
  placement, deviceId: device.id})` then `openPhoneAdWhatsApp(device)`.
- Phone resolution: `resolveAdDevice(ad.link)` (`ad-device-resolver.ts`) — regex on
  `[?#]device=…` then `InventoryService.getExchangeableDevices().find(id)`, same availability
  contract as the phone-details page.
- Non-phone ads (external link or unresolvable id): `device = null` → no overlay → normal
  AdSpot/anchor behavior preserved (test: `renders a normal ad anchor for a non-phone link`).
- Click tracking does not alter ad behavior: transparent overlay button on top; the intent call
  is fire-and-forget void before WhatsApp opens (textual order record→open, but record is not
  awaited). Test asserts both `recordIntent` and `openPhoneAdWhatsApp` are called.
- View counting: IntersectionObserver threshold ≥ 0.6 + ≥ 1 s dwell, once per mount (`viewedRef`),
  timer cleared when ratio drops or on cleanup. Not counted: hidden render, preload, DOM
  creation, off-screen mount.

## 5. ProductDetailsScreen

- Four CTA points: `ACTION_IDS = ['buy','exchange','installment','inquiry']` (line 24) →
  `ProductActionBar` → `handleAction` records `{kind:'whatsapp_intent', ctaType:action,
  placement:'phone-details', deviceId: device.id}` (line 104).
- Records intent only; does not precede/block WhatsApp: `recordIntent` is synchronous void and
  not awaited; then `sendPhoneActionWhatsApp` (pure builder) then `whatsapp.send`. Test asserts
  `mockSend` called once.
- No unauthorized telemetry: the only network call added by M2 in this screen is `recordIntent`.
  The visible `👁 views` counter is `useViewCounter` (line 68) — pre-M2, localStorage-only
  (`useViewCounter.ts`: `showroom_view_counts`, no network), untouched. No `getGlobalTelemetry`/`.track`.

## 6. Security matrix (`campaign_intents` / RPC)

| Role | Table SELECT | Table INSERT/UPDATE/DELETE | RPC EXECUTE | RPC effect |
|---|---|---|---|---|
| `anon` | No (REVOKE ALL, no policy) | No | Yes (granted) | Can insert validated rows — by design (mirrors increment_qr_counter) |
| authenticated **guest** | Granted but RLS → `is_research_role()=false` → 0 rows | No | Yes | Validated rows only |
| authenticated **researcher** | Granted + RLS true → all rows | No | Yes | Validated rows only |
| authenticated **admin** | same as researcher | No | Yes | Validated rows only |
| authenticated **super_admin** | same as researcher | No | Yes | Validated rows only |
| postgres/service_role (server) | full (owner/superuser) — not a client role | full | — | — |

Key: `authenticated` is the Supabase role for every signed-in user; `is_research_role()` checks
`users.role`. No client role can insert/update/delete directly — writes go only through the
SECURITY DEFINER RPC with full server-side validation.

## 7. Frozen-system proof

- Grep across `supabase/m2-campaign-intents` for
  `analytics_events|qr_codes|scan_count|placements|placement_history|lookup_scan_context|
  lookup_campaign_by_short_code|increment_qr_counter|404.html|/c/`:
  all matches are inside **comments** (`01` lines 25/30-31, `02` lines 6-7, `README`) or the
  read-only **evidence counts** in `03` lines 43-46 and `04` lines 187-190. No DML/DDL on those entities.
  `campaigns` is read only (RPC `is_active` check; evidence counts); P6-protected columns
  (`display_name`/fingerprint) untouched.
- Grep of the three client files for the same symbols → **zero matches**.
- `recordIntent` calls `.rpc('record_campaign_intent', …)` only. No calls to `lookup_scan_context`,
  `increment_qr_counter`, `lookup_campaign_by_short_code`. No changes to `/c/<SHORT_CODE>`,
  `404.html`, CR-00005/CR-00007, LV-3/9/10/11, or P3/P5/P6/P7 (their guard suites pass).

## 8. Tests

Full suite: **vitest run → 122 files / 1183 tests PASSED**. `tsc --noEmit` / `tsc -b` clean;
`eslint` 0 errors (only pre-existing design-system style warnings); `vite build` succeeds.

### `intent-tracking.test.ts`
| Test | Property | Expected | Actual |
|---|---|---|---|
| returns void synchronously and dispatches RPC with full payload | fire-and-forget contract + 6 params | void + `p_kind=whatsapp_intent, p_cta_type=buy, p_campaign_id=null, …` | PASS |
| records ad click kind click/cta ad_click | click contract | `p_kind=click, p_cta_type=ad_click` | PASS |
| records view with cta_type null | view contract | `p_kind=view, p_cta_type=null` | PASS |
| never throws when RPC rejects | WhatsApp not blocked | no throw | PASS |
| never throws when client unavailable | missing env | no throw | PASS |
| does NOT dispatch when sender disabled | test seam | no dispatch | PASS |
| visitor_hash is 32 lowercase hex | P7-02 format | `/^[a-f0-9]{32}$/` | PASS |
| stable across calls in one page load | per-page-load | stable | PASS |

### `AdContactBanner.test.tsx`
| Test | Property | Expected | Actual |
|---|---|---|---|
| renders nothing when ad disabled | no render / no intent | no banner, no recordIntent | PASS |
| normal anchor for non-phone link | non-phone behavior unchanged | `<a href>` no overlay | PASS |
| phone ad → click records intent + opens WhatsApp | record then open with correct device | `{click, ad_click, placement, deviceId}` + `openPhoneAdWhatsApp(DEVICE)` | PASS |
| keeps banner visible under overlay | UX | banner present | PASS |
| view only after ≥0.6 for ≥1 s | §17 threshold/dwell | no record at 500 ms, record at 1000 ms | PASS |
| no view when ratio drops below 0.6 before 1 s | visibility cancel | no record | PASS |

### `ProductDetailsScreen.test.tsx`
`records a whatsapp_intent for the pressed action` → `{whatsapp_intent, buy, phone-details,
deviceId}` and `mockSend` called once — PASS. Pre-existing screen tests (4 CTAs, not-found,
similar carousel, favorite) also green.

## 9. Rollback — `02-campaign-intents-rollback.sql`

```sql
DROP TABLE IF EXISTS public.campaign_intents CASCADE;
DROP FUNCTION IF EXISTS public.record_campaign_intent(TEXT,TEXT,TEXT,UUID,TEXT,TEXT) CASCADE;
```
- `DROP TABLE` removes the table + its 3 indexes + its RLS policy + its FK constraint. CASCADE
  cannot drop/alter `campaigns`, `analytics_events`, or anything else (no dependent objects; the
  FK points from the new table to `campaigns`, not the reverse).
- `DROP FUNCTION` removes the function and its GRANT records automatically. No other dependents.
- Finding F3: `DROP EXTENSION pgcrypto` is intentionally **not** part of the rollback (dropping a
  shared extension is risky; on PG13+ `gen_random_uuid` is built-in so the extension may already
  exist). Sole side effect: if pgcrypto did not exist before apply, it remains after rollback (harmless).

## Findings (recorded for owner decision — nothing auto-fixed)

- **F1 — `visitor_hash` is client-rotatable.** Format and per-hash caps are enforced; a malicious
  client can rotate hashes to bypass the per-hash hourly cap. Intentional design property of the
  anon-RPC pattern; the caps are abuse heuristics, not a security boundary. No privacy impact.
- **F2 — 03/04 verification granularity.** Sections A–D/F are evidence SELECTs with expectations
  stated in comments (owner compares); only section E fails fast. A machine-checkable PASS/FAIL
  column per section is an optional change requiring owner decision.
- **F3 — rollback does not drop `pgcrypto`.** Intentional and safe (see §9).
- **F4 — note, not a defect:** the hourly rate limit counts all kinds combined (60/h/visitor_hash);
  documented in the gate report.

---

## Status

**M2 = IMPLEMENTED / TESTED / UNCOMMITTED / NOT DB-APPLIED.**

**HARD STOP — OWNER REVIEW REQUIRED.** Owner decision still open:
- **A** — approve commit only
- **B** — approve commit then move to owner-executed SQL (03 → 01 → 04)
- **C** — request changes before any commit
