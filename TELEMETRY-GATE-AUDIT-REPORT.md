# TELEMETRY-GATE-AUDIT-REPORT

**التقرير المعماري — baseline رسمي قبل Action-Tracking Implementation Wave**
**Date:** 2026-09-06 · **Scope:** repository `focus-production@955125d` + live production Supabase (`fmggysdqigtejxbfpgtg`, PG 17.6)
**Mode:** AUDIT ONLY — zero production changes, zero migrations, zero code edits, zero commits (report = audit artifact, written to working tree without touching unrelated files).

---

## 1. Executive Summary

FOCUS has **two telemetry generations living side-by-side**:

1. **Legacy `analytics_events`** — a large, frozen free-form dataset (10,463 rows, last write **2026-08-13**) using a non-canonical taxonomy (`lamp_appeared`, `round_started`, `game_started`, `qr_scanned`, `repair_requested`, `courier_*`, …). No live producer writes it anymore (enforced by privacy gates + verified in code). It is read only for the QR scan count in the BI console.
2. **`telemetry_events` + closed registry (Phase T1/T2)** — live since **2026-09-04**, 1,419 events, a principled CLOSED contract: 97 canonical event names in `src/core/telemetry/events.ts`, mirrored 97/97 in the server `record_telemetry_event` allowlist (00057/00061/00067), per-event property allowlists, a forbidden-PII key list enforced client+server, batching (10/5s/50 via runtime settings), session/anon/user identity, and a single aggregate-only analytics RPC `get_telemetry_analytics` behind ADMIN/SUPER_ADMIN/RESEARCHER.

**Strengths (verified):** single write path (RPC only), telemetry_events fully closed to direct access (RLS on, 0 policies, only postgres/service_role), RPC hardened (`SECURITY DEFINER` + `SET search_path=''`), idempotent insert (unique `event_id` + `(session_id, dedupe_key)`), privacy gate proved clean (0 PII observed), schema/tests green (3502/3502, tsc 0, build ok).

**Core gaps (why this audit matters):**
- **No journey continuity.** Telemetry `session_id` is a per-page-load random UUID with **0 overlap** against the scientific/game `sessions` rows (PROD T26 = 0). A user journey (entry → category → product → order, or entry → game → result) **cannot be reconstructed end-to-end**.
- **Guest vs registered indistinguishable.** All 1,419 events carry a `user_id` because guest flows use Supabase Anonymous Auth (which always resolves an auth UID). There is no guest/registered flag, so segmentation by user type is impossible from events alone.
- **The exact funnels named in the goal are mostly unmeasured:** screen→domain entry is `screen_view`+`category_view`; product→order exists (6 order events); but **Quantity/delivery-zone/delivery-fee**, **courier accept/claim**, **store-ops transitions & failures**, **cancellation/abandonment of checkout**, **TTT (0 events in prod)**, and **campaign→order outcome** are absent.
- **QR attribution is an isolated rail** (`campaign_qr_events`, 287 rows) that never joins telemetry; campaign → final order is unlinkable.

**Verdict: `PASS WITH GAPS`** — the closed-contract design is sound, survives its gates, and carries real production data; but the *action-tracking objective* (precise, joinable user journey) is not yet achieved by the existing events. Detailed findings ranked in §17.

---

## 2. Current Architecture

```
 UI / screens / services / hooks / App lifecycle / navigation store
   │   track({ event, entityType?, entityId?, screen?, properties? , dedupeKey?})
   ▼
 TelemetryClient  src/core/telemetry/client.ts
   │  isTelemetryEventName() → privacy.sanitizeEvent() → dedupeKeys set
   │  session_id = module-random UUID (per page load)
   │  anonymous_id = localStorage focus_vid_v1 (32-hex visitor hash)
   │  user_id = auth.getUser().uid  (guests via Anonymous Auth ⇒ non-null UID)
   │  occurred_at = CLIENT timestamp;  batch≤10 / flush 5s / buffer≤50 (runtime-configurable)
   ▼
 record_telemetry_event(jsonb p_events[])  [SECURITY DEFINER, SET search_path='', anon+authenticated]
   │  server: batch≤50, event→domain allowlist, forbidden keys, per-event allowlist,
   │  scalar-only values ≤120 chars, session required, anon_id regex, idempotent insert
   ▼
 telemetry_events  (RLS enabled, 0 policies; row only via RPC; postgres/service_role table grants)
   ▼
 get_telemetry_analytics(6 filters)  [SECURITY DEFINER, search_path='', role-gated]
   │  totals / unique sessions & visitors & users / events_by_event / by_domain / daily /
   │  top_entities(50) / funnels: category, product, listing, cart, request, game, ad, system  ← NO funnels for app/navigation/ttt/auth/neighborhood/order
   ▼
 telemetry-api.ts → TelemetryAnalyticsBI.tsx (admin BI)
 + pilot_admin_pilot_health() secondary aggregate read (order event counts)
 + get_campaign_qr_metrics → CommerceIntelligenceBI (QR scans, research/admin)

Parallel rail (isolated): QR/campaign → campaign_qr_events via record_campaign_qr_scan /
record_campaign_funnel (SECURITY DEFINER, anon exec, nonce-based, rate-limited). No join to telemetry.
Legacy (frozen): analytics_events (10463 rows, last 2026-08-13) — no live producer.
```

---

## 3. Existing Event Inventory — كل الأحداث الموجودة (97/97)

Registry: `src/core/telemetry/events.ts` (closed; per-event allowlist). Server mirror: 00057/00061/00067 `record_telemetry_event` (97/97 verified). All events share the wire row shape (event_id, event_name, event_version, domain, occurred_at client-ts, session_id, anonymous_id, user_id, screen?, entity_type?, entity_id?, properties{allowlist}, context, dedupe_key).

Legend: **P** = has producer · **N** = defined, **no** producer in src. DB dest for all = `telemetry_events` via `record_telemetry_event`; auth = anon+authenticated (guests resolve to a UID).

### app & lifecycle
| Event (id) | Producer | Trigger | entity | Payload | Status |
|---|---|---|---|---|---|
| app_open | App.tsx:227 | first real screen, once | — | — | P |
| app_ready | App.tsx:237 | boot complete, once | — | — | P |
| app_background | App.tsx:248 | visibility hidden | — | — | P |
| app_foreground | App.tsx:249 | visibility visible | — | — | P |
| app_update_detected | — | — | — | — | **N** |
| app_error | — | — | — | — | **N** |

