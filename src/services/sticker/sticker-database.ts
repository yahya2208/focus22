import type { StickerPrintBatch, StickerScanEvent, CampaignHeatMapEntry, StickerAnalyticsRow, WisdomAnalytics } from './sticker-types';
import type { StickerCTA, StickerType, ContentType, StickerTheme } from './sticker-types';

let serialCounter = 0;
const printBatches: Map<string, StickerPrintBatch> = new Map();
const scanEvents: StickerScanEvent[] = [];

export function getNextSerialNumber(): string {
  serialCounter++;
  return `ST-${String(serialCounter).padStart(6, '0')}`;
}

export function parseSerialNumber(s: string): number {
  return parseInt(s.replace('ST-', ''), 10);
}

export function estimateSerialNumber(index: number): string {
  return `ST-${String(serialCounter + index + 1).padStart(6, '0')}`;
}

export function registerPrintBatch(
  count: number,
  campaign: string,
  stickerType: StickerType,
  contentType: ContentType,
  theme: StickerTheme,
  cta: StickerCTA,
  location?: string,
): StickerPrintBatch {
  const start = serialCounter + 1;
  const end = serialCounter + count;
  serialCounter += count;
  const batch: StickerPrintBatch = {
    id: `PB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialStart: start,
    serialEnd: end,
    count,
    campaign,
    stickerType,
    contentType,
    theme,
    cta,
    location,
    printedAt: new Date().toISOString(),
  };
  printBatches.set(batch.id, batch);
  return batch;
}

export function logScan(serialNumber: string): StickerScanEvent {
  const event: StickerScanEvent = {
    id: `SC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    serialNumber,
    campaign: 'direct',
    scannedAt: new Date().toISOString(),
    cta: 'view_offers',
  };
  scanEvents.push(event);
  return event;
}

export function logScanWithMetadata(
  serialNumber: string,
  campaign: string,
  cta: StickerCTA,
  location?: string,
): StickerScanEvent {
  const event: StickerScanEvent = {
    id: `SC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    serialNumber,
    campaign,
    scannedAt: new Date().toISOString(),
    location,
    cta,
  };
  scanEvents.push(event);
  try {
    const stored = sanitizeStoredScans(JSON.parse(localStorage.getItem('sticker_scans') || '[]'));
    stored.push(event);
    localStorage.setItem('sticker_scans', JSON.stringify(stored));
  } catch { /* Intentionally ignored. */ }
  return event;
}

function sanitizeEvent(raw: Record<string, unknown>): StickerScanEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if (typeof raw.serialNumber !== 'string' || typeof raw.campaign !== 'string') return null;
  const scannedAt = typeof raw.scannedAt === 'string' ? raw.scannedAt : new Date().toISOString();
  const cta = typeof raw.cta === 'string' ? (raw.cta as StickerCTA) : 'view_offers';
  const location = typeof raw.location === 'string' ? raw.location : undefined;
  return { id: typeof raw.id === 'string' ? raw.id : `SC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, serialNumber: raw.serialNumber, campaign: raw.campaign, scannedAt, location, cta };
}

export function sanitizeStoredScans(): void;
export function sanitizeStoredScans(raw: unknown): StickerScanEvent[];
export function sanitizeStoredScans(raw?: unknown): void | StickerScanEvent[] {
  try {
    if (raw !== undefined) {
      if (!Array.isArray(raw)) return;
      return sanitizeList(raw);
    }
    const original = localStorage.getItem('sticker_scans');
    if (original === null) return;
    const sanitized = sanitizeList(JSON.parse(original));
    localStorage.setItem('sticker_scans', JSON.stringify(sanitized));
  } catch { /* Intentionally ignored. */ }
}

function sanitizeList(stored: unknown): StickerScanEvent[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((e) => sanitizeEvent(e as Record<string, unknown>))
    .filter((e): e is StickerScanEvent => e !== null);
}

export function getScansBySerial(serialNumber: string): StickerScanEvent[] {
  return scanEvents.filter(e => e.serialNumber === serialNumber);
}

export function getScansByCampaign(campaign: string): StickerScanEvent[] {
  return scanEvents.filter(e => e.campaign === campaign);
}

export function getScansByLocation(location: string): StickerScanEvent[] {
  return scanEvents.filter(e => e.location === location);
}

export function getAllScans(): StickerScanEvent[] {
  return [...scanEvents];
}

export function getScanCount(): number {
  return scanEvents.length;
}

export function getHeatMap(): CampaignHeatMapEntry[] {
  const locationMap = new Map<string, number>();
  for (const scan of scanEvents) {
    const loc = scan.location || 'unknown';
    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
  }
  return Array.from(locationMap.entries())
    .map(([location, scans]) => ({
      location,
      scans,
      rating: scans >= 400 ? 5 : scans >= 200 ? 4 : scans >= 80 ? 3 : scans >= 30 ? 2 : 1,
    }))
    .sort((a, b) => b.scans - a.scans);
}

export function getAnalyticsTable(): StickerAnalyticsRow[] {
  const serialMap = new Map<string, StickerScanEvent[]>();
  for (const scan of scanEvents) {
    const list = serialMap.get(scan.serialNumber) || [];
    list.push(scan);
    serialMap.set(scan.serialNumber, list);
  }
  return Array.from(serialMap.entries()).map(([serialNumber, scans]) => ({
    serialNumber,
    scans: scans.length,
    gameStarted: 0,
    gameCompleted: 0,
    whatsapp: 0,
    repair: 0,
    purchase: 0,
    exchange: 0,
  }));
}

export function getBestStickerToday(): { serialNumber: string; scans: number } | null {
  const today = new Date().toISOString().slice(0, 10);
  const todayScans = scanEvents.filter(e => e.scannedAt.slice(0, 10) === today);
  if (todayScans.length === 0) return null;
  const countMap = new Map<string, number>();
  for (const scan of todayScans) {
    countMap.set(scan.serialNumber, (countMap.get(scan.serialNumber) || 0) + 1);
  }
  let best: { serialNumber: string; scans: number } | null = null;
  for (const [serialNumber, scans] of countMap) {
    if (!best || scans > best.scans) best = { serialNumber, scans };
  }
  return best;
}

export function getWisdomAnalytics(): WisdomAnalytics[] {
  return [];
}

export function getBestWisdom(): WisdomAnalytics | null {
  return null;
}

export function getWorstWisdom(): WisdomAnalytics | null {
  return null;
}

export function getPrintBatches(): StickerPrintBatch[] {
  return Array.from(printBatches.values());
}

export function getPrintBatch(id: string): StickerPrintBatch | undefined {
  return printBatches.get(id);
}

export function loadStoredScans(): void {
  try {
    sanitizeStoredScans();
    const stored = JSON.parse(localStorage.getItem('sticker_scans') || '[]');
    for (const event of stored) {
      const existing = scanEvents.some(e => e.id === event.id);
      if (!existing) scanEvents.push(event);
    }
    const storedSerial = localStorage.getItem('sticker_serial_counter');
    if (storedSerial) serialCounter = Math.max(serialCounter, parseInt(storedSerial, 10));
  } catch { /* Intentionally ignored. */ }
}

export function saveSerialCounter(): void {
  try {
    localStorage.setItem('sticker_serial_counter', String(serialCounter));
  } catch { /* Intentionally ignored. */ }
}

loadStoredScans();
