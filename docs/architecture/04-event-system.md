# Event System

FOCUS has two complementary event systems: a **Domain Event Publisher** (pub-sub, in-memory) and a **Telemetry Service** (batched, persistent to Supabase).

## 1. Domain Event Publisher (`src/core/events/index.ts`)

A lightweight publish-subscribe system used for **internal communication** between modules.

### Event Types

```typescript
type EventType =
  | 'session_created'
  | 'session_updated'
  | 'session_completed'
  | 'session_abandoned'
  | 'session_deleted'
  | 'session_synced'
  | 'calibration_updated'
  | 'settings_changed';
```

### API

```typescript
interface EventPublisher {
  publish<T>(type: EventType, payload: T, source?: string): void;
  subscribe<T>(type: EventType, handler: EventHandler<T>): () => void;  // returns unsubscribe fn
  subscribeAll(handler: EventHandler): () => void;
  getHistory(type?: EventType, limit?: number): readonly DomainEvent[];
  clearHistory(): void;
}
```

### Key Listeners

| Subscriber | Listens To | Action |
|-----------|-----------|--------|
| `PersistenceProvider` | `session_created` | Inserts row in Supabase `sessions` table, starts ping interval |
| `PersistenceProvider` | `session_completed` | Calculates scoring, upserts measurements + scientific results |
| `PersistenceProvider` | `session_abandoned` | Marks session as completed with ended_reason |
| `setupSessionTelemetry` | `session_created` | Sets telemetry context, tracks `game_started` |
| `setupSessionTelemetry` | `session_completed` | Tracks `game_completed` |

### History

The publisher keeps the last 100 events in memory, accessible via `getHistory()` for debugging and research.

## 2. Telemetry Service (`src/core/telemetry/index.ts`)

A batched event tracking system that collects analytics and flushes to Supabase.

### Event Types

Defined in `src/core/analytics/events.ts` (93 event types):

| Category | Events |
|----------|--------|
| **Lifecycle** | `app_opened` |
| **Landing** | `landing_loaded`, `campaign_detected`, `game_intro_shown` |
| **Consent** | `consent_granted`, `consent_withdrawn` |
| **Calibration** | `calibration_started`, `calibration_completed` |
| **Game** | `round_started`, `lamp_appeared`, `lamp_clicked`, `miss_click` |
| **Game Lifecycle** | `game_started`, `game_completed`, `game_abandoned`, `game_paused`, `game_resumed` |
| **Results** | `results_viewed`, `share_clicked` |
| **Auth** | `auth_guest_created`, `auth_registered`, `auth_converted`, `login` |
| **QR/Campaign** | `qr_scanned`, `qr_generated`, `qr_game_completed`, `campaign_opened`, `referral_clicked` |
| **Commerce** | `device_selected`, `trade_offer_viewed`, `trade_requested`, `whatsapp_clicked`, `buy_flow_started`, `sell_flow_started`, `exchange_flow_started` |
| **Repair** | `repair_requested`, `quote_sent`, `quote_approved`, `courier_assigned`, `courier_collected`, `store_received`, `inspection_started`, `repair_started`, `waiting_parts`, `repair_completed`, `repair_failed`, `customer_received` |
| **Courier** | `courier_trip_started`, `courier_arrived`, `courier_heading_store`, `courier_returning`, `courier_returned` |

### Telemetry Event Structure

```typescript
interface TelemetryEvent {
  readonly type: TelemetryEventType;
  readonly properties: Record<string, unknown>;
  readonly timestamp: number;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly deviceId: string | null;
  readonly campaignId: string | null;
}
```

### Batching and Flush

- **Batch size**: 20 events (configurable, default)
- **Flush interval**: 30 seconds (configurable, set to 5s in production)
- **Flush target**: Supabase `analytics_events` table via `dataService.trackEvent()`
- **On flush failure**: Events are re-queued (not lost)

### Global Access

```typescript
import { getGlobalTelemetry } from '../core/telemetry';
const telemetry = getGlobalTelemetry();
telemetry.track('app_opened', { source: 'app_mount' });
telemetry.setCampaignId('camp_123');
telemetry.flush();
```

## 3. Gamification Events (`src/core/gamification/achievements.ts`)

A separate achievement system stores unlock state in localStorage:

```typescript
const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_light', title: 'First Light', category: 'milestone', requirement: 1 },
  { id: 'speed_demon', title: 'Speed Demon', category: 'speed', requirement: 250 },
  // ... 18 total achievements
];
```

Achievements are checked after each session via `checkAchievements()`, which evaluates stats (total sessions, best time, consecutive A grades, fatigue, etc.) against unlock criteria.

### Data Flow

```
User Action → Code calls getGlobalTelemetry().track()
  → Event queued in TelemetryService queue
  → When queue reaches batchSize or flushInterval fires:
    → Events sent to Supabase analytics_events table
    → On success: queue cleared
    → On failure: events re-queued for retry

Session events also flow through the Domain Event Publisher:
  SessionService.startSession() → publisher.publish('session_created')
    → PersistenceProvider listens → creates session row in Supabase
    → setupSessionTelemetry listens → sets telemetry context
```