### navigation
| Event | Producer | Trigger | Status |
|---|---|---|---|
| screen_view | store/navigation.tsx:378,386 | nav push/replace (initial vs later) | P |
| navigation_back | store/navigation.tsx:388 | stack depth shrink | P |
| navigation_exit | — | — | **N** |
| deep_link_open | App.tsx:269,280 | hash route / challenge query, {mode,has_code}, once | P |

### category
| Event | Producer | Trigger | entity | Payload | Status |
|---|---|---|---|---|---|
| category_view | CategoryScreen.tsx:234 | active category loaded | category/slug | — | P |
| subcategory_view | CategoryScreen.tsx:385 | child subcategory visible | category/slug | — | P |
| category_product_list_view | CategoryScreen.tsx:241 | phone grid rendered, once | category/slug | {count} | P |
| category_product_click | CategoryScreen.tsx:293 | open phone | product/device.id | {position} | P |
| category_search | ShowroomScreen.tsx:141 | debounced 400ms | category/slug | {has_result} | P |
| category_filter | ShowroomControls.tsx:54,61 | condition/city filter | category/slug | {filter,active} | P |
| category_sort | ShowroomControls.tsx:69 | sort change | category/slug | {sort} | P |

### product / showroom
| Event | Producer | Trigger | entity | Payload | Status |
|---|---|---|---|---|---|
| product_impression | PhoneShowroom.tsx:37 (useTelemetryImpression 0.6/1s) | visible once | product/device.id | {position} | P |
| product_view | ProductDetailsScreen.tsx:103 | loaded | product/device.id | — | P |
| product_image_view | PhoneGallery.tsx:83, ProductImageGallery.tsx:77,116,419 | fs open / nav / thumb | product | {index} | P (4 affordances) |
| product_variant_select | — | — | — | — | **N** |
| product_details_expand | — | — | — | — | **N** |
| product_share | ProductDetailsScreen.tsx:125 | share | product | {method} | P |
| product_favorite | — (button calls favorites.save only) | — | — | — | **N** |
| product_contact | ProductDetailsScreen.tsx:143 | WhatsApp | product/device.id | {method} | P |
| product_back | ProductDetailsScreen.tsx:110 | back | product | — | P |

### listing (marketplace items)
| Event | Producer | Trigger | Payload | Status |
|---|---|---|---|---|
| listing_create_start | CarListingForm:53, ProduceListingForm:35, PropertyListingForm:52 | form open | {step} | P |
| listing_create_submit | Car:81, Produce:67, Property:88 | submit | — | P |
| listing_create_success | listing-service.ts:390,417 | RPC ok | — | P |
| listing_create_failed | listing-service.ts:394,421 | RPC err | {error_code:'DB'} | P |
| listing_view_detail | ListingDetailsScreen.tsx:77 | loaded | — | P |
| listing_share | — | — | — | **N** |
| listing_contact | ListingDetailsScreen.tsx:120 | WhatsApp | {method} | P |
| listing_add_to_cart | ListingDetailsScreen.tsx:167 | add | {qty:1} | P |
| listing_edit_start | EditListingModal.tsx:89 | modal | — | P |
| listing_edit_success | listing-service.ts:442 | RPC ok | — | P |
| listing_delete | listing-service.ts:553 | RPC ok | — | P |
| listing_publish | listing-service.ts:483 | RPC ok | — | P |

### cart
| Event | Producer | Trigger | Payload | Status |
|---|---|---|---|---|
| cart_add | ProductDetailsScreen.tsx:169 | add to cart | {qty} | P |
| cart_remove | CartContext.tsx:120 | remove line | — | P |
| cart_quantity_change | CartContext.tsx:109 | set qty | {qty} | P |
| cart_clear | CartContext.tsx:130 | clear | {count} | P |
| cart_view | CartScreen.tsx:32 | open cart | {count} | P |

### request / whatsapp
| Event | Producer | Trigger | Status |
|---|---|---|---|
| request_start | RequestScreen.tsx:63 | cart non-empty, once | P |
| request_submit | RequestScreen.tsx:105 | validated submit | P |
| request_success | RequestScreen.tsx:124 | wa.me sent | P |
| request_failed | RequestScreen.tsx:101 | local validation | P |
| whatsapp_open | RequestScreen.tsx:125 | whatsapp open | P |

### neighborhood pilot / order
| Event | Producer | Trigger | entity | Payload | Status |
|---|---|---|---|---|---|
| neighborhood_view | PilotStorefrontScreen.tsx:53 | **first** auto neighborhood only | neighborhood | — | P (gap: not on change) |
| store_view | PilotStorefrontScreen.tsx:89 | store change | store | — | P |
| family_view | PilotStorefrontScreen.tsx:79 | **neighborhood change** (not family!) | neighborhood | — | P (wrong trigger) |
| checkout_start | PilotCheckoutScreen.tsx:67 | mount once | — | {items_count, with_delivery:true} | P |
| checkout_submit | order-service.ts:122 | every submit (no dedupe) | — | {items_count} (+family_id **dropped**) | P |
| order_created | order-service.ts:141 | RPC ok | order/result.orderId | {channel} (+family_id **dropped**) | P |
| order_failed | order-service.ts:151 | RPC err | order | {error_code} | P |
| order_status_changed | courier-service.ts:125 & order-service.ts:184 | RPC ok transition | order/orderId | {status} | P |
| order_completed | same ternary | status delivered | order | — | P |

### ad
| Event | Producer | Trigger | Status |
|---|---|---|---|
| ad_impression | AdContactBanner.tsx:185 (≥0.6 visibility 1s, dedupe) | visible | P |
| ad_click | AdContactBanner:229, ad-adapters external:86/92, internal:119, phone:112/126, whatsapp:91 | click | P (7 sites; dup risk phone/wa CTA also emits ad_contact) |
| ad_contact | AdContactBanner.tsx:372 | contact btn | P |

