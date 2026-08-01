/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  QUARANTINE — UNWIRED MODULE (AUDIT 2026-08-01, P2-A)                   ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  PricingIntelligence has ZERO consumers in the codebase (no import of    ║
 * ║  this module outside this file). Its storage key "pricing_records" is    ║
 * ║  never written or read in production.                                    ║
 * ║                                                                          ║
 * ║  Candidate for removal in Legacy Removal (P2-D). Kept intact because it  ║
 * ║  may be revived by the Business Intelligence center.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import { getBrandTier } from './brand-rules';
import { generateId } from '../business-intelligence/data-source';

export interface PriceSuggestion {
  brand: string;
  model: string;
  suggestedBuyPrice: number;
  suggestedSellPrice: number;
  expectedProfit: number;
  expectedMargin: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  basedOn: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  minBuyPrice: number;
  maxBuyPrice: number;
  minSellPrice: number;
  maxSellPrice: number;
  inventoryTurnover: number;
  warning?: string;
}

export interface PriceRecord {
  id: string;
  brand: string;
  model: string;
  variant: string;
  buyPrice: number;
  sellPrice?: number;
  profit: number;
  margin: number;
  date: string;
  source: 'purchase' | 'sale' | 'manual';
}

export interface PriceAlert {
  type: 'low_profit' | 'loss' | 'good_deal' | 'price_drop' | 'price_surge';
  brand: string;
  model: string;
  variant: string;
  message: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
}

const STORAGE_KEY = 'pricing_records';

const TIER_DEFAULTS = {
  budget: { buyMin: 5000, buyMax: 15000, sellMin: 8000, sellMax: 25000 },
  mid: { buyMin: 15000, buyMax: 50000, sellMin: 25000, sellMax: 70000 },
  'high-end': { buyMin: 50000, buyMax: 150000, sellMin: 70000, sellMax: 200000 },
  flagship: { buyMin: 100000, buyMax: 300000, sellMin: 150000, sellMax: 500000 },
} as const;

const TURNOVER_DEFAULTS: Record<string, number> = {
  budget: 14,
  mid: 21,
  'high-end': 30,
  flagship: 45,
};

function loadRecords(): PriceRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: PriceRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function buildTierSuggestion(
  brand: string,
  model: string,
  _variant: string | undefined,
  basedOn: number,
): PriceSuggestion {
  const tier = getBrandTier(brand, model);
  const defaults = TIER_DEFAULTS[tier];
  const avgBuy = Math.round((defaults.buyMin + defaults.buyMax) / 2);
  const avgSell = Math.round((defaults.sellMin + defaults.sellMax) / 2);
  const suggestedBuy = avgBuy;
  const suggestedSell = Math.round(avgSell * 1.15);
  const profit = suggestedSell - suggestedBuy;
  const margin = suggestedBuy > 0 ? (profit / suggestedBuy) * 100 : 0;

  return {
    brand,
    model,
    suggestedBuyPrice: suggestedBuy,
    suggestedSellPrice: suggestedSell,
    expectedProfit: profit,
    expectedMargin: Math.round(margin * 100) / 100,
    confidence: 'none',
    basedOn,
    avgBuyPrice: avgBuy,
    avgSellPrice: avgSell,
    minBuyPrice: defaults.buyMin,
    maxBuyPrice: defaults.buyMax,
    minSellPrice: defaults.sellMin,
    maxSellPrice: defaults.sellMax,
    inventoryTurnover: TURNOVER_DEFAULTS[tier] ?? 30,
    warning: basedOn === 0
      ? 'لا توجد بيانات تاريخية. تم استخدام القيم الافتراضية للفئة.'
      : 'لا توجد بيانات كافية للبيع والشراء. تم استخدام القيم الافتراضية للفئة.',
  };
}

function estimateTurnover(records: PriceRecord[]): number {
  const dated = records.filter(r => r.date);
  if (dated.length < 2) return 30;
  const timestamps = dated
    .map(r => new Date(r.date).getTime())
    .filter(t => !isNaN(t));
  if (timestamps.length < 2) return 30;
  const spanDays = (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24);
  if (spanDays < 1) return 30;
  const avgGap = spanDays / timestamps.length;
  return Math.max(1, Math.round(avgGap * 4));
}

