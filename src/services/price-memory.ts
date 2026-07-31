import { getAllBrands } from '../catalog';

export type DeviceCondition =
  | 'New'
  | 'Open Box'
  | 'Like New'
  | 'Excellent'
  | 'Very Good'
  | 'Good'
  | 'Fair'
  | 'Poor'
  | 'For Parts'
  | 'Refurbished'
  | 'Certified Used';

export const ALL_CONDITIONS: DeviceCondition[] = [
  'New', 'Open Box', 'Like New', 'Excellent', 'Very Good',
  'Good', 'Fair', 'Poor', 'For Parts', 'Refurbished', 'Certified Used',
];

export const CONDITION_ORDER: Record<DeviceCondition, number> = {
  'New': 10,
  'Open Box': 9,
  'Like New': 8,
  'Excellent': 7,
  'Very Good': 6,
  'Good': 5,
  'Fair': 4,
  'Poor': 3,
  'For Parts': 2,
  'Refurbished': 1,
  'Certified Used': 0,
};

export type PriceOperation = 'buy' | 'sell' | 'exchange' | 'trade_in';

export type PriceEvent = {
  id: string;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  condition: DeviceCondition;
  operation: PriceOperation;
  price: number;
  profit?: number;
  margin?: number;
  daysToSell?: number;
  date: string;
  session?: string;
  campaign?: string;
  notes?: string;
};

export type PhonePriceIdentity = {
  brand: string;
  model: string;
  ram: string;
  storage: string;
  condition: DeviceCondition;
};

export type PriceSummary = {
  lastBuyPrice: number | null;
  avgBuyPrice: number | null;
  highestBuyPrice: number | null;
  lowestBuyPrice: number | null;
  buyCount: number;
  lastSellPrice: number | null;
  avgSellPrice: number | null;
  highestSellPrice: number | null;
  lowestSellPrice: number | null;
  sellCount: number;
  lastExchangeValue: number | null;
  avgExchangeValue: number | null;
  exchangeCount: number;
  totalProfit: number;
  bestProfit: number;
  worstProfit: number;
  avgProfitMargin: number | null;
  avgDaysToSell: number | null;
  totalTransactions: number;
};

export type LearningInsight = {
  usualBuyRange: { min: number; max: number } | null;
  usualSellRange: { min: number; max: number } | null;
  avgProfit: number | null;
  avgMargin: number | null;
  bestMonth: string | null;
  worstMonth: string | null;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
};

type PriceTimelineEntry = {
  id: string;
  date: string;
  operation: PriceOperation;
  price: number;
  condition: DeviceCondition;
  profit?: number;
  margin?: number;
  notes?: string;
};

const STORAGE_KEY = 'price_memory_v1';
const MAX_HISTORY = 10000;

