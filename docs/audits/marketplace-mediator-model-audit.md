# FOCUS22 — Marketplace / Ads Mediator Model — Read-Only Audit (Master Directive v1)

- **Date:** 2026-08-09
- **Scope:** Read-only discovery of the entire repository (`E:\dll\focus\focus22`) — code, Supabase SQL, tests, docs. **No file, SQL, migration, RLS, RPC, commit, push or deploy was modified.**
- **Method:** 4 parallel read-only explorations (WhatsApp, Ads/CTA, Campaigns/counters, DB/security) + direct source verification of every load-bearing claim + focused static test runs (30 files / 261 tests; full suite 118 files / 1159 tests PASS earlier in this session).
- **Live-DB caveat (§28):** this environment has **no live-DB access**. Nothing about live row counts, live RLS state, live grants, or live RPC behavior is claimed from this environment. Owner-provided SQL output is the source of truth.
- **Status:** `AUDIT COMPLETE — HARD STOP — OWNER REVIEW REQUIRED`

---

## Executive verdict

1. **FOCUS22 is ALREADY a presentation/contact mediator, not an executing marketplace.** All four CTAs (Buy/Exchange/Installment/Inquiry) produce a **pre-filled WhatsApp message to one business number**; there is **no checkout, cart, order, payment, invoice, exchange workflow or installment workflow anywhere** in the codebase (verified, §13 Q1–Q6).
2. **Server-side owner-only control already holds for `ads` and `campaigns`** (RLS role-gated admin/super_admin; anon read-only). Verified at policy level (§9, §13 Q7–Q8).
3. **What does NOT match the model:**
   - **Phone listings are localStorage-only** (`catalog_inventory`) — there is **no server-side source of truth**, so owner-only publishing is currently **not server-enforceable** for phones (§4, §13 Q9–Q10, risk J1).
   - **Zero counters** exist for campaigns or ads (no views/clicks/WhatsApp intents/CTA breakdown) (§7, risk J2).
   - **Ads and campaigns are disconnected** (`ads.placement` PK, no `campaign_id`).
   - **WhatsApp number is hardcoded** (`+213556254007`), not admin-configurable; 5 duplicated URL builders.
   - CTA **labels/icons imply the platform transacts** (🛒 Buy / 💳 Installment).
4. **Frozen systems are provably untouched** (guard tests + read-only verification scripts + privacy gates).
5. **Nothing needs to be removed.** The mediator model is reached by **alignment (M1) + additive counters (M2–M3)** + a **separate, owner-approved server-listings CR (M4)**. No commerce engine is built.

---

# 1. Current Architecture

- **App:** React + TypeScript SPA on GitHub Pages (vite `base: '/focus22/'`), `public/404.html` handles SPA deep links. Supabase client is **anon-key only** (`src/core/supabase/client.ts`); **no service_role key exists anywhere in `src/`**.
- **Public surfaces (guest):** `home`, `showroom` (used-phone catalog), `phone-details`, `phone-services` (sell/exchange/buy WhatsApp wizard), `repair-home`, `results`, `landing` (`src/App.tsx:60-99`, `src/store/navigation.tsx:6-44`).
- **Admin surfaces:** Research Console (`src/research-console/ResearchConsole.tsx`) incl. Campaigns + Ads Manager; BI sandbox (`src/business-intelligence/BusinessIntelligenceCenter.tsx`). Role-gated (admin/super_admin; researcher read).
- **Data planes:**
  - **Server-backed (Supabase):** `campaigns`, `ads`, `users`, `sessions`, `analytics_events`, `qr_codes`, `placements`, `placement_history`, `repair_*`.
  - **Browser-local (localStorage):** phone inventory `catalog_inventory`, showroom view counts, sticker analytics, BI smart offers.
- **Roles:** source of truth = `public.users.role` (DB row, not JWT) via `src/core/auth/index.ts`; decision point `src/core/research/permissions.ts`; guard `src/components/shared/ProtectedRoute.tsx`.

---

# 2. Ads Architecture

- **Table `public.ads`** (`supabase/migrations/00015_ads_tables.sql`): `placement TEXT PRIMARY KEY, enabled, image_path, image_url, link, alt, sort_order, updated_by, created_at, updated_at`.
- **RLS:** "Public read enabled ads" (`anon, authenticated`, `enabled = TRUE`) · "Staff read all ads" (`authenticated`, role admin/super_admin) · "Staff manage ads" (`ALL`, role admin/super_admin, WITH CHECK). **Grants:** `SELECT` → anon+authenticated; `INSERT/UPDATE/DELETE` → authenticated (RLS-enforced).
- **Storage:** bucket `ads-images` public read; upload/update/delete staff-only (role-checked policies). **Realtime:** `supabase_realtime` publication → admin edits propagate instantly.
- **Manager:** `src/research-console/pages/ads/AdsManager.tsx` (6 placements: home, phones, repair, results, exchange, phone-details), full CRUD + image upload + preview.
- **Renderer:** `src/components/ads/AdSpot.tsx` renders only when `enabled && image`; wraps in `<a href={link} target="_blank" rel="noopener noreferrer">` when a link is set. Call sites: HomeScreen, PhoneServicesScreen, RepairHomeScreen, ResultsScreen, CustomerPhoneFlow (exchange), ProductDetailsScreen, ShowroomScreen.
- **Service:** `src/services/ads-service.ts` — `getAds/getAd/saveAd/resetAd/uploadAdImage/subscribeAds`; module cache + Realtime channel.
- **Key gaps:** **no `campaign_id`** (ads disconnected from campaigns) · ad `link` is a free-form admin URL (untracked; **actual stored values are DB rows — cannot be enumerated from this repo without live data**, §25) · **no click/view tracking**.

