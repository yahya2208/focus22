# FOCUS v2 — Controlled Fix Sprint: Discovery Report

**Date:** 2026-08-10
**Scope:** 3 fixes only — (1) Ad image gallery, (2) Phone CTA → WhatsApp-only, (3) QR scan count in Dashboard.
**Status:** DISCOVERY COMPLETE — no files modified. HARD STOP before any execution.

---

## 1. Related files (per fix)

### Fix 1 — Ad image gallery

| File | Role |
|------|------|
| `src/screens/showroom/ProductDetailsScreen.tsx` | Single-ad detail page. Renders `ProductImageGallery` at line 177 (`images={device.images ?? []}`). |
| `src/components/showroom/ProductImageGallery.tsx` | **The only gallery component.** Hand-rolled, no library. |
| `src/components/showroom/SimilarPhones.tsx` | Horizontal similar-phones strip (separate carousel, out of scope). |
| `src/components/showroom/PhoneImageUploader.tsx` | Uploader (unchanged — storage model untouched). |
| `src/services/image-service.ts` | Image compression (base64 data-URLs, ≤900px, JPEG q0.72). |
| `src/services/inventory-service.ts` | `InventoryRecord.images?: string[]` (base64 data-URLs in localStorage key `catalog_inventory`). |
| `src/__tests__/showroom/gallery.test.tsx` | Existing gallery tests (will be extended). |

### Fix 2 — Phone CTA → WhatsApp only

| File | Role |
|------|------|
| `src/services/whatsapp-service.ts` | Message builders; `WHATSAPP_PHONE = '+213556254007'` (line 4); `openWhatsApp` (line 20); canonical contact-owner pipeline lines 197-256. |
| `src/hooks/useSmartWhatsApp.ts` | **Canonical handoff.** Same-tab `wa.me` navigation + ~1.5s guard + fallback modal. `WhatsAppSendContext` line 12 contains `'installment'`. |
| `src/services/intent-tracking.ts` | Fire-and-forget intent counter. `IntentCtaType` line 27 contains `'installment'`. |
| `src/components/showroom/ContactOwnerAction.tsx` | Single contact CTA (details page). |
| `src/components/ad-contact/AdContactBanner.tsx` | Phone-linked ad overlay CTA. |
| `src/screens/showroom/ProductDetailsScreen.tsx` | `handleContact` (lines 101-110) wires CTA → WhatsApp. |
| `src/screens/phone-services/CustomerPhoneFlow.tsx` | Buy/Sell/Exchange wizard → composes message → WhatsApp. |
| `src/screens/repair/RepairRequestScreen.tsx` | Repair flow (persists request to Supabase; out of phone-purchase scope). |
| `src/__tests__/whatsapp/contact-owner-whatsapp.test.ts` | Existing mediator assertions (must be preserved). |
| `src/__tests__/showroom/ContactOwnerAction.test.tsx` | Existing single-CTA assertions (must be preserved). |

### Fix 3 — QR scan count in Dashboard

| File | Role |
|------|------|
| `src/business-intelligence/pages/CommerceIntelligenceBI.tsx` | **Contains the dead "مسح QR" label** (`qr_scanned: 'مسح QR'`, line 9). |
| `src/business-intelligence/api.ts` | `getCommerceFunnel()` (lines 283-328) — reads `users` + `sessions`; produces stages `users/sessions/completed/trades`. **Never produces `qr_scanned`.** |
| `src/business-intelligence/types.ts` | `CommerceFunnel`, `FunnelStage`, `BIDashboardId` types. |
| `src/research-console/pages/campaigns/campaign-service.ts` | `getCampaignQrMetrics()` (lines 121-125) → RPC `get_campaign_qr_metrics`; `CampaignQrMetricsRow`; `computeCampaignQrRates`. |
| `src/research-console/pages/campaigns/CampaignsDashboard.tsx` | **Working QR-scan counter** (lines 108/134, per-campaign). |
| `src/services/qr-measurement.ts` | Client funnel sender (scan/game_start/game_complete/registration). |
| `src/core/supabase/client.ts` | Supabase client. |

---

## 2. Current state (as-built facts)

### Fix 1 — Gallery current behavior

- Single active image + counter badge `{index+1}/{count}`; thumbnail strip (52×52); touch swipe (threshold 40px, dx-based, RTL-agnostic); keyboard arrows; tap → fullscreen overlay.
- **No transition animation** (instant `<img src>` swap), **no auto-play**, **no side-image blur/dim**, **no carousel library** (package.json has only supabase/qrcode/react/react-dom).
- Images: base64 data-URLs stored in localStorage under `catalog_inventory` (`InventoryRecord.images`).
- Single image → renders as a plain image (no strip). Zero images → 📱 placeholder fallback.

