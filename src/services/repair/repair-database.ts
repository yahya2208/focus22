import type {
  RepairRequest, RepairQuote, RepairTimelineEvent,
  CourierJob,
  RepairStatusHistoryEntry, RepairAuditEntry,
  Courier, Technician,
} from './repair-types';
import { REPAIR_TABLES, REPAIR_TABLES_LEGACY_V1 } from './repair-types';
import { getRepairDataService, resetRepairDataService } from '../../core/supabase/repair-data-service';

interface SimpleStore { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem?: (k: string) => void; }

function getStore(): SimpleStore {
  if (typeof localStorage !== 'undefined') return localStorage;
  return { getItem: () => null, setItem: () => {} };
}

const _store = getStore();

function loadTable<T>(key: string): T[] {
  try {
    const raw = _store.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTable<T>(key: string, data: T[]): void {
  _store.setItem(key, JSON.stringify(data));
}

// ── Legacy v1 table migration ──────────────────────────────────

let _migrated = false;

function migrateFromV1(): void {
  if (_migrated) return;
  _migrated = true;
  for (const [newKey, legacyKey] of Object.entries(REPAIR_TABLES_LEGACY_V1)) {
    const legacyData = _store.getItem(legacyKey);
    if (legacyData) {
      const currentData = _store.getItem(newKey);
      if (!currentData || JSON.parse(currentData).length === 0) {
        _store.setItem(newKey, legacyData);
      }
      if (_store.removeItem) _store.removeItem(legacyKey);
    }
  }
}

// ── Supabase connection (with retry + exponential backoff) ──────
//
// AUDIT NOTE 2026-08-01:
//   Previously the retry counter was capped at MAX_RETRY_COUNT=5 after which
//   retries stopped FOREVER, even if the network came back (the only way to
//   resume was a full page refresh or the user triggering a write → catch).
//   To avoid silent forever-offline mode we now:
//     1. Retry INDEFINITELY (no hard cap; we rely on backoff to stay gentle).
//     2. Use EXPONENTIAL BACKOFF: 30s → 60s → 120s → ... → 10 min cap.
//     3. The counter is reset to 0 on every successful connection, so fast
//        retries happen again after transient failures that recovered quickly.
let _supabaseAvailable: boolean | null = null;
let _supabaseRetryTimer: ReturnType<typeof setTimeout> | null = null;
let _supabaseRetryCount = 0;
const RETRY_BASE_INTERVAL_MS = 30000;
const RETRY_MAX_BACKOFF_MS = 10 * 60 * 1000; // 10 minutes – absolute ceiling

function clearSupabaseCache(): void {
  _supabaseAvailable = null;
  resetRepairDataService();
}

function isSupabaseAvailable(): boolean {
  if (_supabaseAvailable !== null) return _supabaseAvailable;
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
      _supabaseAvailable = false;
      return false;
    }
    const svc = getRepairDataService();
    _supabaseAvailable = !!svc;
    _supabaseRetryCount = 0;
  } catch {
    _supabaseAvailable = false;
    scheduleRetry();
  }
  return _supabaseAvailable;
}

function scheduleRetry(): void {
  if (_supabaseRetryTimer) return;
  _supabaseRetryCount++;
  const expFactor = Math.pow(2, Math.max(0, _supabaseRetryCount - 1));
  const nextDelayMs = Math.min(RETRY_BASE_INTERVAL_MS * expFactor, RETRY_MAX_BACKOFF_MS);
  _supabaseRetryTimer = setTimeout(() => {
    _supabaseRetryTimer = null;
    _supabaseAvailable = null;
    isSupabaseAvailable();
  }, nextDelayMs);
}

export function forceRecheckConnection(): boolean {
  _supabaseAvailable = null;
  resetRepairDataService();
  return isSupabaseAvailable();
}

// ── Helpers ──────────────────────────────────────────────────

// ── Migration on first load ────────────────────────────────────

migrateFromV1();

// ── Repair Requests ────────────────────────────────────────────

export async function getAllRepairRequests(): Promise<RepairRequest[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getAllRepairRequests(); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS);
}

export async function getRepairRequest(id: string): Promise<RepairRequest | null> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getRepairRequest(id); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).find(r => r.id === id) ?? null;
}

export async function saveRepairRequest(request: RepairRequest): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().saveRepairRequest(request); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS);
  const idx = all.findIndex(r => r.id === request.id);
  if (idx >= 0) all[idx] = request; else all.push(request);
  saveTable(REPAIR_TABLES.REPAIR_REQUESTS, all);
}

export async function getRepairCodeExists(code: string): Promise<boolean> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getRepairCodeExists(code); } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS);
  return all.some(r => r.repairCode === code);
}

export async function deleteRepairRequest(id: string): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().deleteRepairRequest(id); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).filter(r => r.id !== id);
  saveTable(REPAIR_TABLES.REPAIR_REQUESTS, all);
}

export async function getRepairRequestsByCustomer(customerPhone: string): Promise<RepairRequest[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getRepairRequestsByCustomer(customerPhone); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).filter(r => r.customerPhone === customerPhone);
}

