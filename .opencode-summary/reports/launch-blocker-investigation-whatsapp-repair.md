# 🚨 Launch Blocker — Investigation Report: WhatsApp Repair Request

- **Status:** READ-ONLY forensic investigation — COMPLETE (no code changed, no commit, no migration)
- **Priority:** 🔴 Critical
- **Report date:** 2026-08-05
- **Scope:** Issue 2 — repair request does not open WhatsApp properly; message arrives encoded/unreadable; only the phone number appears.

---

## 1. Symptoms (as reported)

1. The WhatsApp window does not open correctly.
2. The message arrives **encoded / unreadable**.
3. Only the phone number appears (no readable Arabic message).

---

## 2. Root Cause (confirmed — two independent defects)

### Defect A — Arabic text in `RepairRequestScreen.tsx` is corrupted (mojibake) at the SOURCE

The inline WhatsApp message in `src/screens/repair/RepairRequestScreen.tsx` (lines 75-88) is written with **Latin-1-mojibake Arabic**. Byte-level check (PowerShell `ReadAllBytes` + UTF-8 decode) confirmed the file literally contains `Ø§Ù„Ø³Ù„Ø§Ù…` instead of `السلام`, `Ø£Ø±ØºØ¨` instead of `أرغب`, etc. This is baked into the file on disk — it is **not** an `encodeURIComponent` problem. `encodeURIComponent` faithfully encodes the corrupted characters, so WhatsApp receives the mojibake sequence and shows `Ø§Ù„Ø³Ù„Ø§Ù…` — unreadable to the user.

This is why: only the **phone number** (`+213556254007`) displays correctly — the number is ASCII; everything else in the `text=` param is corrupted.

### Defect B — `openWhatsApp` navigates the current tab instead of opening a new window/tab

`src/services/whatsapp-service.ts:19-25` uses `window.location.href = url`. In a mobile/in-app/PWA context this replaces the current page rather than opening WhatsApp as a new window/tab. Browsers that block full-page redirects to an external app (or a `wa.me` deep link) can silently fail → "the WhatsApp window does not open correctly". The more robust approach is `window.open(url, '_blank', 'noopener')`.

---

## 3. Evidence (file:line)

| # | File:line | Finding |
|---|-----------|---------|
| 1 | `src/screens/repair/RepairRequestScreen.tsx:74-91` | Inline message built from **mojibake** Arabic literals; calls `openWhatsApp(WHATSAPP_PHONE, message, 'repair_requested')`. **Byte-confirmed corruption.** |
| 2 | `src/services/whatsapp-service.ts:5` | `WHATSAPP_PHONE = '+213556254007'` (correct number — not the issue). |
| 3 | `src/services/whatsapp-service.ts:14-17` | `buildWhatsAppUrl` → `https://wa.me/${formatted}?text=${encodeURIComponent(message)}` — encodes whatever string it receives (incl. corrupted text). |
| 4 | `src/services/whatsapp-service.ts:19-25` | `openWhatsApp` → `window.location.href = url` (in-tab navigation; unreliable for external app on mobile). |
| 5 | `src/services/whatsapp-service.ts:78-95` | Clean service-level `openRepairRequest` with **correct** Arabic — exists but the Repair screen does NOT use it; it duplicates a corrupted inline copy instead. |
| 6 | `src/services/repair/repair-whatsapp.ts:4-13` | `sendRepairRequestWhatsApp` correctly delegates to `openRepairRequest` — a proper path exists, unused by RepairRequestScreen. |
| 7 | `src/screens/phone-services/CustomerPhoneFlow.tsx:52-61` | Uses `openWhatsAppForAction` + `WHATSAPP_BUSINESS_PHONE` (alias) — separate flow, clean Arabic (via `whatsapp-message.ts`), NOT affected by the mojibake. |
| 8 | `src/core/qr/share.ts:41` / `src/components/brand/BrandFooter.tsx:19` / `src/services/whatsapp-message.ts:199,216` | Additional independent `wa.me` builders (4+ generators in the codebase). Not the defect, but a fragmentation risk — message/URL logic is duplicated in many places. |

### Mojibake scope scan (full `src/`, byte-level)

Only **two** files are affected:
- `src/screens/repair/RepairRequestScreen.tsx` — the **WhatsApp** defect (lines 75-88), plus corrupted UI fallback strings (lines 110, 118, 131, 139, 149, 157, 175, 180, 184, 191, 205, 210, 219, 222, 244-245, 253).
- `src/business-intelligence/api.ts` — corrupted Arabic in AI summaries / insight strings (lines 390-392, 394-395, 484-485, 496-497, 509-510, 523-524, 536, 544). Display-only (not WhatsApp) but will look garbled in the BI console.

---

## 4. Proposed Fix (for user approval — NOT executed)

**Phase 1 — the repair WhatsApp path (blocker):**
1. **Rewrite the corrupted Arabic literals in `RepairRequestScreen.tsx`** (lines 75-88) with clean UTF-8 Arabic.
2. **Better:** delete the inline message and reuse the existing service builder `openRepairRequest` (whatsapp-service.ts:78) or `sendRepairRequestWhatsApp` (repair-whatsapp.ts:4) so there is exactly one source of truth. The Repair screen already imports `openWhatsApp` — swap it for the service-level function.
3. **Switch `openWhatsApp` to `window.open(url, '_blank', 'noopener')`** (with a fallback to `window.location.href` if popup is blocked) so WhatsApp opens in a new window/tab reliably.

**Phase 2 — cleanup (recommended, not a blocker):**
4. Fix the corrupted Arabic in `src/business-intelligence/api.ts`.
5. Consolidate the 4+ `wa.me` builders into one shared util (`whatsapp-service.ts`) to prevent future drift.

---

## 5. Verification plan (after fix, to be run by user)

1. Submit a repair request → tap "إرسال التفاصيل عبر واتساب".
2. WhatsApp opens (new tab/window) with recipient `+213 556 25 40 07`.
3. The message shows **readable Arabic** (السلام عليكم / رقم الطلب / الهاتف / المشكلة).
4. Re-run the existing test suite + `npm run build` (message strings are not under tests; visual check required).
