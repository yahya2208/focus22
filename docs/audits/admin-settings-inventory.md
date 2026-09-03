# FOCUS — Admin Control Center: Settings Inventory Report (Discovery-Only)

- **Status:** DISCOVERY COMPLETE — NO code, migration, schema, UI, or runtime changes made.
- **Date:** 2026-09-03
- **Rule honored:** Extend the existing `app_settings` + Settings Control Center architecture;
  do NOT create a parallel configuration system. Stay out of Admin UI for security/RBAC/auth/
  DB-permissions/secrets/scientific/measurement/immutable contracts.
- **Rule honored:** No small questions during discovery; full scan executed; report below.

---

## 1) Executive summary

FOCUS already has a mature, centralized Admin Settings Control Center (Phase 7, migrations
`00059` + `00060`). It is **the** correct home for admin-manageable settings and must be
extended, not rebuilt:

- **Store:** `public.app_settings (key PK, value jsonb, category, type, updated_by, updated_at)`.
  RLS enabled with **zero client policies** (direct table access denied to anon/authenticated).
- **Write RPC:** `set_setting(p_key text, p_value jsonb)` — SECURITY DEFINER, `SET search_path=''`,
  writers = **admin / super_admin ONLY**, closed-key registry, JSON-number type check, and
  **server-side min/max bounds** per key. Rejects unknown keys (`INVALID_KEY`), non-numbers
  (`INVALID_TYPE`/`INVALID_VALUE`), out-of-range (`OUT_OF_RANGE`), unauthorized (`FORBIDDEN`).
- **Read RPC:** `get_settings()` — SECURITY DEFINER, readers = **admin / super_admin / researcher**;
  returns only registered keys as `{key:{value,category,type}}`. Never raw rows / audit.
- **Client:** `src/business-intelligence/settings-api.ts` (closed `SETTING_REGISTRY` mirror +
  typed fallbacks), `src/core/config/runtime-settings.ts` (safe runtime read layer; never throws),
  `src/business-intelligence/pages/AdminSettingsBI.tsx` (Admin UI, grouped by category, current+
  default+type+bounds, server re-validates, read-only for researcher).
- **Audit trail (minimal):** `updated_by` (auth.uid) + `updated_at` only. **No old/new value
  history table exists** — this is a gap vs the "who/what/old/new/when" auditability requirement.

**Already centralized (20 keys)** — leave as-is unless re-classified (see §2 D2/D3):

| Category | Keys |
|---|---|
| game | `game.rounds`, `game.min_delay_ms`, `game.max_delay_ms`, `game.min_position_distance_pct` |
| offers | `offers.default_discount_percent`, `offers.default_max_usage`, `offers.return_discount_percent`, `offers.whatsapp_discount_percent`, `offers.whatsapp_max_usage` |
| inventory | `inventory.overstock_multiplier` |
| rules | `rules.inventory_low_threshold`, `rules.device_visitors_threshold`, `rules.trade_conversion_threshold`, `rules.visitor_count_threshold`, `rules.default_threshold`, `rules.needs_discount_visit_count` |
| cache | `cache.max_entries` |
| telemetry | `telemetry.max_batch` (10), `telemetry.flush_ms` (5000), `telemetry.max_buffer` (50) |

---

## 2) Classification of every inventoried setting

**Legend:** **A** = ADMIN-MANAGEABLE (candidate to expose/edit) · **B** = CODE/ARCHITECTURE LOCKED ·
**C** = SCIENTIFIC/MEASUREMENT LOCKED · **D** = SECRET/ENV LOCKED · **E** = NEEDS REVIEW.

### A — Admin-manageable candidates (not yet centralized)