### game (reaction-light)
| Event | Producer | Trigger | entity | Payload | Status |
|---|---|---|---|---|---|
| game_intro_view | GameIntroScreen.tsx:18, TicTacToeIntroScreen.tsx:28 | intro | — | {game} | P |
| game_start | GameScreen.tsx:244 | mount | **session**/sessionId | {game,size} | P |
| game_round_complete | GameScreen.tsx:302,383 | per round, once (hit/miss) | session | {game,round_index,hit} | P |
| game_complete | GameScreen.tsx:342 | round 7 | session | {game,outcome} | P |
| game_result_view | ResultsScreen.tsx:172 | results screen | session | {game} | P |
| game_abandon | GameScreen.tsx:265,414 | stop/unmount | session | {game,turns} | P |
| game_exit | TicTacToeScreen.tsx:251 only | TTT exit | game | {game} | P (TTT only) |
| game_pause / game_resume | — | — | — | — | **N** |

### ttt (multиplayer hook)/single-player
| Event | Producer | Trigger | Status |
|---|---|---|---|
| ttt_lobby_view | use-ttt-multiplayer.ts:166 | game created | P |
| ttt_game_create | use-ttt-multiplayer.ts:165 | create | P |
| ttt_invite_generate | use-ttt-multiplayer.ts:168 | generate | P |
| ttt_invite_share | TttMultiplayerScreen:170,176 | copy/web-share | P |
| ttt_invite_open | TttInviteLandingScreen.tsx:41 | invite page | P |
| ttt_join_attempt/success/failed | hook :190/:208/:215 | join | P |
| ttt_game_ready | hook :209/:298 | ready both sides | P |
| ttt_move_submit/accepted/rejected | hook :223/:239/:241 | moves | P |
| ttt_game_win / draw | hook :305/:303 | result | P |
| ttt_game_exit | TttMultiplayerScreen.tsx:231 | exit | P |
| ttt_game_abandon | hook :253/:255 | abandon | P |

### auth
| Event | Producer | Trigger | Status |
|---|---|---|---|
| auth_login_success/failed | LoginScreen.tsx:55/58 | login | P |
| auth_register_success/failed | RegisterScreen.tsx:50/54 | register | P |
| auth_guest_gate_seen | LoginScreen:32, PilotCheckout:155,180 | guest gate | P |
| auth_guest_upgrade_cta | LoginScreen:50, RegisterScreen:45, PilotCheckout:188 | **(fires on guest continue, misnamed)** | P |

### system / errors
| Event | Producer | Trigger | Status |
|---|---|---|---|
| rpc_error | listing-service:393,420,444,465,480,555 | RPC failures (listing center) | P (only listing-service) |
| network_error | main.tsx:25 | offline | P |
| validation_error | listing-service.ts:338 | invalid category | P |
| ui_error | ErrorBoundary.tsx:85 | boundary catch | P |
| unhandled_error | main.tsx:14,19 | unhandlederror/rejection | P |
| permission_denied | AccessDeniedScreen.tsx:15 | access denied | P |

**No-producer (dead registry) 9 events:** app_update_detected, app_error, navigation_exit, product_variant_select, product_details_expand, product_favorite, listing_share, game_pause, game_resume.

**Production distribution (video evidence, §16):** screen_view 479 · app_open 239 · app_ready 239 · app_background 106 · app_foreground 89 · deep_link_open 70 · ad_impression 29 · game_intro_view 25 · product_impression 20 · product_view 16 · category_view 7 · order family 6 · … (full list §16).

---

## 4. Missing Event Matrix — الأحداث المهمة غير المسجلة (reverse audit)

| # | User action | Code location | Telemetry exists? | Gap |
|---|---|---|---|---|
| 1 | Marketplace entry click | HomeScreen.tsx:385 (marketplace nav) | screen_view only | No explicit entry event |
| 2 | Neighborhood select (user change) | PilotStorefrontScreen.tsx:53 (fires only first auto) | — | No event on change |
| 3 | Family select | PilotStorefrontScreen.tsx:79 (fires on neighborhood change) | — | **No family event at all** |
| 4 | Delivery zone selection | PilotCheckoutScreen.tsx:305 `<Select onChange>` | — | **Missing (no registry event)** |
| 5 | Delivery fee estimate | PilotCheckoutScreen.tsx:90-102 fetchEstimate | — | **Missing** |
| 6 | Checkout quantity change | PilotCheckoutScreen / cart | cart_quantity_change (CartContext:109) | partial (only cart, not pilot-specific) |
| 7 | Guest sign-in prompt (checkout gate) | PilotCheckoutScreen.tsx:155/180 | auth_guest_gate_seen | P but can double-fire |
| 8 | Checkout abandon / leave funnel | — | — | **Missing** (navigation_exit dead) |
| 9 | Duplicate submit guard | order-service.ts:122 (no dedupeKey) | checkout_submit ×N | duplicate risk on retries |
| 10 | Order confirmation receipt view | PilotCheckoutScreen.tsx:162-173 refreshStatus | — | **Missing** |
| 11 | Coupon / line-item / totals | cart | — | **Missing** (out of scope? note) |
| 12 | Courier availability state | courier screens | — | **Missing** |
| 13 | Courier claim/accept | courier-service.ts:115-117 (acceptOrder) | — | **Missing** |
| 14 | Courier accept failure (ORDER_UNASSIGNABLE) | PilotCourierScreen.tsx:84-86 | — | **Missing** |
| 15 | Courier invalid transition (server rejects) | PilotCourierScreen.tsx:84-86 | — | **Missing** |
| 16 | Store-ops order list / select store / expand | PilotStoreOpsScreen.tsx:62,140,175 | — | **Missing** |
| 17 | Store-ops transition failure | PilotStoreOpsScreen.tsx:91-93 | — | **Missing** |
| 18 | Admin courier approve/suspend | courier-service.ts:158-168, PilotOpsAdminScreen | — | **Missing** |
| 19 | TTT difficulty selection | TicTacToeContext.tsx:11-13 | no | **Missing** |
| 20 | TTT silent unmount abandon | TicTacToeScreen.tsx:245-254 | no (only explicit quit) | **Missing** |
| 21 | TTT multiplayer in prod | use-ttt-multiplayer (wired) | ttt_* = **0** in prod | **Not observable** |
| 22 | Opponent-abandoned status | TttMultiplayerScreen.tsx:607 | — | **Missing** |
| 23 | Reaction-light pause/resume | (no producer; only app_*) | game_pause/resume dead | **Missing** |
| 24 | Reaction-light error (audio etc.) | GameScreen silent catch{} | — | **Missing** |
| 25 | Auth transition (login/register) cross-journey marker | LoginScreen/RegisterScreen | auth_* ok | P (but no identity-marker event on session) |
| 26 | Campaign scan → challenge entry | App.tsx challenge route | — | campaign rail only; not telemetry |
| 27 | Campaign → order outcome join | — | — | **Missing** (campaign_qr_events has no order events) |
| 28 | app_error (ErrorBoundary top-level app crash) | — | dead | **Missing** |
| 29 | navigation_exit (funnel-abandon signal) | — | dead | **Missing** |

