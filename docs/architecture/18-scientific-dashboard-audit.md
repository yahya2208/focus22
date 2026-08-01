# Scientific Dashboard Audit — Real Feature vs. Placeholder (Decision)

Status: **✅ REAL — kept as-is.** Verified `2026-08-01` during RC1 stabilization.

## Verdict

The Scientific dashboard is a **real, data-backed feature** reading production
Supabase tables at runtime. It is **not** a mock, placeholder, or hardcoded
visual. It is kept; no delete/complete work was required.

## Data source (trace)

| Field shown | Read from | Written by |
|---|---|---|
| median / mean / stdDev RT, p50–p99 | `sessions.measurements.corrected_rts` (JSONB array, per-press RTS) | `PersistenceProvider.doCloseSession` → `session_repository` on completion |
| consistency % + rating + CV | `sessions.scientific_results.consistency_score` | same (fallback: recomputed from CV of `corrected_rts`) |
| fatigue % + index | `sessions.scientific_results.fatigue_score` | same |
| accuracy / false starts | derived from `corrected_rts` (<150ms counted) | — |
| distribution histogram / percentiles | computed client-side from the fetched arrays | — |

Path: `ScientificDashboard` → `createResearchAPI().getScientific(filters)` →
`client.from('sessions').select('measurements, scientific_results').eq('status','completed')`
(`src/core/research/api-supabase.ts:381-443`). Respects `FilterBar` date/game
filters via `gte/lte/eq` on `created_at` / `plugin_id`.

The `sessions` table and its `measurements` / `scientific_results` JSONB columns
are part of the pre-existing app baseline (documented in
`00008_document_baseline.sql`); the contract migrations (00009–00013) do not
touch them. No mock service is involved.

## Remaining gaps (documented, non-blocking)

These sub-metrics render `0` or empty because the source columns do not yet
feed them; they do not invalidate the real core:

| Gap | Location | Root cause |
|---|---|---|
| `byDimension` always `{}` | `api-supabase.ts:441` | No dimension-breakdown aggregation implemented |
| `calibrationConfidence: 0` | `api-supabase.ts:439` | Calibration confidence is stored per `calibrations` row, not joined in `getScientific` |
| Fatigue `detected` uses `index > 0.1` heuristic | `api-supabase.ts:437` | No per-session fatigue flag column |
| `avgCalibrationConfidence` in overview/devices also `0` | `api-supabase.ts:368` | Same missing join |

## Evidence

- `no-key-warnings.test.tsx` renders `scientific` with no React key warning.
- `live-contract-timeline.test.tsx` writes `scientific_results` (focus_score,
  grade, consistency_rating) through the real `PersistenceProvider` path into
  a fake Supabase client, proving the write→read contract the dashboard consumes.
- `api-supabase.ts` `getScientific` computes real statistics (mean, median,
  variance, percentiles, CV) — no literal fixtures.

## Decision

**Keep.** Optional follow-up (separate task, not part of RC1 stabilization):
join `calibrations.confidence` into `getScientific` and implement
`byDimension` (per-game / per-campaign breakdown) to remove the two `0` fields.