| Setting | Current value | File:line | Suggested category | Notes |
|---|---|---|---|---|
| WhatsApp business line | `'+213556254007'` | `src/services/whatsapp-service.ts:5` | offers / contact | Business contact ‑ A; sensitive (PII-adjacent) — handle carefully |
| Listing page size (public) | `48` | `src/screens/showroom/ShowroomScreen.tsx:27` | marketplace | A — pagination |
| Listing RPC page size | `24` (clamp 1–100) | `00038` :678, `00054` :578 | marketplace | DB-side; A (server clamp exists) |
| Search page size | `50` | `src/screens/admin/CatalogSearchBar.tsx:15` | marketplace | A — pagination |
| Similar-phones count | `8` | `src/hooks/useSimilarPhones.ts:9` | marketplace | A — UI |
| Results auto-advance | `3000` ms | `ResultsScreen.tsx:28` | presentation | A — timing |
| Gallery autoplay | `3000` ms | `ProductImageGallery.tsx:13` | presentation | A — timing |
| Ad carousel autoplay | `2000` ms | `AdImageCarousel.tsx:17` | ads | A — ad ops |
| Ad carousel swipe threshold | `50` px | `AdImageCarousel.tsx:18` | ads | A — ad/UX |
| Ad-impression dwell gate | visibility ≥0.6, 1000 ms | `AdContactBanner.tsx:171–196` | ads | A — BUT feeds `ad_impression` telemetry; changing risks measurement — see E1 |
| Telemetry impression dwell | threshold 0.6 / 1000 ms | `useTelemetryImpression.ts:24` | telemetry | A — feeds `*_impression` counts; see E1 |
| Internal-ad placement allowlist | `['phone-details','showroom','phone-services','repair-home']` | `ad-adapters/internal.ts:43` | ads | A (feature gate) — B-ish scope decision |
| WhatsApp guard timeout | `1500` ms | `useSmartWhatsApp.ts:4` | comms/UX | A — timing |
| WhatsApp number/message limits | 8/15 digits, 1000 chars | `ad-adapters/whatsapp.ts:59–61` | comms/validation | A — validation |
| Double-exit window | `3000` ms | `BackProvider.tsx:38` | UX | A — timing |
| Appointment delivery fallback | 30 / 45 min | `delivery-service.ts:159–162`; `00050:188` | marketplace/delivery | A — commerce (DB-mirror fallback for dormant layer; see E2) |
| Currencies allowlist | `['USD','DA','SAR','EUR','TRY']` | `CampaignWizard.tsx:30` | marketplace | A — commerce |
| Challenge default rounds | `7` | `challenge-system/01-challenge-schema.sql:80` | game | A? — but touches challenge scoring → E3 |
| Challenge qualification rules | `{min_score:80,min_grade:'B',challenge_limit:3,...}` | `challenge-system/01-challenge-schema.sql:57` | game | E (see E3) |
| Nav history cap | `50` | `store/navigation.tsx:111` | architecture | B (test-enforced "not-migrated") |
| Gamification achievement thresholds | streak 3/7/30, sessions 10/50/100 | `core/gamification/achievements.ts:31–50` | gamification | A/E — consumer-facing milestones; A but see E3 |

### B — Code / architecture locked (stay out of Admin UI)

| Setting | Current value | File:line | Reason |
|---|---|---|---|
| `USE_NEW_GALLERY` | `true` | `gallery-config.ts:6` | Code/feature toggle — release switch, not ops config |
| `recalibrateOn*` policy | `true`×3 | `calibration-cache/index.ts:21–23` | Tied to measurement validity (see C) — do not expose |
| `MAX_STACK_DEPTH=50`, nav back-matrix | — | `store/navigation.tsx:111`, `back-matrix.ts:62` | Navigation contract |
| `TELEMETRY_MAX_*` constants | 10/5000/50 | `telemetry/types.ts:200–202` | **These are the built-in fallback defaults** for the already-centralized `telemetry.*` settings — keep as code fallback; do NOT conflate with Admin (Admin edits the DB value, code keeps the safe default) |
| RPC `p_limit` clamps (24/1..100, 50/100, leaderboard 50) | — | `00038`, `00054`, `00043`, `00049` | Server pagination contracts — wrapper values live in code; clamps are architectural |
| Session/engine versioning | `engine_version=1`, `abandon_timeout` | `00010` | Contract — locked |

### C — Scientific / measurement locked (must NOT move; ADMIN-LOCKED)

| Setting | File:line | Reason |
|---|---|---|
| `CORE/scientific/constants.ts` — CALIBRATION, INPUT_LAG, REACTION, CONSISTENCY, FATIGUE, SCORING weights/grades, PLATFORM | `src/core/scientific/constants.ts:4–58` | The measurement/scoring contract. Changing invalidates scores. **ADMIN-LOCKED** |
| Challenge scoring (CV bands 95/80/60/30, slope 0.05, RT 150..400) | `challenge-system/02-challenge-scoring.sql:120–191` | Mirrors the locked scientific contract — change would desync scoring. **ADMIN-LOCKED** |
| RT clamp 150/400, engine scoring | `core/engine/scoring.ts:25,39` | Same contract. **ADMIN-LOCKED** |
| Calibration confidence / cache TTL policy | `calibration-cache/index.ts:19–23` | Feeds calibration validity → measurement. **ADMIN-LOCKED** |
| **`game.*` registry settings (rounds/delays/position)** | registry + `GameScreen.tsx:217–220` | **E3 conflict (see below)** — already exposed but alter measured RT presentation → measurement validity risk |

### D — Secret / env locked (stay out of Admin UI)

| Setting | File:line |
|---|---|
| `VITE_SUPABASE_URL` | `core/supabase/client.ts:14` + `.env` |
| `VITE_SUPABASE_ANON_KEY` | `core/supabase/client.ts:15` + `.env` |
| `VITE_SUPABASE_PROJECT_ID` | `core/supabase/client.ts:16` + `.env` |
| `VITE_APP_VERSION` / `VITE_GIT_SHA` | `SystemDashboard.tsx:10–11` (build metadata — read-only) |
| `import.meta.env.BASE_URL/DEV/PROD/MODE` | build/runtime gates — locked |
| `ADS_BUCKET='ads-images'` | `ads-service.ts:261` — storage ref (architectural) |
| Inventory upload `file_size_limit` 5MB | `00019:1007` — storage/upload bound (B/D) |

