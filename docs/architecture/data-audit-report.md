# Data Audit Report — Phase Repair Enterprise

## 1. localStorage Count
- **Supabase env vars**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID` — all **NOT SET**
- **Result**: `isSupabaseAvailable()` returns `false` → 100% of data lives in **localStorage only**
- **Table keys** (8 localStorage keys, all `_v1` suffixed):
  - `repair_requests_v1`
  - `repair_quotes_v1`
  - `repair_timeline_v1`
  - `repair_courier_jobs_v1`
  - `repair_notifications_v1`
  - `repair_photos_v1`
  - `repair_status_history_v1`
  - `repair_audit_log_v1`
- **Count**: Depends on browser data at runtime. The repair engine generates test data during tests.

## 2. Supabase Connection Status
- **No env vars configured** → Supabase client never initializes
- `initSupabase()` throws `"Supabase URL and anon key are required"` if called
- `RepairDataService` singleton is never created
- All data flows exclusively through localStorage

## 3. Table Check (if Supabase were connected)

### `repair_requests` table
- Created in migration `00001` (93 lines), fixed in `00005`
- **22 columns**: id, repair_code, customer_name, customer_phone, brand_name, model_name, condition, issue, description, device_working, lock_screen, previously_repaired, latitude, longitude, location_accuracy, google_maps_link, photo_paths (jsonb), status, admin_notes, created_at, updated_at, customer_id, assigned_courier_id, assigned_technician_id
- **Indexes**: phone, status, code, customer_name
- **RLS**: Public insert/select, authenticated update
- **Status**: `00005` changes default from `'Pending Quote'` to `'Pending'`

### `repair_quotes` table
- 11 columns, FK → repair_requests(id)
- RLS: public read, authenticated insert/update

### `repair_timeline` table
- 6 columns, FK → repair_requests(id)
- RLS: public read and insert

### `repair_courier_jobs` table
- 14 columns, FK → repair_requests(id)
- RLS: authenticated read/insert/update

### `repair_notifications` table
- 8 columns, FK → repair_requests(id)
- RLS: authenticated read/insert

### `repair_photos` table
- 4 columns, FK → repair_requests(id)
- RLS: public insert, authenticated read

### `repair_status_history` table (from `00006`)
- 10 columns, FK → repair_requests(id)
- RLS: public read, authenticated insert
- Indexes: repair_id, created_at

### `repair_audit_log` table (from `00006`)
- 9 columns, FK optional
- RLS: authenticated read/insert
- Indexes: repair_id, created_at, action

### `users` table (from `00002`)
- Created for auth integration, has auto-create trigger on auth.signup

## 4. Migration Status

| File | Applied? | Notes |
|------|----------|-------|
| `00001_repair_tables.sql` | Unknown | Creates 6 core repair tables |
| `00002_create_users_table.sql` | Unknown | Users table + RLS + trigger |
| `00005_fix_repair_tables.sql` | Unknown | Adds condition, nullable fields, RLS policies |
| `00006_add_repair_status_history_and_audit.sql` | Unknown | Status history + audit log |
| `003_add_session_lifecycle.sql` | Unknown | Session lifecycle (unrelated to repair) |
| `004_add_analytics_events_indexes.sql` | Unknown | Analytics indexes (unrelated to repair) |

**Migration numbering gap**: Files jump from `00002` → `00005` → `00006`, then `003`/`004` at the end. Supabase CLI applies files alphabetically: `00001` → `00002` → `00005` → `00006` → `003_add_session_lifecycle.sql` → `004_add_analytics_events_indexes.sql`. The out-of-order `003`/`004` files (named with 3 digits instead of 5) will be applied after `00006`, which is the correct order for sessions/analytics, but the naming inconsistency is confusing.

## 5. RLS Status
RLS is **enabled** on all 8 repair tables via `00005` and `00006`. Policies:
- `repair_requests`: Anyone can INSERT + SELECT; only authenticated can UPDATE
- `repair_quotes`: Anyone SELECT; authenticated INSERT/UPDATE
- `repair_timeline`: Anyone INSERT + SELECT
- `repair_courier_jobs`: Authenticated only (SELECT/INSERT/UPDATE)
- `repair_notifications`: Authenticated only
- `repair_photos`: Anyone INSERT; authenticated SELECT
- `repair_status_history`: Anyone SELECT; authenticated INSERT
- `repair_audit_log`: Authenticated only

**Potential 404 cause**: If `repair_data_service.ts` queries `repair_requests` but RLS blocks `DELETE` or `UPDATE` for unauthenticated users → 404/401 error. The public INSERT policy allows creating requests, but any attempt to update (status change) by non-authenticated user fails.

## 6. Why Request 0676070165 Cannot Be Found

**Standard code format**: `RP-YYYY-NNNNNN` (e.g., `RP-2026-000042`)

**`0676070165` analysis**:
- Does NOT match the `RP-YYYY-NNNNNN` format
- Does NOT appear anywhere in the codebase (0 results across all files)
- Looks like a **phone number** (Algerian format starting with `0676` or `0770`)
- Could also be an **older tracking code** from a previous system version before the `RP-` format was introduced

**Root cause**: The user is likely searching by **phone number** or **legacy ID** rather than a repair code. The current `detectSearchType()` in `RepairTrackingScreen.tsx:43-48` recognizes `RP-` prefix for code search, or `0[567]` prefix for phone search. `0676070165` starts with `0676` → would be classified as phone search, not code search.

**To verify**: The user should try searching by the customer's phone number instead, or check if this code was from a system that used a different format.

## 7. Critical Architecture Issues Found

### Issue A: localStorage ↔ Supabase Table Name Mismatch
- localStorage keys use `_v1` suffix (e.g., `repair_requests_v1`) — defined in `REPAIR_TABLES`
- Supabase tables have NO suffix — queried as `repair_requests` in `repair-data-service.ts`
- This means data NEVER syncs between localStorage and Supabase
- A request saved via localStorage will NOT appear when Supabase is connected

### Issue B: `isSupabaseAvailable()` Only Checks Once
- Cached permanently at module load
- Never retries if Supabase goes down and comes back
- If env vars exist but Supabase is unreachable, ALL operations try Supabase first (wasting time/requests) before falling back

### Issue C: Courier Name is Free-Text Input
- `RepairAdminDashboard.tsx:326-331` — `input` field for courier name
- `courierId` generated as `'courier-' + Date.now().toString(36)` — totally random
- No courier database/management system

### Issue D: No Technician Management
- `assignedTechnicianId` exists on `RepairRequest` but no UI to assign/manage
- No `technicians` table in migrations
- No technician store/screen

### Issue E: No Archive System
- Delivered/Cancelled requests stay in main list forever
- No `Archived` status or automated archiving

### Issue F: Delivered Requests Disappear (User Report)
- When `isSupabaseAvailable()` returns `true` on one machine but data lives in localStorage
- Or when RLS blocks read of `repair_requests` for unauthenticated users
- The request is written to one data source but read from another → appears as "disappeared"

## 8. Recommendations

1. **Fix table name constant**: Either rename localStorage keys to match Supabase (remove `_v1`), or use consistent naming across both layers
2. **Add Supabase migration verification**: Build migration check into diagnostics
3. **Courier table**: Create `couriers` table + CRUD UI → replace free-text input with Select dropdown
4. **Technician table**: Create `technicians` table → assign from list
5. **Archive system**: Add `Archived` status + auto-archive Delivered after configurable delay
6. **Unified Repository**: Create `RepairRepository` class that wraps both layers with clear priority
7. **Fix `isSupabaseAvailable()`**: Add periodic health check retry
