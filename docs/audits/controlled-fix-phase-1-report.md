# Phase 1 Report — Controlled Execution (Gallery + WhatsApp-only CTA + QR Scan Counter)

Status: **COMPLETE** · Date: 2026-08-10 · Discovery: [`docs/audits/controlled-fix-discovery.md`](controlled-fix-discovery.md)

## Summary

Three source fixes were implemented, covered by tests, and verified (typecheck / lint / unit tests / production build all green). No behavioral changes beyond the three fixes; no commits made.

## Fixes

### FIX-01 — Product gallery is a real carousel (hand-rolled, no library)

File: `src/components/showroom/ProductImageGallery.tsx`

- Center image is the focus (opacity 1, `blur(0px)`); prev/next images peek on the sides, dimmed (`opacity 0.55`), blurred (`3px`), and scaled (`0.9`).
- Auto-play every **3s** (`GALLERY_AUTOPLAY_MS = 3000`) with **circular wrap** (3 → 1 and 1 → 3). Paused during touch/drag; any manual interaction restarts the 3s window.
- Smooth crossfade via stacked slides (no `<img>` swap, no layout shift, no flicker).
- Touch swipe + pointer drag with a 40px threshold; **RTL-aware logical direction** (mirrored in `dir="rtl"`).
- `ArrowLeft` / `ArrowRight` keyboard navigation (RTL-aware), thumbnails + fullscreen viewer preserved.
- `aria-current` on active thumbnail; `role="region"`/`aria-label` retained.
- Single-image and zero-image states: no auto-play, no arrows/thumbnails; empty state shows a placeholder. Timers cleaned up on unmount.
- After a drag swipe, a following tap does **not** open fullscreen (`draggedRef` guard).

Tests: `src/__tests__/showroom/gallery.test.tsx` — 20 tests (rewritten for the new behavior; the old "clamps at boundaries" expectation was replaced by circular-wrap assertions).

### FIX-02 — WhatsApp-only CTA; no `installment` in the intent/CTA model

- `src/hooks/useSmartWhatsApp.ts` — `WhatsAppSendContext.action` union reduced to `'buy' | 'exchange' | 'inquiry'`.
- `src/services/intent-tracking.ts` — `IntentCtaType` reduced to `'buy' | 'exchange' | 'inquiry' | 'ad_click'`.

The `installment` value could never be produced by any call site (all sites use `'inquiry'`/`'buy'`/`'ad_click'`); the union member was dead and misleading. Guardrail comments stating the app never offers installment/financing are kept. Grep sweep confirms no remaining `installment` values anywhere in the two types.

### FIX-03 — Commerce Intelligence shows the real QR scan count (Error ≠ Zero)

Source of truth: the existing guarded RPC `get_campaign_qr_metrics` via `campaign-service.ts`.

- `src/research-console/pages/campaigns/campaign-service.ts` — added status-aware `getCampaignQrMetricsResult(): Promise<{ ok: boolean; rows }>`; the legacy `getCampaignQrMetrics()` now delegates to it (contract unchanged: `[]` on error).
- `src/business-intelligence/api.ts` — new `BusinessAPI.getQrScanCount(): Promise<QrScanCount>` that sums only `event_type === 'scan'` totals across campaigns.
- `src/business-intelligence/types.ts` — new `QrScanCount { available, scans }`.
- `src/business-intelligence/pages/CommerceIntelligenceBI.tsx` — new "عدد مسحات QR" card; removes the dead `qr_scanned` label from `stageLabels` (it was never produced by `getCommerceFunnel`). When the RPC errors, the card shows **"—"** with a "تعذر قراءة البيانات" hint (never a fake `0`); a genuine zero shows **0**.

Tests: `campaign-service.test.ts` (ok:true rows / ok:true empty / ok:false on error / legacy contract) and new `src/__tests__/business-intelligence/qr-scan-count.test.ts` (sums only scans, missing totals → 0, zero read → available:true 0, RPC error → available:false).

## Verification

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | pass |
| Lint | `npm run lint` | 0 errors (warnings pre-existing, design-system style) |
| Unit tests | `npm run test` | **1309 passed / 129 files** |
| Build | `npm run build` | pass |

## Out of scope (untouched)

- `inventory-phase-c/`, `supabase/inventory-central/`, and other prior-phase untracked work.
- `CustomerPhoneFlow.tsx`'s own `CustomerAction` type (`sell|buy|exchange`) — separate screen domain, not the WhatsApp CTA action.

## Follow-ups (not part of this phase)

- Apply `supabase/m2-campaign-intents/01-campaign-intents-apply.sql` so `record_campaign_intent` exists (until then the RPC is absent and `recordIntent` is fire-and-forget-silent).
- Deploy the `get_campaign_qr_metrics` RPC if not already applied; until it exists, `getQrScanCount` returns `available:false` and the BI card correctly renders "—".