---

# 3. Campaign Architecture

- **Table `public.campaigns`** — live-built in the Supabase SQL editor (repo baseline `00008` documents "cannot rebuild from scratch"). **No create-migration exists in the repo.** 25 columns written by the admin service (see §8).
- **Admin surface:** `src/research-console/pages/campaigns/` — `campaign-service.ts` (only writer/reader; generates `short_code`, seeds `timeline`), `CampaignsDashboard.tsx` (filters + soft-delete/restore), `CampaignWizard.tsx` (3-step create), `CampaignDetailView.tsx` (Overview/QR Designer/Print; **analytics and placements tabs deliberately omitted**), `QRDesigner.tsx`, `PrintCenter.tsx`.
- **Public QR contract (FROZEN):** `src/services/campaign-lookup.ts` — regex `/\/c\/([a-zA-Z0-9]{6})(?:\/)?$/` → RPC `lookup_campaign_by_short_code({p_code})` → `{id, shortCode, name}` when `is_active=true` → game-intro (`src/App.tsx:130-135`). `buildCampaignQrUrl` emits plain `${origin}${basePath}c/<short_code>` — **no query params**.
- **Campaign ↔ ad relationship: NONE.** The only `campaign_id` usage in-app is `sessions.campaign_id` read by BI as a user attribute (`src/business-intelligence/api.ts:148,190`) — frozen analytics.
- **Counters: none** (§7).

---

# 4. Phone Listings Architecture

- **Data source: localStorage only.** `src/services/inventory-service.ts:126-128` keys: `catalog_inventory`, `catalog_inventory_transactions`, `catalog_inventory_movements_v2`.
- **Seed:** `src/services/inventory-seed.ts:42` seeds once per browser **if the key is absent**; the seed never overwrites existing data.
- **Read path:** `ShowroomScreen.tsx:23` → `InventoryService.getExchangeableDevices()` (localStorage) → `ProductDetailsScreen` reads the record. `ProductDetailsScreen.tsx:21` imports `InventoryRecord` from `inventory-service`.
- **CRUD:** Inventory management page writes the same localStorage keys. No Supabase call.
- **Server side:** migration `00014_inventory_tables.sql` (tables `inventory_items`/`inventory_images`/`inventory_movements`; policies "Public read published inventory", "Staff manage inventory"; column-level grants hiding `buy_price`) **exists in the repo but is NOT consumed by any app code** — grep for `.from('inventory_items')` in `src/` returns **zero matches**. Whether 00014 was applied to the live DB **cannot be verified from this environment** (§28).
- **Ownership implication (risk J1):** because listings live in the browser, "the owner alone publishes phones" is **not server-enforceable today** — and conversely the owner **cannot manage phone content centrally** (a content change requires a code deploy that bumps the seed). This is the main architectural gap vs the directive.

---

# 5. CTA Architecture (current behavior)

### Primary surface — Product Details (`phone-details`)
`src/components/showroom/ProductActionBar.tsx` renders exactly 4 buttons (`data-action = buy | exchange | installment | inquiry`; labels شراء / استبدال / تقسيط / استفسار; icons 🛒 / 🔄 / 💳 / ❓). Handler in `src/screens/showroom/ProductDetailsScreen.tsx:99-106`:

```ts
const handleAction = useCallback((action: PhoneActionId) => {
  if (!device) return;
  const message = sendPhoneActionWhatsApp(action, device);
  whatsapp.send(message, { action, deviceId: device.id });
}, [device, whatsapp]);
```

`sendPhoneActionWhatsApp` → `buildPhoneActionMessage` (`src/services/whatsapp-service.ts:178-191`) builds a **dynamic message** (greeting + per-action opener + اسم الهاتف + الكود + optional السعر/المدينة + رابط الإعلان (deep link `#/phone-details?device=<id>`) + شكراً). **Opens nothing** itself (test asserts no `window.open`); `useSmartWhatsApp` (`src/hooks/useSmartWhatsApp.ts`) opens `https://wa.me/213556254007?text=<encoded>` **same-tab**; if the page hasn't left after 1.5 s it shows a fallback modal (copy/retry).

### Secondary surface — Phone Services wizard
`src/screens/phone-services/CustomerPhoneFlow.tsx` (sell/exchange/buy) → `openWhatsAppForAction(WHATSAPP_BUSINESS_PHONE, action, {...})` (`src/services/whatsapp-message.ts:149-172`) → `openBuyRequest/openSellRequest/openExchangeRequest` (`whatsapp-service.ts:30-79`), new-tab `window.open(...,'_blank','noopener')` + same-tab fallback.

### Not commerce
- **No** checkout/cart/order/payment/invoice/stripe/internal-exchange/installment workflow exists (grep over `src/`; only French false positives like `Écart-type`).
- `CatalogStepAction` (`src/components/catalog/CatalogStepAction.tsx:16-26`) exposes buy/sell/exchange/trade_in but only sets a form `operation` value — no side effect.
- HomeScreen service strip (Buy New / Buy Used / Sell / Exchange / Repair) just navigates.
- Internal `MovementReason = 'exchange'` and `removeStockWithReason(...,'exchange')` are **admin stock-movement bookkeeping only** — not a customer exchange workflow.

