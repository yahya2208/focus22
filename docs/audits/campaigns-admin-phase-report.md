# Campaigns Admin Phase — Final Report (HARD STOP)

Status: **AWAITING OWNER APPROVAL** — nothing has been committed, pushed, or
deployed. No SQL/DDL/DML was executed. All gates are green on the working tree.

## 1. What was built

A Campaigns admin section inside the **Research Console**, registered as a
`campaigns` dashboard (admin/super_admin only). It is a re-implementation of the
deleted P5 campaign surface with **every attribution/analytics/placement
dependency removed**, per §29 and the owner-approved §3 inventory.

| File | Purpose |
|---|---|
| `src/research-console/pages/campaigns/campaign-service.ts` | Types (`Campaign`, `QRConfig`, `CampaignTimelineEntry`, `CampaignFilters`) + admin CRUD. **Only** data access is `.from('campaigns')`. `generateShortCode()` (base62/crypto). `buildCampaignQrUrl()` builds the **plain `/c/<code>`** deep-link — no params. |
| `.../CampaignsDashboard.tsx` | List + status filter chips (all/active/draft/paused/finished/archived), StatCards, archive (soft delete) / restore, opens the detail view, launches the wizard. |
| `.../CampaignWizard.tsx` | 3-step create (name/goal/type → location → description/notes/budget). Writes **only** the campaigns row. Success modal shows focus-test QR PNG + plain URL with copy/download. |
| `.../CampaignDetailView.tsx` | Tabs: **Overview · QR Designer · Print** (analytics and placements tabs deliberately omitted). Status change, inline notes, timeline display. |
| `.../QRDesigner.tsx` | Templates, colors, rounded/square, frame, logo, live canvas preview, PNG/SVG export. No data-service/analytics imports. |
| `.../PrintCenter.tsx` | A4/300-DPI layouts (single→12-sticker), PNG download, window.print(). |
| `src/research-console/ResearchConsole.tsx` | `DASHBOARD_IDS` + `DASHBOARD_RESOURCE_MAP` (`campaigns → 'campaigns'`) + `dashboardComponents` (`campaigns: CampaignsDashboard`). Role auto-hiding applies unchanged. |
| `src/research-console/layout/ResearchLayout.tsx` | `DashboardId` union + `DASHBOARDS` nav entry (`research.nav.campaigns`, already translated in en/ar/fr/tr). |

## 2. Security / privacy posture (unchanged by this phase)

- **No SQL, no migration, no grant, no policy change.** `supabase/migrations`,
  RPCs `00007`/`00018`, and all RLS are untouched on disk.
- New admin code touches **only** the `campaigns` table. It never reads/writes
  `qr_codes`, `placements`, `placement_history`, `analytics_events`, or
  `sessions`; it does not import `data-service` or `core/qr`; it builds no
  attribution URLs.
- Server-side access control is unchanged: RLS policy **"Admins manage
  campaigns"** gates by DB role; UI is additionally gated by the `campaigns`
  resource in `ROLE_PERMISSIONS` (`research_admin`: read+write; `super_admin`:
  `*`; analyst/viewer/none: no access).
- The public QR entry point is untouched: `src/services/campaign-lookup.ts`,
  `core/qr`, `core/analytics`, `core/telemetry`, `App.tsx` are unchanged.

## 3. Gates (all green)

| Gate | Result |
|---|---|
| `vitest run` | **118 files / 1159 tests pass** (baseline 115/1119 + 3 new files / 40 new tests). |
| `tsc --noEmit` | **Clean** (0 errors). |
| `eslint src/ --report-unused-disable-directives` | **0 errors**, exit 0 (5195 pre-existing design-system warnings; same convention as existing dashboards). |
| `vite build` | **Succeeds** (ResearchConsole bundle includes the campaigns pages). |

New tests:
- `src/__tests__/campaigns/campaign-service.test.ts` — mocked `from('campaigns')`
  CRUD (list/get/create/update/soft-delete/restore/timeline), `generateShortCode`,
  and the plain-URL contract (`buildCampaignQrUrl` never appends `?`/`&`).
- `src/__tests__/campaigns/campaign-dashboard-registration.test.ts` — registration
  in ResearchConsole + ResearchLayout and role gating (admin/super_admin ✅,
  analyst/viewer/none ❌; no delete/export for research_admin).
- `src/__tests__/campaigns/campaign-admin-guard.test.ts` — static guard over every
  file in `pages/campaigns/`: no `.from('qr_codes'|'placements'|'placement_history'|
  'analytics_events'|'sessions')`, no `data-service`/`core/qr`, service touches
  only `campaigns`, no attribution params, no resurrected
  `PlacementsTab`/`CampaignAnalytics`.

## 4. §24 read-only verification package (owner-run)

`supabase/campaigns-admin-read-only-verification.sql` — SELECT/catalog-only,
safe for the production SQL editor. Verifies:
- **A:** all 25 columns the admin service writes/reads exist on `campaigns`
  (incl. `short_code`, `qr_config`, `timeline`, `created_by`, `last_edited_by`).
- **B:** RLS enabled; **"Admins manage campaigns"** is the only campaigns policy;
  broad `Authenticated read campaigns` SELECT absent.
- **C:** `lookup_campaign_by_short_code` intact, SECURITY DEFINER, STABLE,
  `search_path=public`, anon+authenticated EXECUTE.
- **D:** anon/authenticated have **no** direct table grants on campaigns.
- **E:** behavior probes in `BEGIN; SET LOCAL ROLE; …; ROLLBACK;` — anon still
  resolves an ACTIVE campaign via the RPC, gets 0 rows for a non-existent code,
  and 0 rows on direct `SELECT`.
- **F:** machine-readable verdicts (`ALL_COLUMNS_PRESENT`, `POSTURE_UNCHANGED`,
  `RPC_INTACT`).

## 5. Not in scope / deferred

- Campaign **analytics** (scans/started/completed/registered/conversion), the
  **Placements** tab, and **placement/QR-code management** — deliberately
  excluded (privacy gates forbid those tables). If a later phase needs them, it
  requires separate owner approval and a design pass.
- Print is PNG/`window.print()` (no jsPDF dep added).

## 6. HARD STOP

- [ ] Owner runs `supabase/campaigns-admin-read-only-verification.sql` on the
      live DB (or confirms equivalent evidence) and posts the output.
- [ ] Owner reviews this report and approves **commit + push + deploy**.

No commit/push/deploy will happen until approval. Working tree also still
contains the unrelated pre-Phase-B deletions (e.g. `data-service.ts`,
`PersistenceProvider.tsx`, `core/device/index.ts`); they are **not** part of
this phase and will not be committed by this work.
