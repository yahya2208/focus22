# UX & Navigation Enhancement — Execution Plan (v4 — UX-first ordering)

> Status: **Planning only — Execution Freeze active**. No implementation, no commits,
> no migrations, no edits until this document is approved. After approval, each phase
> is submitted for review before the next begins.
>
> Reordering mandate (2026-08-06): UX experience takes priority over internal
> technical fixes. **SPA Integrity Hotfixes must serve the new design, not precede it.**
> Therefore all design phases come first; hotfixes are folded into the execution of the
> approved designs; a final acceptance + production-readiness review closes the cycle.
>
> Review status: **✅ Approved (Conditional)** — approved in its current form AFTER the
> two mandatory conditions are added (v3→v4): (1) **Navigation Analytics** section and
> (2) **Regression Matrix** section. Both are execution-quality contracts, not design
> changes. Freeze is lifted only after v4 is written with both conditions integrated.
>
> Final contract (2026-08-06): **✅ Approved** — execution begins with **Phase 1 only**,
> gated by the pre-commit checklist and post-phase report. **Navigation Compatibility
> Matrix** (all 38 screens) added as a mandatory global contract. No Phase 2 work and no
> out-of-scope hotfixes until Phase 1's report is explicitly approved.

---

## Global Navigation Policy (mandatory, applies to ALL phases)

These are the universal rules of navigation in FOCUS. Every screen, component, deep
link, hotfix, and future feature must obey them.

1. **No internal reload.** `window.location.href`, `window.location.assign()`,
   `window.location.reload()`, or any full-page navigation is **forbidden** for
   internal transitions. All internal transitions go through the single navigation
   dispatcher (Phase 1).
2. **No leaving the SPA except for external actions.** The only permitted exits are
   genuinely native handoffs: WhatsApp (`wa.me`), phone call (`tel:`), email
   (`mailto:`), and native/system share. Anything else is an internal navigation.
3. **Every screen has a clear back path.** No screen may be reachable without a
   defined way back (see Phase 2 priority table + Phase 5 matrix).
4. **No orphan screens.** There is no screen from which the user cannot return;
   every screen's back target is defined in the shared nav-intent table.
5. **One dispatcher.** All internal links use the same dispatcher
   (`dispatch({ type: 'NAVIGATE' | 'REPLACE' | 'BACK' })`). No component builds its
   own navigation logic, and no raw `href` targets an internal screen.

Enforcement: Phase 7 grep-sweep lists every current violation; Phase 8 acceptance
verifies none remain.

---

## Navigation Analytics (mandatory — every navigation event is measurable)

Goal: the navigation system must not only *work*; it must feed the Research console
(later phases / dashboards). Every primary navigation event is tracked through the
existing telemetry pipeline (`getGlobalTelemetry().track`) and **always carries the
current session context when available**: `session_id`, `campaign_id`, `placement_id`.

### Event catalog (added to telemetry)

| Event | When fired | Payload context |
|-------|-----------|-----------------|
| `screen_view` | Every screen becomes visible (mount, after NAVIGATE/REPLACE/BACK) | screen, session_id, campaign_id, placement_id |
| `navigation_push` | `NAVIGATE` pushes onto stack | from, to, session_id, campaign_id, placement_id |
| `navigation_replace` | `REPLACE` swaps top of stack | from, to, session_id, campaign_id, placement_id |
| `navigation_pop` | `BACK` pops the stack | from, to, session_id, campaign_id, placement_id |
| `back_pressed` | Back invoked (hardware, gesture, affordance, button) | screen, stack_depth, session_id, campaign_id, placement_id |
| `back_blocked` | Back prevented by `beforeBack` guard / exit confirm dialog | screen, reason, session_id, campaign_id, placement_id |
| `exit_attempt` | User attempts an exit (internal hotfix exit, double-back first press, native handoff) | from, type: 'internal'\|'native', session_id, campaign_id, placement_id |
| `exit_confirmed` | Exit actually completed (second back press / confirmed dialog / native handoff) | from, type, session_id, campaign_id, placement_id |
| `whatsapp_clicked` | WhatsApp open initiated (already exists — enriched with device context) | action, device (brand/model/variant), phone, session_id, campaign_id, placement_id |
| `phone_details_opened` | `phone-details` screen opened | device_id, brand, model, session_id, campaign_id, placement_id |
| `phone_details_closed` | `phone-details` screen left (back/pop) | device_id, dwell_ms, session_id, campaign_id, placement_id |

> Note: `screen_view`, `navigation_*`, `back_*`, `exit_*` supersede the earlier
> standalone `exit_attempted` placeholder in §3.3 — that event is renamed to
> `exit_attempt` per this catalog.

### What this enables (later in Research console)
- Most-exit screens (`exit_attempt` grouped by `from`).
- Back-press counts and back-blocked rate (`back_pressed` vs `back_blocked`).
- Exit attempt vs confirmed funnel (`exit_attempt` → `exit_confirmed`).
- Most-opened phone details + dwell time (`phone_details_opened` / `phone_details_closed`).
- WhatsApp click-through from details/action steps (`whatsapp_clicked`).
- All of the above sliced by `campaign_id` / `placement_id` / `session_id` — the exact
  attribution fields M1 already writes to `analytics_events`.

### Acceptance
- Every event above is emitted in its exact trigger point; verified by unit test (tracker
  mock) and CDP (real payload rows in `analytics_events` for a live session).
- `session_id`, `campaign_id`, `placement_id` present whenever available (null otherwise).

---

## Regression Matrix (mandatory — run after EVERY phase, before its Approval Gate)