### Gap vs owner contract (§21 of the directive)
Labels + icons (🛒 Buy / 💳 Installment) **imply the platform transacts** — business-model perception issue → UX options in §23.

---

# 6. WhatsApp Architecture

- **Number:** `WHATSAPP_PHONE = '+213556254007'` — **single hardcoded constant** at `src/services/whatsapp-service.ts:4`. Re-exported as `DEFAULT_WHATSAPP_PHONE` (`whatsapp-message.ts:30`), `STORE_PHONE` (`StickerStudio.tsx:10`), `WHATSAPP_BUSINESS_PHONE` (`CustomerPhoneFlow.tsx:17`).
- **No env var / config / DB row** → **not admin-configurable today** (owner decision N3).
- **Formatter:** `formatPhone` strips non-digits; leading `0` → `213` prefix.
- **Encoding:** `encodeURIComponent(message)` on `?text=` in all live builders — **correct**.
- **URL builders — duplicated across 5 places:**
  1. `buildWhatsAppUrl` (`whatsapp-service.ts:13-16`) — **live**.
  2. `generateWhatsAppLink` (`whatsapp-message.ts:174-192`) — dead.
  3. `generateShareLink` (`whatsapp-message.ts:194-209`) — dead.
  4. `buildShareUrl` (`src/core/qr/share.ts:33-41`) — live, generic, **no phone** (`wa.me/?text=`), shares to the user's own WhatsApp.
  5. Inline `href` in `src/components/brand/BrandFooter.tsx:20` (`https://wa.me/213556254007`, no message).
- **Navigation strategies (two):** `openWhatsApp` → new tab + fallback; `useSmartWhatsApp` → same-tab + 1.5 s guard modal. No UA detection.
- **Other surfaces:** Repair submit → `openRepairRequest` (embeds **customer phone number** in the URL — PII, consciously KEPT per P6 matrix). StickerStudio prints the number. ShareScreen shares via the user's own WhatsApp.
- **Privacy gate evidence:** no telemetry before navigation (PG-13/PG-59 direct `wa.me` handoff; `exit-telemetry.test.tsx` asserts no `.track(`/`exit_attempt`).
- **Tests:** `whatsapp/whatsapp-service.test.ts`, `phone-action-whatsapp.test.ts`, `showroom/useSmartWhatsApp.test.tsx`, `navigation/exit-telemetry.test.tsx`, `repair/repair.test.ts`, `qr/share.test.ts` + privacy gates P3/P5/P6/P7.

---

# 7. Counter Architecture (current — none exist)

**Finding: there are NO view/click/intent counters for campaigns or ads anywhere.**

| Exists today | Where | Scope | Frozen? |
|---|---|---|---|
| `useViewCounter` | `src/hooks/useViewCounter.ts` (localStorage `showroom_view_counts`, per-session dedupe) | showroom phone cards only | no |
| `scan_count` / `game_start_count` / `game_complete_count` / `registration_count` | live `qr_codes` + `increment_qr_counter` RPC | QR runtime | **YES — do not touch** |
| `analytics_events` | live table (telemetry) | telemetry | **YES — frozen; do not reuse** |
| sticker analytics | `src/services/sticker-analytics.ts` (in-memory/localStorage) | stickers | separate feature |
| i18n keys `campaign.analytics.*` | `i18n/translations/*` | keys exist, **no consuming UI** | — |
| campaign_roi formula | `src/business-intelligence/metrics.ts` (reads `sessions.campaign_id`) | BI sandbox | reads frozen analytics |

- **No** `click_count`/`view_count`/`impression`/`ctr`/`intent` column or RPC exists for `campaigns` or `ads`.
- Counter definitions (view/click/intent/CTA), unique-visitor and anti-spam rules are **undefined** → §17–§18.
- **Constraint:** new counters must be **server-persisted**, must **not** reuse `analytics_events`/`qr_codes`/`placements`/`placement_history`, must not allow direct counter UPDATE by users, and **tracking failure must never block WhatsApp** (§11).

---

# 8. Database Architecture

### `public.campaigns` (live-built; 25 columns written by admin service)
`name, goal, campaign_type, country, state_name, city, district, venue, description, notes, budget, budget_currency, material, start_date, end_date, status, is_active, logo_url, short_code, qr_config, timeline, created_by, last_edited_by, created_at, updated_at`
(`src/research-console/pages/campaigns/campaign-service.ts:28-55`; verification `campaigns-admin-read-only-verification.sql` §A2).
- `created_by`/`last_edited_by` are **TEXT and NULL** → **no usable owner column** (LV-3 gap; `03-LV3-campaigns-schema-gap.md`).

### `public.ads` (00015)
`placement TEXT PK, enabled, image_path, image_url, link, alt, sort_order, updated_by UUID→users, created_at, updated_at`. **No campaign_id.**

### `inventory_items` (00014) — repo-only, NOT consumed by app (§4)
`inventory_items`, `inventory_images`, `inventory_movements`; `buy_price` never granted to anon/authenticated. **No `.from('inventory_items')` in `src/`.**

