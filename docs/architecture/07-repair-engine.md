# Repair Engine

The Repair Engine (`src/services/repair/`) is a complete repair order management system integrated with WhatsApp, courier tracking, photo management, and business intelligence.

## System Architecture

```
src/services/repair/
├── repair-types.ts      — All types, constants, status flow, code generation
├── repair-engine.ts     — Business logic (create, quote, courier, status)
├── repair-database.ts   — localStorage persistence layer
├── repair-whatsapp.ts   — WhatsApp message templates
└── repair-bi.ts         — Repair BI analytics data source
```

Integration points:
- `src/core/supabase/repair-data-service.ts` — Supabase sync for repair data
- `src/core/supabase/data-service.ts` — General data service
- `src/services/whatsapp-service.ts` — WhatsApp deep link builder
- `src/core/telemetry/` — Event tracking for each repair action

## Repair Request Lifecycle

### Status Flow

```
Pending → Received → Diagnosing → Waiting Parts → Repairing → Ready → Delivered
                                                                    → Cancelled (from any state)
```

### 1. Create Request

`createRepairRequest()` in `repair-engine.ts`:
- Generates a unique repair code (`RP-YYYY-NNNNNN`)
- Creates a `RepairRequest` with: customer info, phone (brand + model), issue, description, location (GPS + Google Maps link), photo paths
- Saves to localStorage via `repair-database.ts`
- Verifies by re-reading the saved record
- Adds timeline event: "طلب تصليح جديد"
- Adds status history entry with IP + device info
- Adds audit log entry
- Sends telemetry event: `REPAIR_REQUESTED`
- Syncs to Supabase via `repair-data-service.ts`

### 2. Quote

`createQuote()` → admin sets estimated price + days:
- Creates a `RepairQuote` with estimatedPrice, estimatedDays, adminNotes, recommendedAction
- Updates status to `'Received'`
- Adds timeline event with quote details
- Sends quote via WhatsApp

`approveQuote()` → customer approves:
- Sets `approvedAt` timestamp
- Advances status to `'Diagnosing'`
- Logs approval in timeline + audit

`rejectQuote()` → customer rejects:
- Sets `rejectedAt` timestamp
- Cancels the repair request
- Logs rejection

### 3. Courier System

`assignCourier()` → admin assigns a courier:
- Creates a `CourierJob` with status `'Pending'`
- Links courier ID to repair request
- Adds timeline event: "تم تعيين المندوب: name"

`updateCourierJobStatus()` → courier updates their trip:
- Statuses: `Pending → Trip Started → Arrived → Collected → Heading To Store → Delivered To Store → Returning → Returned`
- Each status change triggers a telemetry event
- Auto-updates repair request status when device is collected or delivered

### 4. Diagnosis → Repair

- `updateRepairStatus()` — admin advances the status
- Each transition fires a telemetry event:
  - `Diagnosing` → `INSPECTION_STARTED`
  - `Repairing` → `REPAIR_STARTED`
  - `Waiting Parts` → `WAITING_PARTS`
  - `Ready` → `REPAIR_COMPLETED`
  - `Delivered` → `CUSTOMER_RECEIVED`
  - `Cancelled` → `REPAIR_FAILED`

### 5. Customer History

`getRepairCustomerProfile()` — aggregates all repairs for a phone number:
- Total repairs, completed, failed, total paid, average cost
- Most repaired phone, most common issue
- Last repair details
- Repair success rate

## WhatsApp Integration

`src/services/repair/repair-whatsapp.ts` provides two functions:

```typescript
sendRepairRequestWhatsApp(request)  // Sends new request details
sendStatusWhatsApp(request)         // Sends current status
```

Both use `openWhatsApp()` from `src/services/whatsapp-service.ts` to build a `wa.me` URL with a pre-formatted Arabic message (including the phone brand, model, issue, repair code, and location).

## Database Tables (Supabase)

Repair data uses versioned table names:

| Table | Purpose |
|-------|---------|
| `repair_requests_v1` | Main repair request records |
| `repair_quotes_v1` | Quote/pricing per repair |
| `repair_timeline_v1` | Timeline of status events |
| `repair_courier_jobs_v1` | Courier assignment and tracking |
| `repair_notifications_v1` | WhatsApp/push/in-app notifications |
| `repair_photos_v1` | Photo uploads per repair |
| `repair_status_history_v1` | Full status change audit trail |
| `repair_audit_log_v1` | All admin actions audit log |

## Repair Types

```typescript
const REPAIR_ISSUES = [
  'Screen', 'Battery', 'Charging', 'Camera', 'Speaker',
  'Microphone', 'Network', 'Software', 'Water Damage',
  'No Power', 'Boot Loop', 'Other',
] as const;
```

## QR Code Tracking

Repair requests are identified by their `repairCode` (format `RP-YYYY-NNNNNN`), which can be encoded as a QR code. The tracking screen uses this code to look up the repair status.

## Business Intelligence Integration

The `repair-bi.ts` module provides analytics data:
- Average repair time, success rate, profit
- Top issues and brands by frequency
- Repeat customer rates
- Courier performance metrics
- Pending quotes and failed repair counts

This data feeds into the BI Center's dashboards (Command Center, Staff Performance).