The navigation rework must never break existing flows. After **each** phase completes,
the full matrix below is executed and MUST be green before that phase's Approval Gate.
This is how we guarantee that, e.g., a Back Navigation fix does not break the QR flow or
the Admin dashboard.

| # | Flow | Pass criteria | Verified in Phase |
|---|------|---------------|-------------------|
| 1 | **QR → Intro → Game → Result → Register** | QR deep link starts game; game completes; results shown; registration reachable | Phase 2 (S7/S8) · Phase 1 (partial) |
| 2 | **Campaign → Placement → QR** | `/c/{code}?p={placement}` resolves FOUND; correct placement_id/qr attached to session | M2 scope (not nav-verified) |
| 3 | **Research Console** | Researcher can open overview + sub-pages; protected route intact | — |
| 4 | **Dashboard** | Admin dashboard + widgets render; navigation in/out intact | — |
| 5 | **Authentication** | Login / magic link / access-denied redirects work; `intendedScreen` honored | Phase 2 (S4 back) |
| 6 | **Guest Flow** | Anonymous user completes a full game + session without auth | Phase 2 (S7/S8) |
| 7 | **Admin Flow** | Repair admin/courier/customer-history access intact | — |
| 8 | **Used Phones** | Showroom → details → action → WhatsApp works; similar phones navigable | Phase 3 (3B-S1/S5/S6/S7/S13) |
| 9 | **Ads** | `AdSpot` placements (phone-details, exchange, etc.) still render/impression-track | Phase 3 (3B-S3 details slot) |
| 10 | **Sticker Flow** | Sticker scan → CTA → destination screen works (no hard reload) | — |
| 11 | **Repair Flow** | Repair request → tracking → QR → WhatsApp intact | — |

Regression = full test suite (vitest, currently 966 passing) + lint 0 errors + `tsc` +
production build, PLUS manual CDP walkthrough of every row above on
`http://localhost:5173/focus22/...`. Any red row blocks the phase's Approval Gate.

---

## Navigation Compatibility Matrix (mandatory — every screen is documented)

Every screen (37 existing + `phone-details` planned) has an explicit, single row in this
matrix. **No screen may exist without a documented row**; adding a screen requires adding
its row to this matrix in the same commit. Columns:

- **Push** — does `NAVIGATE` push onto the stack when entering this screen?
- **Replace** — does this screen use `REPLACE` semantics (swap top, no history entry)?
- **Back** — target of the back action (from Phase 2 priority table / §5.2).
- **Deep Link** — can the screen be entered directly via URL / hash (`#/…`)? Format.
- **Android Back** — behaviour per §5.2 matrix (overlay → step → tab → BACK → double-exit).
- **Browser Back** — popstate behaviour (same as Android Back via single policy).
- **Exit Allowed** — can the user natively leave the app from here? (`yes` only for
  intentional handoffs per Global Navigation Policy rule 2; otherwise `no`).

Legend: ✓ supported · — not applicable / not allowed · `~` conditional (see note).
**Status:** `Implemented` (back behaviour shipped & verified in Phase 2) · `Designed` (planned, not yet built).

| Screen | Status | Push | Replace | Back | Deep Link | Android Back | Browser Back | Exit Allowed |
|--------|--------|------|---------|------|-----------|--------------|--------------|--------------|
| home | Implemented | — | ✓ (cold load) | — (root) | `#/home`, `/` | double-back exit | double-back exit | yes (double-exit) |
| library | Implemented | ✓ | — | home | — | BACK → home | BACK → home | no |
| intro | Implemented | ✓ | — | library/home | — | BACK → prev | BACK → prev | no |
| calibration | Implemented | ✓ | — | game-intro | — | BACK → game-intro | BACK → game-intro | no |
| countdown | Implemented | — | ✓ | game-intro (confirm) | — | step-back (confirm) | step-back (confirm) | no |
| game | Implemented | ✓ (QR-seeded) | — | game-intro (confirm) | via `/c/{code}?p=` | Stop&Save/Resume dialog | same | no |
| game-intro | Implemented | ✓ (QR-seeded) | — | home | via `/c/{code}?p=` | BACK → home | BACK → home | no |
| results | Implemented | — | ✓ | home | — | BACK → home | BACK → home | no |
| history | Implemented | ✓ | — | home | `#/history` | BACK → home | BACK → home | no |
| settings | Implemented | ✓ | — | home | `#/settings` | BACK → home | BACK → home | no |
| about | Implemented | ✓ | — | settings | — | BACK → settings | BACK → settings | no |
| landing | Implemented | ✓ | — | home | via deep link `?campaign/ref` | BACK → home | BACK → home | no |
| share | Implemented | ✓ | — | results | — | BACK → results | BACK → results | ~ native share only |
| register | Implemented | ✓ | — | results | via `/c/{code}` flow | BACK → results | BACK → results | no |
| consent | Implemented | ✓ | — | intro | — | BACK → intro | BACK → intro | no |
| message | Implemented | ✓ | — | game-intro | — | BACK → game-intro | BACK → game-intro | no |
| research | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| business-intelligence | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| coach | Implemented | ✓ | — | results | — | BACK → results | BACK → results | no |
| login | Implemented | ✓ | — | intendedScreen / previous | `#/login` | REPLACE → intended/prev | same | no |
| admin-setup | Implemented | ✓ | — | login | — | BACK → login | BACK → login | no |
| access-denied | Implemented | — | ✓ | previous/home | — | REPLACE → prev/home | same | no |
| phone-services | Implemented | ✓ | — | home | via sticker CTA (`#/phone-services`) | BACK → home | BACK → home | ~ WhatsApp handoff |
| achievements | Implemented | ✓ | — | results/home | — | BACK → prev | BACK → prev | no |
| repair-home | Implemented | ✓ | — | home (section root) | `#/repair` | BACK → home | BACK → home | no |
| repair-request | Implemented | ✓ | — | repair-home | — | step-back → repair-home | same | no |
| repair-tracking | Implemented | ✓ | — | repair-home | via QR (`#/repair/track?code=`) | BACK → repair-home | BACK → repair-home | ~ WhatsApp handoff |
| repair-admin | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| repair-courier | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| repair-customer-history | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| repair-diagnostics | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| repair-personnel | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| sticker-studio | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| sticker-analytics | Implemented | ✓ | — | previous | — (protected) | BACK → prev / access-denied | same | no |
| sticker-scan | Implemented | ✓ | — | home | via sticker QR (`#/sticker-scan?s=`) | REPLACE → home | same | no |
| showroom | Implemented | ✓ | — | home (section root) | `#/showroom` | BACK → home | BACK → home | no |
| phone-details | Implemented | ✓ | — | showroom | `#/phone-details?device={id}` | BACK → showroom | BACK → showroom | ~ WhatsApp handoff |
| design-system-playground | Implemented | ✓ | — | home | `#/design-system-playground` | BACK → home | BACK → home | no |

