# Phase 3 — User Journey Completion (Design) — **v5**

> Status: **Design v5 — awaiting FINAL approval. No implementation, no commits, no
> migrations, no edits to application code until this version is approved.**
>
> Approval history:
> - v1 (2026-08-06): initial draft presented → approved in principle, **conditional**.
> - v5 (2026-08-06): incorporates the 10 mandatory design amendments (below). Send this
>   v5 only. Execution begins only after final approval, one work package at a time with
>   stop-and-report gates (3A → report → approval → 3B → report → Phase 3 Gate).
> - **v5.1 (2026-08-06) — FINAL editorial amendments, no v6**: **approved** as the
>   reference version for Phase 3. Adds 3 binding conditions — **unlimited image system**
>   (§16.1), **reusable Product Details** (§16.2), **SEO/link preservation without state
>   loss** (§16.3) — then execution starts directly with **Phase 3A only**.
>
> **v4 → v5 changelog (the 10 amendments):**
> 1. Phone Details becomes a **full sales page** (header: back + share + favorite[لاحقاً];
>    gallery main+thumbs+swipe+fullscreen+counter; info list incl. **battery %**;
>    description card; specs card; similar-phones **horizontal carousel**).
> 2. Action bar = **4 buttons** (شراء / استبدال / تقسيط / استفسار) — **بيع removed** from
>    the details page (sell stays available via `CustomerPhoneFlow`).
> 3. WhatsApp messages: every template automatically carries **اسم الهاتف · الكود ·
>    السعر · المدينة · رابط الإعلان · نوع الطلب** (new uniform template set, §9.1).
> 4. Phone cards redesigned as **professional product cards**: image, name, price,
>    condition, city, badge (جديد/مستعمل), multi-image icon — image fills the card.
> 5. **No whitespace** around the card image; the card is a full product-card layout.
> 6. **Stay-in-SPA policy hardened**: no `location.href` / `location.assign` / reload /
>    **opening new tabs** for internal navigation; native handoffs only for WhatsApp,
>    call, email, share.
> 7. **Back Navigation contract**: Phone Details → Back → Showroom restores **Scroll
>    Position + Filters + Search + Sort** (user never feels they left the page).
> 8. **No blank page**: deleted / unpublished / stale link → "هذا الإعلان غير متوفر"
>    page with العودة للمعرض + أجهزة مشابهة.
> 9. **Analytics**: new events `phone_card_clicked`, `phone_gallery_swipe`,
>    `phone_image_zoom`, `whatsapp_template_selected`, `whatsapp_sent`,
>    `showroom_filter_changed`, `showroom_sort_changed` (session/campaign/placement
>    context preserved as M1/M2).
> 10. **Acceptance criteria** updated to the exact 10 conditions (§15.1).
>
> **v5.1 — Final binding conditions (added 2026-08-06 after approval, §16):**
> 1. **Unlimited image system** — the design must NOT be constrained to 3 or 5 images:
>    slider / thumbnails / fullscreen fully dynamic for 1, 2, 5, 10 or any future count.
> 2. **Reusable Product Details** — the details page is built on the **Product Details**
>    concept (new phones, tablets, accessories, watches, any product), not "Used Phone
>    Details" — even though the current route name (`phone-details`) stays.
> 3. **SEO / links without state loss** — Deep Links, QR Links, Campaign Links, Placement
>    Links, Back/Forward and Refresh must restore the exact page **directly** (e.g.
>    opening the product link re-renders that page immediately, not via a chain of
>    screens).

---

## Table of contents