---

## 5. Event Taxonomy Audit

**Verdict: disciplined closed taxonomy (Phase T) with a legacy shadow; two naming inconsistencies.**

- Naming convention: `snake_case` `noun_action` — consistent across the closed registry; `domain` per event; each event has a closed property allowlist; version field always `1` (never bumped — unused signal).
- Session semantics: single page-load session per client — see §6.
- Duplicate/conflict cases found (do **not** unify yet, per instructions — recording):
  1. **Legacy vs new double-registration (real conflict):** legacy `analytics_events` uses `lamp_appeared ⋅ round_started ⋅ game_started ⋅ game_completed ⋅ qr_scanned ⋅ game_intro_shown ⋅ results_viewed` (visible in PROD T28); new registry uses `game_round_complete ⋅ game_start ⋅ game_complete ⋅ game_intro_view ⋅ game_result_view ⋅ deep_link_open`. Old and new coexist in code (GameScreen still emits `emitDiagnosticLog(…round_started…)` at :278 for devtools) and in the DB (frozen). **Canonical candidates:** keep the closed registry; map legacy names in a doc table only.
  2. **Same semantic, two spellings:** `game_complete` (registry) vs legacy `game_completed`; `game_start` vs `game_started`; `round_started/lamp_appeared/lamp_clicked` (legacy, per-lamp) vs `game_round_complete` (new, per-round). → canonical = registry forms.
  3. **`auth_guest_upgrade_cta` misnamed:** it fires when a guest *continues* (PilotCheckoutScreen.tsx:188) — semantically a "guest continue", not "upgrade CTA".
  4. **Error_code casing drift:** `'validation'` (RequestScreen:101) vs `'INVALID_CATEGORY'` (listing-service:338) vs `'DB'` (listing-service RPC errors) vs order-service classified codes.
  5. **Entity-type inconsistency for the same event family:** reaction-light sends `entityType:'session'` (GameScreen.tsx:246); TTT sends `entityType:'game'` (TicTacToeScreen ttt events). Segments `game_start` across two entity_types.
  6. Required vs optional fields: `session_id` required (client always sets; server errors `MISSING_SESSION`); `screen` optional and largely unused (64% null); `entity_id` optional (94% null); `context` defined but never populated (fpHash never sent).

---

## 6. Session Audit

- **App/analytics session id:** `crypto.randomUUID()` cached in module var (`client.ts:70-74`). **Per page load; not persisted**; resets on reload; **does not change on login**; older state is overwritten by buffer-drop on offline.
- **anonymous_id / visitor:** localStorage `focus_vid_v1` 32-hex hash (`intent-tracking.ts:54,67-82`) — cross-session, cross-reload visitor identity; stable on login.
- **user_id:** current auth UID per event (`client.ts:87-95`); guests (Supabase Anonymous Auth) **have a UID**, so `user_id` is non-null for 100% of production rows (PROD T3) — guest vs registered is not distinguishable from events.
- **Scientific/game session:** `sessions` rows (plugin `reaction-light` 137 completed + 27 running; PROD T21) created by `record_scientific_session`; **separate id space, no overlap with telemetry session_id (PROD T26=0)**.
- **Order journey:** no journey id; `checkout_start`/`checkout_submit`/`order_created` share the page session_id, and order events carry `entityId=orderId` only after creation — the pre-order phase has no order identity.
- **Guest→auth continuity:** `anonymous_id` constant → **joinable across the auth boundary**; `session_id` constant within the page → joinable only if no reload; after reload the visitor hash is your only stitch.
- **Orphan risk:** with reload between game/order, scientific session and order events are orphaned from the entry journey; **multiple identifiers coexist** (telemetry session_id, anonymous_id, sessions.id, order id, campaign nonce) with **no mapping table**.

---

## 7. Identity & Privacy Audit

**Contract (verified) — clean:**
- `privacy.ts` FORBIDDEN_PROPERTY_KEYS blacklist (phone/email/name/address/text/token/code/secret/…, case-insensitive) enforced client-side (`client.ts:107`) and mirrored server-side (00057 `FORBIDDEN_FIELD`).
- Property values restricted to scalar string/number/boolean/null; strings ≤120 chars server-side.
- Per-event allowlists (closed). `entity_id` is free-form text but never PII in practice (catalog/listing/order/session/visit ids observed).
- Wire/table: `telemetry_events` direct access fully closed (RLS on, 0 policies); read only via aggregate RPC returning no raw rows/ids/properties (00058:20-22).
- **No PII observed in any production event** (entity/histograms and payload samples §16). No phone numbers, addresses, free-text, or customer fields reach `record_telemetry_event`. **Do not add customer phone/address to telemetry.**
- **Findings:**
  - F1 (HIGH, identity): no guest/registered discriminator — all events carry a UID (anonymous auth); segmentation and session-funnel by auth-level needs a joined signal or an `is_guest`-style enum (careful: still must be non-PII).
  - F2 (MEDIUM): `context.fpHash` defined but never emitted; device fingerprint is only `focus_vid_v1` (device-scoped, non-PII).
  - F3 (INFO): `campaign`/`source` deliberately exiled from telemetry (PG-51..61 gate) — good privacy posture; note it in analytics design.

---

## 8. QR Attribution Audit

- Entry detection: `/c/XXXXXX` short code (path or query) → `campaign-lookup.ts:10-25` → `lookup_campaign_by_short_code` (00007+00042, `is_active` gated) → `recordScan(shortCode)` → **in-memory only** `qr-measurement.ts:36-38` (nonce+campaign; lost on reload by design).
- Persistence: `campaign_qr_events` via SECURITY DEFINER `record_campaign_qr_scan` / `record_campaign_funnel` (nonce-validated, rate-limited 1000/h·10k/d, idempotent), events `scan|game_start|game_complete|registration` (PROD T20: scan 151 · game_start 97 · game_complete 38 · registration 1).
- Funnel callers: registration `RegisterScreen.tsx:51`; game start/complete `GameScreen.tsx:240,335` (reaction-light **only**, not TTT).
- **Does attribution reach session/events?** No. `deep_link_open` carries only `mode,has_code`; campaign scans do not emit `deep_link_open` for `/c/` (App.tsx:344-345 gate). QR attribution and telemetry are **two disjoint rails**.
- **Reload/auth:** in-memory nonce lost on reload; guest→auth within same page works; no localStorage (deliberate).
- **Joining:** campaign scan → game result joinable inside `campaign_qr_events` (nonce single-use; scan→game_start→game_complete series present). Campaign → **order** outcome: **not joinable** (no order event on the campaign rail; tunnel missing).
- **Production evidence:** 70 `deep_link_open` (hash/query deep links) vs 151 campaign `scan` rows — the campaign rail is the richer signal and it is offline-visible only on dashboard.

