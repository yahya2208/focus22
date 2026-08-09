# M2 — Campaign Intent Counters · Gate Report

**Model:** Marketplace Mediator (`docs/audits/marketplace-mediator-model-audit.md`, §17–§20 design · §31 N1–N10 governance)
**Phase:** M2 — owner-approved **2026-08-09** (N4/N5/N6)
**Status:** ⏳ **Implementation complete — awaiting owner SQL execution (HARD STOP below)**
**SQL directory:** `supabase/m2-campaign-intents/`
**Prior phase:** M1 — complete, committed `0242363` (`docs/audits/m1-marketplace-mediator-gate-report.md`)

---

## 1. Scope of M2

One **new independent counter table** + one **guarded write RPC**, wired to three client
fire-and-forget hooks. No frozen surface is touched (see §6). The SQL is **additive only**
and **must be executed by the owner** in the Supabase SQL editor — the client code is
already live behind a defensive fire-and-forget wrapper that never blocks WhatsApp.

---

## 2. SQL package — owner checklist

> **Owner executes in the SQL editor, in this exact order. Scripts 03 and 04 are read-only; only script 01 writes.**

| # | File | Type | Purpose |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | Baseline: confirms M2 objects absent, frozen tables/RPCs unchanged, frozen row counts captured |
| 2 | `01-campaign-intents-apply.sql` | **apply (writes)** | Creates `public.campaign_intents` + indexes, enables RLS, grants, guarded RPC |
| 3 | `04-post-apply-verify.sql` | read-only | Columns, RLS/policies, grant matrix, RPC snapshot, BEGIN/ROLLBACK behavior probes, frozen-count comparison |

### 01 apply script — what it creates
| Entity | Detail |
|---|---|
| `CREATE EXTENSION IF NOT EXISTS pgcrypto` | idempotent; `gen_random_uuid()` for PK |
| `public.campaign_intents` | PK `id UUID DEFAULT gen_random_uuid()`; `kind CHECK IN (view, click, whatsapp_intent)`; `cta_type CHECK IN (buy, exchange, installment, inquiry, ad_click)`; `campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE`; `ad_placement CHECK IN (home, phones, repair, results, exchange, phone-details)`; `device_id` (1–32 chars or NULL); `visitor_hash NOT NULL CHECK '^[a-f0-9]{16,64}$'`; `created_at TIMESTAMPTZ DEFAULT now()` |
| 3 indexes | `idx_campaign_intents_dedup` (visitor_hash, kind, cta_type, created_at DESC) · `idx_campaign_intents_visitor_time` (visitor_hash, created_at DESC) · `idx_campaign_intents_research` (created_at DESC) |
| RLS | `ENABLE ROW LEVEL SECURITY`; SELECT-only policy **"Research roles read campaign intents"** → `authenticated USING (is_research_role())`. **No INSERT/UPDATE/DELETE policies** |
| Grants | `REVOKE ALL FROM PUBLIC, anon, authenticated` on the table; `GRANT SELECT TO authenticated` only. **No anon table access** |
| RPC | `public.record_campaign_intent(p_kind, p_visitor_hash, p_cta_type, p_campaign_id, p_ad_placement, p_device_id) RETURNS void` — `SECURITY DEFINER VOLATILE SET search_path = public`; `GRANT EXECUTE TO anon, authenticated` |

### RPC contract (server-side enforcement — JS is never the protection)
| Check | Behavior |
|---|---|
| kind/cta_type matrix | `view → cta_type NULL` · `click → ad_click` · `whatsapp_intent → buy/exchange/installment/inquiry`; mismatch raises |
| visitor_hash | `~ '^[a-f0-9]{16,64}$'` else raise |
| device_id / ad_placement | length ≤ 32 / allowlist else raise |
| target presence | at least one of campaign_id/ad_placement/device_id required |
| campaign active | if campaign_id given, `EXISTS (campaigns WHERE id = … AND is_active = TRUE)` else raise |
| rate limit | ≤ 60 rows/h/visitor_hash else raise |
| dedup window | `view` 1 h, `click`/`whatsapp_intent` 5 min → **silent RETURN** on duplicate (same visitor_hash+kind+cta_type+campaign+placement+device) |

### 02 rollback script — exact one-shot
- `DROP TABLE IF EXISTS public.campaign_intents;` and `DROP FUNCTION IF EXISTS public.record_campaign_intent(...)`.
- No cascade overreach; does not touch any frozen object.

---

## 3. Client wiring proof

