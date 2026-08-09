# M1 — Marketplace Mediator Model: Implementation Gate Report

**Status:** PASSED — awaiting owner approval (HARD STOP per N10)
**Date:** 2026-08-09
**Commit:** `0242363` — `feat(marketplace-mediator): M1 — single WhatsApp contact layer + CTA Option A + Ad Click to WhatsApp`
**Base:** `17d259f`
**Scope:** M1 only. M2 / M3 / M4 NOT started (per owner approval `M1 APPROVED — M2/M3/M4 NOT APPROVED YET`).

---

## 1. Owner decisions implemented (audit §31)

| Decision | Implemented |
|---|---|
| **N1 — CTA Option A** | Keep labels شراء / استبدال / تقسيط / استفسار. Icons replaced with contact-neutral symbols (💬 / 🔄 / 📩 / ❓). A clarifying subtitle is rendered under the actions explaining the action sends a request to the owner via WhatsApp (we are a marketplace — deals happen directly between visitor and owner). |
| **N2 — messages keep device fields** | Ad-click message reuses the existing 6-field contact contract (اسم الهاتف / الكود / السعر / المدينة / رابط الإعلان). No PII added. |
| **N3 — number stays hard-coded** | `WHATSAPP_PHONE = '+213556254007'` untouched. No DB-configurable number in M1. |
| **N6 — fire-and-forget tracking** | `recordIntent` is synchronous, never awaited, never throws. Disabled in M1. |
| **N7 — no ad↔campaign link** | No campaigns / placements tables or RPC touched. Ads remain purely visual. |
| **N9 — ad link policy** | No scope expansion: internal deep links + `wa.me` only (external links keep plain anchor behaviour). |

## 2. Exact changed files

**Modified (12):**
- `src/services/whatsapp-service.ts` — became the single contact layer (see below)
- `src/components/showroom/ProductActionBar.tsx` — CTA Option A
- `src/components/brand/BrandFooter.tsx` — WhatsApp chip uses `buildWhatsAppUrl` (central URL builder)
- `src/i18n/translations/en.ts`, `ar.ts`, `fr.ts`, `tr.ts` — added `phoneDetails.actions.whatsappNote`
- `src/screens/home/HomeScreen.tsx`, `src/screens/phone-services/PhoneServicesScreen.tsx`, `src/screens/phone-services/CustomerPhoneFlow.tsx`, `src/screens/repair/RepairHomeScreen.tsx`, `src/screens/results/ResultsScreen.tsx`, `src/screens/showroom/ProductDetailsScreen.tsx`, `src/screens/showroom/ShowroomScreen.tsx` — AdSpot → AdContactBanner on all 6 placements
- `src/__tests__/s3-cross-brand-ui-forwarding.test.tsx` — mock updated to the consolidated `whatsapp-service` module

**Added (7):**
- `src/services/ad-device-resolver.ts` — `extractAdDeviceId` + `resolveAdDevice` (ad link → phone listing, same availability contract as the phone-details page)
- `src/services/intent-tracking.ts` — fire-and-forget tracking seam, sender disabled in M1
- `src/components/ad-contact/AdContactBanner.tsx` — the Ad Click → WhatsApp component
- `src/__tests__/ad-click-whatsapp.test.ts`
- `src/__tests__/ad-contact/AdContactBanner.test.tsx`
- `src/__tests__/intent-tracking.test.ts`
- `src/__tests__/showroom/ProductActionBar.test.tsx`

**Deleted (1):**
- `src/services/whatsapp-message.ts` — only live export was `openWhatsAppForAction` (moved to `whatsapp-service`); the rest (`generateWhatsAppLink`, `generateShareLink`, `generateMessage`, `WHATSAPP_TEMPLATES`, `DEFAULT_WHATSAPP_PHONE`) were proven dead by grep (zero external references).

## 3. Every change

### 3.1 Single WhatsApp contact layer
- Moved `openWhatsAppForAction(action, params)` from `whatsapp-message.ts` into `whatsapp-service.ts` (routes buy/sell/exchange to the existing `openBuyRequest` / `openSellRequest` / `openExchangeRequest`). `CustomerPhoneFlow` updated to import it from the consolidated module.
- `BrandFooter` now builds its WhatsApp chip with `buildWhatsAppUrl(WHATSAPP_PHONE, '')` instead of an inline `wa.me` template — one URL builder everywhere.
- Deleted `whatsapp-message.ts` (dead after the move).
- `encodeURIComponent` in `buildWhatsAppUrl` kept exactly as-is.
- All existing WhatsApp behaviour and fallbacks preserved: `openWhatsApp` keeps its popup → same-tab fallback; `useSmartWhatsApp` untouched (same-tab wa.me + 1.5s guard modal).

### 3.2 CTA Option A (N1)
- `ProductActionBar.tsx`: icons 🛒/💳 → 💬/📩; added a `<p>` note under the buttons (`phoneDetails.actions.whatsappNote`) that the actions are requests to contact the owner via WhatsApp.
- New i18n key `phoneDetails.actions.whatsappNote` added to all 4 locales.
- `data-action` attributes preserved (CDP evidence). Still exactly 4 actions, no "بيع".

### 3.3 Ad Click → WhatsApp (N2, N6, N9)
- New `AdContactBanner` mounts on all 6 placements (home, phones, repair, results, exchange, phone-details).
  - When the configured ad is disabled/no image → renders nothing (same as AdSpot).
  - When `ad.link` is an internal `#/phone-details?device=<id>` deep link AND the device is deliverable (`getExchangeableDevices`) → the banner becomes a contact CTA: click fires `recordIntent` (fire-and-forget) then `openPhoneAdWhatsApp(device)`.
  - Any other link (external URL, other route, empty) → renders the standard `AdSpot` anchor exactly as before.