export async function getRepairRequestsByStatus(status: string): Promise<RepairRequest[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getRepairRequestsByStatus(status); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).filter(r => r.status === status);
}

export async function getRepairRequestsByCourier(courierId: string): Promise<RepairRequest[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getRepairRequestsByCourier(courierId); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).filter(r => r.assignedCourierId === courierId);
}

export async function getRepairRequestByCode(code: string): Promise<RepairRequest | null> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getRepairRequestByCode(code); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).find(r => r.repairCode === code) ?? null;
}

// ── Quotes ──────────────────────────────────────────────────────

export async function getAllQuotes(): Promise<RepairQuote[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getAllQuotes(); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairQuote>(REPAIR_TABLES.REPAIR_QUOTES);
}

export async function getQuote(repairId: string): Promise<RepairQuote | null> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getQuote(repairId); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairQuote>(REPAIR_TABLES.REPAIR_QUOTES).find(q => q.repairId === repairId) ?? null;
}

export async function saveQuote(quote: RepairQuote): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().saveQuote(quote); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairQuote>(REPAIR_TABLES.REPAIR_QUOTES);
  const idx = all.findIndex(q => q.repairId === quote.repairId);
  if (idx >= 0) all[idx] = quote; else all.push(quote);
  saveTable(REPAIR_TABLES.REPAIR_QUOTES, all);
}

// ── Timeline ────────────────────────────────────────────────────

export async function getAllTimelineEvents(repairId?: string): Promise<RepairTimelineEvent[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getAllTimelineEvents(repairId); } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairTimelineEvent>(REPAIR_TABLES.REPAIR_TIMELINE);
  return repairId ? all.filter(e => e.repairId === repairId) : all;
}

export async function addTimelineEvent(event: RepairTimelineEvent): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().addTimelineEvent(event); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairTimelineEvent>(REPAIR_TABLES.REPAIR_TIMELINE);
  all.push(event);
  saveTable(REPAIR_TABLES.REPAIR_TIMELINE, all);
}

// ── Courier Jobs ────────────────────────────────────────────────

export async function getAllCourierJobs(courierId?: string): Promise<CourierJob[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getAllCourierJobs(courierId); } catch { clearSupabaseCache(); }
  }
  const all = loadTable<CourierJob>(REPAIR_TABLES.REPAIR_COURIER_JOBS);
  return courierId ? all.filter(j => j.courierId === courierId) : all;
}

export async function getCourierJobByRepair(repairId: string): Promise<CourierJob | null> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getCourierJobByRepair(repairId); } catch { clearSupabaseCache(); }
  }
  return loadTable<CourierJob>(REPAIR_TABLES.REPAIR_COURIER_JOBS).find(j => j.repairId === repairId) ?? null;
}

export async function saveCourierJob(job: CourierJob): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().saveCourierJob(job); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<CourierJob>(REPAIR_TABLES.REPAIR_COURIER_JOBS);
  const idx = all.findIndex(j => j.id === job.id);
  if (idx >= 0) all[idx] = job; else all.push(job);
  saveTable(REPAIR_TABLES.REPAIR_COURIER_JOBS, all);
}

// ── Status History ──────────────────────────────────────────

export async function addStatusHistory(entry: RepairStatusHistoryEntry): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().addStatusHistory(entry); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairStatusHistoryEntry>(REPAIR_TABLES.REPAIR_STATUS_HISTORY);
  all.push(entry);
  saveTable(REPAIR_TABLES.REPAIR_STATUS_HISTORY, all);
}