### `users`, `sessions`, `analytics_events`, `devices`, `calibrations`, `surveys`, `qr_codes`, `placements`, `placement_history`, `repair_*`
Owner+role-gated reads (`is_research_role()`), tightened to `authenticated` (CR-004). `placements` column-level grants (anon/authenticated: identity cols only; **no DELETE anywhere**). `placement_history` staff read, admin/super_admin write.

### RPCs
`lookup_campaign_by_short_code` (SECURITY DEFINER STABLE search_path=public; `WHERE short_code=TRIM(p_code) AND is_active=true`; EXECUTE anon+authenticated) · `lookup_scan_context` (v2, placement-aware, whitelisted JSONB) · `increment_qr_counter` (frozen) · `app_role` / `is_admin` / `is_research_role` / `has_super_admin` / `handle_new_user` / `update_updated_at`.

---

# 9. RLS & Grants

| Object | Public (anon) | Authenticated (non-admin) | Admin/super_admin | Researcher |
|---|---|---|---|---|
| `campaigns` | **none** (CR-00006/CR-00007: RLS "Admins manage campaigns", anon `REVOKE ALL`) | SELECT table-ACL only (no policy) | ALL (RLS) | — |
| `ads` | SELECT `enabled=TRUE` | SELECT enabled + (grants INSERT/UPDATE/DELETE but RLS blocks non-staff) | SELECT all + ALL (RLS) | SELECT all (reads) |
| `placements` | SELECT active identity cols | same | manage (no DELETE) | read |
| `placement_history` | none | none | write | read |
| `qr_codes` | none | none | manage | — |
| `sessions`/`analytics_events`/`users` | 0 rows | role-gated | role-gated | role-gated |
| storage `ads-images` | read | read | read + write | read |

- **Key design note:** for `ads`, `authenticated` holds INSERT/UPDATE/DELETE **grants**, but **RLS ("Staff manage ads") is the enforcement** — a non-admin authenticated user gets 0 rows on write. This is the correct "RLS not just hidden buttons" pattern to replicate in M2/M4.
- `inventory_*` (00014, if applied live): public SELECT published, `buy_price`/`quantity`/`is_published` withheld; **no DELETE grant anywhere**.

---

# 10. RPCs (current, incl. security posture)

- `lookup_campaign_by_short_code` — **SECURITY DEFINER, STABLE, search_path=public**, `EXECUTE` anon+authenticated; returns only `{id, shortCode, name}` when active. **Frozen.**
- `lookup_scan_context` — v2 placement-aware whitelisted JSONB. **Frozen.**
- `increment_qr_counter` — **frozen; must not be reused or extended.**
- `app_role`/`is_admin`/`is_research_role`/`has_super_admin` — used by RLS; `has_super_admin` EXECUTE to anon is a **documented exception**.
- `handle_new_user`, `update_updated_at` — triggers.
- **Testing gap:** no live-Postgres integration tests; RLS evidenced by read-only verification scripts + phase execution logs (A/B cross-user blocked, anon INSERT 42501, etc.).

---

# 11. Security Posture (summary)

- **Role chain:** DB `users.role` → `fetchRoleFromProfile` → `mapToResearchRole` → `ROLE_PERMISSIONS`/`permissionGuard` → `ProtectedRoute`.
- **Client:** anon-key only; no service key in repo; `.env` git-ignored (Supabase URL/anon-key/project-id).
- **Frozen remediations intact:** LV-1/LV-2/LV-4 owner-read, LV-5 analytics insert ownership, LV-9/LV-10/LV-11 revokes, CR-003/CR-004 search_path + TO authenticated, 2.1.6 incident closure — evidenced in `phase1/README.md`, `phase2/README.md`, phase-c files.
- **Live state:** cannot be verified from this environment (§28).

---

# 12. Frozen Systems — absolutely protected (verified untouched)

- **Guard tests:** `src/__tests__/campaigns/campaign-admin-guard.test.ts` — campaign-admin code never calls `.from('qr_codes'|'placements'|'placement_history'|'analytics_events'|'sessions')`, never references `data-service`/`core/qr/`, `buildCampaignQrUrl` has no attribution params, no `PlacementsTab`/`CampaignAnalytics` resurrected.
- **QR contract:** `src/__tests__/qr/campaign-lookup.test.ts` + `qr-routing.test.tsx` assert `/c/<SHORT_CODE>` routing, rejection of `?campaign=`/`?source=`/`?ref=`/`?utm_*`, and no analytics writes from the QR runtime.
- **Privacy gates P3/P5/P6/P7:** QR-runtime must not touch `qr_codes`/`placements`/`placement_history`/`analytics_events`/`lookup_scan_context`/`increment_qr_counter`/`scan_count`; `core/supabase/data-service.ts` absent; WhatsApp direct handoff preserved (PG-13/15/59).
- **Live evidence scripts:** `campaigns-admin-read-only-verification.sql`, `phase-b-qr-recovery-read-only-verification.sql`, `f-03-f09-privacy-read-only-verification.sql`, `verify-live-schema.sql`.
- **Do not touch / reuse:** `analytics_events`, `qr_codes` (+ `scan_count`), `placements`, `placement_history`, QR runtime, `/c/<SHORT_CODE>`, `404.html`, Campaign QR routing, `lookup_campaign_by_short_code`, `lookup_scan_context`, `increment_qr_counter`, Phase 2.3, CR-00005, CR-00007, LV-3/9/10/11, P7-01/02/03, P3/P5/P6/P7.