function generateAlertsForRecord(record: PriceRecord): PriceAlert[] {
  const alerts: PriceAlert[] = [];
  const { brand, model, variant, margin, sellPrice, buyPrice } = record;

  if (sellPrice == null) return alerts;

  if (sellPrice < buyPrice) {
    alerts.push({
      type: 'loss',
      brand,
      model,
      variant,
      message: `خسارة متوقعة في ${brand} ${model} ${variant}`,
      severity: 'danger',
    });
  } else if (margin < 5) {
    alerts.push({
      type: 'low_profit',
      brand,
      model,
      variant,
      message: `ربح ضعيف جداً (${Math.round(margin)}%) لـ ${brand} ${model} ${variant}`,
      severity: 'danger',
    });
  } else if (margin < 10) {
    alerts.push({
      type: 'low_profit',
      brand,
      model,
      variant,
      message: `ربح أقل من المعتاد (${Math.round(margin)}%) لـ ${brand} ${model} ${variant}`,
      severity: 'warning',
    });
  } else if (margin > 25) {
    alerts.push({
      type: 'good_deal',
      brand,
      model,
      variant,
      message: `ربح ممتاز (${Math.round(margin)}%) لـ ${brand} ${model} ${variant}`,
      severity: 'success',
    });
  }

  return alerts;
}

function detectPriceSurges(records: PriceRecord[]): PriceAlert[] {
  const grouped = new Map<string, PriceRecord[]>();
  for (const r of records) {
    if (r.sellPrice == null) continue;
    const key = `${r.brand}|${r.model}|${r.variant}`;
    const group = grouped.get(key) ?? [];
    group.push(r);
    grouped.set(key, group);
  }

  const alerts: PriceAlert[] = [];
  for (const [, group] of grouped) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = sorted[0]!;
    const older = sorted.slice(1);
    const avgOlderSell = older.reduce((s, r) => s + (r.sellPrice ?? 0), 0) / older.length;
    if (avgOlderSell <= 0) continue;

    const change = ((latest.sellPrice! - avgOlderSell) / avgOlderSell) * 100;

    if (change > 20) {
      alerts.push({
        type: 'price_surge',
        brand: latest.brand,
        model: latest.model,
        variant: latest.variant,
        message: `ارتفاع حاد في سعر البيع (${Math.round(change)}%) لـ ${latest.brand} ${latest.model} ${latest.variant}`,
        severity: 'warning',
      });
    } else if (change < -15) {
      alerts.push({
        type: 'price_drop',
        brand: latest.brand,
        model: latest.model,
        variant: latest.variant,
        message: `انخفاض ملحوظ في سعر البيع (${Math.round(Math.abs(change))}%) لـ ${latest.brand} ${latest.model} ${latest.variant}`,
        severity: 'info',
      });
    }
  }

  return alerts;
}

