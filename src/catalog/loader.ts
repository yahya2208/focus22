import type { CatalogBrand, SearchResult, CatalogIndex, CatalogVariant } from './types';
import samsung from './brands/samsung.json';
import apple from './brands/apple.json';
import xiaomi from './brands/xiaomi.json';
import honor from './brands/honor.json';
import huawei from './brands/huawei.json';
import oppo from './brands/oppo.json';
import vivo from './brands/vivo.json';
import realme from './brands/realme.json';
import oneplus from './brands/oneplus.json';
import motorola from './brands/motorola.json';
import google from './brands/google.json';
import nothing from './brands/nothing.json';
import sony from './brands/sony.json';
import asus from './brands/asus.json';
import nokia from './brands/nokia.json';
import infinix from './brands/infinix.json';
import tecno from './brands/tecno.json';
import zte from './brands/zte.json';

const ALL_BRANDS: CatalogBrand[] = [
  samsung, apple, xiaomi, honor, huawei, oppo, vivo,
  realme, oneplus, motorola, google, nothing, sony,
  asus, nokia, infinix, tecno, zte,
];

let _index: CatalogIndex | null = null;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s,/-]+/).filter(Boolean).map(t => t.replace(/[^a-z0-9\u0600-\u06FF]/g, ''));
}

function buildIndex(): CatalogIndex {
  const brandIndex = new Map<string, CatalogBrand>();
  const modelNumberIndex = new Map<string, { brand: string; model: string }>();
  const aliasIndex = new Map<string, string[]>();
  const tokenIndex = new Map<string, { brand: string; model: string }[]>();

  for (const brand of ALL_BRANDS) {
    brandIndex.set(brand.brand.toLowerCase(), brand);
    for (const alias of brand.aliases) aliasIndex.set(normalize(alias), [brand.brand]);

    for (const model of brand.models) {
      const tokens = tokenize(model.model);
      for (const token of tokens) {
        const existing = tokenIndex.get(token) ?? [];
        existing.push({ brand: brand.brand, model: model.model });
        tokenIndex.set(token, existing);
      }
      for (const mn of model.modelNumbers) {
        modelNumberIndex.set(normalize(mn), { brand: brand.brand, model: model.model });
      }
    }
  }

  _index = { brandIndex, modelNumberIndex, aliasIndex, tokenIndex };
  return _index;
}

export function getIndex(): CatalogIndex {
  if (!_index) _index = buildIndex();
  return _index;
}

export function getAllBrands(): CatalogBrand[] {
  return ALL_BRANDS;
}

export function getBrand(name: string): CatalogBrand | undefined {
  return ALL_BRANDS.find(b => b.brand.toLowerCase() === name.toLowerCase());
}

export function getBrandsList(): string[] {
  return ALL_BRANDS.map(b => b.brand).sort();
}

export function getSeries(brandName: string): string[] {
  const brand = getBrand(brandName);
  if (!brand) return [];
  const series = new Set(brand.models.map(m => m.series));
  return Array.from(series).sort();
}

export function getModelsBySeries(brandName: string, series: string): { model: string; variants: CatalogVariant[] }[] {
  const brand = getBrand(brandName);
  if (!brand) return [];
  return brand.models
    .filter(m => m.series === series)
    .map(m => ({ model: m.model, variants: m.variants }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

export function getVariants(brandName: string, modelName: string): CatalogVariant[] {
  const brand = getBrand(brandName);
  if (!brand) return [];
  const model = brand.models.find(m => m.model === modelName);
  return model?.variants ?? [];
}

export function searchProgressive(query: string): { brands: string[]; series: string[]; models: string[] } {
  const idx = getIndex();
  const q = normalize(query);

  if (q.length < 1) return { brands: [], series: [], models: [] };

  const matchedBrands = new Set<string>();
  const matchedSeries = new Set<string>();
  const matchedModels = new Set<string>();

  for (const [token, entries] of idx.tokenIndex) {
    if (token.startsWith(q) || q.startsWith(token)) {
      for (const entry of entries) {
        const brand = idx.brandIndex.get(entry.brand.toLowerCase());
        if (brand) {
          matchedBrands.add(entry.brand);
          const model = brand.models.find(m => m.model === entry.model);
          if (model) {
            matchedSeries.add(model.series);
            matchedModels.add(entry.model);
          }
        }
      }
    }
  }

  for (const [alias, brands] of idx.aliasIndex) {
    if (alias.startsWith(q) || q.startsWith(alias)) {
      for (const b of brands) matchedBrands.add(b);
    }
  }

  for (const [mn, entry] of idx.modelNumberIndex) {
    if (mn.startsWith(q) || q.startsWith(mn)) {
      matchedBrands.add(entry.brand);
      matchedModels.add(entry.model);
    }
  }

  return {
    brands: Array.from(matchedBrands).sort(),
    series: Array.from(matchedSeries).sort(),
    models: Array.from(matchedModels).sort(),
  };
}

export function search(query: string): SearchResult[] {
  const idx = getIndex();
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  const scores = new Map<string, SearchResult>();
  const key = (b: string, m: string) => `${b}|${m}`;

  for (const brand of ALL_BRANDS) {
    for (const model of brand.models) {
      const modelTokens = tokenize(model.model);
      let matchedTokens = 0;
      for (const qt of qTokens) {
        if (modelTokens.some(mt => mt.startsWith(qt) || qt.startsWith(mt))) {
          matchedTokens++;
        }
      }
      if (matchedTokens === 0) continue;

      const aliasMatch = brand.aliases.some(a => normalize(a).includes(qTokens[0] ?? ''));

      let score = matchedTokens / Math.max(qTokens.length, modelTokens.length);
      if (aliasMatch) score += 0.3;

      const existing = scores.get(key(brand.brand, model.model));
      if (!existing || score > existing.matchScore) {
        scores.set(key(brand.brand, model.model), {
          brand: brand.brand,
          model: model.model,
          matchScore: score,
          matchType: score > 0.8 ? 'exact' : 'token',
        });
      }
    }
  }

  for (const [mn, entry] of idx.modelNumberIndex) {
    for (const qt of qTokens) {
      if (mn.includes(qt) || qt.includes(mn)) {
        const k = key(entry.brand, entry.model);
        const existing = scores.get(k);
        if (!existing || 1.0 > existing.matchScore) {
          scores.set(k, {
            brand: entry.brand,
            model: entry.model,
            matchScore: 1.0,
            matchType: 'model-number',
          });
        }
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 20);
}

export function searchBrand(query: string): string[] {
  const q = normalize(query);
  return ALL_BRANDS
    .filter(b => {
      if (normalize(b.brand).includes(q)) return true;
      return b.aliases.some(a => normalize(a).includes(q));
    })
    .map(b => b.brand);
}

export function getAllModels(): { brand: string; model: string; series: string }[] {
  const result: { brand: string; model: string; series: string }[] = [];
  for (const brand of ALL_BRANDS) {
    for (const model of brand.models) {
      result.push({ brand: brand.brand, model: model.model, series: model.series });
    }
  }
  return result;
}

export function rebuildIndex(): void {
  _index = null;
  getIndex();
}