---

# 13. Business-Model Compliance — Q1–Q11 (evidence-based)

| # | Question | Answer | Evidence |
|---|---|---|---|
| Q1 | Any actual purchase executed by the platform? | **NO** | No order/purchase/payment code in `src/`; CTA handler only builds a WhatsApp message + opens `wa.me` (`ProductDetailsScreen.tsx:99-106`). |
| Q2 | Checkout? | **NO** | No checkout/cart components or flows; grep over `src/` finds none. |
| Q3 | Payment? | **NO** | No payment/Stripe/invoice code; `.env` has no payment keys. |
| Q4 | Internal order? | **NO** | No orders table or service; `inventory_movements` are admin stock bookkeeping (localStorage, key `catalog_inventory_movements_v2`), not customer orders. |
| Q5 | Internal exchange? | **NO** | "exchange" is only a CTA type + `MovementReason='exchange'` stock bookkeeping; no exchange workflow. |
| Q6 | Installment processing? | **NO** | "installment" is only a CTA label; no workflow. |
| Q7 | Can a non-owner publish an ad? | **NO** | `GRANT INSERT,UPDATE,DELETE ON ads TO authenticated` exists BUT RLS "Staff manage ads" restricts to admin/super_admin (`00015:68-77`); anon = SELECT only. |
| Q8 | Can a non-owner edit an ad? | **NO** | Same RLS (`00015:60-77`). Non-staff authenticated write → 0 rows. |
| Q9 | Can a non-owner create a phone? | **N/A today — no server model exists** | Phone data is localStorage (`inventory-service.ts:126`). A visitor could mutate their own browser copy via devtools, but it **does not propagate** and cannot be "published". Conversely the **owner cannot publish server-side either** → gap J1. |
| Q10 | Can a non-owner change a price? | **N/A today** | Same as Q9: no server source of truth; local edits are per-browser, non-propagating. |
| Q11 | Can a non-owner modify a counter? | **N/A — no counters exist yet** | §7. Once built (M2), RLS+RPC must forbid direct mutation (§17–§20). |

**Conclusion:** the business model is **already structurally compliant** for the transaction side (Q1–Q6: nothing to remove). The **content-publishing side is only partially enforceable** (ads/campaigns ✓ via RLS; phones ✗ because localStorage). Counters do not exist and must be built additive.

---

# 14. Business-Model Violations (current, if any)

| Violation | Severity | Detail |
|---|---|---|
| V1 — Phone listings have **no server-side source of truth** → "owner-only publishing" is **not server-enforceable** for phones, and the owner cannot manage phone content centrally | High | `inventory-service.ts` localStorage; seed per browser (`inventory-seed.ts:42`). |
| V2 — CTA labels/icons **imply the platform transacts** (🛒 Buy, 💳 Installment) | Medium | Perception risk, not code risk. UX options §23. |
| V3 — No counters → **no measured interest**, contradicts "قياس الاهتمام" role | Medium | §7. |
| V4 — Ads **disconnected from campaigns**; ad `link` free-form/untracked | Low | §2, §25. |

None of these requires *removing* existing behavior; all are closed by alignment + additive work.

---

# 15. Risks

| # | Risk | Severity | Notes / Mitigation |
|---|---|---|---|
| J1 | Phone listings localStorage-only; owner-only publishing unenforceable server-side | **High** | M4 separate CR: server table + RLS (owner decision N8). |
| J2 | Zero counters → no admin insight | **High** | M2–M3. |
| J3 | Counter build could collide with **frozen tables** | **High** | New dedicated table + guarded RPC; campaign-admin-guard + P-gates prevent reuse. |
| J4 | Anti-spam / unique-visitor undefined → inflated counters | **High** | §17–§18 design must be owner-approved before M2. |
| J5 | WhatsApp number hardcoded; 5 duplicated builders | **Medium** | M1 consolidation; N3 decision. |
| J6 | CTA labels/icons imply transactions | **Medium** | §23 UX options (N1). |
| J7 | Message phrasing drift from owner contact contract | **Low** | N2 decision. |
| J8 | Ad `link` arbitrary untracked URL | **Low** | N9 decision. |
| J9 | No owner column on campaigns (`created_by` TEXT NULL) | **Medium** | LV-3 open item. |
| J10 | `campaign_roi` reads frozen `sessions.campaign_id` — risk of conflating new counters with frozen analytics | **Medium** | New counters fully separate table. |
| J11 | 00014 inventory migration existence may mislead (draft vs live) | **Low** | Verified: no app consumer; live application unverifiable from here (§28). |

---

# 16. Required Changes

1. **M1 — CTA/WhatsApp alignment (code only, no DB):**
   - Centralize WhatsApp builders (5 → 1 util + 1 message builder); keep `encodeURIComponent`; keep "tracking failure never blocks WhatsApp".
   - CTA wording/icons per owner decision N1 (§23).
   - Exact per-action message contract per N2 (§21).
   - **Ad click → WhatsApp** behavior (§22).
