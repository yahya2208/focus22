import { generateId } from '../business-intelligence/data-source';

export type DeviceStatus =
  | 'in_stock'
  | 'sold'
  | 'exchanged'
  | 'repair'
  | 'warranty_returned'
  | 'lost'
  | 'archived';

export type DeviceEventType =
  | 'purchase'
  | 'sale'
  | 'exchange'
  | 'repair'
  | 'warranty'
  | 'transfer'
  | 'note';

export interface DeviceEvent {
  id: string;
  date: string;
  type: DeviceEventType;
  price?: number;
  profit?: number;
  margin?: number;
  counterparty?: string;
  notes?: string;
}

export interface DeviceEntry {
  id: string;
  sequentialNumber: number;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  condition: string;
  imei?: string;
  serialNumber?: string;
  status: DeviceStatus;
  events: DeviceEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelProfitSummary {
  brand: string;
  model: string;
  totalDevices: number;
  totalSales: number;
  totalProfit: number;
  avgProfit: number | null;
  totalRevenue: number;
  avgSalePrice: number | null;
  avgDaysInStock: number | null;
  bestProfit: number;
  worstProfit: number;
}

export interface DeviceLedgerStats {
  totalDevices: number;
  inStock: number;
  sold: number;
  exchanged: number;
  inRepair: number;
  totalProfit: number;
}

const STORAGE_KEY = 'device_ledger_v1';
const SEQUENCE_KEY = 'device_ledger_sequence';

function loadAll(): DeviceEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAll(entries: DeviceEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function nextSequence(): number {
  try {
    const seq = parseInt(localStorage.getItem(SEQUENCE_KEY) || '0', 10);
    const next = seq + 1;
    localStorage.setItem(SEQUENCE_KEY, String(next));
    return next;
  } catch { return Date.now(); }
}

export const DeviceLedger = {
  registerDevice(params: {
    brand: string;
    model: string;
    ram: string;
    storage: string;
    condition: string;
    imei?: string;
    serialNumber?: string;
    buyPrice?: number;
    counterparty?: string;
    notes?: string;
  }): DeviceEntry {
    const entries = loadAll();
    const seq = nextSequence();
    const now = new Date().toISOString();
    const entry: DeviceEntry = {
      id: `DEV-${String(seq).padStart(5, '0')}`,
      sequentialNumber: seq,
      brand: params.brand,
      model: params.model,
      ram: params.ram,
      storage: params.storage,
      condition: params.condition,
      imei: params.imei,
      serialNumber: params.serialNumber,
      status: 'in_stock',
      events: [{
        id: generateId(),
        date: now,
        type: 'purchase',
        price: params.buyPrice,
        counterparty: params.counterparty,
        notes: params.notes,
      }],
      createdAt: now,
      updatedAt: now,
    };
    entries.push(entry);
    saveAll(entries);
    return entry;
  },

  recordSale(deviceId: string, params: {
    sellPrice: number;
    buyPrice?: number;
    counterparty?: string;
    notes?: string;
  }): DeviceEntry | null {
    const entries = loadAll();
    const idx = entries.findIndex(d => d.id === deviceId);
    if (idx === -1) return null;
    const device = entries[idx]!;
    const profit = params.buyPrice !== undefined ? params.sellPrice - params.buyPrice : undefined;
    const margin = params.buyPrice && params.buyPrice > 0 ? ((params.sellPrice - params.buyPrice) / params.buyPrice) * 100 : undefined;
    device.events.push({
      id: generateId(),
      date: new Date().toISOString(),
      type: 'sale',
      price: params.sellPrice,
      profit,
      margin,
      counterparty: params.counterparty,
      notes: params.notes,
    });
    device.status = 'sold';
    device.updatedAt = new Date().toISOString();
    entries[idx] = device;
    saveAll(entries);
    return device;
  },

  recordExchange(deviceId: string, params: {
    tradeValue: number;
    counterparty?: string;
    notes?: string;
  }): DeviceEntry | null {
    const entries = loadAll();
    const idx = entries.findIndex(d => d.id === deviceId);
    if (idx === -1) return null;
    const device = entries[idx]!;
    device.events.push({
      id: generateId(),
      date: new Date().toISOString(),
      type: 'exchange',
      price: params.tradeValue,
      counterparty: params.counterparty,
      notes: params.notes,
    });
    device.status = 'exchanged';
    device.updatedAt = new Date().toISOString();
    entries[idx] = device;
    saveAll(entries);
    return device;
  },

  recordRepair(deviceId: string, params: {
    cost?: number;
    notes?: string;
  }): DeviceEntry | null {
    const entries = loadAll();
    const idx = entries.findIndex(d => d.id === deviceId);
    if (idx === -1) return null;
    const device = entries[idx]!;
    device.events.push({
      id: generateId(),
      date: new Date().toISOString(),
      type: 'repair',
      price: params.cost,
      notes: params.notes,
    });
    device.status = 'in_stock';
    device.updatedAt = new Date().toISOString();
    entries[idx] = device;
    saveAll(entries);
    return device;
  },

  recordWarranty(deviceId: string, params: {
    notes?: string;
  }): DeviceEntry | null {
    const entries = loadAll();
    const idx = entries.findIndex(d => d.id === deviceId);
    if (idx === -1) return null;
    const device = entries[idx]!;
    device.events.push({
      id: generateId(),
      date: new Date().toISOString(),
      type: 'warranty',
      notes: params.notes,
    });
    device.status = 'warranty_returned';
    device.updatedAt = new Date().toISOString();
    entries[idx] = device;
    saveAll(entries);
    return device;
  },

  addNote(deviceId: string, notes: string): DeviceEntry | null {
    const entries = loadAll();
    const idx = entries.findIndex(d => d.id === deviceId);
    if (idx === -1) return null;
    const device = entries[idx]!;
    device.events.push({
      id: generateId(),
      date: new Date().toISOString(),
      type: 'note',
      notes,
    });
    device.updatedAt = new Date().toISOString();
    entries[idx] = device;
    saveAll(entries);
    return device;
  },

  getDevice(deviceId: string): DeviceEntry | null {
    return loadAll().find(d => d.id === deviceId) || null;
  },

  findByImei(imei: string): DeviceEntry | null {
    return loadAll().find(d => d.imei === imei) || null;
  },

  getByModel(brand: string, model: string): DeviceEntry[] {
    const bl = brand.toLowerCase();
    const ml = model.toLowerCase();
    return loadAll().filter(d => d.brand.toLowerCase() === bl && d.model.toLowerCase() === ml);
  },

  getInStock(): DeviceEntry[] {
    return loadAll().filter(d => d.status === 'in_stock');
  },

  getAll(): DeviceEntry[] {
    return loadAll();
  },

  getModelProfitSummary(brand?: string, model?: string): ModelProfitSummary[] {
    const entries = loadAll();
    const sold = entries.filter(d => d.status === 'sold');
    const grouped: Record<string, { brand: string; model: string; devices: number; sales: number; profits: number[]; revenues: number[]; days: number[] }> = {};

    for (const d of sold) {
      const key = `${d.brand}_${d.model}`;
      if (brand && d.brand.toLowerCase() !== brand.toLowerCase()) continue;
      if (model && d.model.toLowerCase() !== model.toLowerCase()) continue;
      if (!grouped[key]) {
        grouped[key] = { brand: d.brand, model: d.model, devices: 0, sales: 0, profits: [], revenues: [], days: [] };
      }
      grouped[key].devices++;
      const saleEvent = [...d.events].reverse().find(e => e.type === 'sale');
      const purchaseEvent = d.events.find(e => e.type === 'purchase');
      if (saleEvent) {
        grouped[key].sales++;
        if (saleEvent.price) grouped[key].revenues.push(saleEvent.price);
        if (saleEvent.profit !== undefined) grouped[key].profits.push(saleEvent.profit);
        if (purchaseEvent && saleEvent.date) {
          const days = Math.max(0, Math.floor((new Date(saleEvent.date).getTime() - new Date(purchaseEvent.date).getTime()) / 86400000));
          grouped[key].days.push(days);
        }
      }
    }

    return Object.values(grouped).map(g => {
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      return {
        brand: g.brand,
        model: g.model,
        totalDevices: g.devices,
        totalSales: g.sales,
        totalProfit: g.profits.reduce((s, v) => s + v, 0),
        avgProfit: avg(g.profits),
        totalRevenue: g.revenues.reduce((s, v) => s + v, 0),
        avgSalePrice: avg(g.revenues),
        avgDaysInStock: avg(g.days),
        bestProfit: g.profits.length > 0 ? Math.max(...g.profits) : 0,
        worstProfit: g.profits.length > 0 ? Math.min(...g.profits) : 0,
      };
    }).sort((a, b) => b.totalProfit - a.totalProfit);
  },

  getMostProfitableModels(limit = 10): ModelProfitSummary[] {
    return DeviceLedger.getModelProfitSummary().slice(0, limit);
  },

  getStats(): DeviceLedgerStats {
    const entries = loadAll();
    return {
      totalDevices: entries.length,
      inStock: entries.filter(d => d.status === 'in_stock').length,
      sold: entries.filter(d => d.status === 'sold').length,
      exchanged: entries.filter(d => d.status === 'exchanged').length,
      inRepair: entries.filter(d => d.status === 'repair').length,
      totalProfit: entries
        .flatMap(d => d.events)
        .filter(e => e.profit !== undefined)
        .reduce((s, e) => s + e.profit!, 0),
    };
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SEQUENCE_KEY);
  },
};
