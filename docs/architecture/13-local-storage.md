# localStorage Usage

FOCUS stores the majority of its operational data in localStorage. This enables **offline-first operation** — the app is fully functional without a network connection.

## Storage Map

| localStorage Key | Data Type | Module | Purpose | Size Limit |
|-----------------|-----------|--------|---------|------------|
| `focus_settings` | `AppSettings` JSON | `core/config/settings.ts` | Theme, language, motion preferences | ~200 bytes |
| `focus_sessions` | `SessionRecord[]` | `core/history/` | Completed game session history | ~100 sessions |
| `focus_achievements` | `Record<AchievementId, timestamp>` | `core/gamification/achievements.ts` | Unlocked achievement timestamps | ~500 bytes |
| `price_memory_v1` | `PriceEvent[]` | `services/price-memory.ts` | Buy/sell/exchange price history (max 10,000) | Varies |
| `focus-price-memory` | `PriceRecord[]` | `services/price-memory.ts` | Consumer-facing catalog price history | Varies |
| `catalog_inventory` | `InventoryRecord[]` | `services/inventory-service.ts` | Stock records (brand, model, variant, qty) | Varies |
| `catalog_inventory_transactions` | `InventoryTransaction[]` | `services/inventory-service.ts` | Stock transaction log (max 500) | Varies |
| `catalog_inventory_movements_v2` | `InventoryMovement[]` | `services/inventory-service.ts` | Stock movement audit (max 2,000) | Varies |
| `inventory_timeline_v3` | `TimelineEvent[]` | `services/inventory-service.ts` | Inventory event timeline (max 5,000) | Varies |
| `popularity_events` | `PopularityEvent[]` | `services/popularity-engine.ts` | Phone search/select/purchase events (max 5,000) | Varies |
| `popularity_scores` | `PopularityScore[]` | `services/popularity-engine.ts` | Cached popularity scores | Varies |
| `repair_requests` | `RepairRequest[]` | `services/repair/repair-database.ts` | Repair order requests | Varies |
| `repair_quotes` | `RepairQuote[]` | `services/repair/repair-database.ts` | Repair quotes | Varies |
| `repair_timeline` | `RepairTimelineEvent[]` | `services/repair/repair-database.ts` | Repair timeline events | Varies |
| `repair_courier_jobs` | `CourierJob[]` | `services/repair/repair-database.ts` | Courier jobs | Varies |
| `repair_notifications` | `RepairNotification[]` | `services/repair/repair-database.ts` | Repair notifications | Varies |
| `repair_photos_v1` | `RepairPhoto[]` | `services/repair/repair-database.ts` | Repair photo metadata | Varies |
| `repair_status_history_v1` | `RepairStatusHistoryEntry[]` | `services/repair/repair-database.ts` | Status change audit | Varies |
| `repair_audit_log_v1` | `RepairAuditEntry[]` | `services/repair/repair-database.ts` | Admin action audit log | Varies |
| `sticker_projects_v1` | `StickerProject[]` | `services/sticker/sticker-database.ts` | Sticker design projects | Varies |
| `sticker_analytics_v1` | `StickerAnalytics[]` | `services/sticker/sticker-analytics.ts` | Sticker usage analytics | Varies |
| `sticker_scan_log_v1` | `StickerScanEvent[]` | `services/sticker/sticker-engine.ts` | Sticker scan history | Varies |
| `customer_memory_v1` | `CustomerRecord[]` | `services/customer-memory.ts` | Repeat customer recognition | Varies |
| `device_ledger_v1` | `DeviceRecord[]` | `services/device-ledger.ts` | Device ownership records | Varies |
| `user_profile_v1` | `UserProfile` | `core/session/` | User profile data | ~1 KB |
| `offline_queue_v1` | `QueueItem[]` | `core/offline/` | Pending sync operations (exponential backoff) | Varies |
| `bi_rules_v1` | `BIRule[]` | `business-intelligence/actions/RuleEngine.tsx` | IF-THEN automation rules | Varies |
| `bi_notifications_v1` | `Notification[]` | `business-intelligence/actions/NotificationCenter.tsx` | BI notifications | Varies |

## Data Patterns

### Reading Data

All services follow a consistent pattern:

```typescript
function loadAll(): T[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];  // Graceful degradation on parse failure
  }
}
```

### Writing Data

```typescript
function saveAll(data: T[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
```

### Append-Only Logs

Most datasets (price memory, timeline, movements, popularity events) use append-only patterns:
- New entries are pushed to the end of the array
- Arrays are capped at a maximum length (e.g., 10,000 price events, 5,000 timeline entries)
- Operations prepend to show most recent first (e.g., `all.unshift(event)`)

### Offline Queue (`src/core/offline/index.ts`)

For operations that must eventually sync to Supabase:

```typescript
interface QueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: string;
  payload: unknown;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed' | 'retrying';
  error: string | null;
  nextRetryAt: number | null;
}
```

The queue uses exponential backoff: `delay = 1000ms * 2^retryCount` (capped at 60s). Items are processed by `SyncManager` when the app comes online.

## Migration Strategy

Data is versioned in key names:

- `price_memory_v1` → if schema changes, increment to `v2`
- `catalog_inventory_movements_v2` → v2 migration handled by adding fields with defaults
- `repair_requests` → no version suffix (uses table names from constants instead)
- `inventory_timeline_v3` → has gone through 3 iterations

When a service detects missing fields (e.g., `totalPurchased` not present on an `InventoryRecord`), it applies defaults on read:

```typescript
for (const r of records) {
  if (!r.status) r.status = calcStatus(r.quantity);
  if (typeof (r as any).totalPurchased !== 'number') (r as any).totalPurchased = 0;
}
```

## Storage Limits

localStorage is limited to ~5-10 MB per origin. FOCUS conservatively manages this by:
- Capping arrays (10,000 max for price events, 5,000 for timeline, 500 for transactions)
- Storing only essential fields (no large binary blobs — photos are referenced by path)
- Using JSON compression by omitting null/undefined fields
- Clearing completed items from the offline queue
- Achievements store only unlock timestamps, not full objects
