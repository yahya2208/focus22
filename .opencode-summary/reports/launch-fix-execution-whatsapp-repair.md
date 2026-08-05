# 🚀 Launch Fix — Execution Report: WhatsApp Repair (unified clean-Arabic path)

- **Status:** EXECUTED + verified (code, typecheck, lint, 860-test suite, production build, evidence tests)
- **Priority:** 🔴 Critical (WhatsApp unusable for repair requests)
- **Report date:** 2026-08-05
- **Predecessor:** `launch-blocker-investigation-whatsapp-repair.md` (read-only root-cause proof)

---

## 1. Root cause (recap)

Two independent defects:

- **Defect A — mojibake at the SOURCE:** `RepairRequestScreen.tsx` built the WhatsApp message from inline Arabic literals that are corrupted on disk (Latin-1 mojibake, e.g. `Ø§Ù„Ø³Ù„Ø§Ù…` instead of `السلام`). `encodeURIComponent` faithfully encodes the garbage, so WhatsApp receives unreadable text. Only the ASCII phone number displayed correctly.
- **Defect B — in-tab navigation:** `openWhatsApp` used `window.location.href = url`, which is unreliable on mobile/in-app browsers for external `wa.me` deep links → "the WhatsApp window does not open correctly".

Also: the repair screen duplicated the message builder instead of using the existing clean service-level generator (`sendRepairRequestWhatsApp` → `openRepairRequest`), which is why there were 4+ independent `wa.me` generators.

## 2. Fix (one unified send path, single source of truth)

| File | Change |
|------|--------|
| `src/services/whatsapp-service.ts:19-30` | `openWhatsApp` now `window.open(url, '_blank', 'noopener')` with a same-tab fallback `window.location.href = url` when the popup is blocked. |
| `src/services/whatsapp-service.ts:83-102` | `openRepairRequest` extended with `condition?: string` + `customerPhone?: string`; message written in clean UTF-8 Arabic (السلام عليكم / أرغب في إصلاح الهاتف التالي / 📱 الهاتف / الحالة / 🔧 العطل / الوصف / 📍 الموقع / 🆔 رقم الطلب / 📞 رقم العميل / شكراً). |
| `src/services/repair/repair-whatsapp.ts:4-15` | `sendRepairRequestWhatsApp` now forwards `condition` and `customerPhone` into `openRepairRequest`. |
| `src/screens/repair/RepairRequestScreen.tsx:11-13,73-78` | Inline mojibake builder **deleted**. `handleOpenWhatsApp` now calls `sendRepairRequestWhatsApp(result.request)`. Imports updated (dropped `openWhatsApp`/`WHATSAPP_PHONE`/`toInternationalFormat`, added `sendRepairRequestWhatsApp`; kept `openModelNotFoundRequest` + `AlgerianPhoneInput`/`normalizePhone`). |

Unified path after fix (repair, sell, buy, exchange all funnel into the **same** `openWhatsApp`):

```
RepairRequestScreen ──► sendRepairRequestWhatsApp ──┐
CustomerPhoneFlow ────► openWhatsAppForAction ──────┼─► openBuyRequest / openSellRequest
                                                    │    / openExchangeRequest / openRepairRequest
                                                    └─► openWhatsApp ──► wa.me/+213556254007 (window.open '_blank','noopener')
```

## 3. Automated evidence (recorded run)

New test file: `src/__tests__/whatsapp/whatsapp-service.test.ts` (4 tests, all PASS).

| # | Test | What it proves |
|---|------|----------------|
| 1 | opens wa.me with the business number in a new tab via window.open | `window.open(url,'_blank','noopener')`, URL = `https://wa.me/213556254007?text=...` |
| 2 | falls back to window.location.href when the popup is blocked | popup-blocked → same-tab redirect still opens WhatsApp |
| 3 | sends a clean Arabic repair message with all request details via the unified path | message contains `السلام عليكم` + brand/model + الحالة + العطل + الوصف + رقم الطلب + رقم العميل; **no `\uFFFD`, no `Ø` (mojibake guard)** |
| 4 | routes repair, buy, sell, exchange through the same openWhatsApp path with the same business number | all four flows → `wa.me/213556254007?text=`, all messages clean Arabic (`لا Ø`), correct per-flow text (شراء / بيع / استبدال / إصلاح) |

The existing `src/__tests__/repair/repair.test.ts` → "Engine 5 — WhatsApp Messages" also still passes (22/22) — no regression on the previous `sendRepairRequestWhatsApp` wa.me assertions.

## 4. Full verification matrix

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `tsc --noEmit` | ✅ exit 0 |
| Lint (changed files) | `eslint ... whatsapp-service.ts repair-whatsapp.ts RepairRequestScreen.tsx ...` | ✅ 0 errors (pre-existing design-system style warnings + one pre-existing `exhaustive-deps` on the unrelated `submitRequest` callback, line 71) |
| Full test suite | `vitest run` | ✅ **78 files, 860/860 passed** (855 baseline + 5 new) |
| Production build | `tsc -b && vite build` | ✅ built in 4.66s (pre-existing chunk-split warnings only) |

## 5. Manual device checklist (for the user — WhatsApp handoff cannot be automated)

1. Submit a repair request → tap the WhatsApp/send button.
2. **WhatsApp must open directly** (new tab/window; same-tab fallback if the browser blocks popups).
3. Recipient number shown: **+213 556 25 40 07** (`wa.me/213556254007`).
4. Message must be **100% clean Arabic** (السلام عليكم, رقم الطلب, الهاتف, الحالة, العطل, رقم العميل) — **no** `Ø§Ù„Ø³Ù„Ø§Ù…`-style garbage.
5. Repeat for **sell**, **buy**, **exchange** flows: each must open WhatsApp with the same number and clean Arabic. All four must use the same unified message generator + send path.

## 6. Out of scope (per "no side improvements" instruction)

- `src/business-intelligence/api.ts` still contains corrupted Arabic display strings (BI console only, not WhatsApp). Flagged for a future cleanup.
- The 4+ `wa.me` builders elsewhere (`share.ts`, `BrandFooter.tsx`, `whatsapp-message.ts`) are now all funneled through the single `openWhatsApp` for the four customer flows; further consolidation was deliberately not done.

## 7. Outcome

WhatsApp repair requests now use one clean UTF-8 generator + one reliable send path, and all four customer flows (repair/sell/buy/exchange) share it. Automated suite fully green with dedicated evidence tests. **Stage C remains frozen** — no migration, no Supabase change.