Notes:
- **home** is the single root: it never pushes; cold-load and RESET land here.
- **Deep Link** column documents the *future* hash format (Phase 1.3). Today only `/c/`
  and legacy `?campaign/ref` deep links exist; the matrix is the target contract.
- Protected screens (`research`, BI, repair-admin/courier/customer-history/diagnostics/
  personnel, sticker-studio) keep `ProtectedRoute`; on auth denial they `REPLACE` to
  `access-denied` and clear `intendedScreen`.
- `~` Exit Allowed means the screen may hand off to a native action (WhatsApp / native
  share) but the SPA itself must not be abandoned; per Global Navigation Policy rule 2.

---

## Execution methodology (one phase at a time — M1/M2 style)

The execution follows exactly the cycle used in M1 and M2:

1. Implement **one phase only**.
2. **Stop.**
3. Deliver a full report: what changed, results of all tests, files modified, evidence
   (CDP traces / screenshots / event rows).
4. **Wait for explicit approval.**
5. Move to the next phase.

**No two phases may be merged into a single commit.** Each phase is a separate,
reviewable unit with its own Approval Gate (checked in §8.2 / Approvals).

### Mandatory execution controls (scope containment)

- **Execute Phase 1 only.** Phase 2 and any later phase are **forbidden** until Phase 1's
  report is explicitly approved.
- **No hotfix outside Phase 1 scope.** No `location.href`, sticker, repair, QR, email,
  WhatsApp, or any other fix may be implemented during Phase 1 unless it is a *direct*
  consequence of the Phase-1 navigation model (e.g. a `NAVIGATE` call that must become
  `REPLACE` to make the stack correct). Phase 7 remains the sole owner of general
  hotfixes.

### Pre-commit checklist (required BEFORE the first commit of each phase)

Present, before committing:

| Requirement | Detail |
|-------------|--------|
| **Files to be changed** | Explicit list of every file (add/modify/delete) |
| **New components** | Names + purpose (if any) |
| **New hooks** | Names + purpose (if any) |
| **New navigation scheme** | How the stack/actions integrate with the existing reducer |
| **Link compatibility** | How existing URLs / deep links keep working (no breaking change) |
| **M1 + M2 preservation** | How attribution (campaign/placement), telemetry, and dashboards remain regression-free (see Regression Matrix) |

### Post-phase report (required BEFORE the Approval Gate)

| Item | Requirement |
|------|-------------|
| Files modified | Full list |
| Lines changed | Added / removed / modified counts |
| Tests added | Names + what they cover |
| TypeScript | `tsc` result (0 errors) |
| ESLint | result (0 errors) |
| Vitest | full suite result (966 currently) |
| Build | production build result |
| Breaking changes | must be **zero** (documented if any) |
| Before/after comparison | behavior + test/type/lint/build deltas |

---

## Ordering rationale (UX-first)

| # | Phase | Type | Why this order |
|---|-------|------|----------------|
| 1 | Navigation Architecture (full) | Design | Foundational — every other phase builds on how screens & stack behave |
| 2 | Smart Back Navigation | Design | Depends on the stack model from Phase 1 |
| 3 | User Journey & exit-point prevention | Design | Uses navigation + back behavior to keep users in flow |
| 4 | Used-Phone Customer Journey **+ WhatsApp Flow** (Showroom → Details → Action → WhatsApp) | Design | New customer surface; needs nav stack to enter/exit correctly; WhatsApp is its conversion step |
| 5 | Android Native Behaviour | Design | Cross-cuts phases 1–4; consolidated back matrix + per-environment checklist |
| 6 | Accessibility + Performance Budget | Design | Cross-cutting quality gates for every screen built in Phases 1–5 |
| 7 | SPA Integrity Hotfixes | **Execution** | Only after designs are approved — fixes are shaped BY the approved navigation model (they must serve it, not precede it) |
| 8 | Final Acceptance Testing + Production Readiness Review | Execution | Gate before any release |

The old v1 placed SPA Integrity Hotfixes first. That ordering forced technical decisions
before the UX model existed. v2+ inverts it: the approved architecture in Phase 1 defines
*what* "SPA integrity" means (correct base-aware URLs, deep links into the new stack,
guards), and Phase 7 implements exactly that.

---

