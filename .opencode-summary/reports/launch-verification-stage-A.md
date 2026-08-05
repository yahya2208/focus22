# Launch Verification — Stage A: QR Counter from Real Events (Option C)

Date: 2026-08-05
Status: PASS (all gates green)

## Decision Context
- Incident `INC-2026-08-03-D2-close`: `public.qr_codes.scan_count` was poisoned to
  `999,999,999` in 8 rows by `04-2.1.6-baseline-reverify.sql:205` (total ~7,999,999,995).
- Any `UPDATE` on `scan_count` is forbidden; the counter continues only via the
  `increment_qr_counter` RPC (SECURITY DEFINER, column allowlist).
- Approved option C: all QR counters are derived from real events in
  `public.analytics_events` where `event_type = 'qr_scanned'`.

## What Changed

### Data layer (`src/core/supabase/data-service.ts`)
- Added `countQrScans(options?: { since?, campaignId? })` — exact count of
  `analytics_events` rows with `event_type = 'qr_scanned'` (optional campaign/date filters).
- Added `getQrScansByCampaign()` — single query returning `{ campaignId: count }`
  grouped client-side.
- `getQRStats().totalScans` now derives from `countQrScans()` instead of summing
  `qr_codes.scan_count`. Other fields (`game_start/complete`, `registration`) unchanged.

### Research API (`src/core/research/api-supabase.ts`)
- `getCampaignAnalytics()`: per-campaign `scans` and `referralPerformance[].scans` now
  come from `getQrScansByCampaign()` (event-derived). `rate` recomputed from event scans.

### Campaign store (`src/core/qr/campaign.ts`)
- `createCampaignStore().getStats(id)` now counts `qr_scanned` events for the campaign
  (via `.match({ event_type, campaign_id })`) and keeps `registration_count` from `qr_codes`.
- `recordScan()` still calls `increment_qr_counter` (the D2-approved write path) —
  unchanged.

### Dashboard consumers
- `src/research-console/pages/live/LiveDashboard.tsx` — 28d QR Scans now counts
  `qr_scanned` events in the 28-day window (was: `SUM(qr_codes.scan_count)`).
- `src/research-console/pages/campaigns/CampaignsDashboard.tsx` — per-campaign
  `scan_count` and totals now use `getQrScansByCampaign()`.
- `src/research-console/pages/campaigns/CampaignDetailView.tsx` — `stats.scans` now uses
  `ds.countQrScans({ campaignId })`; passes `scanCount` to `CampaignAnalytics`.
- `src/research-console/pages/campaigns/CampaignAnalytics.tsx` — new optional
  `scanCount` prop; `stats.scans` uses it (funnel "QR Scans" no longer reads
  `qrCodes[].scan_count`).

### Tests updated (behavior parity with Option C)
- `src/__tests__/qr/campaign.test.ts` — store `getStats` now mocks `analytics_events`
  count via `.match()`; added `match` to the supabase chain mock.
- `src/__tests__/session/lifecycle.test.ts` — CampaignAnalytics "props-only" proof now
  asserts `stats.scans` comes from the `scanCount` prop, not from `qr_codes.scan_count`.

## Gates (evidence)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | PASS, 0 errors |
| Lint | `npm run lint` (`eslint src/`) | PASS, 0 errors (pre-existing design-system style warnings only) |
| Tests | `npm test` (`vitest run`) | PASS, 77 files / 855 tests |
| Build | `npm run build` (`tsc -b && vite build`) | PASS, 405 modules, dist generated (`index-eG8dxJ7S.js`) |

## Remaining `scan_count` references (all safe)
- `data-service.ts` QRCode type fields + create-input default (schema / writes only).
- `CampaignWizard.tsx` create initial value `0` (new rows).
- `campaign.ts:198` `increment_qr_counter` RPC write (D2-approved counter path).
- `CampaignsDashboard.tsx` local `CampaignRow.scan_count` field — now populated from
  event-derived `getQrScansByCampaign()` counts, never from the poisoned column.

## Notes / Follow-ups
- Deep-link scans (`App.tsx:157-161`) record `qr_scanned` without `campaign_id`
  (only `source/campaign/referrer`), so they count toward global totals but cannot be
  attributed per-campaign. This matches the previous short-code-only counter semantics
  for per-campaign attribution while the global "28d QR Scans" is now strictly a real
  event count.
- No SQL/migration was executed in this stage.