export async function getStatusHistory(repairId: string): Promise<RepairStatusHistoryEntry[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getStatusHistory(repairId); } catch { clearSupabaseCache(); }
  }
  return loadTable<RepairStatusHistoryEntry>(REPAIR_TABLES.REPAIR_STATUS_HISTORY)
    .filter(e => e.repairId === repairId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

// ── Audit Log ──────────────────────────────────────────────

export async function addAuditLog(entry: RepairAuditEntry): Promise<void> {
  if (isSupabaseAvailable()) {
    try { await getRepairDataService().addAuditLog(entry); return; } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairAuditEntry>(REPAIR_TABLES.REPAIR_AUDIT_LOG);
  all.push(entry);
  saveTable(REPAIR_TABLES.REPAIR_AUDIT_LOG, all);
}

export async function getAuditLog(repairId?: string): Promise<RepairAuditEntry[]> {
  if (isSupabaseAvailable()) {
    try { return await getRepairDataService().getAuditLog(repairId); } catch { clearSupabaseCache(); }
  }
  const all = loadTable<RepairAuditEntry>(REPAIR_TABLES.REPAIR_AUDIT_LOG);
  return repairId ? all.filter(e => e.repairId === repairId) : all;
}

// ── Couriers ────────────────────────────────────────────────────

export async function getAllCouriers(): Promise<Courier[]> {
  return loadTable<Courier>(REPAIR_TABLES.REPAIR_COURIERS);
}

export async function getCourier(id: string): Promise<Courier | null> {
  return loadTable<Courier>(REPAIR_TABLES.REPAIR_COURIERS).find(c => c.id === id) ?? null;
}

export async function saveCourier(courier: Courier): Promise<void> {
  const all = loadTable<Courier>(REPAIR_TABLES.REPAIR_COURIERS);
  const idx = all.findIndex(c => c.id === courier.id);
  if (idx >= 0) all[idx] = courier; else all.push(courier);
  saveTable(REPAIR_TABLES.REPAIR_COURIERS, all);
}

export async function deleteCourier(id: string): Promise<void> {
  const all = loadTable<Courier>(REPAIR_TABLES.REPAIR_COURIERS).filter(c => c.id !== id);
  saveTable(REPAIR_TABLES.REPAIR_COURIERS, all);
}

// ── Technicians ─────────────────────────────────────────────────

export async function getAllTechnicians(): Promise<Technician[]> {
  return loadTable<Technician>(REPAIR_TABLES.REPAIR_TECHNICIANS);
}

export async function getTechnician(id: string): Promise<Technician | null> {
  return loadTable<Technician>(REPAIR_TABLES.REPAIR_TECHNICIANS).find(t => t.id === id) ?? null;
}

export async function saveTechnician(technician: Technician): Promise<void> {
  const all = loadTable<Technician>(REPAIR_TABLES.REPAIR_TECHNICIANS);
  const idx = all.findIndex(t => t.id === technician.id);
  if (idx >= 0) all[idx] = technician; else all.push(technician);
  saveTable(REPAIR_TABLES.REPAIR_TECHNICIANS, all);
}

export async function deleteTechnician(id: string): Promise<void> {
  const all = loadTable<Technician>(REPAIR_TABLES.REPAIR_TECHNICIANS).filter(t => t.id !== id);
  saveTable(REPAIR_TABLES.REPAIR_TECHNICIANS, all);
}

// ── Universal Search ────────────────────────────────────────────

export async function searchRequests(query: string): Promise<RepairRequest[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const all = await getAllRepairRequests();
  const results = all.filter(r => {
    if (r.repairCode.toLowerCase().includes(trimmed)) return true;
    if (r.customerPhone.includes(trimmed)) return true;
    if (r.customerName.toLowerCase().includes(trimmed)) return true;
    if (r.brandName.toLowerCase().includes(trimmed)) return true;
    if (r.modelName.toLowerCase().includes(trimmed)) return true;
    return false;
  });
  return results;
}

// ── Sync localStorage → Supabase ───────────────────────────────

export async function syncToSupabase(): Promise<{ synced: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  let failed = 0;

  if (!isSupabaseAvailable()) {
    const ok = forceRecheckConnection();
    if (!ok) return { synced: 0, failed: 0, errors: ['Supabase not available'] };
  }

  const tables: Array<{
    key: string;
    save: (items: Array<RepairRequest | RepairQuote | RepairTimelineEvent>) => Promise<void>;
  }> = [
    { key: REPAIR_TABLES.REPAIR_REQUESTS, save: async (items) => {
      for (const item of items) {
        try { await getRepairDataService().saveRepairRequest(item as RepairRequest); synced++; }
        catch (e) { failed++; errors.push(`Request ${item.id}: ${(e as Error)?.message}`); }
      }
    }},
    { key: REPAIR_TABLES.REPAIR_QUOTES, save: async (items) => {
      for (const item of items) {
        try { await getRepairDataService().saveQuote(item as RepairQuote); synced++; }
        catch (e) { failed++; errors.push(`Quote ${item.id}: ${(e as Error)?.message}`); }
      }
    }},
    { key: REPAIR_TABLES.REPAIR_TIMELINE, save: async (items) => {
      for (const item of items) {
        try { await getRepairDataService().addTimelineEvent(item as RepairTimelineEvent); synced++; }
        catch (e) { failed++; errors.push(`Timeline ${item.id}: ${(e as Error)?.message}`); }
      }
    }},
  ];

  for (const table of tables) {
    const items = loadTable<RepairRequest | RepairQuote | RepairTimelineEvent>(table.key);
    if (items.length > 0) {
      await table.save(items);
    }
  }

  return { synced, failed, errors };
}

// ── Health Check ────────────────────────────────────────────────

export async function getHealthStatus(): Promise<{
  connected: boolean;
  tables: Record<string, boolean>;
  localStorageCount: number;
  error?: string;
}> {
  const lsCount = loadTable<RepairRequest>(REPAIR_TABLES.REPAIR_REQUESTS).length;
  if (!isSupabaseAvailable()) {
    return { connected: false, tables: {}, localStorageCount: lsCount };
  }
  try {
    const result = await getRepairDataService().healthCheck();
    return { ...result, localStorageCount: lsCount };
  } catch (e) {
    return { connected: false, tables: {}, localStorageCount: lsCount, error: (e as Error)?.message };
  }
}
