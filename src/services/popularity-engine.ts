import { resolveAlias } from './alias-engine';

export interface PopularityScore {
  brand: string;
  model: string;
  score: number;
  searches: number;
  selections: number;
  purchaseRequests: number;
  exchangeRequests: number;
  whatsAppMessages: number;
  recommendations: number;
  lastActivity: string;
  trend: 'rising' | 'stable' | 'declining';
}

function normalizeDevice(brand: string, model: string): { brand: string; model: string } {
  const alias = resolveAlias(`${brand} ${model}`);
  if (alias) return { brand: alias.brand, model: alias.model };
  return { brand, model };
}

function neutralScore(brand: string, model: string): PopularityScore {
  return {
    brand,
    model,
    score: 0,
    searches: 0,
    selections: 0,
    purchaseRequests: 0,
    exchangeRequests: 0,
    whatsAppMessages: 0,
    recommendations: 0,
    lastActivity: '',
    trend: 'stable',
  };
}

export const PhonePopularity = {
  getScore(brand: string, model: string): PopularityScore {
    const normalized = normalizeDevice(brand, model);
    return neutralScore(normalized.brand, normalized.model);
  },

  getAllScores(): PopularityScore[] {
    return [];
  },

  getTopDevices(): { brand: string; model: string; score: number }[] {
    return [];
  },

  searchByPopularity(_query: string): { brand: string; model: string; score: number }[] {
    return [];
  },

  getTrend(): 'rising' | 'stable' | 'declining' {
    return 'stable';
  },

  getMostPopularBrand(): string | null {
    return null;
  },
};