2. **M2 — Counter infrastructure (additive DB):** new table + guarded RPC + RLS + grants + anti-spam + fire-and-forget client hook (§17–§20).
3. **M3 — Counter UI (read-only):** Campaigns performance cards/filters; Ads views/clicks/CTR/intents.
4. **M4 — Phone listings server source (separate CR):** design first, then HARD STOP (§24).
5. **Ad ↔ campaign link** decision (N7); **ad link policy** (N9); **WhatsApp number config** (N3).

---

# 17. Counter System — Design (definitions)

Definitions to be **owner-approved before M2 builds anything**.

- **View** — the ad/campaign material actually enters the viewport **and** stays visible for a minimum duration (proposal: IntersectionObserver, threshold ≥ 0.6, ≥ 1 s). **NOT** counted for: hidden render, preload, DOM creation, off-screen mount.
- **Click** — user actual click/tap on the ad (CTA type `ad_click`).
- **WhatsApp intent** — press of a CTA (buy/exchange/installment/inquiry) that leads to WhatsApp.
- **CTA types:** `buy`, `exchange`, `installment`, `inquiry`, `ad_click` (extensible per final design).
- **Campaign counters (admin view, §16 of directive):** views, clicks, WhatsApp intents, buy/exchange/installment/inquiry breakdown, CTR, WhatsApp conversion; filterable by day / period / ad / phone.
- **Ad counters (§17):** views, clicks, CTR, WhatsApp intents, CTA breakdown when applicable. Reads: **Admin/Researcher read-only**.
- **Visitor/session identifier:** anonymous, non-PII `visitor_hash` generated client-side (crypto-random per browser/session) — no email/phone/name. Device identity = the phone's short `device` id (already non-PII); ad identity = `placement`; campaign = `campaign_id`.

---

# 18. Counter System — Anti-Spam (design)

- **Dedup window:** server-side — no insert for the same `visitor_hash + target (campaign_id/ad_placement/device) + kind + cta_type` within a dedup window (proposal: view 1 h; click/intent 5 min; exact values = owner decision N4).
- **Rate limit:** max accepted events per `visitor_hash` per hour (proposal 60; owner decision N4).
- **Server-side validation:** `kind`/`cta_type` enum checks; campaign must exist and be active; ad placement must exist; payload size limits; reject malformed `visitor_hash`.
- **Direct manipulation blocked:** table has **no** INSERT/UPDATE/DELETE grants for anon; writes only via RPC; no role can UPDATE/DELETE counters.
- **JS alone is never the protection** — enforcement is in the RPC.
- **Duplicate/rapid-fire:** mitigated by rate limit + dedup; malicious INSERT loops impossible without table ACL.

---

# 19. Counter Storage (design)

After owner approval of §17–§18, create a **new, independent, server-side table** (e.g. `campaign_intents` or a better name from the design):

Proposed columns (design proposal, not literal):
`id UUID PK, kind TEXT CHECK (view|click|whatsapp_intent), cta_type TEXT CHECK (buy|exchange|installment|inquiry|ad_click), campaign_id UUID NULL, ad_placement TEXT NULL, device_id TEXT NULL, visitor_hash TEXT, created_at TIMESTAMPTZ DEFAULT now()`.

- **RLS:** INSERT via guarded RPC only (no anon table ACL); SELECT to `is_research_role()`.
- **Frozen:** must **not** use `analytics_events`, `qr_codes`, `placements`, `placement_history`.

---

# 20. RPC Security (design for M2)

```sql
CREATE FUNCTION public.record_campaign_intent(...) RETURNS void
  SECURITY DEFINER SET search_path = public VOLATILE
```
- Input validation: kind/cta enums, campaign exists + active, ad placement exists, `visitor_hash` format + length cap, payload size limits.
- Anti-spam dedup + rate limit inside the function (server-side).
- `GRANT EXECUTE` to anon, authenticated. **No direct table write to anon** — pattern `anon → RPC → validation → INSERT`, matching directive §15.

---

# 21. WhatsApp — Central Contact Layer (design, M1)

- **Single source of truth:** `src/services/whatsapp-service.ts` becomes THE contact layer. One URL builder `buildWhatsAppUrl(phone, message)` (encodeURIComponent), one message builder `buildContactMessage(intent, { device?, ad?, campaign? })`.
- **Dynamic message contract (§9):** when data is available include اسم الهاتف، الموديل، variant، السعر، المدينة، كود الإعلان، رابط الإعلان (deep link `#/phone-details?device=<id>`). **No unnecessary personal data** (current messages are product-data-only, no PII — verified).
- **Phrasing:** owner decision N2 — keep current dynamic Arabic template (greeting + opener + fields + شكراً) or switch to the owner's §4 example wording.
- **Number:** owner decision N3 — keep hardcoded `+213556254007` or make admin-configurable (DB + admin UI, later CR).
- **Navigation:** keep same-tab `wa.me` + 1.5 s fallback modal; fire-and-forget tracking **never blocks WhatsApp** (§11).

---

# 22. Ad Click → WhatsApp (design, M1 — new requirement §10)

Current: ad with a link opens the URL in a new tab. Required behavior for **phone ads**:

