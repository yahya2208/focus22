import { PHONE_CATALOG, PHONE_MODELS } from '../data/phone-catalog';
import type { PhoneVariant } from '../data/phone-variants';
import { PHONE_VARIANTS, getVariantsForModel, formatVariant } from '../data/phone-variants';
import { searchWithAliases, resolveAlias, buildAliasIndex } from './alias-engine';
import { PhonePopularity } from './popularity-engine';

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
  const results = aliasResults.map(r => {
    const pop = PhonePopularity.getScore(r.brand, r.model);
    return {
      brand: r.brand,
      model: r.model,
      normalized: r.model.toLowerCase().replace(/\s+/g, ''),
      score: r.score,
      matchedOn: r.matchedOn,
      popularityScore: pop.score,
    };
  });

  // Smart ranking: sort by similarity score first, then by popularity
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

export function getSuggestedVariants(model: string): PhoneVariant[] {
  return getVariantsForModel(model);
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