function loadAll(): PriceEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(events: PriceEvent[]): void {
  if (events.length > MAX_HISTORY) {
    events = events.slice(events.length - MAX_HISTORY);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function generateId(): string {
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function identityKey(id: PhonePriceIdentity): string {
  return `${id.brand}||${id.model}||${id.ram}||${id.storage}||${id.condition}`.toLowerCase();
}

export const PriceMemory = {
  recordBuy(event: Omit<PriceEvent, 'id' | 'operation' | 'date'> & { operation?: PriceOperation; date?: string }): PriceEvent {
    const events = loadAll();
    const ev: PriceEvent = {
      ...event,
      id: generateId(),
      operation: event.operation || 'buy',
      date: event.date || new Date().toISOString(),
    } as PriceEvent;
    events.push(ev);
    saveAll(events);
    return ev;
  },

  recordSell(
    identity: PhonePriceIdentity,
    sellPrice: number,
    buyPrice?: number,
    buyDate?: string,
    extras?: { session?: string; campaign?: string; notes?: string },
  ): PriceEvent {
    const events = loadAll();
    const profit = buyPrice !== undefined ? sellPrice - buyPrice : undefined;
    const margin = buyPrice && buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : undefined;
    const daysToSell =
      buyDate
        ? Math.max(0, Math.floor((new Date().getTime() - new Date(buyDate).getTime()) / (1000 * 60 * 60 * 24)))
        : undefined;
    const ev: PriceEvent = {
      id: generateId(),
      brand: identity.brand,
      model: identity.model,
      ram: identity.ram,
      storage: identity.storage,
      condition: identity.condition,
      operation: 'sell',
      price: sellPrice,
      profit,
      margin,
      daysToSell,
      date: new Date().toISOString(),
      session: extras?.session,
      campaign: extras?.campaign,
      notes: extras?.notes,
    };
    events.push(ev);
    saveAll(events);
    return ev;
  },

  recordExchange(
    identity: PhonePriceIdentity,
    tradeValue: number,
    extras?: { session?: string; campaign?: string; notes?: string },
  ): PriceEvent {
    const events = loadAll();
    const ev: PriceEvent = {
      id: generateId(),
      brand: identity.brand,
      model: identity.model,
      ram: identity.ram,
      storage: identity.storage,
      condition: identity.condition,
      operation: 'exchange',
      price: tradeValue,
      date: new Date().toISOString(),
      session: extras?.session,
      campaign: extras?.campaign,
      notes: extras?.notes,
    };
    events.push(ev);
    saveAll(events);
    return ev;
  },

  getHistory(identity: PhonePriceIdentity): PriceEvent[] {
    const key = identityKey(identity);
    return loadAll().filter(
      (e) => identityKey(e) === key,
    );
  },

  getAllHistory(): PriceEvent[] {
    return loadAll();
  },

  getSummary(identity: PhonePriceIdentity): PriceSummary {
    const history = PriceMemory.getHistory(identity);
    const buys = history.filter((e) => e.operation === 'buy');
    const sells = history.filter((e) => e.operation === 'sell');
    const exchanges = history.filter((e) => e.operation === 'exchange');
    const buyPrices = buys.map((e) => e.price);
    const sellPrices = sells.map((e) => e.price);
    const exchangeValues = exchanges.map((e) => e.price);
    const profits = sells.filter((e) => e.profit !== undefined).map((e) => e.profit!);
    const margins = sells.filter((e) => e.margin !== undefined).map((e) => e.margin!);
    const days = sells.filter((e) => e.daysToSell !== undefined).map((e) => e.daysToSell!);

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

    function last<T>(arr: T[]): T {
      return arr[arr.length - 1]!;
    }

    return {
      lastBuyPrice: buyPrices.length > 0 ? last(buyPrices) : null,
      avgBuyPrice: avg(buyPrices),
      highestBuyPrice: buyPrices.length > 0 ? Math.max(...buyPrices) : null,
      lowestBuyPrice: buyPrices.length > 0 ? Math.min(...buyPrices) : null,
      buyCount: buys.length,
      lastSellPrice: sellPrices.length > 0 ? last(sellPrices) : null,
      avgSellPrice: avg(sellPrices),
      highestSellPrice: sellPrices.length > 0 ? Math.max(...sellPrices) : null,
      lowestSellPrice: sellPrices.length > 0 ? Math.min(...sellPrices) : null,
      sellCount: sells.length,
      lastExchangeValue: exchangeValues.length > 0 ? last(exchangeValues) : null,
      avgExchangeValue: avg(exchangeValues),
      exchangeCount: exchanges.length,
      totalProfit: profits.length > 0 ? profits.reduce((s, v) => s + v, 0) : 0,
      bestProfit: profits.length > 0 ? Math.max(...profits) : 0,
      worstProfit: profits.length > 0 ? Math.min(...profits) : 0,
      avgProfitMargin: avg(margins),
      avgDaysToSell: avg(days),
      totalTransactions: history.length,
    };
  },

  getTimeline(identity: PhonePriceIdentity): PriceTimelineEntry[] {
    return PriceMemory.getHistory(identity)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((e) => ({
        id: e.id,
        date: e.date,
        operation: e.operation,
        price: e.price,
        condition: e.condition,
        profit: e.profit,
        margin: e.margin,
        notes: e.notes,
      }));
  },

  getLearningInsight(identity: PhonePriceIdentity): LearningInsight {
    const summary = PriceMemory.getSummary(identity);
    const history = PriceMemory.getHistory(identity);
    const buys = history.filter((e) => e.operation === 'buy');
    const sells = history.filter((e) => e.operation === 'sell');

    const buyPrices = buys.map((e) => e.price);
    const sellPrices = sells.map((e) => e.price);

    const usualBuyRange = buyPrices.length >= 2
      ? {
          min: Math.min(...buyPrices),
          max: Math.max(...buyPrices),
        }
      : buyPrices.length === 1
        ? { min: buyPrices[0]! - buyPrices[0]! * 0.1, max: buyPrices[0]! + buyPrices[0]! * 0.1 }
        : null;

    const usualSellRange = sellPrices.length >= 2
      ? {
          min: Math.min(...sellPrices),
          max: Math.max(...sellPrices),
        }
      : sellPrices.length === 1
        ? { min: sellPrices[0]! - sellPrices[0]! * 0.1, max: sellPrices[0]! + sellPrices[0]! * 0.1 }
        : null;

    const avgProfit = summary.avgSellPrice !== null && summary.avgBuyPrice !== null
      ? summary.avgSellPrice - summary.avgBuyPrice
      : null;

    const byMonth: Record<string, number> = {};
    for (const e of sells) {
      if (e.profit === undefined) continue;
      const month = e.date.slice(0, 7);
      byMonth[month] = (byMonth[month] || 0) + e.profit;
    }
    const sortedMonths = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
    const bestMonth = sortedMonths.length > 0 ? sortedMonths[0]![0] : null;
    const worstMonth = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 1]![0] : null;

    const confidence = summary.totalTransactions >= 20 ? 'high' : summary.totalTransactions >= 8 ? 'medium' : 'low';

    let summaryText = '';
    if (confidence === 'high') {
      summaryText = `لدينا ${summary.totalTransactions} عملية. `;
    } else {
      summaryText = `لدينا ${summary.totalTransactions} عملية (تعلم قيد التقدم). `;
    }

    if (usualBuyRange) {
      summaryText += `عادة تشتري بين ${usualBuyRange.min.toLocaleString()} و ${usualBuyRange.max.toLocaleString()}. `;
    }
    if (usualSellRange) {
      summaryText += `وتبيع بين ${usualSellRange.min.toLocaleString()} و ${usualSellRange.max.toLocaleString()}. `;
    }
    if (avgProfit !== null) {
      summaryText += `متوسط الربح ${avgProfit.toLocaleString()}. `;
    }
    if (summary.avgProfitMargin !== null) {
      summaryText += `هامش الربح ${summary.avgProfitMargin.toFixed(1)}%. `;
    }
    if (summary.avgDaysToSell !== null) {
      summaryText += `متوسط مدة البقاء ${summary.avgDaysToSell} يوماً.`;
    }

    return {
      usualBuyRange,
      usualSellRange,
      avgProfit,
      avgMargin: summary.avgProfitMargin,
      bestMonth,
      worstMonth,
      confidence,
      summary: summaryText,
    };
  },

  checkPriceAlert(
    identity: PhonePriceIdentity,
    proposedPrice: number,
    operation: 'buy' | 'sell',
  ): { level: 'info' | 'warning' | 'danger'; message: string } | null {
    const summary = PriceMemory.getSummary(identity);
    const insight = PriceMemory.getLearningInsight(identity);

    if (operation === 'buy') {
      if (insight.usualBuyRange && proposedPrice > insight.usualBuyRange.max) {
        const overPct = ((proposedPrice - insight.usualBuyRange.max) / insight.usualBuyRange.max) * 100;
        if (overPct > 20) {
          return {
            level: 'danger',
            message: `هذا السعر أعلى بنسبة ${overPct.toFixed(0)}% من أعلى سعر اشتريته به. هل أنت متأكد؟`,
          };
        }
        return {
          level: 'warning',
          message: `السعر أعلى من المعتاد (${insight.usualBuyRange.min.toLocaleString()}–${insight.usualBuyRange.max.toLocaleString()})`,
        };
      }
      if (insight.usualBuyRange && proposedPrice < insight.usualBuyRange.min * 0.7) {
        return {
          level: 'info',
          message: 'هذا السعر أقل من المعتاد بشكل ملحوظ. صفقة جيدة!',
        };
      }
    } else {
      if (insight.usualSellRange && proposedPrice < insight.usualSellRange.min * 0.85) {
        const underPct = ((insight.usualSellRange.min - proposedPrice) / insight.usualSellRange.min) * 100;
        return {
          level: 'warning',
          message: `سعر البيع أقل من المعتاد بنسبة ${underPct.toFixed(0)}%. هل تريد المتابعة؟`,
        };
      }
      if (summary.avgBuyPrice !== null && proposedPrice <= summary.avgBuyPrice) {
        return {
          level: 'warning',
          message: `سعر البيع (${proposedPrice.toLocaleString()}) أقل من أو يساوي متوسط الشراء (${summary.avgBuyPrice.toLocaleString()}). لن تحقق ربحاً.`,
        };
      }
    }
    return null;
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

  getStats(): { totalEvents: number; totalBrands: number; totalProfit: number } {
    const events = loadAll();
    const brands = new Set(events.map((e) => e.brand));
    const totalProfit = events
      .filter((e) => e.profit !== undefined)
      .reduce((s, e) => s + e.profit!, 0);
    return { totalEvents: events.length, totalBrands: brands.size, totalProfit };
  },

  getTopProfitableModels(limit = 10): { identity: PhonePriceIdentity; totalProfit: number; count: number }[] {
    const events = loadAll();
    const sells = events.filter((e) => e.operation === 'sell' && e.profit !== undefined);
    const grouped: Record<string, { identity: PhonePriceIdentity; totalProfit: number; count: number }> = {};
    for (const e of sells) {
      const key = `${e.brand}_${e.model}_${e.condition}`;
      if (!grouped[key]) {
        grouped[key] = { identity: { brand: e.brand, model: e.model, ram: e.ram, storage: e.storage, condition: e.condition }, totalProfit: 0, count: 0 };
      }
      grouped[key].totalProfit += e.profit!;
      grouped[key].count += 1;
    }
    return Object.values(grouped).sort((a, b) => b.totalProfit - a.totalProfit).slice(0, limit);
  },
};

// ===== Consumer-facing catalog price history =====

export interface PriceRecord {
  model: string;
  brand: string;
  price: number;
  currency: string;
  condition: string;
  date: string;
  source: string;
}

export interface ModelPriceHistory {
  model: string;
  brand: string;
  records: PriceRecord[];
  currentPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  priceChange: number | null;
  trend: 'up' | 'down' | 'stable' | 'unknown';
}

const CATALOG_STORAGE_KEY = 'focus-price-memory';

function loadCatalogPrices(): PriceRecord[] {
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCatalogPrices(records: PriceRecord[]): void {
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(records));
}

function seedSampleData(): void {
  const existing = loadCatalogPrices();
  if (existing.length > 0) return;

  const samples: PriceRecord[] = [];
  const now = new Date();

  const brands = getAllBrands();
  for (const brand of brands.slice(0, 5)) {
    for (const model of brand.models.slice(0, 3)) {
      for (let i = 0; i < 5; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - (i * 30 + Math.floor(Math.random() * 15)));
        const basePrice = 500 + Math.floor(Math.random() * 1500);
        samples.push({
          brand: brand.brand,
          model: model.model,
          price: basePrice + Math.floor(Math.random() * 400 - 200),
          currency: 'USD',
          condition: (['New', 'Excellent', 'Good'] as const)[Math.floor(Math.random() * 3)]!,
          date: date.toISOString(),
          source: (['Market analysis', 'Store lookup', 'Online listing'] as const)[Math.floor(Math.random() * 3)]!,
        });
      }
    }
  }

  saveCatalogPrices(samples);
}

export function getPriceHistory(brand: string, model: string): ModelPriceHistory {
  const records = loadCatalogPrices()
    .filter(r => r.brand.toLowerCase() === brand.toLowerCase() && r.model.toLowerCase() === model.toLowerCase())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (records.length === 0) {
    return {
      model, brand,
      records: [],
      currentPrice: null, lowestPrice: null, highestPrice: null,
      averagePrice: null, priceChange: null, trend: 'unknown',
    };
  }

  const prices = records.map(r => r.price);
  const currentPrice = prices[prices.length - 1]!;
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const averagePrice = prices.reduce((s, v) => s + v, 0) / prices.length;
  const priceChange = prices.length >= 2 ? prices[prices.length - 1]! - prices[0]! : null;

  let trend: 'up' | 'down' | 'stable' | 'unknown';
  if (priceChange === null || priceChange === 0) trend = 'stable';
  else if (priceChange > 0) trend = 'up';
  else trend = 'down';

  return {
    model, brand, records,
    currentPrice, lowestPrice, highestPrice, averagePrice,
    priceChange, trend,
  };
}

export function getAllPriceMemory(): ModelPriceHistory[] {
  const records = loadCatalogPrices();
  const grouped = new Map<string, PriceRecord[]>();
  for (const r of records) {
    const key = `${r.brand}||${r.model}`.toLowerCase();
    const existing = grouped.get(key) ?? [];
    existing.push(r);
    grouped.set(key, existing);
  }
  return Array.from(grouped.entries()).map(([key]) => {
    const parts = key.split('||');
    return getPriceHistory(parts[0]!, parts[1]!);
  });
}

export function logPrice(
  brand: string, model: string, price: number,
  currency: string, condition: string, source: string,
): void {
  const records = loadCatalogPrices();
  records.push({
    brand, model, price, currency, condition,
    date: new Date().toISOString(),
    source,
  });
  saveCatalogPrices(records);
}

export function clearPriceHistory(): void {
  localStorage.removeItem(CATALOG_STORAGE_KEY);
}

seedSampleData();