1. [Scope & interpretation](#1-scope--interpretation)
2. [Architecture](#2-architecture)
3. [Wireframes](#3-wireframes)
4. [Files that will change](#4-files-that-will-change)
5. [New React components](#5-new-react-components)
6. [New hooks](#6-new-hooks)
7. [New routes](#7-new-routes)
8. [Navigation Flow](#8-navigation-flow)
9. [WhatsApp Flow](#9-whatsapp-flow)
10. [Data Model](#10-data-model)
11. [CDP tests](#11-cdp-tests)
12. [Vitest tests](#12-vitest-tests)
13. [Migration plan](#13-migration-plan)
14. [Regression prevention M1/M2](#14-regression-prevention-m1m2)
15. [Acceptance criteria & approvals](#15-acceptance-criteria--approvals)
16. [Final binding conditions (v5.1)](#16-final-binding-conditions-v51)

---

## 1. Scope & interpretation

### 1.1 "Remove orphan screens" = eliminate the orphan CONDITION, not delete screens

The six screens flagged as orphans (verified audit below) are designed screens with a
defined back target in `BACK_MATRIX`. Deleting them would destroy product functionality.
Consistent with Global Navigation Policy rule 4 ("No screen from which the user cannot
return"), Phase 3A makes every screen **reachable** (an inbound navigation edge exists)
and verifies it by an automated **reachability invariant** (see §12). After 3A the orphan
set must be **empty**.

### 1.2 Verified current violations (grep-sweep, 2026-08-06)

**Internal-navigation violations → become SPA navigation (3A fixes):**

| # | Location | Today | Fix |
|---|----------|-------|-----|
| 1 | `src/screens/stickers/StickerScanHandler.tsx:35` | `window.location.href = '/'` (full reload) | `REPLACE` → `home` |
| 2 | `src/components/repair/RepairQR.tsx:21` | `origin + '/repair/track?code='` raw path (breaks base) | `REPLACE` → `repair-tracking` carrying `code` via `routeParams` (§8) |
| 3 | `src/components/shared/ErrorBoundary.tsx:38` | `window.location.reload()` on retry | In-app recovery via a reset bridge; reload only as a last resort behind a logged guard |
| 4 | `src/core/auth/index.ts:148` | `emailRedirectTo: window.location.origin` (no base) | base-aware redirect (`base + '/'`), restore `intendedScreen` on return |
| 5 | `src/services/sticker/sticker-engine.ts:92` | `STICKER_CTA_URLS` built on raw `origin` | build via shared base helper (new `src/core/base-path.ts`, §4) |
| 6 | `src/screens/share/ShareScreen.tsx:18` | `origin + '/?source=share'` (no base) | base-aware share URL (native share stays external — allowed) |

**Hardened stay-in-SPA policy (v5, §6 of amendments) — applies to ALL internal
transitions:**

| Construct | Allowed for internal nav? |
|-----------|---------------------------|
| `location.href` | ❌ |
| `location.assign` | ❌ |
| `window.location.reload()` | ❌ |
| `window.open(url, '_blank')` / opening new tabs | ❌ |
| The ONE dispatcher (`NAVIGATE`/`REPLACE`/`BACK`) | ✅ |
| Native handoffs only: WhatsApp (`wa.me`), `tel:`, `mailto:`, native/system share | ✅ (intentional exits only) |

**Read-only / already-correct (NOT violations — stay as-is):**
- `src/services/whatsapp-service.ts:28` `window.location.href = url` — the same-tab
  fallback for the **intentional WhatsApp handoff**; in v5 the WhatsApp open path is
  reworked to same-tab + `beforeunload` guard + fallback modal (§9.2) so no new tab is
  opened at all.
- `src/core/qr/share.ts:66-67` `window.location.href = url` — **mailto: native handoff**
  (email share), intentional.
- URL *reads* (`App.tsx` deep-link parse, `BackProvider.tsx`, `navigation.tsx` hash
  mirror, `RepairTrackingScreen`/`StickerScanHandler` param reads, research-console URL
  builders) — read-only, keep. The research-console builders should adopt the shared base
  helper (#5) but are not navigation.

### 1.3 Verified orphan audit (2026-08-06) + wire-up plan

| Screen | Parent (audit) | Back target (matrix) | New inbound edge (3A) |
|--------|----------------|----------------------|------------------------|
| `landing` | deep link `?campaign/ref` | home | `InitialRoute`: deep link `?campaign/ref` with campaign params → `REPLACE` `landing` (today it jumps straight to `START_QR_FLOW`, skipping the landing page) |
| `consent` | landing | intro | becomes reachable once `landing` is reachable (`landing → consent`, exists at `LandingScreen.tsx:94`) |
| `message` | consent | game-intro | becomes reachable via `consent → message` (exists at `ConsentScreen.tsx:16`) |
| `coach` | results | results | `ResultsScreen`: add secondary action **"مدرب الأخطاء"** → `NAVIGATE` `coach` |
| `achievements` | home / results | results | `ResultsScreen`: add secondary action **"الإنجازات"** → `NAVIGATE` `achievements` |
| `share` | results | results | `ResultsScreen`: add secondary action **"مشاركة النتائج"** → `NAVIGATE` `share` (native share + `SHARE_CLICKED`) |

`consent` / `message` / `landing` back targets are unchanged (their BACK_MATRIX rows
already exist). After wiring, a unit test asserts reachability (every screen has an
inbound edge) and no dead-ends (every screen has a back target) — §12.

---

## 2. Architecture

### 2.1 3A — Navigation integrity

- **One dispatcher, zero reloads, zero new tabs.** All internal transitions go through
  `dispatch({ type: 'NAVIGATE' | 'REPLACE' | 'BACK' })`. The grep-sweep in §1.2 removes
  every internal `location.*` navigation. Exit classification + telemetry
  (`exit_attempt` / `exit_confirmed`) measure where users leave.
- **`routeParams` on the reducer** — minimal extension so internal screens carry
  parameters without page loads (fixes Repair QR `code`; powers `phone-details` deep
  links and the device id for the details page):
  - `AppState.routeParams?: Record<string, string>` (cleared on `BACK`/`RESET`).
  - `NAVIGATE`/`REPLACE` gain optional `params?: Record<string, string>`.
  - `syncUrlWithState` mirrors params into the hash query (`#/phone-details?device=abc`);
    on cold load `InitialRoute` parses the hash query and `REPLACE`s with the same
    `params`.
- **Reachability invariant** — new `EDGES` table (screen → inbound edges) in
  `src/core/navigation/reachability.ts` + unit test (§12) proving zero orphans.
- **ErrorBoundary reset bridge** — module-level `requestInAppReset()`; `AppProvider`
  registers a RESET callback; `ErrorFallback` retry calls it and clears the error state.
  Full reload is retained only as a logged last resort if the app is still crashing.

### 2.2 3B — Showroom UX (Phone Details = full sales page)

```
Showroom (product-card grid + search + filters + sort)
   │  tap a card  →  phone_card_clicked  →  NAVIGATE phone-details { device }
   ▼
Phone Details (lazy sales page, §3.2)
   ├─ back → showroom — restores Scroll + Filters + Search + Sort (§8.1)
   ├─ gallery: main + thumbs + swipe + fullscreen + counter (§3.2)
   ├─ header: back · share · favorite(لاحقاً)
   ├─ info card · description card · specs card
   ├─ 4 action buttons (شراء/استبدال/تقسيط/استفسار) → WhatsApp (§9)
   ├─ similar-phones horizontal carousel → NAVIGATE details (push)
   └─ missing device → "هذا الإعلان غير متوفر" page (§3.3, §8.4)
```

- The selected phone is carried as an **id** (`routeParams.device`), never a heavy
  payload through the reducer; `PhoneDetailsScreen` re-reads the record from
  `InventoryService`. If the record is gone / unpublished → not-available page (§3.3).
- `PhoneShowroom` card click always fires `onSelect(device)`; `ShowroomScreen` passes
  `onSelect` → `NAVIGATE phone-details`. The old "gallery-only" interaction on showroom
  is removed; the fullscreen gallery moves *inside* the details page.
- **Full showroom UI-state preservation** (v5, §7): scroll + search query + filters +
  sort live in a module registry `showroom-ui-state`; `useShowroomState` restores them
  when returning from details (§6, §8.1).
- `phone-details` is **lazy-loaded** so it never blocks the Showroom or home bundle.

### 2.3 New telemetry events (added to `EventTypes` in `src/core/analytics/events.ts`)

| Event | Fires | Context |
|-------|-------|---------|
| `exit_attempt` | any classified exit (internal fix or native handoff) | from, type: `internal`\|`native` |
| `exit_confirmed` | exit actually completed (second back press / confirmed / handoff) | from, type |
| `phone_details_opened` | phone-details mounted | device_id, brand, model |
| `phone_details_closed` | phone-details left (back/pop) | device_id, dwell_ms |
| `phone_card_clicked` | showroom product card tapped | device_id, brand, model, price, index |
| `phone_gallery_swipe` | gallery swipe changes image | device_id, index_before, index_after |
| `phone_image_zoom` | fullscreen viewer opened | device_id, index |
| `whatsapp_template_selected` | one of the 4 action buttons tapped | action (buy\|exchange\|installment\|inquiry), device_id |
| `whatsapp_sent` | wa.me actually left to / "فتح واتساب" confirmed | action, device_id |
| `whatsapp_fallback_shown` | fallback modal rendered (guard timed out) | action |
| `whatsapp_message_copied` | "نسخ الرسالة" in fallback modal | action |
| `showroom_filter_changed` | showroom filter chip changed | filter, value |
| `showroom_sort_changed` | showroom sort changed | sort, value |

All new events carry `session_id` / `campaign_id` / `placement_id` when available
(existing telemetry context — M1/M2 attribution preserved). `phone_card_clicked` is the
gating event between Showroom and Details in the funnel.

---

## 3. Wireframes

### 3.1 Showroom — redesigned product cards + controls (v5 §4, §5)

```
 ┌────────────────────────────────────────────┐
 │ 🏬 معرض الهواتف المستعملة                   │
 │ هواتف معتمدة متوفرة الآن                    │
 │ [AdSpot phone-details]                      │
 │ ┌────────────────────────────────────────┐  │
 │ │ 🔍 ابحث عن هاتف…                        │  │  ← search (state-preserved)
 │ │ chips: [الكل] [جديد] [مستعمل]  📍وهران  │  │  ← condition + city filters
 │ │ sort: [الأحدث ▾]                        │  │  ← sort: الأحدث/الأرخص/الأغلى
 │ └────────────────────────────────────────┘  │
 │ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
 │ │▌▌▌img▌▌▌  │ │▌▌▌img▌▌▌  │ │▌▌▌img▌▌▌  │   │  ← image FILLS card top (no
 │ │ [مستعمل]📷│ │ [جديد] 📷 │ │ [جديد]    │   │    whitespace around image)
 │ │ Samsung   │ │ Samsung   │ │ Redmi     │   │
 │ │ A16       │ │ A15       │ │ Note 13   │   │  ← name
 │ │ 34,000 د.ج│ │ 30,000 د.ج│ │ 42,000 د.ج│   │  ← price
 │ │ وهران     │ │ الجزائر   │ │ وهران     │   │  ← city
 │ └─────▲─────┘ └───────────┘ └───────────┘   │
 │       │ tap → phone_details_opened           │
 │       ▼ (no gallery overlay at showroom)     │
 │ [← العودة للرئيسية]                          │
 └────────────────────────────────────────────┘
```

Card spec (v5 §4/§5): image on top **filling the card width with no margin/whitespace**;
overlaid badge **جديد / مستعمل**; small **multi-image icon 📷 N** when `images.length > 1`;
below: phone name (brand + model), price (د.ج, hidden if null), city (hidden if unknown).
The user knows what they are opening **before** tapping.

### 3.2 Phone Details — full sales page (top → bottom)

```
 ┌──────────────────────────────────────────────┐
 │ [←]      Phone Details            [⤴] [♥]   │  ← back · share · favorite(لاحقاً)
 ├──────────────────────────────────────────────┤
 │              ┌────────────────────┐          │
 │              │  main image (1)    │          │  ← one LARGE main image
 │              │  swipe ◀ ▶ (touch) │          │  ← tap → fullscreen viewer
 │              └────────────────────┘          │
 │          1 / 5      ● ● ○ ● ●               │  ← counter
 │   [thumb] [thumb] [thumb] [thumb] [thumb]   │  ← thumbnail strip BELOW
 │  (thumbnails switch the main image; NEVER   │     (explicitly NOT 3 large
 │   three large images side-by-side)           │      side-by-side per v5)
 ├──────────────────────────────────────────────┤
 │  Samsung A16                     [مستعمل]    │  ← name + condition badge
 │  [متوفر (2)]                    34,000 د.ج   │  ← availability + price
 │  الشركة: Samsung · الموديل: A16               │
 │  السعة: 128GB · الرام: 6GB · اللون: أسود     │  ← info lines
 │  الحالة: مستعمل · البطارية: 92% (إن وجدت)    │  ← battery % optional
 │  الضمان: 3 أشهر · 📍 وهران                    │
 │  🕐 أُضيف 12/07/2026 · 👁 34 مشاهدات         │  ← date added + views
 ├──────────────────────────────────────────────┤
 │  [أزرار الإجراءات — 4 أزرار واضحة]           │
 │  [شراء] [استبدال] [تقسيط] [استفسار]          │  ← each → DISTINCT WhatsApp (§9)
 ├──────────────────────────────────────────────┤
 │  ┌─ الوصف (بطاقة مستقلة) ────────────────┐   │
 │  │ حالة ممتازة، يأتي مع الشاحن والعلبة…   │   │  ← description card
 │  └────────────────────────────────────────┘   │
 │  ┌─ المواصفات (بطاقة مستقلة) ────────────┐   │
 │  │ RAM 6GB · 128GB · 90Hz · 5000mAh · …  │   │  ← specs card
 │  └────────────────────────────────────────┘   │
 │  ── هواتف مشابهة (Carousel أفقي) ──          │
 │  ◀ [card] [card] [card] [card] ▶            │  ← horizontal snap carousel
 │                                             │     (same product card, tap → details)
 │  [AdSpot phone-details]                      │
 └──────────────────────────────────────────────┘
```

### 3.3 Not-available page (v5 §8 — NO blank page)

Rendered by `PhoneDetailsScreen` when the record is **deleted / unpublished / stale
link** (device not found in `getExchangeableDevices()`):

```
 ┌──────────────────────────────────────┐
 │ [←]           Phone Details          │
 ├──────────────────────────────────────┤
 │                 😕                    │
 │   هذا الإعلان غير متوفر               │
 │  ربما حُذف أو انتهى هذا الإعلان.     │
 │  [العودة للمعرض]  ← NAVIGATE showroom│
 │  ── أجهزة مشابهة ──                  │
 │  [card] [card] [card]  (carousel)    │  ← top exchangeable devices (6)
 └──────────────────────────────────────┘
```

Fullscreen viewer (tap main image): upgraded `PhoneGallery` — counter `X / Y`,
prev/next arrows, **swipe on mobile**, Esc/arrow keys, `role="dialog"`, close button.

---

## 4. Files that will change

### 3A

| File | Change |
|------|--------|
| `src/screens/stickers/StickerScanHandler.tsx` | `:35` `window.location.href = '/'` → `REPLACE` `home` |
| `src/components/repair/RepairQR.tsx` | `:21` → `REPLACE` `repair-tracking` with `routeParams.code` |
| `src/screens/repair/RepairTrackingScreen.tsx` | read `code` from `routeParams` (fallback to URL query for legacy links) |
| `src/core/auth/index.ts` | `:148` base-aware `emailRedirectTo`; restore `intendedScreen` on return |
| `src/components/shared/ErrorBoundary.tsx` | retry → `requestInAppReset()` (no `location.reload()`); reload kept as logged last resort |
| `src/services/sticker/sticker-engine.ts` | `:92` use `buildAppUrl` for `STICKER_CTA_URLS` |
| `src/screens/share/ShareScreen.tsx` | `:18` base-aware share URL |
| `src/core/base-path.ts` *(new)* | `getBasePath()` (`import.meta.env.BASE_URL \|\| '/'`) + `buildAppUrl(path)`; single source for all URL builders |
| `src/screens/results/ResultsScreen.tsx` | add 3 secondary CTAs → `coach`, `achievements`, `share` |
| `src/App.tsx` (`InitialRoute`) | `?campaign/ref` deep link → `REPLACE` `landing`; parse hash-query params on cold load |
| `src/store/navigation.tsx` | `routeParams` on state + actions; clear on `BACK`/`RESET`; mirror params in hash |
| `src/core/navigation/reachability.ts` *(new)* | `EDGES` table + `assertNoOrphans()`/`assertNoDeadEnds()` helpers |
| `src/core/analytics/events.ts` | add `exit_attempt`, `exit_confirmed` |
| `src/i18n/translations/{en,ar,fr,tr}.ts` | `results.coach`, `results.achievements`, `results.share` labels (en.ts is the `TranslationKey` type source) |

### 3B

| File | Change |
|------|--------|
| `src/store/navigation.tsx` | add `'phone-details'` to `ScreenName` + `ALL_SCREEN_NAMES`; `routeParams` (§4/3A) |
| `src/core/navigation/back-matrix.ts` | row: `phone-details` → `backTarget: 'showroom'`, `exitAllowed: false`, `browserBack: 'back'`, `androidBack: 'back'`, `hasInContentBackButton: true` |
| `src/App.tsx` | lazy import + `screens` map entry + `InitialRoute` hash-query param parse |
| `src/screens/showroom/ShowroomScreen.tsx` | pass `onSelect` → `NAVIGATE phone-details { device }`; render `ShowroomControls`; `useShowroomState` restore; `useScrollPreservation` |
| `src/components/showroom/PhoneShowroom.tsx` | card redesign (product card: image fills, name/price/condition/city/badge/multi-image icon); card click always `onSelect(device)`; compact variant for carousel |
| `src/components/showroom/PhoneGallery.tsx` | add touch swipe + aria labels (used as fullscreen viewer) |
| `src/screens/showroom/PhoneDetailsScreen.tsx` *(new)* | the sales page (§3.2) + not-available state (§3.3) |
| `src/components/showroom/PhoneImageGallery.tsx` *(new)* | main + thumbnail strip + swipe + counter + fullscreen trigger |
| `src/components/showroom/PhoneActionBar.tsx` *(new)* | **4** buttons (شراء/استبدال/تقسيط/استفسار) + smart WhatsApp wiring |
| `src/components/showroom/PhoneNotFound.tsx` *(new)* | "هذا الإعلان غير متوفر" + العودة للمعرض + similar carousel |
| `src/components/showroom/SimilarPhones.tsx` *(new)* | horizontal snap-scroll **carousel** of compact product cards |
| `src/components/showroom/ShowroomControls.tsx` *(new)* | search + condition/city filter chips + sort dropdown (v5 §4) |
| `src/components/showroom/WhatsAppFallbackModal.tsx` *(new)* | prefilled message + فتح واتساب + نسخ الرسالة |
| `src/hooks/useShowroomState.ts` *(new)* | §6 — registry: scroll + search + filters + sort |
| `src/hooks/useScrollPreservation.ts` *(new)* | §6 |
| `src/hooks/usePhoneDetails.ts` *(new)* | §6 |
| `src/hooks/useViewCounter.ts` *(new)* | §6 |
| `src/hooks/useSimilarPhones.ts` *(new)* | §6 |
| `src/hooks/useSmartWhatsApp.ts` *(new)* | §6 |
| `src/services/whatsapp-service.ts` | add the v5 uniform message builders (§9.1): `sendPhoneActionWhatsApp(action, device)`; rework open to same-tab + guard + modal; existing generic builders untouched |
| `src/services/inventory-service.ts` | extend `InventoryRecord` with optional presentational fields incl. **`batteryHealth`**, `code` (§10); no behaviour change |
| `src/core/analytics/events.ts` | add §2.3 events |
| `src/i18n/translations/{en,ar,fr,tr}.ts` | `phoneDetails.*`, `showroom.*` (search/filter/sort), `whatsapp.*` keys (en.ts first) |
| `docs/design/11-ux-navigation-enhancement.md` | `phone-details` matrix row: `Designed (Phase 4)` → `Implemented (Phase 3)`; update Regression Matrix `Verified in Phase` |
| `docs/design/12-phase3-user-journey-completion.md` | this doc: mark 3A/3B gates + final approval |

Admin entry for the new optional fields (`color`, `city`, `description`, `warranty`,
`batteryHealth`): add inputs to the existing Inventory edit UI (the page that already
calls `updateImages`/`updatePrices`) — 3B, small addition, no new screen.

---

## 5. New React components

| Component | Purpose |
|-----------|---------|
| `PhoneImageGallery` | inline gallery: **one large main image** + **thumbnail strip below** + counter `X / Y` + touch swipe + tap-to-fullscreen. Explicitly **not** three large side-by-side images |
| `PhoneGallery` (enhanced) | existing fullscreen viewer reused as details-page fullscreen open: add touch swipe + improved aria labels |
| `PhoneActionBar` | **4** buttons: شراء / استبدال / تقسيط / استفسار — each calls `sendPhoneActionWhatsApp` with its action |
| `SimilarPhones` | horizontal snap-scroll **carousel** of compact product cards (same `modelId`, else brand+model, exclude self), tap → NAVIGATE details of that phone |
| `PhoneNotFound` | not-available state (§3.3): message + العودة للمعرض + similar-devices carousel |
| `ShowroomControls` | search input + condition/city filter chips + sort dropdown; every change → telemetry + registry save |
| `WhatsAppFallbackModal` | shown when same-tab wa.me guard times out: prefilled message + "فتح واتساب" link + "نسخ الرسالة" |
| `PhoneDetailsScreen` | the sales page (§3.2) + header (back/share/favorite) + not-available branch (§3.3) |

---

## 6. New hooks

| Hook | Responsibility |
|------|----------------|
| `useShowroomState()` | module-level registry `showroom-ui-state` = `{ scrollY, query, condition, city, sort }`; restore on mount, save on change/unmount. Restores **scroll + search + filters + sort** on BACK (§8.1) |
| `useScrollPreservation(screen)` | integrated into `showroom-ui-state` for `showroom`; generic `Record<ScreenName, number>` for other list screens; saves `window.scrollY` on unmount/navigation, restores on mount (rAF after paint) |
| `usePhoneDetails(deviceId)` | loads record via `InventoryService` by id; returns `{ device, notFound }`; re-resolves when `deviceId` changes (similar/carousel navigation) |
| `useViewCounter(recordId)` | increment once per session (session set), persist per `recordId` under `showroom_view_counts`; returns `{ count }`; dedupes same-session re-opens (key kept off the inventory record so stock payload stays clean) |
| `useSimilarPhones(device \| null)` | from `getExchangeableDevices()`: same `modelId` first, then brand+model, exclude self, cap (e.g. 8); for the not-found state (device null) returns top exchangeable devices (6) |
| `useSmartWhatsApp()` | v5 WhatsApp open: **same-tab** `wa.me` + `beforeunload` guard (~1.5s); if page doesn't leave → `WhatsAppFallbackModal`; tracks `whatsapp_sent` / `whatsapp_fallback_shown` / `whatsapp_message_copied`. No new tabs |
| `useFavorites()` *(placeholder, لاحقاً)* | exposes a `save()` that only shows a "قريباً" toast — no storage yet; keeps the header button wired for the future feature |

---

## 7. New routes

One new screen: **`phone-details`**. Registration points (all required in the same
commit, mirroring the Phase 2 screen-registration pattern):

1. `ScreenName` union — `src/store/navigation.tsx`
2. `ALL_SCREEN_NAMES` — `src/store/navigation.tsx`
3. lazy import + `screens` map — `src/App.tsx`
4. `BACK_MATRIX` row — `src/core/navigation/back-matrix.ts`
5. Navigation Compatibility Matrix row — `docs/design/11-ux-navigation-enhancement.md`
6. i18n keys ×4 — `src/i18n/translations/{en,ar,fr,tr}.ts`

Deep link (cold load): `#/phone-details?device={id}` → `InitialRoute` parses hash-query →
`REPLACE` `phone-details` with `routeParams = { device: id }`. This URL is also the
"رابط الإعلان" embedded in every WhatsApp message (§9).

---

## 8. Navigation Flow

### 8.1 Showroom ↔ Phone Details (the core user requirement — v5 §7)

```
home ──NAVIGATE──▶ showroom                    stack: [home, showroom]
showroom ──NAVIGATE {device}──▶ phone-details   stack: [home, showroom, phone-details]
phone-details ──BACK──▶ showroom                stack: [home, showroom]
       restores SAME: Scroll Position · Filters · Search · Sort
       → user feels they never left the page (no reload, no remount-jump)
showroom ──BACK──▶ home
```

- In-content back button on `phone-details` → `dispatch({ type: 'BACK' })` (BACK_MATRIX
  row; hardware/browser back identical via `popstate` → `BACK`).
- `ShowroomScreen` uses `useShowroomState()` + `useScrollPreservation('showroom')`: on
  BACK, the search query, filter chips, sort selection AND the exact `scrollY` are all
  restored. Verified by CDP (3B-S11).
- `routeParams.device` cleared on `BACK` so re-entering details always needs a fresh
  card tap (or deep link).

### 8.2 Similar-phones / carousel navigation

```
phone-details (A) ──NAVIGATE {device: B}──▶ phone-details (B)
   stack: [home, showroom, phone-details(A), phone-details(B)]
   BACK → phone-details(A)   BACK → showroom   BACK → home
```

Push (not REPLACE) so the natural back chain is preserved; `usePhoneDetails` re-resolves
on `deviceId` change.

### 8.3 Header actions (v5 §1)

- **Back** → `BACK` (to showroom).
- **Share** → native share (`navigator.share` with the listing URL); fallback
  copy-link. Allowed external handoff (policy rule 2); fires `SHARE_CLICKED`.
- **Favorite** → `useFavorites().save()` placeholder → toast "قريباً" (لاحقاً, no
  storage in this phase).

### 8.4 Not-available path (v5 §8 — no blank page)

- `usePhoneDetails` returns `notFound` when the device id is absent OR the record is not
  in `getExchangeableDevices()` (deleted / unpublished / archived / stale link).
- `PhoneDetailsScreen` renders `PhoneNotFound` instead of an empty page:
  - "العودة للمعرض" → `NAVIGATE showroom` (safe from any stack, including deep-link).
  - "أجهزة مشابهة" → carousel of top exchangeable devices (6), each tap navigates to
    its details.
- Tracked as a `phone_details_opened` with `not_found: true` (funnel visibility).

### 8.5 3A exit handling (no exit on back except intentional)

- Back only pops the internal stack; it never triggers a page load or a new tab.
- The only exits after 3A are native handoffs (WhatsApp / tel / mailto / native share)
  and the double-press-to-exit toast on `home` — all intentional.
- Every exit fires `exit_attempt` → `exit_confirmed`.

---

## 9. WhatsApp Flow

### 9.1 The 4 actions — each button generates a DIFFERENT message (v5 §3, uniform fields)

Every template automatically contains the 6 required fields: **اسم الهاتف · الكود ·
السعر · المدينة · رابط الإعلان · نوع الطلب**. All auto-filled from the device; the user
types nothing.

| Button | Action id | Generated message (verbatim per user v5) |
|--------|-----------|--------------------------------------------|
| شراء | `buy` | `السلام عليكم،` ⏎ `أود شراء الهاتف التالي:` ⏎ `اسم الهاتف: {name}` ⏎ `الكود: {code}` ⏎ `السعر: {price} دج` ⏎ `المدينة: {city}` ⏎ `رابط الإعلان: {url}` ⏎ `شكراً.` |
| استبدال | `exchange` | `السلام عليكم،` ⏎ `أود استبدال هاتفي بهذا الجهاز:` ⏎ `اسم الهاتف: {name}` ⏎ `الكود: {code}` ⏎ `السعر: {price} دج` ⏎ `المدينة: {city}` ⏎ `رابط الإعلان: {url}` ⏎ `شكراً.` |
| تقسيط | `installment` | `السلام عليكم،` ⏎ `أود الاستفسار عن إمكانية التقسيط لهذا الهاتف:` ⏎ `اسم الهاتف: {name}` ⏎ `الكود: {code}` ⏎ `السعر: {price} دج` ⏎ `المدينة: {city}` ⏎ `رابط الإعلان: {url}` ⏎ `شكراً.` |
| استفسار | `inquiry` | `السلام عليكم،` ⏎ `أود الاستفسار عن هذا الهاتف:` ⏎ `اسم الهاتف: {name}` ⏎ `الكود: {code}` ⏎ `السعر: {price} دج` ⏎ `المدينة: {city}` ⏎ `رابط الإعلان: {url}` ⏎ `شكراً.` |

Placeholders:
- `{name}` = `brand + model (variant)`.
- `{code}` = the ad code: `record.code` when set, else the short form of `record.id`
  (e.g. first 8 chars). Added as optional `code?` on the record (§10).
- `{price}` = `sellPrice` formatted (د.ج). **Always included for these 4 templates**
  (per v5; if a listing genuinely has no price, the line is omitted — noted as a
  conditional fallback).
- `{city}` = `record.city` (omitted when unknown).
- `{url}` = base-aware listing deep link from `src/core/base-path.ts`
  (`base + '#/phone-details?device=' + id`).
- نوع الطلب = the opening phrase states it (شراء / استبدال / تقسيط / استفسار).

- `installment` is a **new** template (verified: only buy/sell/exchange/inquiry/
  stock_check/price_check exist today). The existing generic builders in
  `whatsapp-message.ts` / `whatsapp-service.ts` are **untouched** so `CustomerPhoneFlow`
  and repair flows keep their messages (no regression). **بيع is NOT in the details
  action bar** (v5 §2); the sell template remains available only in `CustomerPhoneFlow`.

### 9.2 Pipeline (single point of change — v5 §6: same-tab, no new tabs)

```
tap action → sendPhoneActionWhatsApp(action, device)   [whatsapp-service]
   ├─ track('whatsapp_template_selected', { action, device_id })
   ├─ build message from PHONE_ACTION_TEMPLATES[action]  (§9.1)
   └─ useSmartWhatsApp(WHATSAPP_PHONE, message)
        ├─ same-tab wa.me navigation + beforeunload guard (~1.5s)
        │     ├─ page leaves → track('whatsapp_sent')   (intentional native handoff)
        │     └─ still here → WhatsAppFallbackModal + track('whatsapp_fallback_shown')
        │           ├─ "فتح واتساب" → wa.me (same tab) → track('whatsapp_sent')
        │           └─ "نسخ الرسالة" → clipboard + track('whatsapp_message_copied')
```

- No `window.open('_blank')`, no new tabs — consistent with the v5 stay-in-SPA policy
  (new tabs are forbidden for internal navigation; WhatsApp handoff itself is handled
  same-tab).
- After WhatsApp opens and the user returns, **back → phone-details → showroom → home**
  (never a dead end; the nav stack is untouched by the handoff).

---

## 10. Data Model

### 10.1 `InventoryRecord` extension (backward-compatible, all optional, presentational only)

Current verified shape (`src/services/inventory-service.ts:43-65`): `id, modelId, brand,
model, variant, ram, storage, condition, quantity, status?, buyPrice?, sellPrice?,
createdAt, updatedAt, totalPurchased, totalSold, images?: string[]`.

> **v5.1 §16.1 — UNLIMITED image system (binding).** `images` is NOT capped. Today
> `updateImages` truncates to 12 (`images.slice(0, 12)`); Phase 3B **removes that cap** so
> the system supports 1, 2, 5, 10 or any number of images, and the gallery
> (slider / thumbnails / fullscreen) renders the count **dynamically** — no fixed counts
> anywhere in the UI.

Add (purely presentational, same pattern as `images`):

```ts
color?: string;          // e.g. "أسود"        — v5 info list
batteryHealth?: number;  // e.g. 92 (= 92%)   — v5 "نسبة البطارية (إن وجدت)"
warranty?: string;       // e.g. "ضمان 3 أشهر"
city?: string;           // e.g. "وهران"       — card + info + WhatsApp
description?: string;    // used-phone notes / cosmetic condition (description card)
code?: string;           // short ad code for WhatsApp {code}; fallback = short id
```

- `viewCount` is **not** stored on the record (keeps the stock payload clean): managed
  by `useViewCounter` under its own key `showroom_view_counts` (§6).
- Display mapping (v5 §1): الشركة = `brand` · الموديل = `model` · السعة = `storage`
  (+ `variant`) · الرام = `ram` · اللون = `color` · الحالة = `condition` ·
  البطارية = `batteryHealth` · الضمان = `warranty` · السعر = `sellPrice` (د.ج، hidden if
  null) · المدينة = `city` · تاريخ الإضافة = `createdAt` (formatted) ·
  عدد المشاهدات = `viewCount`. Name on card/WhatsApp = `brand + model (variant)`.

### 10.2 No schema / storage change

- Inventory stays **localStorage** (`catalog_inventory`). Supabase migration `00014`
  (inventory) remains a **draft, NOT executed** — untouched by Phase 3.
- No new tables, no new columns, no Supabase schema work.
- Existing records simply lack the new optional fields → UI hides empty sections/lines.

---

## 11. CDP tests

Mirroring the verified pattern of `phase2-check.mjs` (Chrome 9222, per-scenario S1–S10,
assert `performance` entries show **no full-page navigations** on internal transitions,
and **no new tabs**). Target: `http://localhost:5173/focus22/...` with a seeded
localStorage inventory.

### 3A scenarios

| # | Scenario | Assert |
|---|----------|--------|
| 3A-S1 | grep-sweep gate: no internal `location.href/assign/reload` and no internal `window.open` remains (static scan via CDP runtime) | clean |
| 3A-S2 | Sticker scan → "continue" | lands home, **no reload**, telemetry row present |
| 3A-S3 | Repair QR scan (`code`) | lands `repair-tracking` with code, **no reload** |
| 3A-S4 | Force an error → ErrorBoundary → retry | app recovers in-SPA (**no reload**) |
| 3A-S5 | Orphan walkthrough: `?campaign/ref` deep link → landing → consent → message | all reachable, back chain per matrix |
| 3A-S6 | Results → coach / achievements / share → back | each reachable; back → results |
| 3A-S7 | Auth magic link email redirect | base-aware URL; `intendedScreen` restored on return |

### 3B scenarios

| # | Scenario | Assert |
|---|----------|--------|
| 3B-S1 | Showroom: tap a card | opens phone-details, **no reload**, no showroom-level gallery overlay |
| 3B-S2 | Gallery: thumbnails, swipe, fullscreen | tap thumb switches main; swipe changes image (`phone_gallery_swipe`); main tap opens fullscreen (`phone_image_zoom`); Esc closes; **never 3 large side-by-side** |
| 3B-S3 | Sales page sections with seeded record | company/model/capacity/ram/color/condition/battery/warranty/price/city/date/views + description card + specs card all rendered |
| 3B-S4 | View counter | increments once per session; persisted; shows "X مشاهدات" |
| 3B-S5 | Similar phones carousel | strip renders siblings; tap similar → new details; back chain correct |
| 3B-S6 | 4 action buttons | each yields the **distinct** encoded wa.me URL (exact templates, §9.1) containing اسم/كود/سعر/مدينة/رابط |
| 3B-S7 | Back from details | returns to showroom; **no reload** |
| 3B-S11 | Showroom controls preserved | search + filter chips + sort set → details → back: **query, filters, sort AND scroll position all restored** |
| 3B-S8 | Deep link cold load `#/phone-details?device=abc` | opens details directly (REPLACE), params parsed |
| 3B-S9 | WhatsApp popup blocked / guard times out | **same-tab** path shows fallback modal with full message; copy works; `whatsapp_fallback_shown`/`whatsapp_message_copied` recorded |
| 3B-S12 | Deleted / unpublished / stale device id | **not "هذا الإعلان غير متوفر" page — NO blank page**; العودة للمعرض + similar carousel both work |
| 3B-S13 | Product card content | card shows image (fills card, no whitespace), name, price, condition, city, badge, multi-image icon when `images.length > 1` |
| 3B-S14 | Header actions | share opens native share (or copy fallback); favorite shows "قريباً" toast; no crash |
| 3B-S15 | No new tabs | internal navigation produces zero `window.open` calls and zero new page entries; only allowed handoffs (wa.me/tel/mailto/share) may |
| 3B-S10 | Performance budget | phone-details open < 200 ms; WhatsApp open < 300 ms (§6.2 of doc `11`) |

---

## 12. Vitest tests

| Suite | Covers |
|-------|--------|
| reducer (`navigation`) | `NAVIGATE`/`REPLACE` with `params`; `routeParams` cleared on `BACK`/`RESET`; phone-details stack shape |
| back-matrix | `phone-details` row present; no-divergence test (matrix ↔ `BACK_MATRIX` ↔ §3.2) |
| reachability | **every** `ScreenName` has ≥1 inbound edge in `EDGES` (orphans = 0) and a defined back target (dead-ends = 0) |
| `useShowroomState` | scroll+query+filters+sort save/restore round-trip; filters/sort applied to device list; state survives remount |
| `useScrollPreservation` | save/restore round-trip with mocked `window`; no restore when no entry |
| `useViewCounter` | once per session; persist; dedupe |
| `useSimilarPhones` | same-`modelId` priority, brand+model fallback, self excluded, cap; not-found mode returns top exchangeable |
| WhatsApp templates | snapshot tests of the **4 exact user messages** (§9.1) with auto-filled اسم/كود/سعر/مدينة/رابط; `installment` new; `{code}` fallback to short id; wa.me URL encoding |
| `sendPhoneActionWhatsApp` | action → template → message → same-tab open; events `whatsapp_template_selected` + `whatsapp_sent` |
| `useSmartWhatsApp` / fallback modal | same-tab guard timeout shows modal; copy-to-clipboard (mock) + `whatsapp_message_copied`; **no `window.open` invoked** |
| gallery | index clamp, wrap-around, keyboard, touch-swipe math, `phone_gallery_swipe`/`phone_image_zoom` |
| `PhoneDetailsScreen` | renders all sections; missing device → not-available state (no blank page) with العودة للمعرض + similar carousel; similar-phones navigation |
| `PhoneShowroom` card | product card renders name/price/condition/city/badge/multi-image icon; image fills card; click → `onSelect` |
| `ShowroomControls` | search/filter/sort filter the device list correctly; `showroom_filter_changed`/`showroom_sort_changed` emitted |
| 3A exits | `StickerScanHandler`/`RepairQR` dispatch (no `location`); `exit_attempt`/`exit_confirmed` emitted |
| telemetry | new events emitted at exact trigger points (tracker mock), session/campaign/placement context |

Existing suites must stay green (see §14).

---

## 13. Migration plan

- **No DB migration.** Supabase `00014` stays draft/uneexecuted.
- **No data migration.** New `InventoryRecord` fields are optional; existing localStorage
  records render without them (empty sections/lines hidden).
- **New localStorage keys**: `showroom_view_counts` (created lazily by `useViewCounter`,
  bounded, pruned on write). `showroom-ui-state` is a **session-only** module registry
  (not persisted across app reloads).
- **i18n**: add keys to all four locale files (`en.ts` is the type source for
  `TranslationKey`); no locale key removal.
- **URL**: new hash form `#/phone-details?device=…`; old hash forms (`#/showroom`, …)
  keep working (`InitialRoute` parse is additive).

---

## 14. Regression prevention M1/M2

### 14.1 Verification gates (mandatory before the Phase 3 Approval Gate)

- Full vitest suite (currently 966+ passing, growing with Phase 3 tests) + lint 0 +
  `tsc` 0 + production build.
- **Regression Matrix (doc `11`)** — all 11 flows re-run and green. `Verified in Phase`
  updates: Used Phones (S2/S5/S6/S7), Ads (details slot), Sticker (3A-S2), Repair
  (3A-S3), Authentication (3A-S7), Guest Flow (unchanged green).
- CDP walkthrough of every Regression Matrix row on `/focus22/`.

### 14.2 Commit discipline (M1/M2 worktree protection)

- M2 changes remain **uncommitted** in the worktree (shared files: `HomeScreen`,
  research-console, migrations `00016–00018`, `PlacementsTab`, `AdBanner`, `setup.ts`,
  i18n). Phase 3 commits must **not** sweep them in.
- Use the **exact hunk-splitting technique** proven in Phase 2 (`a376ae9`): copy
  worktree files to backup → create Phase-3-only versions in a temp tree → stage →
  commit → restore full M2+Phase3 worktree versions. Verify the index contains zero M2
  symbols (`git diff --cached` scan) before committing.
- Verification runs in an **isolated tree** (proven Phase 2 procedure): `git write-tree`
  + `git archive` + junction to `node_modules` + copy `.env` (gitignored; Supabase
  URL/anon key required by `client.ts:25`).

### 14.3 Attribution / analytics preservation

- `session_id` / `campaign_id` / `placement_id` context attached to every new event via
  the existing `getGlobalTelemetry()` pipeline — M1/M2 dashboards and Research console
  keep working (additive events only, no schema change).
- Existing WhatsApp builders and their templates are untouched → `CustomerPhoneFlow` /
  repair flows produce identical messages.
- **Sell** is removed only from the details action bar; the sell flow in
  `CustomerPhoneFlow` is unchanged.

### 14.4 Design-parity checks

- Back priority table (doc `11` §2.3) unchanged; `phone-details` rows added to both
  matrixes without diverging.
- Accessibility + performance budgets (doc `11` §6) applied to every new component;
  touch targets ≥ 44 px, aria labels on gallery/action buttons/carousel,
  `prefers-reduced-motion`.

---

## 15. Acceptance criteria & approvals

### 15.1 Acceptance criteria (v5 §10 — ALL must hold; Phase 3 is NOT complete otherwise)

1. **No orphan screen** (reachability test = 0 orphans).
2. **No unintentional SPA exit** (no internal `location.href`/`assign`/`reload`/new tab).
3. **All internal buttons use the new Navigation system** (single dispatcher).
4. **Phone Details page is a complete sales page**, not just an image (all §3.2 sections).
5. **Phone cards display enough info** (image fills card, name, price, condition, city,
   badge, multi-image icon).
6. **All WhatsApp templates work** (4 actions, distinct messages, 6 fields each).
7. **Back restores Scroll Position and Filters** (and search + sort) — user never feels
   they left the page.
8. **All CDP and Vitest tests and the build pass.**
9. **No regression on M1 and M2** (full Regression Matrix green).

### 15.2 Definition of Done (per work package)

| Criterion | 3A | 3B |
|-----------|----|----|
| Grep-sweep clean (no internal `location` navigation / new tabs) | ✅ | — |
| Orphan set = 0 (reachability test) | ✅ | — |
| Parent + Back Target for every screen; no exit on back except intentional | ✅ | ✅ |
| Sales page renders ALL sections (§3.2) incl. description & specs cards | — | ✅ |
| Gallery = main + thumbnails + swipe + fullscreen + counter (no 3 side-by-side) | — | ✅ |
| 4 action buttons → 4 distinct WhatsApp messages (v5 uniform templates) | — | ✅ |
| Back: Scroll + Filters + Search + Sort preserved (Showroom ↔ Details) | — | ✅ |
| Not-available page (no blank page) with العودة للمعرض + similar devices | — | ✅ |
| Product-card redesign (no image whitespace) | — | ✅ |
| Header: back · share · favorite (placeholder) | — | ✅ |
| Deep link `#/phone-details?device=` works | — | ✅ |
| All CDP scenarios green | ✅ | ✅ |
| All Vitest suites green (new + existing) | ✅ | ✅ |
| Full Regression Matrix green + matrixes updated | ✅ | ✅ |
| M2 worktree untouched (isolated-tree verification) | ✅ | ✅ |

### 15.3 Approvals

- [ ] **Phase 3 design v5** (this doc) — approved before any code
- [ ] **3A — Navigation integrity** — implementation + report approved
- [ ] **3B — Showroom UX / Phone Details sales page** — implementation + report approved
- [ ] **Phase 3 Approval Gate** — full regression + matrix update signed

Execution contract (unchanged): implement one work package → **stop** → report →
**wait for explicit approval** → next. No two phases/packages merged into one commit.

---

## 16. Final binding conditions (v5.1)

Approved 2026-08-06 as **mandatory constraints** for the whole of Phase 3. These are
editorial amendments (no v6); they override any earlier wording that contradicts them.

### 16.1 — Unlimited image system (binding)

- The design is **not** constrained to 3 or 5 images. `images` supports **any count**:
  1, 2, 5, 10, or any future number.
- The gallery must be **fully dynamic**: **Slider** (main image + counter `X / N`),
  **Thumbnails** (strip rendered from the actual array length), **Full Screen**
  (same dynamic set) — all driven by `images.length`, never by a hard-coded count.
- Phase 3B removes the current `images.slice(0, 12)` cap in `InventoryService.updateImages`
  (see §10.1). No UI component may assume a maximum image count.
- Acceptance: CDP seed with 1, 2, 5 and 10 images → gallery/thumbnails/fullscreen all
  correct at every count.

### 16.2 — Reusable Product Details (binding)

- The details page is built on the **Product Details** concept, **not** "Used Phone
  Details". It must be reusable for **new phones, tablets, accessories, watches, and any
  future product**.
- Implementation rules (3B):
  - Components are named **product-generically** (`ProductImageGallery`,
    `ProductActionBar`, `ProductDetailsScreen`, …) even though the **route name stays
    `phone-details`** (no URL/back-compat break).
  - All fields/specs are rendered from a **neutral `product` descriptor** derived from the
    record (`kind`, `title`, `price`, `condition`, `city`, `specs[]`), so a tablet /
    accessory / watch record renders correctly without phone-specific code.
  - WhatsApp actions map by product **kind** (phones get the 4 phone actions; other
    product kinds fall back to a generic inquiry template).
- Acceptance: the details screen renders a non-phone record (e.g. a tablet seed) without
  phone-specific logic.

### 16.3 — SEO / links without state loss (binding)

- Despite being an SPA, **Deep Links, QR Links, Campaign Links, Placement Links,
  Back/Forward and Refresh** must all restore the **exact page directly**, with **no page
  state loss**:
  - Opening the product URL (e.g. `/focus22/#/phone-details?device=ABC123` — the
    path-style form `/showroom/product/ABC123` is equivalent in intent) must render that
    page **immediately** — `InitialRoute` resolves the deep link to the target screen and
    `REPLACE`s to it in one step; **no chain of intermediate screens**.
  - Back/Forward (popstate) → `BACK` per the priority table; Refresh → same deep-link
    restoration path (URL is the source of truth, not in-memory-only state).
  - QR / Campaign / Placement deep links (Phase 1 mechanisms) keep working unchanged and
    are extended (not replaced) by hash-query params (`?device=`, `?code=`).
- This is partly realized in **3A** (routeParams + `InitialRoute` hash-query parsing +
  base-aware URL builders) and fully in **3B** (product route + `ProductDetailsScreen`
  cold-load).
- Acceptance: CDP — cold load of the product deep link lands directly on the product page
  (single navigation, no intermediate screens), and Refresh re-renders the same page.