### E — Needs review (decision points)

- **E1 — Ad/impression dwell gates (A vs fidelity):** `AdContactBanner` + `useTelemetryImpression`
  gates feed `ad_impression`/`*_impression` counts. Making them admin-editable could change
  telemetry counts retroactively → cross-domain consistency. **Recommendation: A (expose) but
  gate with a "changes impression metrics" warning; or keep C.** Decide with owner.
- **E2 — Delivery fees/minutes (A vs dormant):** `fee=0`, 30/45 min are DB-mirror fallbacks for a
  **dormant** delivery layer (`00050`). Centralizing is low-risk but no live consumer uses it today.
  **Recommendation: A (centralize) when the delivery layer activates; else defer.**
- **E3 — Game/achievement/challenge (A vs C):** the **existing** `game.*` registry entries
  (rounds/delays) and daily-challenge/achievement thresholds affect measured/gamified outcomes.
  Per the ADMIN-LOCKED rule, changing delay ranges can bias measured RT. **Recommendation:
  re-classify `game.*` + challenge/achievement as C (measurement locked) or A-with-guard.**
  This must be a conscious owner decision, since the registry ALREADY exposes them.
- **E4 — Auditability gap:** no old/new-value audit history exists (only `updated_by`/`updated_at`).
  To meet "who/what/old/new/when," a **light** append-only settings-change log is needed. Per the
  no-reinvention rule this stays a proposal for owner approval — it is additive and non-breaking.

---

## 3) What must stay out of the Admin Control Center (ADMIN-LOCKED)

- Security controls, RBAC, auth architecture (`ROLE_PERMISSIONS`, `ROLE_CAPABILITY_MAP`, `users.role`).
- Database permissions / grants / RLS policy definitions.
- Secrets & service-role credentials (`VITE_SUPABASE_ANON_KEY`, URLs, private keys).
- Cryptographic config, migration architecture, storage bucket definitions.
- Scientific measurement & scoring contracts (`core/scientific/constants.ts`, challenge scoring).
- Political/navigation architecture contracts (back-matrix, MAX_STACK_DEPTH).
- The `telemetry.*` **code fallback defaults** (types.ts) — kept as safe defaults, distinct from the
  Admin-editable DB values.

---

## 4) Existing architecture to EXTEND (reuse, do not rebuild)

- `public.app_settings` table + `get_settings` / `set_setting` SECURITY DEFINER RPCs (00059/00060).
- `set_setting` already enforces: auth role → closed-key registry → JSON-number type → per-key
  bounds. **New keys = add a seed row + a CASE branch + client registry entry.** Safe contract ready.
- `settings-api.ts` registry, `runtime-settings.ts` fallback layer, `AdminSettingsBI.tsx` UI.
- **Telemetry settings (max_batch/flush_ms/max_buffer) are ALREADY in the Admin UI** via the
  existing telemetry category — verified, defaults unchanged (10/5000/50). No work needed there.

---

## 5) Proposed Admin Control Center structure (for owner approval — NOT implemented)

1. **New categories** (in registry + UI grouping): `marketplace` (pagination/page-size, delivery),
   `ads` (autoplay/swipe), `comms` (whatsapp line/limits/guard), `presentation` (autoplay/timing),
   `gamification` (achievements — pending E3).
2. **No new table schema** — reuse `app_settings` + RPC pattern exactly.
3. **Audit (E4, if approved):** append-only `app_settings_changes` (key, old, new, by, at) written
   inside `set_setting` (SECURITY DEFINER) — reused, not a parallel config system.
4. **Boundaries enforced:** C/D/B settings are never registered (so they cannot be named/edited).

---

## 6) Settings gaining recommended classification (quick table)

| Group | Class | Action |
|---|---|---|
| WhatsApp line, limits | A | Candidate to centralize |
| Pagination/size (marketplace/admin) | A | Candidate to centralize |
| Presentation/autoplay/timing | A | Candidate to centralize |
| Ad autoplay/swipe | A | Candidate to centralize |
| Ad-impression dwell | E1 | Decide A vs C |
| Delivery fee/minutes | E2 | Defer (dormant layer) |
| game.*, challenge, achievements | E3 | Decide A-vs-C guard |
| Scientific constants | C | ADMIN-LOCKED |
| Env/secrets | D | ADMIN-LOCKED |
| Feature flags / nav / RPC clamps / engine | B | ADMIN-LOCKED |
| telemetry.* (existing) | A (already) | Already in Admin UI — no change |

---

## 7) Files touched this phase

- NEW `docs/audits/phase8-phase9-closeout.md` (Phase 8/9 closeout record — the only write; the
  stale "00062 unapplied" note existed only in prior conversation, not in any repo file).
- This report (`docs/audits/admin-settings-inventory.md`).

**No source code, migrations, schema, RLS, RBAC, settings, or runtime behavior were modified.**
