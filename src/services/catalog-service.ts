import { PHONE_CATALOG, PHONE_MODELS } from '../data/phone-catalog';
import type { PhoneVariant } from '../data/phone-variants';
import { PHONE_VARIANTS, getVariantsForModel, formatVariant } from '../data/phone-variants';
import { searchWithAliases, resolveAlias, buildAliasIndex } from './alias-engine';
import { PhonePopularity } from './popularity-engine';
import { getApprovedCatalogModelsCached } from './catalog-approved-service';

export interface CatalogSearchResult {
  brand: string;
  model: string;
  normalized: string;
  score: number;
  matchedOn?: string;
  popularityScore?: number;
}

export function searchCatalog(query: string, limit = 20): CatalogSearchResult[] {
  if (!query.trim()) return [];
  const aliasResults = searchWithAliases(query, limit);
  const seen = new Set<string>();
  const results: CatalogSearchResult[] = [];

  for (const r of aliasResults) {
    const pop = PhonePopularity.getScore(r.brand, r.model);
    const key = `${r.brand}|${r.model}`;
    seen.add(key.toLowerCase());
    results.push({
      brand: r.brand,
      model: r.model,
      normalized: r.model.toLowerCase().replace(/\s+/g, ''),
      score: r.score,
      matchedOn: r.matchedOn,
      popularityScore: pop.score,
    });
  }

  // Augment with DB-approved models (not in static catalog)
  const q = query.toLowerCase().trim();
  const dbBrands = getApprovedCatalogModelsCached();
  if (dbBrands) {
    for (const brand of dbBrands) {
      const brandMatch = brand.brand.toLowerCase().includes(q)
        || brand.aliases.some(a => a.toLowerCase().includes(q));
      for (const model of brand.models) {
        const key = `${brand.brand}|${model.model}`;
        if (seen.has(key.toLowerCase())) continue;
        const modelMatch = model.model.toLowerCase().includes(q);
        if (brandMatch || modelMatch) {
          seen.add(key.toLowerCase());
          results.push({
            brand: brand.brand,
            model: model.model,
            normalized: model.model.toLowerCase().replace(/\s+/g, ''),
            score: brandMatch && modelMatch ? 0.9 : modelMatch ? 0.7 : 0.5,
            matchedOn: brandMatch ? 'brand+model' : 'model',
          });
        }
      }
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.popularityScore ?? 0) - (a.popularityScore ?? 0);
  }).slice(0, limit);
}

export function getAllBrands(): string[] {
  return PHONE_CATALOG.map(b => b.brand);
}

export function getModelsForBrand(brand: string): string[] {
  const entry = PHONE_CATALOG.find(b => b.brand.toLowerCase() === brand.toLowerCase());
  return entry ? [...entry.models] : [];
}

export interface ResolvedModel {
  brand: string;
  model: string;
  canonical: string;
}

export function resolveModel(input: string): ResolvedModel | null {
  if (!input.trim()) return null;
  const alias = resolveAlias(input);
  if (alias) return { brand: alias.brand, model: alias.model, canonical: alias.canonical };

  const lower = input.toLowerCase().trim();
  const direct = PHONE_MODELS.find(m => m.normalized === lower);
  if (direct) return { brand: direct.brand, model: direct.model, canonical: `${direct.brand} ${direct.model}` };

  const results = searchCatalog(input, 1);
  if (results.length > 0) {
    return { brand: results[0]!.brand, model: results[0]!.model, canonical: `${results[0]!.brand} ${results[0]!.model}` };
  }

  return null;
}

export function getSuggestedVariants(model: string, brand?: string): PhoneVariant[] {
  return getVariantsForModel(model, brand);
}

export function getAllVariants(): PhoneVariant[] {
  return PHONE_VARIANTS;
}

export function normalizeModelName(model: string): string {
  return model.trim().replace(/\s+/g, ' ');
}

export function rebuildAliasIndex(): void {
  buildAliasIndex();
}

export type { PhoneVariant } from '../data/phone-variants';
export { formatVariant };