```
Ad Click → Identify Advertisement → Build Contact Message → WhatsApp
```
- Map ad → phone: via ad link/metadata to the device (`#/phone-details?device=<id>` or a dedicated ad code field).
- Build message: `السلام عليكم، أريد الاستفسار عن الهاتف [MODEL] الذي شاهدت إعلانه.` + available product data (price/city/code/link).
- **Campaign context:** if the ad is campaign-bound (decision N7), include campaign context **without touching the QR system** — campaign context comes from the `campaigns` table (admin-bound), **never** from `qr_codes`/`placements`/`lookup_scan_context`.
- Non-phone ads: keep normal link behavior or route to WhatsApp per owner decision.
- Fire-and-forget intent tracking (§11); tracking failure → WhatsApp still opens.

---

# 23. CTA UX (owner decision N1 — 3 options)

The buttons must read as **"request contact with the owner"**, not "the platform will execute the transaction".

1. **Option A (minimal):** keep action words (شراء/استبدال/تقسيط/استفسار) but change icons to contact-neutral (💬/📩) and add a clarifying subtitle (e.g. "سيتم تحويلك إلى واتساب للتواصل مع المالك").
2. **Option B (contact-intent wording):** re-word to contact intent (e.g. "أتواصل بخصوص الهاتف", "أرسل استفسار عبر واتساب") with a single consistent CTA + one "أرسل طلب عبر واتساب" primary button; the per-intent semantics move into the message.
3. **Option C (keep as-is):** owner explicitly accepts current labels/icons.

Recommendation: **Option A** (keeps per-intent routing + fixes perception with minimal change).

---

# 24. Owner-Only Phone Listings (M4 — separate CR, design-first)

**Do NOT begin migrating data.** First produce (then HARD STOP):

- **Proposed server model** (design after inspecting current seed, not literal): `phone_listings` with `id, title, brand, model, variant, price, city, description, status, published, image references, created_at, updated_at, created_by, updated_by` (+ other fields derived from `inventory-seed.ts` shape).
- **RLS:** public SELECT `published=TRUE` rows only; admin/super_admin ALL (pattern of `ads` §9). **Grants:** no DELETE for any role; column-level grants withholding internal fields.
- **Storage:** images in a role-gated bucket (pattern of `ads-images`).
- **Migration plan + rollback:** exact, documented (§30).
- **Compatibility with current localStorage:** keep the seed as an offline fallback / one-time bootstrap; reads prefer server, fallback to localStorage; explicit migration/backfill strategy.
- **Owner write access (§19):** create/update/publish/unpublish/delete/price/images/metadata — server-enforced via RLS+grants, not hidden buttons.

---

# 25. Ad Links (analysis + recommendation)

- Renderer: `AdSpot.tsx` only renders `<a href={link} target="_blank" rel="noopener noreferrer">` when `enabled && image && link`.
- **Cannot enumerate actual stored `link` values from this repo** — they are live DB rows (§28). Static analysis of the code shows links are arbitrary strings; no validation, no allow-list, no internal/external classification.
- Recommendation (owner decision N9): (a) restrict ad `link` to internal deep links (`#/...` routes) and `wa.me` only; (b) validate format server-side (RPC/CHECK); or (c) leave arbitrary. **No change until approval.**

---

# 26. Proposed Architecture (summary)

```
OWNER (admin/super_admin)
 ├── publishes phones (M4, server-side)
 ├── publishes ads (exists)            ── reads/writes ads + images
 ├── publishes offers/campaigns (exists)
 └── reads counters (M3)               ── reads campaign_intents
                  │
              FOCUS22
   Display · Search/Discovery · Campaign presentation · Ad presentation
   CTA = "request contact" (M1 wording/icons)
   Ad click (phone) → build contact message → WhatsApp (M1)
   Intent tracking = fire-and-forget RPC → campaign_intents (M2)
                  │
              VISITOR (anon)
   Browse · View (counted, dedup) · Click (counted) · Choose intent (counted)
                  │
              WHATSAPP → OWNER
```
Platform never sells, never orders, never pays, never holds money, never mediates payment.

---

# 27. Migration Strategy

| Phase | Scope | DB impact | Deploy | Gate |
|---|---|---|---|---|
| **M1** | CTA wording/icons + central WhatsApp builder + message contract + ad-click→WhatsApp | **none** | code + tests | REPORT → OWNER APPROVAL |
| **M2** | New counter table + guarded RPC + RLS + grants + anti-spam + fire-and-forget hook | **additive** (1 table, 1 function, policies, grants) | PRE-APPLY evidence → owner executes SQL → POST-APPLY verify → RUNTIME | OWNER APPROVAL REQUIRED |
| **M3** | Counter UI (Campaigns + Ads), read-only | none | code + tests | TEST → BUILD → RUNTIME → OWNER APPROVAL |
| **M4** | Phone listings server source | **separate CR** | design → schema → migration → rollback → HARD STOP | OWNER APPROVAL |

- Each phase: `IMPLEMENT → TEST → BUILD → REPORT → OWNER APPROVAL`. **No auto-advance.**
- M2 follows the CR-00007 discipline: pre-apply gates → owner executes → post-apply verify → rollback, read-only evidence, owner runs SQL in the Supabase SQL editor.

---

# 28. Testing Strategy

