# Data Flow

FOCUS follows an **offline-first** data architecture. Data flows through three layers: **localStorage** (primary), **Supabase** (sync/backup), and **React Context** (UI state).

## Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    React UI Layer                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ AppScreen     │  │ BI Center   │  │ Research      │  │
│  │ Components   │  │ Dashboards  │  │ Console       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                  │          │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │              Context Layer (React)                  │  │
│  │  AppState (navigation)  │  Settings  │  Auth       │  │
│  │  Theme  │  Translation  │  Persistence Provider    │  │
│  └─────────────────────────┴──────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────┐
│              Services Layer (TypeScript)                  │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Session    │  │ Catalog  │  │ Repair   │            │
│  │ Service    │  │ Service  │  │ Engine   │            │
│  ├────────────┤  ├──────────┤  ├──────────┤            │
│  │ Inventory  │  │ Price    │  │ Alias    │            │
│  │ Service    │  │ Memory   │  │ Engine   │            │
│  └───────┬────┘  └────┬─────┘  └────┬─────┘            │
└──────────┼─────────────┼─────────────┼─────────────────┘
           │             │             │
┌──────────┴─────────────┴─────────────┴─────────────────┐
│              Persistence Layer                           │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │    localStorage      │  │      Supabase             │  │
│  │                      │  │                          │  │
│  │  focus_settings     │  │  sessions (with scoring) │  │
│  │  focus_sessions     │  │  users (auth)            │  │
│  │  focus_achievements │  │  devices                 │  │
│  │  price_memory_v1    │  │  calibrations            │  │
│  │  catalog_inventory  │  │  surveys                 │  │
│  │  popularity_events  │  │  analytics_events        │  │
│  │  catalog_inventory_ │  │  campaigns               │  │
│  │    transactions     │  │  repair_requests_v1      │  │
│  │  repair_requests    │  │  repair_quotes_v1        │  │
│  │  sticker_*          │  │  repair_timeline_v1      │  │
│  └─────────────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### 1. Session Data Flow

```
Game plays 7 rounds
  → raw reaction times collected in memory
  → calibration applied → correctedRts
  → calculateFocusScore() → grade + score
  → dispach SET_RESULTS → AppState.results
  → saveSessionHistory() → localStorage (focus_sessions)
  → SessionService.completeSession()
    → publisher.publish('session_completed')
      → PersistenceProvider listens
        → calculate analytics (consistency, fatigue, mean, median)
        → upsert into Supabase sessions table
      → setupSessionTelemetry listens
        → track 'game_completed'
```

### 2. Catalog Data Flow

```
App mounts
  → CatalogLoader builds SearchIndex from 18 JSON brand files
    → brandIndex (Map), modelNumberIndex, aliasIndex, tokenIndex
    → stored in module-level variable (not localStorage)

User searches
  → search(query) / searchProgressive(query)
    → tokenize query
    → match against tokenIndex, modelNumberIndex, aliasIndex
    → score and rank results
    → return SearchResult[]

User selects model
  → cascade selector: getSeries() → getModelsBySeries() → getVariants()
  → displayed in UI from in-memory index
```

### 3. Settings Flow

```
App mounts
  → SettingsProvider initializes useSettings()
    → reads localStorage 'focus_settings'
    → if not found, uses defaults (theme: midnight, lang: browser-detect)
  → ThemeProvider reads current theme from settings
  → TranslationProvider reads language from settings

User changes setting
  → updateSettings(partial)
    → writes to localStorage
    → notifies all subscribers via listener set
    → triggers DOM updates (lang, dir, theme-color)
```

### 4. Repair Flow

```
Customer submits repair form
  → createRepairRequest()
    → generate unique repair code
    → save to localStorage repair_requests
    → add timeline event (localStorage)
    → add status history (localStorage)
    → add audit log (localStorage)
    → sync to Supabase repair_requests_v1
    → track telemetry 'repair_requested'
    → return { request, code }

Admin views dashboard
  → getAllRepairRequests() → localStorage
  → optionally syncs from Supabase on refresh
```

### 5. Inventory Flow

```
Store adds stock
  → InventoryService.addStock(brand, model, variant, qty)
    → finds existing record by modelId+variant+condition
    → updates or creates InventoryRecord
    → saves to localStorage 'catalog_inventory'
    → records transaction → 'catalog_inventory_transactions'
    → records movement → 'catalog_inventory_movements_v2'
    → records timeline event → 'inventory_timeline_v3'
    → returns updated InventoryRecord
```

## Sync Strategy

FOCUS uses a **local-first with background sync** model:

1. **All writes go to localStorage first** — the app works fully offline
2. **Background sync to Supabase** — when connectivity is available:
   - Sessions: synced via `PersistenceProvider` which listens to domain events
   - Repair: synced immediately via `repair-data-service.ts`
   - Inventory: stored only in localStorage (no automatic Supabase sync)
   - Price memory: stored only in localStorage
3. **Conflict resolution** — `src/core/offline/index.ts` provides strategies:
   - `client_wins` — local data takes precedence
   - `server_wins` — remote data takes precedence
   - `last_write_wins` — newer timestamp wins
   - `merge` — deep merge objects

## Offline Queue (`src/core/offline/index.ts`)

For operations that must be synced to Supabase:

```typescript
interface QueueItem {
  operation: 'create' | 'update' | 'delete';
  table: string;
  payload: unknown;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed' | 'retrying';
}
```

- Exponential backoff: `baseDelay * 2^retryCount` (capped at 60s)
- Max 5 retries per item
- `SyncManager` processes the queue when online
- Network status tracked via `window.online`/`offline` events