- `buildAdClickMessage(device)` reuses `getPhoneActionContext` — same name/code/price/city/link fields, line omitted when absent — prefixed by an "I saw your ad for this phone" opener.
- `openPhoneAdWhatsApp(device)` → `openWhatsApp(WHATSAPP_PHONE, message)` (popup + fallback preserved).

### 3.4 Fire-and-forget tracking (N6)
- `intent-tracking.ts` exports `recordIntent` + `setIntentSenderEnabled` (test seam). Sender is **disabled** in M1 (no Supabase/RPC, no `analytics_events`, no table).
- Contract enforced in code and tests: `recordIntent` returns void synchronously, never throws, callers do not await it. AdContactBanner also wraps the call in try/catch as a second layer.

## 4. Gate results

| Gate | Command | Result |
|---|---|---|
| Full test suite | `vitest run` | **122 files / 1175 tests PASSED** |
| New tests | `ad-click-whatsapp` (5), `AdContactBanner` (4), `intent-tracking` (3), `ProductActionBar` (4) | **16/16 PASSED** |
| WhatsApp + ads regression | `whatsapp-service.test.ts` (4), `phone-action-whatsapp.test.ts` (9), `AdSpot.test.tsx` (6), `ProductDetailsScreen.test.tsx` (5), `s3-cross-brand-ui-forwarding.test.tsx` (2) | PASSED |
| Frozen-system guards | `p3-stop-write-gate` (18), `p5-telemetry-qr-removal-gate` (13), `p7-privacy-regression-gate` (11), `campaign-admin-guard` (9) | **PASSED (see §5)** |
| i18n keys | `translation-keys.test.ts` (4) | PASSED |
| TypeScript | `tsc --noEmit` (and `tsc -b` in build) | 0 errors |
| ESLint | `eslint src/ --report-unused-disable-directives` | 0 errors (5202 pre-existing warnings, unchanged) |
| Production build | `tsc -b && vite build` | `✓ built in 3.60s` (409 modules) |

## 5. Frozen-system proof

- **PG-27** (p3): no runtime-path file performs `.from(...).insert/update/delete` or `.rpc(` — `whatsapp-service.ts` (M1-modified) and `useSmartWhatsApp.ts` clean.
- **PG-13/15** (p3): `useSmartWhatsApp` still contains `wa.me` and `window.open`.
- **PG-57** (p3): `git diff --name-only HEAD` after the M1 commit contains **no** file under the protected prefixes (`catalog/`, `components/catalog/`, `components/ads/`, `inventory-service.ts`, `inventory-seed.ts`, `price-memory.ts`, `ads-service.ts`).
- **P5 PG-59/61** (p5): `useSmartWhatsApp` remains direct same-tab wa.me; catalog/inventory/ads files unchanged.
- **P7-01/02/03** (p7): no geolocation/cookie/sendBeacon/fingerprint; no persistent visitor identity; QR-runtime files never reference `qr_codes` / `placements` / `placement_history` / `analytics_events` / `lookup_scan_context` / `increment_qr_counter` / `scan_count` / `START_QR_FLOW` / `setCampaignId` / `setPlacementId` / `qr_scanned`.
- **Campaign admin guard** (9 tests): campaigns/QR admin surface unchanged.
- **Proof QR/analytics/placements untouched:** no migration, no table create/alter, no RLS edit, no RPC add/edit; `supabase/` unmodified by M1; `src/components/ads/` (AdSpot/AdBanner) unmodified; `ads-service.ts` unmodified.

## 6. Proof: WhatsApp works when tracking fails

`AdContactBanner` click handler:
```ts
try {
  recordIntent({ kind: 'ad_click', ctaType: 'ad_click', placement, deviceId: device.id });
} catch {
  // fire-and-forget: tracking must never block WhatsApp
}
openPhoneAdWhatsApp(device);
```
`recordIntent` returns `void` synchronously and is never awaited. `intent-tracking.test.ts` verifies it never throws (even with the sender enabled). Therefore a tracking failure cannot delay or prevent the WhatsApp open. `openWhatsApp` keeps its popup + same-tab fallback.

## 7. Proof: Ad → Phone → WhatsApp works

`AdContactBanner.test.tsx`:
- Phone-linked ad (`#/phone-details?device=rec_abcdef12`, device resolvable) → clicking the overlay calls `openPhoneAdWhatsApp(DEVICE)` exactly once (asserted via spy).
- Non-phone link (`https://go.example`) → renders the plain `AdSpot` anchor, no overlay button.
- Disabled ad → nothing rendered.
`ad-click-whatsapp.test.ts` verifies `extractAdDeviceId`/`resolveAdDevice` against the phone-details deep-link format (incl. encoded ids and `&`-suffix params).

## 8. Scope-deviation note

None. All M1-forbidden items were avoided: no migration/table/RLS/RPC; no writes to `analytics_events`/`qr_codes`/`placements`/`placement_history`; QR runtime (`/c/<SHORT_CODE>`, `404.html`, `lookup_campaign_by_short_code`, `lookup_scan_context`, `increment_qr_counter`) untouched; no commerce workflow; M2/M3/M4 not started.

## 9. HARD STOP

M1 gate closed. **Awaiting owner approval before any M2 work.** No auto-advance (N10).
