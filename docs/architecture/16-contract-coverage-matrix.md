# Contract Coverage Matrix — FOCUS Product Contract v1.0 ↔ Database

Reference doc mapping every Product Contract v1.0 requirement to its database
object. Status key: **✅** enforced/documented now · **⏳** deferred to a later
phase · **🟡** transitional (enforcement lands in Phase E).

## Core contract

| Contract requirement | DB object(s) | Status |
|---|---|---|
| Campaign state machine `draft\|scheduled\|running\|paused\|ended\|archived` | `campaigns.status` (backfilled from `is_active` in 00012; CHECK in Phase E) | 🟡 |
| Campaign version | `campaigns.campaign_version` | ✅ |
| Session snapshot (results stay stable) | `sessions.campaign_snapshot` (JSONB: `id, name, version, plugin_id, plugin_version, start_date, end_date, status, created_at`) | ✅ |
| Engine identity | `sessions.engine_name` + `sessions.engine_version` | ✅ |
| Replay (`trials[]` per press) | `sessions.trials` | ✅ |
| Idle-abandon timeout (default 5 min) | `campaigns.abandon_timeout_minutes` + `system_settings.abandon_timeout_minutes` | ✅ |
| Audit trail (`reason` mandatory) | `audit_log` | ✅ |
| Feature flags (operational / experiment) | `system_settings.flags.op` + `system_settings.flags.exp` (JSONB groups) | ✅ |
| Delegate assignments (no fixed count) | `job_assignments` (incl. `cancelled` state) | ✅ |
| Observability contract (`request_id/duration_ms/error_code` + source/outcome) | `analytics_events` (`schema_version, request_id, service, action, duration_ms, status, error_code`) | ✅ |
| QR lookup: playable only + explained outcome | `lookup_campaign_by_short_code_v2` (`FOUND\|ENDED\|SCHEDULED\|PAUSED\|NOT_FOUND`) | ✅ |
| Guest → User identity (register = upgrade, no re-signup) | `users` + `convertGuestToUser` (app layer) | ⏳ Phase E |
| Unified queue (offline-first) | IndexedDB client-side; no DB table in v1 | ⏳ Phase F |
| Retention jobs (end expired campaigns, abandon idle sessions) | Scheduled jobs (roadmap in 00013) | ⏳ Phase F |
| SECURITY DEFINER with `SET search_path` | All RPCs — `update_updated_at`/`has_super_admin`/`bootstrap_super_admin`/`admin_promote_user`/`handle_new_user`/`increment_qr_counter` still need it (00013) | 🟡 |
| Least-privilege RLS | Policies on all tables (existing + new) | ✅ |
| RLS decisions in DB, not React | Policies + RPCs above | ✅ |
| Service role never exposed to the client | `client.ts` anon-key only | ✅ |

## Phase-1 rule compliance

| Phase-1 rule | Status |
|---|---|
| ADD ONLY — no `DROP` / `ALTER TYPE` / `RENAME` | ✅ |
| No new `CHECK` constraints | ✅ (deferred to Phase E, see 00013) |
| No change to defaults the current app relies on | ✅ (`campaigns.status` default untouched) |
| v1 RPC untouched; only `_v2` added | ✅ |
| Backfill is one-way and idempotent | ✅ (00012) |
| Forward-Compatible & Rollback-Aware | ✅ (each migration header documents it) |