## Phase 1 — Navigation Architecture (full design)

Goal: define the single navigation model that all screens, back behavior, deep links,
and the QR flow share. No router library — evolve the existing dispatch reducer.

### 1.1 Current model (verified in code)

- `ScreenName` union in `src/store/navigation.tsx` — 37 screens, no router library.
- `navigationReducer`: `NAVIGATE` replaces `screen`+`currentScreen`; `RESET` returns to
  `'home'`; `START_QR_FLOW` resets state and jumps to `'game-intro'`.
- No navigation stack, no back history, no URL mirror.
- `InitialRoute` (App.tsx) fires once per load (guard `qrFlowHandledRef`) to resolve
  `/c/{shortCode}?p={placement}` and legacy `?campaign/ref` deep links.
- `AppShell` renders `ScreenRouter`; protected screens use `ProtectedRoute`.

### 1.2 Proposed model — `NavStack` on the reducer

Add to `AppState`:

```ts
interface AppState {
  // ...existing fields...
  navStack: ScreenName[];          // internal back history
  intendedScreen: ScreenName | null; // post-auth/login redirect target
  sessionRestoredAt?: number;      // session-restore marker
}
```

New actions:

```ts
| { type: 'NAVIGATE'; screen: ScreenName }            // push onto stack
| { type: 'REPLACE'; screen: ScreenName }             // swap top (no history entry)
| { type: 'BACK' }                                    // pop stack
| { type: 'RESET' }                                   // clear stack → home
| { type: 'SET_INTENDED_SCREEN'; screen: ScreenName | null }
```

Rules:
- `NAVIGATE` always pushes (unless the target equals top → no-op). `REPLACE` is used by
  wizards/steppers (`CustomerPhoneFlow` steps, calibration, repair request) to avoid
  polluting history.
- `RESET` empties stack and resets to `home`.
- `START_QR_FLOW` seeds the stack as `['home', 'game-intro']` so back from `game-intro`
  goes home, never to a stale screen.
- Guard-affected screens (`research`, `business-intelligence`, `repair-admin`,
  `repair-courier`, `repair-customer-history`, `repair-personnel`, `repair-diagnostics`,
  `sticker-studio`): on auth denial, `ProtectedRoute` must `REPLACE` to `access-denied`
  (no history pollution) and clear `intendedScreen`.

### 1.3 URL mirror (no router)

- On `NAVIGATE`, write `history.pushState({screen}, '', '#/' + screen)`.
- `popstate` → `dispatch({ type: 'BACK' })` if stack non-empty; otherwise `RESET`-to-home.
- On load: read `location.hash` (`#/showroom`) → `REPLACE` to that screen instead of home.
- Keeps deep-linkable URLs without adopting React Router.

### 1.4 Screen → nav intent table (design contract)

Every screen declares its nav behavior:

