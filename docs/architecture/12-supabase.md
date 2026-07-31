# Supabase Integration

FOCUS uses Supabase as its backend for authentication, data persistence, real-time session monitoring, and analytics storage.

## Configuration

Supabase client is configured in `src/core/supabase/client.ts`:

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function getSupabaseClient(): SupabaseClient { ... }
export function getSupabaseConfig(): { url: string; anonKey: string } { ... }
```

Environment variables are loaded from `.env` at the project root.

## Database Schema (`src/core/supabase/schema.ts`)

### Tables

| Table | Type | Row | Purpose |
|-------|------|-----|---------|
| `users` | `DatabaseUser` | `{ id, email, display_name, role, avatar_url, is_anonymous, created_at, updated_at, last_login_at }` | User accounts and roles |
| `sessions` | `DatabaseSession` | `{ id, user_id, device_id, calibration_id, plugin_id, status, measurements, scientific_results, metadata, created_at, updated_at, finished_at, version }` | Game/test sessions |
| `devices` | `DatabaseDevice` | `{ id, user_id, browser, browser_version, os, os_version, platform, screen_width, screen_height, pixel_ratio, refresh_rate, touch_support, pointer_type, cpu_cores, memory_gb, language, timezone, user_agent, collected_at }` | Device profiles |
| `calibrations` | `DatabaseCalibration` | `{ id, user_id, device_id, refresh_rate, display_lag_ms, input_lag_ms, confidence, platform, browser_name, created_at, expires_at }` | Calibration records (30-day expiry) |
| `surveys` | `DatabaseSurvey` | `{ id, user_id, age_range, gender, country, state, education, occupation, sleep_hours, coffee_per_day, exercise_frequency, dominant_hand, gaming_frequency, created_at }` | User survey responses |

### Session Measurements (JSON columns)

The `sessions` table has two JSON fields:

**`measurements`**: `{ raw_rts, corrected_rts, total_rounds, valid_rounds, outlier_count }`

**`scientific_results`**: `{ mean_corrected_ms, median_corrected_ms, consistency_score, consistency_rating, fatigue_index, fatigue_score, focus_score, grade }`

## Authentication (`src/core/auth/AuthProvider.tsx`)

Uses Supabase Auth with the following flow:

1. **Anonymous (guest) users**: Created on first visit. A guest user is created via `supabase.auth.signInAnonymously()`.
2. **Registered users**: Can register with email/password or convert from guest.
3. **Roles**: `guest` → `user` → `researcher` → `admin` → `super_admin`
4. **Protected routes**: Components like `ResearchConsole`, `BusinessIntelligenceCenter`, and admin screens are wrapped in `<ProtectedRoute>` which checks the user's role.

## Session Persistence (`src/core/supabase/PersistenceProvider.tsx`)

The key persistence component. Listens to domain events and syncs to Supabase:

### Session Created
```typescript
// Creates a session row with status 'running'
await client.from('sessions').insert({
  id: sessionId,
  user_id: userId,
  device_id: deviceId,
  calibration_id: calibrationId,
  campaign_id: campaignId,
  plugin_id: gameMode,
  status: 'running',
  // timestamps, metadata
});
```

### Session Completed
```typescript
// Calculates all scientific metrics
const consistency = analyzeConsistency(correctedRts);
const fatigue = detectFatigue(correctedRts);
const scoring = calculateFocusScore({ mean, consistency, fatigue, totalRounds });

// Upserts the session with full results
await client.from('sessions').upsert({
  id: sessionId,
  status: 'completed',
  measurements: { raw_rts, corrected_rts, total_rounds, valid_rounds, outlier_count },
  scientific_results: { mean, median, consistency, fatigue, focus_score, grade },
  // timestamps
});
```

### Session Abandoned
```typescript
// Marks as completed with reason
await client.from('sessions').update({
  status: 'completed',
  ended_reason: 'browser_closed',
}).eq('id', sessionId);
```

### Browser Close Handling
- `beforeunload` event triggers both `sendBeacon()` and `fetch()` with `keepalive: true`
- Two methods used for redundancy — beacon is more reliable on mobile
- Marks session as completed with `browser_closed` reason

### Stale Session Cleanup
- Runs every 5 minutes
- Finds sessions `status = 'running'` with `last_activity_at > 5 minutes ago` or `NULL`
- Closes them with `timeout` reason

### Activity Pings
- While a session is running, a `setInterval` pings `last_activity_at` every 30 seconds
- `visibilitychange` handler also pings when the tab goes hidden

## Real-time Live Sessions (`src/core/supabase/live-sessions.ts`)

The Live Dashboard in the Research Console monitors active sessions in real-time:

```typescript
export function subscribeToLiveSessions(
  listener: (sessions: readonly LiveSession[]) => void
): () => void;  // returns unsubscribe function
```

**Mechanism**:
1. **Initial fetch**: `GET /sessions` with `.in('status', ['running', 'paused'])` — joins devices, campaigns, users
2. **Polling**: Every 5 seconds as fallback
3. **Supabase Realtime**: `postgres_changes` subscription on `sessions` table for push updates

The `LiveSession` type includes joined data: device details (OS, browser, screen), campaign name, user display name, current round count.

## Repair Data Service (`src/core/supabase/repair-data-service.ts`)

Separate service for repair order CRUD operations against Supabase:
- `createRepairRequest()`, `getRepairRequest()`, `updateRepairRequest()`
- `createQuote()`, `getQuote()`, `updateQuote()`
- `createCourierJob()`, `updateCourierJob()`
- `createTimelineEvent()`, `getTimeline()`

Uses versioned table names: `repair_requests_v1`, `repair_quotes_v1`, etc.

## Analytics Events

Telemetry events are flushed to Supabase via `dataService.trackEvent()`:

```typescript
await dataService.trackEvent({
  user_id: event.userId,
  session_id: event.sessionId,
  event_type: 'app_opened',
  event_data: { source: 'app_mount' },
  campaign_id: null,
  device_id: null,
  user_agent: navigator.userAgent,
});
```

Events are stored in the `analytics_events` table (not defined in schema.ts — created via migration).

## Campaigns

The `campaigns` table stores marketing campaign metadata:
- `name`, `source`, `location`, `school`, `company`, `event`
- `language`, `version`, `is_active`, `location_type`
- `country`, `state_name`, `city`, `district`, `venue`
- `goal`, `budget`, `budget_currency`, `campaign_type`, `material`
- `start_date`, `end_date`, `status`, `short_code`

`getCampaignByShortCode()` resolves 6-character short codes to full campaign records.

## Data Service (`src/core/supabase/data-service.ts`)

A comprehensive data access layer (702 lines) providing:
- Event tracking (`trackEvent`)
- Campaign CRUD (`createCampaign`, `getCampaign`, `getCampaignByShortCode`, `updateCampaign`)
- User management (`updateUserRole`, `getUserProfile`)
- Session queries (`getUserSessions`, `getSessionById`)
- Device management (`getDevice`, `createDevice`)
- Analytics queries (`getDashboardMetrics`, `getDailyStats`)