---

## 9. Games Audit

### Reaction Light
Tracked: intro (`game_intro_view`, GameIntroScreen:18) → start (`game_start`, GameScreen:244) → **per-round** results (`game_round_complete` hit:383 / miss:302, exactly once/round) → complete (`game_complete`, :342, 7-round completion-only DB write via `record_scientific_session`) → result view (`game_result_view`, ResultsScreen:172) → abandon (`game_abandon` :265/:414, once).
- **Volume judgment (architectural):** per-lamp events are correctly **not** a DB telemetry item; the per-round contract (7 rounds, raw/corrected RT arrays persisted in `scientific_results`) is the right granularity. Do **not** add per-lamp telemetry.
- **Gaps:** `game_pause`/`game_resume` dead (pause only via `app_background`); no `game_exit` for reaction-light; silent error catch (audio); and **the gateway mismatch**: DB pins 7 rounds (00041:80-84) while the settings registry allows `game.rounds` 1–50 (`settings-api.ts:67`) — an admin could break all completions.
- **Production:** 137 completed scientific sessions, but only **1** `game_start`/`game_complete` in telemetry → telemetry start window ≠ session history; also reveals the two-store split (§6/§16).

### Tic Tac Toe (single-player, 9×9, first-to-4) — confirmed NOT wired to funnel
- Tracked: `game_intro_view` (TicTacToeIntroScreen:28) → `game_start {size:9}` (:242) → `game_complete {outcome}` (:291) → `game_result_view` (TicTacToeResultsScreen:41 — but **screen never navigated to** ⇒ effectively dead) / `game_abandon` (explicit quit :326).
- 3×3→9×9 + first-to-4: migration 00048 **does** implement 9×9 + 4-in-a-row replay (win detection 4 directions, moves 0-80, move_count 1-81, difficulty easy/medium/hard) and supersedes the frozen 3×3 00047; client `BOARD_SIZE=9, WIN_LENGTH=4` (`core/tic-tac-toe/types.ts:32-34`) matches server.
- **Gaps:** difficulty not in telemetry (only in scientific RPC); silent-unmount abandon emits **no** telemetry (TicTacToeScreen:245-254); TTT not part of QR funnel; no error telemetry; `game_result_view` dead.

### TTT Multiplayer
- Fully instrumented in hook (create/lobby/invite/join/move/win/draw/abandon/exit; 15 producers) — but **production telemetry has 0 `ttt_*` events** (PROD T15), i.e., this flow is either unexercised or failing silently. **Needs a deliberate check before claiming coverage.**

---

## 10. Marketplace / Order Telemetry Audit

Path browse → product → qty → zone → fee → submit → gate → order → delivered:

| Stage | Event | Evidence |
|---|---|---|
| browse / category / product | screen_view · category_view · product_impression · product_view | §3 |
| quantity (cart) | cart_add / cart_quantity_change | CartContext:109, ProductDetails:169 |
| **delivery zone select** | **MISSING** | PilotCheckoutScreen.tsx:305 |
| **delivery fee estimate** | **MISSING** | PilotCheckoutScreen.tsx:90-102 |
| submit / auth gate | checkout_submit / auth_guest_gate_seen | order-service:122, PilotCheckout:155/180 |
| order created / failed | order_created / order_failed | order-service:141/151 |
| lifecycle | order_status_changed / order_completed (success-only, client-emitted) | courier-service:125, order-service:184; **no server trigger** |
| track order poll | **MISSING** | PilotCheckoutScreen.tsx:162-173 |

- **Duplicate submit:** `checkout_submit` per attempt, no dedupeKey → N on retries.
- **`family_id` silently dropped:** passed in `checkout_submit`/`order_created` props (order-service:126/146) but **not in the allowlists** (`checkout_submit`=[items_count], `order_created`=[channel]) → sanitizer strips it (privacy.ts:165-167); intent never reaches the wire.
- **Guest behavior:** gated at submit (`NEEDS_AUTHENTICATION`, :155) and at UI (`:180`); continue-as-guest emits misnamed `auth_guest_upgrade_cta`(:188).
- **No abandonment signal:** leaving checkout before completion is invisible (`navigation_exit`/dedicated funnel exit dead).
- **Production order evidence (PROD T30):** checkout_start 1 · checkout_submit 1 · order_created 1 · order_completed 1 · order_status_changed 2 (confirmed sample rows valid: `items_count:3`, `channel:pilot_order`, `status:confirmed/out_for_delivery`).

---

## 11. Store Operator & Courier Audit

- **Store ops:** PilotStoreOpsScreen (list :62, store switch :140-154, detail expand :175, status transitions; failure `setError('STATUS_FAILED')` :91-93). **No telemetry** for any of it except the generic `screen_view` and the success-only `order_status_changed`.
- **Courier:** PilotCourierScreen (:44 list, :92 accept), courier-service acceptOrder (:115-117) — **no event on accept**; `ORDER_UNASSIGNABLE`/`TRANSITION_NOT_ALLOWED` swallowed into `COURIER_FAILED` (:84-86) with **no event**.
- **Admin:** PilotOpsAdminScreen (`adminSetCourierStatus` courier-service:158-168) — **zero track calls**.
- **Server asymmetry:** store `pilot_order_set_status` (00065:868) does **not** validate transitions (any state→any), while courier `pilot_courier_set_status` (00068:399-446) enforces strict `TRANSITION_NOT_ALLOWED`. Telemetry therefore records `order_status_changed` for impossible-looking store transitions on misuse; actor (store/courier) is **not recorded anywhere** in order events.
- **Architectural note:** operator/courier domain has no event-domain in the registry at all — this is the **largest measured surface with zero coverage**.