export const PricingIntelligence = {
  suggestPrice(brand: string, model: string, variant?: string): PriceSuggestion {
    const records = loadRecords();
    const lowerBrand = brand.toLowerCase();
    const lowerModel = model.toLowerCase();

    const filtered = records.filter(r =>
      r.brand.toLowerCase() === lowerBrand &&
      r.model.toLowerCase() === lowerModel &&
      (variant ? r.variant.toLowerCase() === variant.toLowerCase() : true),
    );

    const basedOn = filtered.length;
    const hasBothPrices = filtered.some(r => r.buyPrice > 0 && r.sellPrice != null && r.sellPrice > 0);

    if (basedOn === 0 || !hasBothPrices) {
      return buildTierSuggestion(brand, model, variant, basedOn);
    }

    const buyPrices = filtered.filter(r => r.buyPrice > 0).map(r => r.buyPrice);
    const sellPrices = filtered.filter(r => r.sellPrice != null && r.sellPrice > 0).map(r => r.sellPrice!);

    const avgBuyPrice = buyPrices.length > 0
      ? buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length
      : 0;
    const avgSellPrice = sellPrices.length > 0
      ? sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length
      : 0;
    const minBuyPrice = buyPrices.length > 0 ? Math.min(...buyPrices) : 0;
    const maxBuyPrice = buyPrices.length > 0 ? Math.max(...buyPrices) : 0;
    const minSellPrice = sellPrices.length > 0 ? Math.min(...sellPrices) : 0;
    const maxSellPrice = sellPrices.length > 0 ? Math.max(...sellPrices) : 0;

    let confidence: PriceSuggestion['confidence'];
    if (basedOn <= 2) confidence = 'low';
    else if (basedOn <= 9) confidence = 'medium';
    else confidence = 'high';

    const suggestedBuyPrice = Math.round(avgBuyPrice);
    const suggestedSellPrice = Math.round(avgSellPrice * 1.15);
    const expectedProfit = suggestedSellPrice - suggestedBuyPrice;
    const expectedMargin = suggestedBuyPrice > 0
      ? (expectedProfit / suggestedBuyPrice) * 100
      : 0;

    const inventoryTurnover = estimateTurnover(filtered);

    return {
      brand,
      model,
      suggestedBuyPrice,
      suggestedSellPrice,
      expectedProfit,
      expectedMargin: Math.round(expectedMargin * 100) / 100,
      confidence,
      basedOn,
      avgBuyPrice,
      avgSellPrice,
      minBuyPrice,
      maxBuyPrice,
      minSellPrice,
      maxSellPrice,
      inventoryTurnover,
    };
  },

  recordPrice(input: Omit<PriceRecord, 'id' | 'profit' | 'margin' | 'date'>): void {
    const records = loadRecords();
    const profit = (input.sellPrice ?? 0) - input.buyPrice;
    const margin = input.buyPrice > 0 ? (profit / input.buyPrice) * 100 : 0;

    const record: PriceRecord = {
      ...input,
      id: generateId(),
      profit,
      margin: Math.round(margin * 100) / 100,
      date: new Date().toISOString(),
    };

    records.push(record);
    saveRecords(records);
  },

  getPriceHistory(brand: string, model: string, variant?: string, limit?: number): PriceRecord[] {
    const records = loadRecords();
    const lowerBrand = brand.toLowerCase();
    const lowerModel = model.toLowerCase();

    const filtered = records.filter(r =>
      r.brand.toLowerCase() === lowerBrand &&
      r.model.toLowerCase() === lowerModel &&
      (variant ? r.variant.toLowerCase() === variant.toLowerCase() : true),
    );

    const sorted = filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  },

  getNeedingReview(): { brand: string; model: string; variant: string; daysSinceLastPrice: number }[] {
    const records = loadRecords();
    const grouped = new Map<string, { brand: string; model: string; variant: string; lastDate: string }>();

    for (const r of records) {
      const key = `${r.brand}|${r.model}|${r.variant}`;
      const existing = grouped.get(key);
      if (!existing || r.date > existing.lastDate) {
        grouped.set(key, { brand: r.brand, model: r.model, variant: r.variant, lastDate: r.date });
      }
    }

    const now = Date.now();
    const thresholdDays = 30;
    const results: { brand: string; model: string; variant: string; daysSinceLastPrice: number }[] = [];

    for (const [, entry] of grouped) {
      const lastTime = new Date(entry.lastDate).getTime();
      if (isNaN(lastTime)) continue;
      const daysSince = Math.floor((now - lastTime) / (1000 * 60 * 60 * 24));
      if (daysSince >= thresholdDays) {
        results.push({ ...entry, daysSinceLastPrice: daysSince });
      }
    }

    results.sort((a, b) => b.daysSinceLastPrice - a.daysSinceLastPrice);
    return results;
  },

  getBestMargin(limit: number = 10): PriceSuggestion[] {
    const records = loadRecords();
    const seen = new Set<string>();
    const suggestions: PriceSuggestion[] = [];

    for (const r of records) {
      const key = `${r.brand.toLowerCase()}|${r.model.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(this.suggestPrice(r.brand, r.model));
    }

    return suggestions
      .filter(s => s.confidence !== 'none')
      .sort((a, b) => b.expectedMargin - a.expectedMargin)
      .slice(0, limit);
  },

  getWorstMargin(limit: number = 10): PriceSuggestion[] {
    const records = loadRecords();
    const seen = new Set<string>();
    const suggestions: PriceSuggestion[] = [];

    for (const r of records) {
      const key = `${r.brand.toLowerCase()}|${r.model.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(this.suggestPrice(r.brand, r.model));
    }

    return suggestions
      .filter(s => s.confidence !== 'none')
      .sort((a, b) => a.expectedMargin - b.expectedMargin)
      .slice(0, limit);
  },

  checkPrice(
    brand: string,
    model: string,
    variant: string,
    proposedBuy?: number,
    proposedSell?: number,
  ): PriceAlert | null {
    const suggestion = this.suggestPrice(brand, model, variant);
    const { avgBuyPrice } = suggestion;

    if (proposedBuy != null && proposedSell != null) {
      const margin = proposedBuy > 0
        ? ((proposedSell - proposedBuy) / proposedBuy) * 100
        : 0;

      if (proposedSell < avgBuyPrice) {
        return {
          type: 'loss',
          brand,
          model,
          variant,
          message: `خسارة متوقعة — سعر البيع (${proposedSell}) أقل من متوسط سعر الشراء (${Math.round(avgBuyPrice)})`,
          severity: 'danger',
        };
      }

      if (margin < 5) {
        return {
          type: 'low_profit',
          brand,
          model,
          variant,
          message: `ربح ضعيف جداً (${Math.round(margin)}%) — السعر المدخل سيؤدي إلى ربح ضعيف`,
          severity: 'danger',
        };
      }

      if (margin < 10) {
        return {
          type: 'low_profit',
          brand,
          model,
          variant,
          message: `ربح أقل من المعتاد (${Math.round(margin)}%) — يفضل رفع السعر قليلاً`,
          severity: 'warning',
        };
      }

      if (margin > 25) {
        return {
          type: 'good_deal',
          brand,
          model,
          variant,
          message: `ربح ممتاز (${Math.round(margin)}%)`,
          severity: 'success',
        };
      }

      return null;
    }

    if (proposedSell != null && proposedSell < avgBuyPrice) {
      return {
        type: 'loss',
        brand,
        model,
        variant,
        message: `خسارة متوقعة — سعر البيع (${proposedSell}) أقل من متوسط سعر الشراء (${Math.round(avgBuyPrice)})`,
        severity: 'danger',
      };
    }

    if (proposedBuy != null && avgBuyPrice > 0 && proposedBuy > avgBuyPrice * 1.1) {
      return {
        type: 'low_profit',
        brand,
        model,
        variant,
        message: `سعر شراء مرتفع — ${proposedBuy} مقابل متوسط ${Math.round(avgBuyPrice)}`,
        severity: 'warning',
      };
    }

    return null;
  },

  getAlerts(): PriceAlert[] {
    const records = loadRecords();
    const alerts: PriceAlert[] = [];

    const withBoth = records.filter(r => r.buyPrice > 0 && r.sellPrice != null && r.sellPrice > 0);

    for (const record of withBoth) {
      alerts.push(...generateAlertsForRecord(record));
    }

    alerts.push(...detectPriceSurges(records));

    const sorted = alerts.sort((a, b) => {
      const severityOrder: Record<string, number> = { danger: 0, warning: 1, info: 2, success: 3 };
      return (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
    });

    return sorted.slice(0, 100);
  },

  getAveragePriceForTier(tier: 'budget' | 'mid' | 'high-end' | 'flagship'): { avgBuy: number; avgSell: number } {
    const records = loadRecords();
    const filtered = records.filter(r => {
      const t = getBrandTier(r.brand, r.model);
      return t === tier && r.buyPrice > 0;
    });

    if (filtered.length === 0) {
      const defaults = TIER_DEFAULTS[tier];
      return {
        avgBuy: Math.round((defaults.buyMin + defaults.buyMax) / 2),
        avgSell: Math.round((defaults.sellMin + defaults.sellMax) / 2),
      };
    }

    const totalBuy = filtered.reduce((s, r) => s + r.buyPrice, 0);
    const sellRecords = filtered.filter(r => r.sellPrice != null && r.sellPrice > 0);
    const totalSell = sellRecords.reduce((s, r) => s + r.sellPrice!, 0);

    return {
      avgBuy: Math.round(totalBuy / filtered.length),
      avgSell: sellRecords.length > 0 ? Math.round(totalSell / sellRecords.length) : 0,
    };
  },

  resetData(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