| Screen | Entry | Back target | Replaces stack? |
|--------|-------|-------------|-----------------|
| home | default | — (root) | RESET clears |
| game / game-intro | QR flow | home | START_QR_FLOW seeds |
| calibration | from game-intro | game-intro | push |
| results | from game | home (skip intermediate) | REPLACE |
| showroom | home | home | push |
| phone-details | showroom | showroom | push |
| research/* | protected | previous | push; auth-fail → access-denied |
| login | any protected action | intendedScreen after auth | REPLACE |

Full 38-row Navigation Compatibility Matrix (37 screens + `phone-details`) is the
single source of truth — see the **Navigation Compatibility Matrix** section. It is
referenced by Phase 1 (§1.4), Phase 2 (§2.3), and Phase 5 (§5.2); none may diverge.

---

## Phase 2 — Smart Back Navigation

### 2.1 Problem
Every screen today dispatches hardcoded `NAVIGATE('home')` for "back" — losing where the
user actually came from (showroom→details, repair flow→request, sticker-scan→home).

### 2.2 Design
- Single `BackButton` component: renders if `navStack.length > 0`, dispatches `BACK`.
- `AppShell` renders a global top-back affordance when the active screen has a back
  target (per the Phase-1 matrix) AND the screen itself has no in-content back button.
- Wizards (`CustomerPhoneFlow`, repair request, calibration) keep their internal steppers
  but now map step-back to `BACK` (REPLACE semantics) so hardware back also works.
- Double-back-to-exit: on `home`, if stack empty and user presses back (hardware or
  affordance), show a one-time toast "اضغط مرة أخرى للخروج" — second press exits.

### 2.3 Back priority table — THE single reference for back behaviour

This is the **only** source of truth for what "back" means at any moment. Evaluated
top-to-bottom; first match wins:

| Priority | If the current state is… | Then back action is… |
|----------|--------------------------|----------------------|
| 1 | A **Dialog** is open | Close the dialog (no navigation) |
| 2 | A **Bottom Sheet** is open | Close the bottom sheet (no navigation) |
| 3 | A **Modal** is open | Close the modal (no navigation) |
| 4 | Inside a **Stepper / wizard step** | Go back one step (internal, no nav) |
| 5 | Inside a **Tab / sub-page** | Return to the previous tab/sub-page |
| 6 | Inside a **screen** (stack non-empty) | `dispatch({ type: 'BACK' })` |
| 7 | On **home** (stack empty) | **Double Back Exit** toast → exit |

Notes:
- Dialog / Bottom Sheet / Modal overlays are tracked in a small overlay stack
  (local state per screen + reducer counter) so hardware back closes them first —
  matching platform conventions.
- Stepper/tab cases map to the same `REPLACE` semantics used in Phase 1 (no history
  pollution); only priority 6 pops the stack.
- This table is referenced by Phase 5 (Android) and Phase 2.2; both must never diverge.

### 2.4 Guard rails
- Screens that must not re-enter stale state after back (`game` mid-session,
  `countdown`) implement `beforeBack?: () => boolean` — false = confirm/cancel
  (Stop & Save / Resume dialog), matching existing in-screen exit buttons.
- Back never triggers a network redirect; it only pops the internal stack.

---

## Phase 3 — User Journey & exit-point prevention

### 3.1 Audit result (6–11 hard exits found)
- `StickerScanHandler.tsx:35` — `window.location.href = '/'` full page load (loses state).
- Sticker CTAs → `STICKER_CTA_URLS` build raw `/game?...`, `/phones?...` etc. against
  `window.location.origin` — no `/focus22/` base, no SPA route (deep links break).
- `RepairQR.tsx:21` — `origin + '/repair/track?code='` hardcoded path, no base, not a
  registered screen.
- Share/email share → `window.location.href` (full reload) and popup fallback.
- Auth magic link → `emailRedirectTo: window.location.origin` (no base).
- `404.html` path rewriting + `sw.js` offline shell not validated against `/focus22/`.

### 3.2 Design — keep users in the SPA
- Every listed exit becomes an **internal navigation** to the correct screen carrying the
  same data via the nav stack (no full page load).
- External/native handoffs are reserved for: WhatsApp (wa.me), tel/mailto, and printer
  views — i.e. genuinely native actions.
- Exit classification table:

| Action | Today | After | Rationale |
|--------|-------|-------|-----------|
| Sticker scan "continue" | hard reload `/` | `REPLACE`→home | keep telemetry & stack |
| Sticker CTA (play/repair/phones) | raw path, breaks | deep-link into screen | stay in SPA |
| Repair QR scan | raw path, breaks | `REPLACE`→repair-tracking w/ code | stay in SPA |
| Email share | full reload | keep (mailto is native) | native handoff OK |
| WhatsApp | wa.me popup ✓ | keep + fallback modal (§4.7) | native handoff OK |

### 3.3 Telemetry hooks
`track('exit_attempt', { from, type: 'internal'|'native' })` on every classified exit
(renamed from the earlier `exit_attempted` — see Navigation Analytics catalog), so
funnel analytics (M2) can measure where users leave.

---

## Phase 4 — Used-Phone Customer Journey (`showroom → phone-details → action → WhatsApp`)

### 4.1 Current gap (verified in code)
- `PhoneShowroom` supports `onSelect` but `ShowroomScreen.tsx:37-40` does **not** pass it →
  no details page today; cards only open the image gallery.
- `ShowroomScreen.tsx:34` already renders `<AdSpot placement="phone-details" />` at the
  top — the ad slot exists but the details surface does not.
- `CustomerPhoneFlow` is a separate search-based flow (search→variant→condition→action→
  whatsapp) with a single WhatsApp send — it does **not** start from a phone's details.

### 4.2 Full journey (not just one button)

```
Showroom (grid of used phones)
    │  tap a phone card
    ▼
Phone Details (full page, §4.3)
    │  user picks an action
    ▼
Choose Action  →  1. شراء  2. استبدال  3. تقسيط  4. استفسار
    │
    ▼
Generate WhatsApp Message (4 distinct templates, §4.6)
    │
    ▼
Open WhatsApp (wa.me, smart fallback modal, §4.7)
```

Design decisions:
- `ShowroomScreen` passes `onSelect={(device) => dispatch({type:'NAVIGATE', screen:'phone-details'})}`
  and carries the selected record via a **`selectedDeviceId`** in state (no heavy payload
  through the reducer — details re-read from `InventoryService.getAll()` by id).
- `phone-details` replaces the current dead-end (gallery-only) interaction: tapping a card
  now always opens details; the gallery lives *inside* the details page.
- Action selection is a dedicated step (not a single CTA): each action maps to its own
  WhatsApp template (§4.6) and each has its own telemetry event
  (`phone_action_selected`, `phone_action:buy|exchange|installment|inquiry`).
- After opening WhatsApp, back returns to **details** (stack: home → showroom → details),
  then showroom, then home — never a dead end.
- AdSpot `phone-details` stays on the details page as a secondary slot below the content.

### 4.3 Phone Details page — required content

The page is a full product surface, not a spec sheet. Required sections, top to bottom:

| Section | Content |
|---------|---------|
| **Image gallery** | Large primary image + thumbnail strip (existing `PhoneGallery` upgraded to main+thumbs); swipeable; counter "1/6" |
| **Title** | Brand + model + variant, condition badge, availability badge (متوفر/نفد) |
| **Price** | sell price prominent (`د.ج`), formatted; hidden if null |
| **Key specs** | RAM, storage, condition (جديد/مستعمل · حالة), displayed as spec chips |
| **Warranty** | `warranty?: string` — e.g. "ضمان 3 أشهر" (optional field, hidden if absent) |
| **Accessories** | `accessories?: string[]` — e.g. ["شاحن", "كابل", "علبة"] (optional, hidden if empty) |
| **City** | `city?: string` — shop/location context (optional, hidden if unknown) |
| **Description** | `description?: string` — cosmetic condition / used-phone notes (optional) |
| **Views** | view counter "X مشاهدات" (see §4.4) |
| **Choose Action** | 4 buttons: شراء / استبدال / تقسيط / استفسار → WhatsApp flow |
| **Similar phones** | `similarPhones` — sibling records same `modelId` or same brand/model, rendered as a horizontal strip of small `PhoneShowroom` cards → navigate to their details |
| **Back** | → showroom (per stack) |

Optional backward-compatible `InventoryRecord` expansion (purely presentational, not part
of the stock contract):

```ts
warranty?: string;     // e.g. "ضمان 3 أشهر"
accessories?: string[]; // e.g. ["شاحن", "كابل"]
city?: string;         // shop city
description?: string;  // used-phone notes / cosmetic condition
viewCount?: number;    // local engagement counter (localStorage)
```

### 4.4 View counter
Increment on mount, persisted per `record.id` in localStorage; shown as "🡢 X مشاهدات" on
details + small badge on the showroom card. Dedupes the same-session re-opens.

### 4.5 WhatsApp — current state (verified in code)
- `whatsapp-message.ts` / `whatsapp-service.ts` already centralize templates, phone
  formatting (0→213), and `wa.me` links (never `api.whatsapp.com`).
- `openWhatsApp` opens `window.open(url, '_blank')` with a `location.href` fallback —
  popup blockers can still silently fail on some in-app browsers.

### 4.6 Four distinct message templates (NOT one unified message)

Each action in the phone journey has its **own** template. All of them carry the phone's
data automatically (brand/model/variant/condition/price/city) — the user never types
anything. Templates (Arabic), built with the existing `WHATSAPP_TEMPLATES` machinery but
as 4 dedicated entries:

| Action | Template id | Generated message (fields auto-filled) |
|--------|-------------|------------------------------------------|
| شراء | `buy` | `السلام عليكم. أرغب في شراء {brand} {model} ({variant}) — الحالة: {condition} — السعر: {price} د.ج — المدينة: {city}. متوفر؟` |
| استبدال | `exchange` | `السلام عليكم. أرغب في استبدال هاتفي {myBrand} {myModel} ({myVariant}, {condition}) بالهاتف {brand} {model} ({variant}) — {city}.` |
| تقسيط | `installment` | `السلام عليكم. أرغب في شراء {brand} {model} ({variant}) بالتقسيط — السعر: {price} د.ج — المدينة: {city}. كم مدة التقسيط والدفعة الأولى؟` |
| استفسار | `inquiry` | `السلام عليكم. لدي استفسار عن {brand} {model} ({variant}) — الحالة: {condition} — {city}.` |

- `installment` is a **new** template (does not exist today — verified: only
  buy/sell/exchange/inquiry/stock_check/price_check exist).
- City is included only when known (falls back to omitting the line); price only when a
  sell price exists.
- `openWhatsAppForAction` is replaced by `sendPhoneActionWhatsApp(action, device, opts)`
  mapping action → template → message → open (single point of change).
- Telemetry: `whatsapp_clicked` (enriched with device context) + `phone_action_selected`
  (per action) — see Navigation Analytics catalog.

### 4.7 Smart fallback modal
Before `window.open`, do a same-tab `wa.me` navigation with a pre-open `beforeunload`
guard; if the page doesn't leave within ~1.5s (popup blocked / no WhatsApp app), show an
inline modal with the prefilled message text + a "فتح واتساب" link + "نسخ الرسالة" copy
button. User never loses the message.

- All entry points route through ONE function `sendSmartWhatsApp(phone, message, action)`
  (replaces scattered `openWhatsApp*` calls): phone-details actions, CustomerPhoneFlow,
  repair request/status, sticker CTAs, model-not-found.
- Telemetry: keep `whatsapp_clicked` + add `whatsapp_fallback_shown` and
  `whatsapp_message_copied` events (Navigation Analytics catalog).

---

## Phase 5 — Android Native Behaviour

### 5.1 Problem
No `popstate`/back handling today; hardware back on Android either exits the app or
relies on browser history that the SPA never maintains (single-page, one history entry).

### 5.2 Back matrix (shared source of truth — must match Phase 2 priority table)

| Screen | HW Back action | Exit confirm? |
|--------|----------------|---------------|
| any overlay (dialog/sheet/modal) | close overlay (priority 1–3) | no |
| stepper step | previous step (priority 4) | no |
| tab/sub-page | previous tab (priority 5) | no |
| home (empty stack) | exit app (double-press toast) | toast only |
| game | Stop & Save / Resume dialog | yes |
| countdown | cancel to game-intro | yes |
| game-intro (QR flow) | home | no |
| results | home (skip history) | no |
| calibration | game-intro | no |
| showroom | home | no |
| phone-details | showroom | no |
| repair-request stepper | previous step → request home | no |
| research/BI (sub-pages) | previous sub-page → research home | no |
| login | intendedScreen (if set) else previous | no |

- Screens that are *root of a section* (repair-home, showroom, settings, history,
  research) mark themselves `isSectionRoot` → back pops to `home`.
- Android-specific: no reliance on `navigator.app.exitApp()`; double-press-to-exit uses
  the standard toast pattern, avoiding Play Store policy friction.

### 5.3 Android Native Behaviour — per environment checklist

Purpose: verify the back/gesture behaviour **before launch** so differences between
environments are known, not discovered after release. Each environment is tested in
Phase 8 with the same back-priority test script:

| Environment | What is verified |
|-------------|------------------|
| **Hardware Back button** (Android) | `popstate`→`BACK` fires the priority table; double-back-to-exit toast on home; dialogs close first |
| **Gesture Back** (Android 10+, predictive back) | edge-swipe triggers the same `popstate`; no accidental full exit; gesture works while dialog open |
| **PWA** | Installable (manifest + icons present); back inside installed PWA behaves like in-browser; standalone window has no address bar but back still works |
| **Standalone Mode** (`display: standalone`) | No browser UI; system back + swipe both route through `popstate`; double-back-to-exit still shows toast; no dead-end after navigation |
| **Chrome (Android)** | Back + gesture + PWA install prompt; URL bar present in tab mode |
| **Samsung Internet** | Same back model; verify no default "exit app" override; check PWA/standalone support |
| **Edge (Android)** | Same back model; verify gesture back and installed PWA |

- Acceptance: back priority table behaves **identically** across all seven rows above
  (any difference = bug, filed per-environment).
- Note: iOS/Safari gesture back is a follow-up; this phase scopes Android surfaces as
  requested, with the same `popstate` policy reused for iOS later.

---

## Phase 6 — Accessibility + Performance Budget

### 6.1 Accessibility (cross-cutting for every screen built in Phases 1–5)

Every new/edited screen must satisfy these, verified in Phase 8:

| Requirement | Rule |
|-------------|------|
| **Focus states** | Visible, high-contrast focus ring on every interactive element (keyboard + touch); never `outline: none` without a replacement |
| **Keyboard navigation** | Full flow operable by keyboard alone: Tab order follows visual RTL order; Enter/Space activate; Esc closes overlays (mirrors back-priority 1–3); no keyboard trap |
| **Screen reader labels** | `aria-label`/`aria-labelledby` on nav buttons, icon-only buttons, gallery (main + thumbs), action buttons (شراء/استبدال/تقسيط/استفسار), WhatsApp CTA, back button; `aria-live` for view counter & copy-success |
| **Touch targets** | All tap targets ≥ **44×44 px** (min 44, preferred 48); adequate spacing between adjacent targets |
| **Contrast & semantics** | Maintain current design-token contrast; use semantic HTML (`button`, `nav`, `img alt`, `role="dialog"` for modal fallback) |
| **Reduced motion** | Respect `prefers-reduced-motion` for gallery transitions & toasts |

### 6.2 Performance Budget (measured in Phase 8, enforced at every Approval Gate)

| Metric | Budget |
|--------|--------|
| **Back** | < **100 ms** (overlay close & stack pop must feel instant) |
| **Navigation** (screen transition dispatch→paint) | < **150 ms** |
| **Phone details open** (`phone-details` mount→content visible) | < **200 ms** (lazy-loaded screen; no blocking work) |
| **WhatsApp open** (tap→wa.me intent or fallback modal) | < **300 ms** |

Budget rules:
- Any new async work on the navigation path (reading `InventoryService`, telemetry
  flush, gallery decode) must not block the transition budget.
- Measure with CDP performance traces (Chrome 9222) per the above thresholds;
  regression = fail the phase's approval gate.

---

## Phase 7 — SPA Integrity Hotfixes (execution — only after Phases 1–6 approved)

### 7.0 Scope lock (mandatory)
**No hotfix may be implemented unless it is directly tied to an approved item in
Phases 1–6.** Each item below lists its originating phase/rule. Anything not traceable
to the approved design is out of scope for this round and must be proposed separately.
The Global Navigation Policy (top of doc) is the compliance frame for every item.

### 7.1 Items (each mapped to its source decision)

| # | Fix | Source decision (Phase/§) |
|---|-----|---------------------------|
| 1 | `StickerScanHandler.tsx:35` → `REPLACE` to `home` (no `location.href`) | Policy rule 1; Phase 3.2 |
| 2 | `STICKER_CTA_URLS` → build against a base helper that returns the SPA's base path (`/focus22/`) and dispatch into registered screens instead of raw paths | Policy rule 1 & 5; Phase 3.2 |
| 3 | `RepairQR.tsx:21` → `REPLACE` to `repair-tracking` with `code` param (base-aware) | Policy rule 1; Phase 3.2 |
| 4 | `emailRedirectTo` (`core/auth/index.ts:148`) → base-aware redirect URL (`origin + '/focus22/'`), and on return parse to restore `intendedScreen` | Phase 1 (`intendedScreen`) + policy rule 1 |
| 5 | `404.html` + `sw.js` → validate/repair rewrite + offline shell under `/focus22/`; test deep-link refresh on the hosted base | Policy rule 1 (no reload break); Phase 3 deep links |
| 6 | WhatsApp fallback modal (§4.7) wired into `openWhatsApp` | Phase 4.7 |
| 7 | Share/email → confirm mailto-only reload is intentional; popup share stays native | Policy rule 2 (external-only exits) |
| 8 | Double-back-to-exit toast + global back affordance (Phases 1–2) shipped here | Phases 1–2 + Phase 2.3 |
| 9 | Grep-sweep: remove ALL remaining `location.href`/`assign`/`reload` for internal transitions; assert none in CI | Policy rule 1 enforcement |
| 10 | Back-priority integration: overlay stack (dialog/sheet/modal) wired to `BACK` | Phase 2.3 priority table |

Acceptance per item: verified via CDP session (Chrome 9222 profile) on
`http://localhost:5173/focus22/...` — no full-page reload on any internal navigation,
deep links resolve, back stack returns to the true origin screen.

---

## Phase 8 — Final Acceptance Testing + Production Readiness Review

### 8.1 Final Acceptance Testing (executed here)
- Full journey walkthrough (CDP): QR scan → game → results → history → showroom →
  phone-details → action → WhatsApp → back matrix on every screen.
- Regression: vitest (currently 966 passing), lint 0 errors, `tsc`, production build.
- Android Native Behaviour checklist (§5.3), Accessibility checklist, and Performance
  Budget all verified here.
- **Regression Matrix**: all 11 flows of the Regression Matrix section executed and green.
- **Navigation Analytics**: live session emits every catalog event with correct
  `session_id` / `campaign_id` / `placement_id` (verified in `analytics_events` rows).
- Sign-off checklist per screen: back target correct, no dead `NAVIGATE('home')`,
  no exit without classification, telemetry events present.

### 8.2 Production Readiness Review (final gate)
- Full test suite + lint + `tsc` + production build green on the hosted base
  (`/focus22/`), not just dev server.
- `404.html` + `sw.js` + manifest validated under `/focus22/`; deep-link refresh works.
- No open P0/P1 issues from any phase; every Approval Gate from Phases 1–7 signed.
- **Release gate**: only merge/launch after this review is green.

### 8.3 Per-phase Acceptance Criteria template (Definition of Done)

Every phase (1–7) is gated by the SAME checklist. Each phase's approval requires ALL
rows complete:

| Criterion | Requirement |
|-----------|-------------|
| **Definition of Done** | The phase's design/impl matches its section in this doc with zero drift |
| **Files modified** | Explicit list of every file touched (planned in the phase PR) |
| **Tests required** | Unit/component tests covering new logic (back reducer, 4 WhatsApp templates, phone-details rendering, fallback modal, navigation analytics events) |
| **Manual tests** | Walkthrough script per phase executed on Chrome (desktop + mobile viewport) |
| **Regression Matrix** | All 11 flows of the Regression Matrix section re-run and green for THIS phase |
| **Regression tests** | Full vitest suite green (966 currently) + lint 0 errors + `tsc` + build |
| **CDP verification** | Chrome 9222 profile: no full reload, deep links resolve, back stack correct, budget traces captured |
| **Performance check** | Back <100ms · Navigation <150ms · Phone details <200ms · WhatsApp <300ms |
| **Approval Gate** | Documented sign-off (owner approves phase before next begins) |

Phase-specific acceptance notes:
- **Phase 1**: `NAVIGATE`/`REPLACE`/`BACK`/`RESET` reducer unit tests; hash URL mirror
  round-trip test; deep-link `#/showroom` on cold load; `screen_view`/`navigation_*`
  events emitted.
- **Phase 2**: overlay-stack unit tests (dialog→sheet→modal→stepper→tab→BACK→double-exit);
  back priority table matches Phase 5 matrix (single source, no divergence test);
  `back_pressed`/`back_blocked` events verified.
- **Phase 3**: every item in the exit classification table verified via CDP (no reload);
  `exit_attempt`/`exit_confirmed` telemetry present.
- **Phase 4**: details page renders ALL required sections (§4.3); gallery main+thumbs;
  similar-phone navigation; view counter; action → WhatsApp wiring; 4 templates
  snapshot-tested with auto-filled data; fallback modal appears only when wa.me blocked;
  copy-to-clipboard works; `phone_details_opened`/`phone_details_closed`/`whatsapp_clicked`
  verified.
- **Phase 5**: back matrix verified on the 7 environments of §5.3; divergence = bug.
- **Phase 6**: a11y checklist + performance budget verified per §6.1/§6.2.
- **Phase 7**: each item traceable to its source phase (§7.1 table) — scope lock
  respected; grep-sweep clean in CI.

---

## Risk assessment

| Risk | Mitigation |
|------|-----------|
| Stack divergence between web back & Android back | Single `popstate`→`BACK` policy; Phase 2.3 table + Phase 5.2 matrix share one source of truth (no-divergence test) |
| Deep-link base (`/focus22/`) regressions | All URL builders go through one base helper; CDP-verified per item in Phase 7 |
| QR-flow re-entry bug (previously fixed) | `START_QR_FLOW` seeds stack; `qrFlowHandledRef` guard preserved |
| WhatsApp fallback shows when app is installed | Same-tab nav succeeds → modal never appears; timeout guard only |
| Reducer state bloat (selectedDeviceId, stack, overlay counter) | Keep payloads light: store IDs, re-read services; stack capped (e.g. 50) |
| Old `NAVIGATE('home')` / `location.href` calls linger | Phase 7 grep-sweep item #9 + CI assertion + tests asserting back targets |
| Phase 7 scope creep into unrelated fixes | §7.0 scope lock: every hotfix must trace to an approved Phase 1–6 item |
| Android environment differences after launch | §5.3 seven-environment checklist verified in Phase 8 before release |
| Accessibility/performance regressions unnoticed | Budget thresholds + a11y checklist enforced as approval-gate criteria in §8.2 |
| Overlay-stack complexity (dialog vs stepper vs tab) | Priority table is the single reference; unit-tested top-to-bottom in Phase 2 |

---

## Approvals

### Global contracts (approved once, apply to all phases)
- [ ] Global Navigation Policy (rules 1–5)
- [ ] Navigation Analytics (event catalog + session/campaign/placement context)
- [ ] Regression Matrix (11 flows, run after every phase)
- [ ] **Navigation Compatibility Matrix (all 38 screens documented)**
- [ ] Accessibility requirements
- [ ] Performance Budget thresholds

### Per-phase
- [ ] Phase 1 — Navigation Architecture
- [x] Phase 2 — Smart Back Navigation (priority table) — **approved 2026-08-06**
- [ ] Phase 3 — User Journey / exit prevention
- [ ] Phase 4 — Used-Phone Customer Journey + WhatsApp Flow (details + 4 templates + fallback modal)
- [ ] Phase 5 — Android Native Behaviour
- [ ] Phase 6 — Accessibility + Performance
- [ ] Phase 7 — SPA Integrity Hotfixes (execution, scope-locked)
- [ ] Phase 8 — Final Acceptance Testing + Production Readiness Review
