import type { CatalogBrand, SearchResult, CatalogIndex, CatalogVariant } from './types';
import { getApprovedCatalogModelsCached } from '../services/catalog-approved-service';
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

// ── Merged brand cache ──────────────────────────────────────────────
// Recomputed only when the DB cache reference changes (cold → warm, or
// after invalidation).  Static brands are the base; DB-approved models
// are merged IN (additive) so they become visible in browse + search.
let _mergedBrands: CatalogBrand[] | null = null;
let _lastDbCache: CatalogBrand[] | null = null;

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

  for (const brand of getAllBrands()) {
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

/**
 * Merge DB-approved brands into the static catalog.
 *
 * Rules:
 * - Static catalog data is authoritative when the same model exists.
 * - DB-approved models are additive (new models are appended).
 * - New DB-only brands are appended.
 * - Deduplication is case-insensitive for both brands and models.
 * - Original static ALL_BRANDS objects are NOT mutated.
 */
function computeMergedBrands(dbBrands: CatalogBrand[]): CatalogBrand[] {
  // Start with deep copies of static brands (avoid mutation).
  const merged: CatalogBrand[] = ALL_BRANDS.map(b => ({
    ...b,
    models: b.models.map(m => ({ ...m, variants: m.variants.map(v => ({ ...v })) })),
  }));

  for (const dbBrand of dbBrands) {
    const existing = merged.find(b => b.brand.toLowerCase() === dbBrand.brand.toLowerCase());
    if (existing) {
      // Merge: add DB models not already in static (case-insensitive dedup).
      const existingModelKeys = new Set(existing.models.map(m => m.model.toLowerCase()));
      for (const dbModel of dbBrand.models) {
        if (!existingModelKeys.has(dbModel.model.toLowerCase())) {
          existing.models.push(dbModel);
        }
      }
    } else {
      // New brand — append entire DB brand.
      merged.push(dbBrand);
    }
  }

  return merged.sort((a, b) => a.brand.localeCompare(b.brand));
}

function getMergedBrands(): CatalogBrand[] {
  const dbBrands = getApprovedCatalogModelsCached();
  // Recompute only when the DB cache reference changed.
  if (dbBrands !== _lastDbCache) {
    _lastDbCache = dbBrands;
    _mergedBrands = dbBrands && dbBrands.length > 0
      ? computeMergedBrands(dbBrands)
      : null;
  }
  return _mergedBrands ?? ALL_BRANDS;
}

export function getAllBrands(): CatalogBrand[] {
  return getMergedBrands();
}

export function getBrand(name: string): CatalogBrand | undefined {
  const merged = getMergedBrands();
  return merged.find(b => b.brand.toLowerCase() === name.toLowerCase());
}

export function getBrandsList(): string[] {
  return getAllBrands().map(b => b.brand).sort();
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

let _variantsByName: Map<string, CatalogVariant[]> | null = null;

function ensureVariantsByName(): Map<string, CatalogVariant[]> {
  if (!_variantsByName) {
    const map = new Map<string, CatalogVariant[]>();
    for (const brand of ALL_BRANDS) {
      for (const model of brand.models) {
        const key = normalize(model.model);
        if (!map.has(key)) map.set(key, model.variants);
      }
    }
    _variantsByName = map;
  }
  return _variantsByName;
}

/**
 * Real per-model variants from the canonical JSON catalog, looked up by model
 * name. When `brand` is provided, results are restricted to that brand's model
 * (never another brand's). When `brand` is absent, legacy behavior is kept:
 * first brand match wins (backward compatible).
 */
export function getVariantsByName(modelName: string, brand?: string): CatalogVariant[] {
  const normalized = normalize(modelName);
  if (brand) {
    const b = getBrand(brand);
    if (b) {
      const model = b.models.find(m => normalize(m.model) === normalized);
      if (model) return model.variants;
    }
    // Fallback: DB-approved models (loaded via catalog_approved_models_for_inventory RPC)
    const dbBrands = getApprovedCatalogModelsCached();
    if (dbBrands) {
      const dbBrand = dbBrands.find(bb => bb.brand.toLowerCase() === brand.toLowerCase());
      if (dbBrand) {
        const dbModel = dbBrand.models.find(m => normalize(m.model) === normalized);
        if (dbModel) return dbModel.variants;
      }
    }
    return [];
  }
  // No brand specified: check static first, then DB
  const staticResult = ensureVariantsByName().get(normalized);
  if (staticResult) return staticResult;
  const dbBrands = getApprovedCatalogModelsCached();
  if (dbBrands) {
    for (const dbBrand of dbBrands) {
      const dbModel = dbBrand.models.find(m => normalize(m.model) === normalized);
      if (dbModel) return dbModel.variants;
    }
  }
  return [];
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

/**
 * @deprecated — LEGACY SEARCH PATH (AUDIT 2026-08-01)
 *
 *   This legacy internal search function is no longer used by production UI.
 *   The OFFICIAL, production-grade search path for catalog lookups is:
 *
 *       services/catalog-service.ts → searchCatalog(query, limit)
 *           ↓
 *       services/alias-engine.ts  → searchWithAliases(query, limit)
 *           ↳ combines alias fuzzy matching + reverse-lookup + popularity ranking
 *
 *   Why two paths exist historically:
 *     - loader.search() was the V1 index-based search built at the same time
 *       as the CatalogIndex. It scored matches using pure token overlap
 *       without aliases or popularity signals.
 *     - alias-engine was added later to handle Arabic/Latin aliases, common
 *       synonyms, and store-specific shorthand naming. It is now the SOLE
 *       runtime search path used by Autocomplete, Cascade Selector, Inventory
 *       Modals, Search Screens, and every other UI search entry-point.
 *
 *   This function is preserved ONLY as a reference for replaying against the
 *   canonical index (e.g. in index-build-time consistency checks). Do NOT
 *   expose to new code paths. Scheduled for removal after 30+ days of
 *   confirmed zero runtime imports.
 *
 *   @param query free-form user query (any case, any language).
 *   @returns ranked list of {brand, model, matchScore, matchType} matches.
 */
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