---

## 12. Database / RPC / RLS Contract Audit

**`telemetry_events`** (00057:37-54): 15 columns `id bigserial PK · event_id text UNIQUE · event_name · event_version · domain · occurred_at timestamptz DEFAULT now() · session_id NOT NULL · anonymous_id · user_id uuid · screen · entity_type · entity_id · properties jsonb · context jsonb · dedupe_key`. Indexes: 7 (event_name, domain, session, user, entity composite + unique event_id + partial-unique `(session_id, dedupe_key)`). **RLS enabled, 0 policies; table grants only postgres + service_role** (PROD T8/T9) — direct insert/read impossible for clients (`REVOKE ALL`).
**`record_telemetry_event(jsonb)`** (00057/00061/00067): plpgsql, `SECURITY DEFINER`, `SET search_path=''` (PROD T6/T12 confirmed), grants anon+authenticated (PROD T7). Validation: batch array ≤50; event→domain allowlist (97 final); `session_id` required; `anonymous_id` regex `[0-9a-f]{32}`; forbidden-key block; per-event property allowlist; scalar-only values; string ≤120; `context` validated; insert idempotent via unique keys (replay/dedupe → silent no-op). Body stores client `occurred_at` parsed to microsecond ISO.
**`get_telemetry_analytics(...)`** (00058/00061/00067): 6 filters `(date_from,date_to,domain,event,game,entity_id)`, STABLE, SECURITY DEFINER, search_path='' (PROD T6); role-gate via `public.users.role ∈ admin|super_admin|researcher`; returns **aggregates only** (totals/unique sessions·visitors·users, events_by_event, events_by_domain, daily, top_entities 50, funnels for category/product/listing/cart/request/game/ad/system — **no funnels for app/navigation/ttt/auth/neighborhood/order**). Grants: authenticated only; **anon revoked** (00062, PROD T7 anon=false).
**Other write RPCs:** `record_scientific_session` elliptic history (00041→00044 overload bug→00045→00046 final 6-param, fingerprint inside JSONB, sessions.device_id NULL); `record_tic_tac_toe_session` (00047 3×3 → **00048 9×9 creates over**); TTT multiplayer RPCs (00049); `record_phone_search`/`record_search_selection` (00030/00032, search_path=`public` — **legacy, unhardened**); QR RPCs (qr-measurement set).
**Contradictions in-tree:** 00045 vs 00046 (fingerprint FK 23503 fiasco converges on 00046); 00047 vs 00048 (both files coexist, runtime = 00048); 00008 documents `sessions`/`analytics_events` as **baseline** (not created by migrations) → a fresh `supabase db reset` would not rebuild them (`users.id` text vs uuid drift noted).
**Baseline reproducibility risk:** `sessions`, `analytics_events`, `campaigns`, `qr_codes`, `devices`, `placements` are baseline-only; `campaign_qr_events` + its RPCs live in the **owner-applied** `supabase/qr-measurement/` set (not migration-tracked).

---

## 13. Security Model Audit