| File | Change |
|---|---|
| `src/services/intent-tracking.ts` | `IntentKind` (`'view'\|'click'\|'whatsapp_intent'`); `getVisitorHash()` = crypto-random 32-hex held in memory only (P7-02, never persisted); `recordIntent` fire-and-forget via `rpc('record_campaign_intent', …)` with `null`s for absent fields; RPC rejection or missing Supabase env never throws; `setIntentSenderEnabled()` test seam (default true) |
| `src/components/ad-contact/AdContactBanner.tsx` | View effect **above** the `if (!ad) return null;` early return (Rules of Hooks); IntersectionObserver threshold ≥ 0.6 + ≥ 1 s dwell, one view per banner per mount; click overlay calls `recordIntent({kind:'click', ctaType:'ad_click', placement, deviceId})` in try/catch **before** `openPhoneAdWhatsApp` |
| `src/screens/showroom/ProductDetailsScreen.tsx` | `handleAction` calls `recordIntent({kind:'whatsapp_intent', ctaType:action, placement:'phone-details', deviceId:device.id})` in try/catch **before** `sendPhoneActionWhatsApp` |

All three call sites are fire-and-forget: a rejected RPC, a missing `VITE_SUPABASE_*` env, or a throwing sender can never block WhatsApp.

---

## 4. Test matrix

Full suite: **`vitest run` → 122 files / 1183 tests PASSED**. New/updated M2 tests:

| File | Coverage |
|---|---|
| `src/__tests__/intent-tracking.test.ts` | RPC payloads for whatsapp_intent/click/view (correct params, nulls for absent); rejected RPC never throws; unavailable client never throws; disabled sender → no dispatch; visitor_hash 32-hex + stable per session |
| `src/__tests__/ad-contact/AdContactBanner.test.tsx` | disabled renders nothing; external-link anchor fallback; click overlay records intent + opens WhatsApp; view fires only after ≥ 0.6 ratio + ≥ 1 s dwell; view cancelled when ratio drops below 0.6 |
| `src/__tests__/showroom/ProductDetailsScreen.test.tsx` | mocked `useSmartWhatsApp` + `recordIntent`; asserts whatsapp_intent payload + WhatsApp send order |

Static gates re-run after fixes: `tsc --noEmit` ✅ · `tsc -b` ✅ · `eslint .` (0 errors; only pre-existing design-system style warnings) ✅ · `vite build` ✅.

---

## 5. Anti-spam decision record (§18)

- **Hourly cap:** 60 intents/hour/visitor_hash — below the historical production `analytics_events` volume (~100/hour in P5 baseline), so it cannot distort M3 readouts and still bounds abuse.
- **Dedup windows:** view 1 h (matches the "one view per banner per mount" UI guard); click/whatsapp_intent 5 min (WhatsApp taps are a hard user action — a short window is enough).
- **Enforcement:** server-side in the RPC only; the client hook is best-effort.

---

## 6. Frozen surfaces — untouched evidence

| Guard | Verdict |
|---|---|
| `p3-stop-write-gate.test.ts` | ✅ green — M2 files not in the frozen runtime write lists |
| `p5-telemetry-qr-removal-gate.test.ts` | ✅ green — denies `getGlobalTelemetry`/`.track(` only; M2 does not use them |
| `p6-red-gate-07-keep-protection.test.ts` | ✅ green — `campaigns` target `display_name`/fingerprint columns untouched |
| `p7-privacy-regression-gate.test.ts` | ✅ green — P7-02 (visitor_hash in-memory only) respected |
| `campaign-admin-guard.test.ts` | ✅ green |

Frozen tables/RPCs (`analytics_events`, `qr_codes`, `placements`, `placement_history`, `increment_qr_counter`, `lookup_scan_context`) are **not** referenced in `supabase/m2-campaign-intents/*` except `03/04` read-only evidence snapshots. Client does not read/write `campaigns` for counters.

---

## 7. Owner execution (SQL editor) — ⏳ PENDING

1. Run `supabase/m2-campaign-intents/03-pre-apply-evidence.sql` — capture the baseline output.
2. Run `supabase/m2-campaign-intents/01-campaign-intents-apply.sql` — expect no errors.
3. Run `supabase/m2-campaign-intents/04-post-apply-verify.sql` — expect all probes PASS (E1 direct INSERT blocked · E2 valid write 1 row · E3 dedup stays 1 row · E4 invalid kind/cta/hash rejected · E5 active-campaign; each wrapped BEGIN/ROLLBACK, zero committed rows).

---

## 🛑 HARD STOP

**M2 implementation is complete and verified client-side, but the database changes are NOT applied.**
This report is the stopping point. The owner must run the three scripts above (pre → apply → post).
**M3 (read-only counter UI) and M4 (phone listings server source) remain NOT approved** — do not proceed to them in this session.

Once the owner has applied and the 04 output is pasted back, the verification can be closed (N4/N5/N6) and the next phase proposed.
