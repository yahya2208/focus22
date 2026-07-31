import { resolveAlias } from './alias-engine';
import { generateId } from '../business-intelligence/data-source';

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

export interface PopularityEvent {
  id: string;
  brand: string;
  model: string;
  type: 'search' | 'select' | 'purchase' | 'exchange' | 'whatsapp' | 'recommend';
  timestamp: string;
}

const EVENTS_KEY = 'popularity_events';
const SCORES_KEY = 'popularity_scores';
const MAX_EVENTS = 5000;

const WEIGHTS: Record<PopularityEvent['type'], number> = {
  search: 1,
  select: 3,
  purchase: 10,
  exchange: 8,
  whatsapp: 5,
  recommend: 2,
};

let _events: PopularityEvent[] | null = null;
let _scoresCache: Map<string, PopularityScore> | null = null;
let _dirty = true;

function loadEvents(): PopularityEvent[] {
  if (_events !== null) return _events;
  try {
    const stored = localStorage.getItem(EVENTS_KEY);
    _events = stored ? JSON.parse(stored) : [];
  } catch {
    _events = [];
  }
  return _events!;
}

function saveEvents(events: PopularityEvent[]): void {
  const trimmed = events.slice(-MAX_EVENTS);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
  _events = trimmed;
}

function loadScoresCache(): Map<string, PopularityScore> {
  if (_scoresCache !== null && !_dirty) return _scoresCache;
  const events = loadEvents();
  const scoreMap = new Map<string, PopularityScore>();

  for (const ev of events) {
    const key = `${ev.brand}|${ev.model}`;
    let entry = scoreMap.get(key);
    const now = Date.now();
    const evTime = new Date(ev.timestamp).getTime();
    if (!entry) {
      entry = {
        brand: ev.brand,
        model: ev.model,
        score: 0,
        searches: 0,
        selections: 0,
        purchaseRequests: 0,
        exchangeRequests: 0,
        whatsAppMessages: 0,
        recommendations: 0,
        lastActivity: ev.timestamp,
        trend: 'stable',
      };
      scoreMap.set(key, entry);
    }
    switch (ev.type) {
      case 'search': entry.searches++; break;
      case 'select': entry.selections++; break;
      case 'purchase': entry.purchaseRequests++; break;
      case 'exchange': entry.exchangeRequests++; break;
      case 'whatsapp': entry.whatsAppMessages++; break;
      case 'recommend': entry.recommendations++; break;
    }
    if (evTime > now) {
      // future timestamps are invalid, skip
    } else if (!entry.lastActivity || evTime > new Date(entry.lastActivity).getTime()) {
      entry.lastActivity = ev.timestamp;
    }
  }

  let maxSum = 0;
  const allEntries = Array.from(scoreMap.values());
  const rawSums: number[] = [];
  for (const entry of allEntries) {
    const sum = entry.searches * WEIGHTS.search
      + entry.selections * WEIGHTS.select
      + entry.purchaseRequests * WEIGHTS.purchase
      + entry.exchangeRequests * WEIGHTS.exchange
      + entry.whatsAppMessages * WEIGHTS.whatsapp
      + entry.recommendations * WEIGHTS.recommend;
    rawSums.push(sum);
    if (sum > maxSum) maxSum = sum;
  }

  const denominator = maxSum || 100;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i]!;
    entry.score = Math.min(100, Math.round((rawSums[i]! / denominator) * 100));
    entry.trend = computeTrend(events, entry.brand, entry.model);
  }

  _scoresCache = scoreMap;
  _dirty = false;

  persistScores(scoreMap);

  return _scoresCache;
}

function persistScores(map: Map<string, PopularityScore>): void {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // storage full, skip
  }
}

function computeTrend(events: PopularityEvent[], brand: string, model: string): 'rising' | 'stable' | 'declining' {
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  let current = 0;
  let previous = 0;

  for (const ev of events) {
    if (ev.brand !== brand || ev.model !== model) continue;
    const evTime = new Date(ev.timestamp).getTime();
    if (evTime > now) continue;
    if (evTime >= now - SEVEN_DAYS) {
      current++;
    } else if (evTime >= now - 2 * SEVEN_DAYS) {
      previous++;
    }
  }

  if (current > previous * 1.2) return 'rising';
  if (current < previous * 0.8) return 'declining';
  return 'stable';
}

function normalizeDevice(brand: string, model: string): { brand: string; model: string } {
  const alias = resolveAlias(`${brand} ${model}`);
  if (alias) return { brand: alias.brand, model: alias.model };
  return { brand, model };
}

export const PhonePopularity = {
  recordEvent(brand: string, model: string, type: PopularityEvent['type']): void {
    const normalized = normalizeDevice(brand, model);
    const events = loadEvents();
    events.push({
      id: generateId(),
      brand: normalized.brand,
      model: normalized.model,
      type,
      timestamp: new Date().toISOString(),
    });
    saveEvents(events);
    _dirty = true;
  },

  getScore(brand: string, model: string): PopularityScore {
    const normalized = normalizeDevice(brand, model);
    const cache = loadScoresCache();
    const key = `${normalized.brand}|${normalized.model}`;
    const entry = cache.get(key);
    if (entry) return entry;
    return {
      brand: normalized.brand,
      model: normalized.model,
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
  },

  getAllScores(limit?: number): PopularityScore[] {
    const cache = loadScoresCache();
    const all = Array.from(cache.values()).sort((a, b) => b.score - a.score);
    return limit ? all.slice(0, limit) : all;
  },

  getTopDevices(limit?: number): { brand: string; model: string; score: number }[] {
    return this.getAllScores(limit).map(({ brand, model, score }) => ({ brand, model, score }));
  },

  searchByPopularity(query: string): { brand: string; model: string; score: number }[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const cache = loadScoresCache();
    const scored = Array.from(cache.values())
      .filter(
        s =>
          s.brand.toLowerCase().includes(q) || s.model.toLowerCase().includes(q),
      )
      .sort((a, b) => b.score - a.score);
    return scored.map(({ brand, model, score }) => ({ brand, model, score }));
  },

  getTrend(brand: string, model: string): 'rising' | 'stable' | 'declining' {
    return this.getScore(brand, model).trend;
  },

  resetScores(): void {
    localStorage.removeItem(EVENTS_KEY);
    localStorage.removeItem(SCORES_KEY);
    _events = null;
    _scoresCache = null;
    _dirty = true;
  },

  getTotalEvents(): number {
    return loadEvents().length;
  },

  getMostPopularBrand(): string | null {
    const cache = loadScoresCache();
    if (cache.size === 0) return null;
    const brandScores = new Map<string, number>();
    for (const entry of cache.values()) {
      brandScores.set(entry.brand, (brandScores.get(entry.brand) || 0) + entry.score);
    }
    let best: string | null = null;
    let bestScore = -1;
    for (const [brand, score] of brandScores) {
      if (score > bestScore) {
        bestScore = score;
        best = brand;
      }
    }
    return best;
  },
};