| Question | Answer (evidence) |
|---|---|
| Who can INSERT telemetry? | **Only** via `record_telemetry_event` (anon+authenticated EXECUTE, PROD T7; direct table closed, T8/T9). |
| Who can READ? | Only `get_telemetry_analytics` (authenticated, role-gated admin/super_admin/researcher; anon=no, PROD T7) + `pilot_admin_pilot_health()` counts. Raw table closed. |
| Is anon insert intentional? | Yes — Anonymous Auth guarantees a UID; `UNAUTHENTICATED` if none (00057:119-121, 412-415). Do not remove. |
| Can client send arbitrary event names? | **No** — closed allowlist (client + server). |
| Payload validation? | Yes — allowlist, forbidden keys, scalar-only, length caps, context checks (server). |
| Can telemetry be forged/spoofed? | event name/domain/props: no; **entity_type & screen: yes** (free text, client-only validation) → analytics `top_entities` trusts untrusted strings. `anonymous_id` format-gated; `user_id` server-derived; `occurred_at` client-supplied (spoofable timestamps). |
| Privilege escalation risk? | Low — RPC returns void, no `IS_ADMIN` branches; read-RPC role-gated. **One weakening:** 00074 added `sessions` own-row ALL policies and `analytics_events` own-row INSERT/SELECT → **direct client writes bypass the strict scientific-session validators** (00041/00047's "RPC-only" claims). Own-row only, low cross-user risk, still a contract divergence. |
| SECURITY DEFINER / search_path? | telemetry RPCs both `SECURITY DEFINER` + `SET search_path=''` (00057/00058/00061/00067; PROD T12). Comparisons: `record_phone_search`/QR RPCs still `search_path = public` (legacy, LOW). |

---

## 14. Reliability & Performance Audit

**Reliability (client.ts):**
- `track()` is fire-and-forget, never throws (client.ts:142-144); business actions never blocked by telemetry.
- Batching: runtime-configurable `max_batch=10 / flush_ms=5000 / max_buffer=50` (settings 00060). Flush on: batch full, 5s timer, `pagehide`.
- **Offline → whole buffer dropped** (client.ts:172-177); **RPC failure → batch dropped, no retry** (client.ts:187-191); buffer overflow → oldest dropped (client.ts:150-155). **No queue/persistence, no telemetry-level `rpc_error`.**
- Ordering: FIFO within a batch; not guaranteed across flushes; timestamps client-side.
- Idempotency: unique `event_id` + `(session_id,dedupe_key)` partial-unique (PROD T10) → duplicates collapse (PROD T17: 53 events use dedupe_key, 19 distinct).
- Timing risk: `track()` `await`s `auth.getUser()` per event (client.ts:126) — fine at this volume, wasteful.

**Volume (PROD):** 1,419 events in ~2.5 days; peak ~759/day; per-session median low (max 91 events/session, PROD T25). ~50–80 KB/day — **trivially small** for PG; no batching concern. High-rate risks: none observed; per-lamp game events are (correctly) not sent. **No retention/cleanup** for telemetry_events (PROD growth unbounded in theory; still tiny).

---

## 15. Analytics Audit

- **Raw vs aggregated is cleanly separated:** raw = `telemetry_events` (write-only, closed); analysis = `get_telemetry_analytics` (aggregate-only jsonb, never raw rows/ids/properties; 00058:20-22) consumed only by `telemetry-api.ts` → `TelemetryAnalyticsBI.tsx`. `CommerceIntelligenceBI` reads ONLY `get_campaign_qr_metrics` (client-side sum of `event_type='scan'`). 
- `pilot_admin_pilot_health()` (00068:550-588) is a second, honest aggregate read (event counts) for the pilot health screen.
- Filters: date_from/to, domain, event, game, entity_id (validated `INVALID_FILTER`; inverted → `INVALID_DATE_RANGE`).
- Gaps: **no funnel blocks** for app/navigation/ttt/auth/neighborhood/order (their events appear only in totals/events_by_*); TTT and order analytics can't be drilled down; no time-on-screen, no funnel drop-off computation, no session-path cohort view — **session/attribution analytics is the big missing layer**. Legacy `analytics_events` (10,463 rows) is not reconciled into the analytics UI.

---

## 16. Test Coverage & Quality Gates (run today)

**Tests run:** `vitest run` → **3502 passed / 281 files** · `tsc --noEmit` → **0 errors** · `npm run build` → **OK** (4.39 s) · `npm run lint` → **not clean (7 errors + 8124 warnings)** — all pre-existing (design-system warnings; 7 errors in pre-existing test/ai files: `t3-1-category-wiring.test.tsx:33`, `t4-3-phase8-game-auth.test.ts:135-136`, `core/tic-tac-toe/ai.test.ts:6-7,100,123`). Telemetry suite is disciplined and asserted: `telemetry/client.test.ts`, `telemetry/event-schema.test.ts` (97 registry), `telemetry/event-validation.test.ts`, `telemetry/privacy.test.ts`, `telemetry/privacy-regression-gate.test.ts` (RPC-only + forbidden keys), `telemetry/analytics-migration-gate.test.ts`, `telemetry/migration.test.ts` (server-side allowlist sync), wiring suites `t3-1…t4-7d` (categories, cart/request, TTT single, phase8, phase9, phase10a, listing edit, app lifecycle, ads, network), `analytics-api/ui`, `pilot-*` (order telemetry mocked), `qr/*`, `privacy/p5-telemetry-qr-removal-gate.test.ts`, `navigation/exit-telemetry.test.tsx`. No tests were modified.

## 16. Production Evidence (read-only, 2026-09-06)

All queries wrapped in `BEGIN READ ONLY; … ROLLBACK;`. Key results (project DB, schema `public`):

| # | Query result |
|---|---|
| T1 | telemetry_events rows=1419, latest=2026-09-06T00:15Z, earliest=2026-09-04T02:37Z |
| T3 | total=1419, **with_user=1419, without_user=0**, anonid_notnull=1419 |
| T2/T18 | top events: screen_view 479 · app_open 239 · app_ready 239 · app_background 106 · app_foreground 89 · deep_link_open 70 · ad_impression 29 · game_intro_view 25 · product_impression 20 · product_view 16 … ; daily 605 / 759 / 55 |
| T6/T7 | `record_telemetry_event(jsonb)` secdef+search_path='' · grants anon=yes,auth=yes; `get_telemetry_analytics(...)` secdef+search_path='' · grants anon=**no**,auth=yes |
| T8/T9 | telemetry_events grants: postgres+service_role only; rls=true policies=0 |
| T10 | 8 indexes incl. unique event_id + partial-unique (session_id,dedupe_key) |
| T15 | game_*=28, **ttt_*=0**, order/checkout=6, neighborhood=18, deep_link=70, screen_view=479 |
| T17 | with_dedupe=53, distinct=19, null_event_id=0 |
| T19/T24 | screen_null=910/1419 (64%), entity_null=1330/1419 (94%); **0** entity_type values outside closed union |
| T20 | campaign_qr_events=287: scan 151 · game_start 97 · game_complete 38 · registration 1 |
| T21 | sessions: reaction-light completed 137 + running 27 (no ttt plugin rows) |
| T22 | analytics_events=10463, latest=2026-08-13 (frozen legacy) |
| T25/T26/T27 | distinct telemetry sessions=96; **overlap telemetry.session_id↔sessions.id = 0**; analytics_events↔sessions overlap=0 |
| T28 | legacy event_type top: repair_requested 2155 · inspection_started 1618 · quote_sent 1387 · quote_approved 1155 · courier_assigned 515 · lamp_appeared 264 · lamp_clicked 221 · game_started 43 … |
| T30/T31 | order_created{channel:pilot_order} · checkout_start{items_count:3,with_delivery:true} · order_status_changed{status:confirmed} / {status:out_for_delivery} · order_completed{} |

---

## 17. Findings (ranked)

### HIGH
- **H1 — No journey joinability between telemetry and authoritative sessions/orders.** `session_id` (page UUID) has **0 overlap** with `sessions.id`; scientific perf & game results and order flows live on a separate rail. Impact: core objective ("دقة رحلة المستخدم") unachievable for game/order continuity. **Evidence:** client.ts:70-74; PROD T26=0, T25=96 distinct page sessions. **Direction:** introduce a stable journey/visit identity bound to `anonymous_id` + `sessions`/orders link (future wave); do not fragment further.
- **H2 — Guest vs registered indistinguishable.** `user_id` non-null on 100% of rows (Anonymous Auth). Impact: cannot segment guest vs member funnels or retention. **Evidence:** client.ts:87-95; 00057:412-415; PROD T3. **Direction:** an explicit, non-PII auth-state enum (guest/anonymous/registered) recorded server-side.
- **H3 — Operator/courier workflow entirely unmeasured.** Courier claim/accept, transitions & failures, store-ops list/select/transition failures, admin courier actions — zero events. Impact: store/courier architecture is "صحة النظام" blind. **Evidence:** courier-service.ts:115-117; PilotCourierScreen.tsx:84-92; PilotStoreOpsScreen.tsx:62-175; PilotOpsAdminScreen. **Direction:** new `operator`/`courier` domain events + accepted/rejected-outcome pairs; no permissions changes.
- **H4 — Campaign→order attribution impossible.** Campaign rail (`campaign_qr_events`, 287 rows) never joins telemetry or orders; `deep_link_open` has no campaign key (/c/ path excluded by design). Impact: no source→purchase conversion. **Evidence:** qr-measurement.ts:36-38; App.tsx:344-345; PROD T20 vs T2. **Direction:** attribute join layer (mapping campaign nonce↔journey) that respects the P5 privacy gate.
- **H5 — Client-side telemetry loss is silent and total.** Offline buffer drop, no retry, no `rpc_error` for telemetry's own RPC. Impact: under-counted journeys, silent gaps in national/international planning. **Evidence:** client.ts:172-177, 187-191. **Direction:** bounded retry/queue + server-side heartbeat; keep fire-and-forget UX contract.

### MEDIUM
- **M1 — `family_id` (and delivery intent) silently dropped:** not in allowlists → sanitizer strips; checkout ancestry lost. Evidence: order-service.ts:126,146 vs events.ts:84-89. 
- **M2 — Server-side `entity_type` (and `screen`) unvalidated free text:** forgeable segmentation; `top_entities` trusts it. Evidence: 00057 (no entity_type check) vs types.ts:33-47. 
- **M3 — Dead registry entries (9):** `app_error`, `app_update_detected`, `navigation_exit`, `product_variant_select`, `product_details_expand`, `product_favorite`, `listing_share`, `game_pause`, `game_resume` — defined, never emitted. 
- **M4 — Checkout funnel missing critical stops:** zone select, fee estimate, order confirmation view, funnel-abandon (`navigation_exit` dead), duplicate-submit. Evidence: PilotCheckoutScreen.tsx:90-102,305; RequestScreen.tsx:163; order-service.ts:122. 
- **M5 — Store-ops server transition not validated (00065:868) while courier is (00068):** impossible status paths can reach analytics; no actor dimension. 
- **M6 — TTT silent-unmount abandon untracked & `game_result_view` dead:** TicTacToeScreen.tsx:245-254; TicTacToeResultsScreen never navigated to (App.tsx:135). 
- **M7 — Legacy `analytics_events` (10,463 rows) unreconciled with the new contract** (different taxonomy/session ids; frozen 2026-08-13). Risk: analytics continuity confusion. 
- **M8 — 00074 own-row write policies on `sessions`/`analytics_events` bypass the strict RPC validators.** Risk: integrity divergence (own-row only). 
- **M9 — Volume spikes absent any rate protection** for telemetry (unbounded client batching; only caps = buffer). Not urgent (PROD 759/day) but a plan for a game-launch blast.

### LOW
- L1 `error_code` casing drift (`validation` vs `INVALID_CATEGORY` vs `DB`); L2 `auth_guest_upgrade_cta` misnamed; L3 event_version always 1 (unused); L4 `ttt_game_abandon` fires even on RPC-failure branch; L5 `record_phone_search` still `search_path=public`; L6 `deep_link_open` cannot distinguish QR from hash deep links; L7 no retention policy for telemetry_events; L8 `game.rounds` setting (1-50) vs DB 7-round pin.

### INFO
- Closed registry 97/97 synced client+server; privacy blacklist double-gated client+server; idempotent insert proven (0 dup event_id); search_path hardened on telemetry RPCs; anon read of analytics revoked (00062); BI consumes only aggregates; 0 PII observed; 0 entity_type misuse in prod; volume trivial (<1k/day) with 8 indexes.

---

## 18. Proposed Future Architecture (proposal only — NOT implemented)

1. **Unified Journey Identity:** a single server-assigned `journey_id` seeded on first app contact (per `anonymous_id`), bound to page `session_id`, scientific `sessions.id`, `order.id`, and campaign `nonce` in a mapping table — while keeping `anonymous_id`/`session_id` columns for compatibility. Fields remain non-PII; guest/member split via server-side auth-state enum.
2. **Closed Registry ×2**: (a) keep v1 `telemetry_events` as the immutable wire contract; (b) **derived, aggregated** analytics layer (separate tables/views) fed by a deterministic consumer — never let BI touch raw rows.
3. **Canonical funnel events**: single `funnel_*` vocabulary (abandon/leave with step), `quantity_*`, `delivery_zone/fee_*`, `courier_claim_*`, `order_attempt/outcome` with results, each with entity ids and dedupe keys.
4. **Server-side truth for actor/status**: emit `order_status_changed` and operator/courier events from the transition functions (00065/00068), not client-side post-success.
5. **Resilience**: bounded offline queue + single retry, telemetry-level failure counters, and a small daily aggregation job (retention TTL for raw).
6. **Privacy contract unchanged**; campaign attribution continues via the separate non-PII rail, now with a journey-join index.

## 19. Recommended Implementation Waves (proposal — pending decision)

- **Wave A — Canonical Event Contract:** registry extensions + server allowlists for funnel/operator/courier/order-attempt events; validate `entity_type` server-side; fix `family_id`/allowlists; remove dead registry entries or wire them.
- **Wave B — Identity/Journey normalization:** `journey_id` + mapping table + auth-state enum; sink page `session_id` into it.
- **Wave C — Core navigation/product telemetry:** entry/abandon (`navigation_exit`), screen context propagation, entity-id propagation on category/product/impression funnels, delivery zone/fee events.
- **Wave D — Games telemetry:** wire TTT difficulty/unmount-abandon, QR funnel inclusion for TTT, pause/resume, error events; **before that, diagnose why prod `ttt_*`=0**.
- **Wave E — Marketplace/Pilot telemetry:** server-side transition events (order/state) + actor dimension + courier/store/admin event domains + QR→order attribution join.
- **Wave F — Reliability/QA:** offline queue/retry, dedupe hardening for retry events, rate limits & retention, tests for every new event against the closed contract (mirror 00057 gates).
- **Wave G — Admin analytics/control:** funnels for ttt/navigation/order/auth/neighborhood; session-path cohort view; legacy `analytics_events` reconciliation/migration.

---

## 20. Final Verdict

```
PASS WITH GAPS
```

**Reason:** The existing telemetry contract is defensible, closed, privacy-safe, security-hardened, fully tested (3502/3502, tsc 0, build ok), and live with credible production volume. However, the primary objective — an accurate, joinable **user journey** (auth-level, session boundaries, category/product/order, QR attribution, games, operator/courier) — is **not yet achievable**: the journey is fragmented across disjoint identity rails (H1, H2), the largest operational surfaces (operator/courier/admin) are unmeasured (H3), funnel attribution stops before outcomes (H4), and client-side delivery silently loses coverage (H5). No intervention was made; production was read-only.

*No migrations, no RPCs, no RBAC/RLS/P3/order-lifecycle/privacy-contract changes, no commits — per mandate.* Working tree untouched apart from this audit artifact.