- **Unit (vitest):** exact message per CTA × device fields (name/model/variant/price/city/code/link); URL encoding round-trip; `formatPhone`; **no `window.open`/telemetry before redirect**; builder consolidation (dead builders removed with tests); RPC contract (kind/cta_type validation, campaign-active check, anti-spam, oversized payload rejected); RLS matrix; guard: campaign code never touches frozen tables.
- **Integration:** mocked Supabase for RPC call shape; fire-and-forget-on-failure; maybe-single.
- **Security tests:** anon cannot INSERT/UPDATE/DELETE counters; non-admin authenticated cannot mutate ads/counters; RLS behaves.
- **Regression:** Campaigns Admin suite, WhatsApp suite, ads suite, showroom suite, QR suite, privacy gates P3–P7 — all must remain green. Frozen-system guard tests must pass after every phase (§26 of directive; failure → **HARD STOP**).
- **Build/TS/ESLint/full suite:** required for every phase; a phase does not close on tests alone.

---

# 29. Runtime Verification Strategy (live, after each phase)

- **Ads:** admin can create/edit; public can view; public cannot modify.
- **Phones (M4):** owner can publish; public can view; public cannot modify.
- **CTA:** test every buy/exchange/installment/inquiry; verify WhatsApp message content (correct phone, model, price, city, code, ad link) and correct WhatsApp number.
- **Ad click:** click an ad → correct phone → correct message → correct WhatsApp number.
- **Counters:** view increments per definition; click increments; WhatsApp intent increments; duplicate actions controlled; refresh does not inflate.
- **Security:** anon cannot mutate; authenticated non-admin cannot mutate; counters not directly modifiable; RLS behaves.
- **Frozen regression:** `/c/<SHORT_CODE>`, `404.html`, QR routing, `lookup_campaign_by_short_code`, `lookup_scan_context`, `increment_qr_counter`, `qr_codes`, `placements`, `placement_history`, `analytics_events`, sessions, privacy gates, CR-00007, prior remediations — unchanged (run guard tests).
- **Live evidence:** owner runs the runtime checks; agent reports what is verifiable from the environment and explicitly says what is NOT (§28).

---

# 30. Rollback Strategy (exact, no guessing — §27 of directive)

- **M1 / M3 (code-only):** revert the phase commit; no DB objects exist to roll back. Verify via `git revert` + full test suite.
- **M2 (DB additive):**
  - *Apply:* create `campaign_intents` + `record_campaign_intent` RPC + policies + grants (single owner-executed script).
  - *Pre-apply evidence:* read-only listing that the four frozen tables are untouched (queries only).
  - *Post-apply verify:* RPC works for anon with valid input; invalid input rejected; anon direct table INSERT → 0 rows; frozen tables unchanged (queries only).
  - *Rollback (exact, documented one-shot):* `DROP TABLE IF EXISTS public.campaign_intents CASCADE;` `DROP FUNCTION IF EXISTS public.record_campaign_intent(...) CASCADE;` — the exact owner-executed rollback script is delivered with the apply script. **No "restore something similar".**
- **M4:** its own apply + rollback scripts (DROP new tables/functions; revert grants; keep localStorage intact as fallback).

---

# 31. Required Owner Decisions (explicit)

| # | Decision | Options |
|---|---|---|
| N1 | **CTA labels/icons** | (a) Option A: keep words, contact-neutral icons + clarifying subtitle (Recommended); (b) Option B: contact-intent wording; (c) Option C: keep as-is. |
| N2 | **WhatsApp message contract** | Approve current dynamic Arabic template (with price/city/code/ad-link) vs owner §4 example wording; keep or drop optional fields. |
| N3 | **WhatsApp number source** | (a) keep hardcoded `+213556254007`; (b) admin-configurable (DB + admin UI, later CR). |
| N4 | **Counter definitions + anti-spam** | Approve §17–§18: view (viewport ≥1 s, threshold ≥0.6), dedup windows (view 1 h, click/intent 5 min), rate limit (60/h/visitor) — or adjust. |
| N5 | **Counter storage** | Approve new dedicated table + guarded RPC (`campaign_intents` or better name); NOT reusing frozen tables. |
| N6 | **Tracking failure behavior** | Confirm: fire-and-forget; **never block WhatsApp**. |
| N7 | **Ad ↔ campaign link** | (a) no link (ads independent); (b) add `campaign_id` to ads later; (c) bind CTA/ad-click messages to a bound campaign (context from `campaigns`, never from QR). |
| N8 | **Phone listings → server (M4)** | Approve starting M4 design work (separate CR), or keep localStorage. |
| N9 | **Ad link policy** | (a) internal deep links + `wa.me` only, server-validated; (b) keep arbitrary URLs. |
| N10 | **Phase sequencing** | Approve M1 → M2 → M3 → M4, each gated; no auto-advance. |

---

## Directive compliance checklist

- ✅ §5 Phase 0 read-only discovery (ads, campaigns, phones, WhatsApp, counters, security).
- ✅ §6 read-only rule: **no code/SQL/migration/RLS/RPC/commit/push/deploy** — the only new file is this report.
- ✅ §7 required audit report with all 21 items (this document, sections 1–31).
- ✅ §8 Q1–Q11 answered with code/database evidence (§13).
- ✅ §12 counter definitions, §13 anti-spam, §14 storage, §15 RPC security designs.
- ✅ §33 16 required report contents (what exists / missing / risky / must change / must not touch / proposed design / counters / WhatsApp / ad-click / owner listings / RLS-security / tests / runtime / rollback / M1–M4 / owner decisions).
- ⏸ **M1 NOT started** — awaiting explicit owner approval after this review.

> **AUDIT COMPLETE — HARD STOP — OWNER REVIEW REQUIRED**
