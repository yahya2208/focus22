# Research Console — Dashboard Review Table

Verified against `ResearchConsole.tsx` `DASHBOARD_IDS` on `2026-08-01` during
RC1 stabilization. **23 dashboards** (not 24) are registered; this is the
authoritative count (`src/research-console/ResearchConsole.tsx:67-91` and
`no-key-warnings.test.tsx` both list 23).

Status key: **✅ real** (reads a real data source) · **🟡 partial** (real core,
some sub-fields hardcoded to `0`/empty) · **❌ placeholder/mock**.

| # | Dashboard | Data source | Status | Notes |
|---|---|---|---|---|
| 1 | overview | Supabase `users`, `sessions`, `qr_codes` (`getQRStats`) | 🟡 | `countries`/`cities`/`calibrationConfidence`/`retentionD30` hardcoded `0` |
| 2 | acquisition | Supabase `users`, `sessions`, `analytics_events` | 🟡 | `returningUsers: 0`, `referralSuccess: []` |
| 3 | scientific | Supabase `sessions.measurements.corrected_rts` + `sessions.scientific_results` | ✅ | Verified real — see `18-scientific-dashboard-audit.md`; `byDimension`/`calibrationConfidence` gaps |
| 4 | users | Supabase `users`, `analytics_events` | ✅ | Real |
| 5 | sessions | Supabase `sessions` + `users` + `devices` (`getSessionList`) | ✅ | Real |
| 6 | devices | Supabase `devices` | 🟡 | `cpuCores`/`ram`/`inputType`/`calibrationByDevice`/`inputLag` arrays empty |
| 7 | surveys | Supabase `surveys` | 🟡 | country/sleep/coffee/exercise/correlationMatrix empty |
| 8 | campaigns | Supabase `campaigns`, `qr_codes`, `sessions` | 🟡 | `avgRtByCampaign`/`avgFocusByCampaign` empty |
| 9 | journey | `dataService.getJourney` → `analytics_events` + `sessions` | ✅ | Real |
| 10 | health | `dataService` → `analytics_events` (counts/orphans/volume) | ✅ | Real |
| 11 | conversion | `dataService.getFunnelEvents` → `analytics_events` | ✅ | Real |
| 12 | comparator | `dataService.getFunnelEvents` → `analytics_events` | ✅ | Real |
| 13 | intelligence | `dataService` → `analytics_events` + `sessions` | ✅ | Real |
| 14 | insights | `dataService` (calibration/game/funnel events) | ✅ | Real |
| 15 | exchange | `dataService.getPhoneExchangeEvents` → `analytics_events` | ✅ | Real |
| 16 | inventory | `InventoryService` (local) | ✅ | Real, local catalog data |
| 17 | catalog-health | `InventoryService` + `alias-engine` (local) | ✅ | Real |
| 18 | variant-coverage | `variant-verification` service (local) | ✅ | Real |
| 19 | inventory-health | `variant-verification` + `price-memory` (local) | ✅ | Real |
| 20 | price-memory | `price-memory` service (local) | ✅ | Real |
| 21 | live | `live-sessions` (realtime + 5s poll) + `sessions`/`analytics_events` | ✅ | Real; RC1 stabilized |
| 22 | live-diagnostics | `live-diagnostics` runtime buffer (`live-diagnostics.ts`) | ✅ | New in RC1 (Part 7); in-memory, 50-event ring |
| 23 | system | `getSystemHealth` (`users` ping) + `analytics_events` | 🟡 | `offlineQueueLength`/`storageUsedMb`/`syncQueueLength` hardcoded `0` |

## Rules applied

- Every dashboard maps to a real consumer in `dashboardComponents`
  (`ResearchConsole.tsx:93-117`) and a resource in `DASHBOARD_RESOURCE_MAP`
  (all under `overview` except `scientific`, `users`, `sessions`, `devices`,
  `surveys`, `campaigns`).
- No `❌` placeholder/mock dashboards exist.
- The React key warning gate (`no-key-warnings.test.tsx`) covers all 23 with no
  "Each child in a list" warning.
- The sidebar navigation test covers all 23 with no DOM remount
  (`sidebar-navigation.test.tsx`).

## Authoritative counts (fixes earlier "24" figure)

| Item | Count |
|---|---|
| Registered dashboards (`DASHBOARD_IDS`) | 23 |
| `no-key-warnings` cases | 23 |
| Sidebar nav buttons (incl. `diagnostics`) | 23 |