### Fix 2 — CTA current state (audit result: **already mediator-only**)

- No checkout, no payment, no installment calculator, no order/cart, no per-product seller phone.
- Every purchase/contact CTA ends at `wa.me/213556254007` — same-tab via `useSmartWhatsApp.send`, or `openWhatsApp` (repair/legacy, `window.open` + `location.href` fallback).
- `InventoryRecord` has **no** seller phone field. Recipient is always the hardcoded `WHATSAPP_PHONE`.
- **Dead-code remnants of the word "installment"** (no production caller):
  - `src/hooks/useSmartWhatsApp.ts:12` — `WhatsAppSendContext.action?: 'buy' | 'exchange' | 'installment' | 'inquiry'`
  - `src/services/intent-tracking.ts:27` — `IntentCtaType = 'buy' | 'exchange' | 'installment' | 'inquiry' | 'ad_click'`
  - Comments in `ContactOwnerAction.tsx:14,16` and `whatsapp-service.ts:200,203` (documentation only).
- `ProductDetailsScreen.tsx:109` passes `action: 'inquiry'` (not installment). Ad clicks pass intent `click` / `whatsapp_handoff_started`.

### Fix 3 — QR count current state

- The string "مسح QR" exists **only** in `CommerceIntelligenceBI.tsx:9` (`stageLabels.qr_scanned`).
- `api.getCommerceFunnel()` returns stages `users` / `sessions` / `completed` / `trades` — **never `qr_scanned`** → the label + count **never render**; the funnel shows raw English fallbacks instead.
- The **real, authoritative** QR-scan source is `campaign_qr_events` (via RPC `get_campaign_qr_metrics`), already rendered correctly in Research Console → Campaigns dashboard (`CampaignsDashboard.tsx`), labeled «المسحات» / "Scans".
- No `product_views` / `qr_scans` counter exists for showroom items.
- Legacy QR runtime (`analytics_events`, `qr_codes`, `placements`, `placement_history`, `lookup_scan_context`, `increment_qr_counter`, `scan_count`, `START_QR_FLOW`, `setCampaignId`, `setPlacementId`) exists **only** in forbidden-token regression tests and an old SQL file on disk — NOT active client code.

---

## 3. Correct data sources

| Metric | Correct source | Currently used by |
|--------|---------------|-------------------|
| QR scan count | `campaign_qr_events` via RPC `get_campaign_qr_metrics` | Campaigns dashboard (Research Console) — **correct** |
| QR scan count (BI) | same source | Commerce Intelligence — **wrong/missing** (`users`+`sessions`) |
| Phone images | `InventoryRecord.images` (base64, localStorage) | gallery — **correct** |

---

## 4. Unwanted commercial paths (all confirmed DEAD / non-customer-facing)

- `WhatsAppSendContext.action: 'installment'` — type member, no caller (DEAD).
- `IntentCtaType: 'installment'` — type member, no caller (DEAD).
- No checkout/payment/order/cart/reserve code exists anywhere in `src`.

---

## 5. Risks

1. Gallery auto-play must not fight touch/thumbnails/keyboard; needs pause-on-interaction to avoid index races.
2. Base64 images: transitions must be cheap (CSS opacity/transform), avoid re-renders of large data-URLs.
3. Removing `'installment'` from `IntentCtaType`/`WhatsAppSendContext` must not break existing tests that reference it (`ContactOwnerAction.test.tsx:50,54` — only queries buttons, safe).
4. BI fix must not reactivate legacy QR runtime; must not invent a number. If `get_campaign_qr_metrics` returns [] on error, show a clear "unavailable" state rather than a fabricated count.
5. RTL: carousel swipe direction must be logical (RTL-aware), not raw dx.

---

## 6. Existing tests that will be affected

- `src/__tests__/showroom/gallery.test.tsx` — counter/thumbnail/swipe/fullscreen; will be extended for autoplay, wrap, side-blur, RTL, single/empty.
- `src/__tests__/whatsapp/contact-owner-whatsapp.test.ts` — must be preserved (no weakening).
- `src/__tests__/showroom/ContactOwnerAction.test.tsx` — must be preserved.
- `src/__tests__/privacy/p3-stop-write-gate.test.ts`, `p7-privacy-regression-gate.test.ts`, `results/game-to-showroom.test.tsx`, `qr/qr-measurement.test.ts` — forbidden-token gates; unchanged behavior must keep them green.
- `src/__tests__/intent-tracking.test.ts` — may reference `IntentCtaType`; needs check.

---

**HARD STOP — Discovery complete. Awaiting owner approval before Phase 1 execution.**
