/**
 * Master Product Catalog — public surface.
 *
 * Consumers import from 'domains/catalog' only. This module wraps the ICONs.md
 * seed (`MASTER_CATALOG`) with deterministic lookup / search / normalization
 * helpers. It is a pure in-memory data layer: no DB, no RPCs, no side effects,
 * no storefront wiring. Future parts of ICONs.md extend `MASTER_CATALOG`
 * (data-only) without touching this API.
 */

import { MASTER_CATALOG } from './seed';
import type {
  CatalogCategory,
  CatalogId,
  CatalogProduct,
  CatalogSubcategory,
} from './types';

export type {
  CatalogCategory,
  CatalogId,
  CatalogProduct,
  CatalogSubcategory,
  CatalogUnit,
  MasterCatalog,
} from './types';

export { MASTER_CATALOG } from './seed';

export interface CatalogStats {
  categories: number;
  subcategories: number;
  products: number;
}

/** Flat, order-preserving list of all root categories. */
export function getCatalogCategories(): readonly CatalogCategory[] {
  return MASTER_CATALOG.categories;
}

/** Flat list of every subcategory across the catalog (order-preserving). */
export function getCatalogSubcategories(): readonly CatalogSubcategory[] {
  return MASTER_CATALOG.categories.flatMap((c) => c.subcategories);
}

/** Flat list of every product across the catalog (order-preserving). */
export function getCatalogProducts(): readonly CatalogProduct[] {
  return MASTER_CATALOG.categories
    .flatMap((c) => c.subcategories)
    .flatMap((s) => s.products);
}

/** Subcategories belonging to a root category id (empty when unknown). */
export function getCatalogSubcategoriesByCategory(
  categoryId: CatalogId,
): readonly CatalogSubcategory[] {
  const category = getCatalogCategory(categoryId);
  return category ? category.subcategories : [];
}

export function getCatalogCategory(id: CatalogId): CatalogCategory | undefined {
  return MASTER_CATALOG.categories.find((c) => c.id === id);
}

export function getCatalogSubcategory(
  id: CatalogId,
): CatalogSubcategory | undefined {
  return getCatalogSubcategories().find((s) => s.id === id);
}

export function getCatalogProduct(id: CatalogId): CatalogProduct | undefined {
  return getCatalogProducts().find((p) => p.id === id);
}

/** Total counts of the whole catalog (used by validation and reporting). */
export function getCatalogStats(): CatalogStats {
  return {
    categories: MASTER_CATALOG.categories.length,
    subcategories: getCatalogSubcategories().length,
    products: getCatalogProducts().length,
  };
}

/**
 * Deterministic count summary (identity of this exact seed). Useful as a
 * hard-ceiling guard so accidental edits to the seed are caught by tests:
 * `{ categories: 8, subcategories: 45, products: 381 }`.
 */
export const CATALOG_EXPECTED_STATS: CatalogStats = {
  categories: 8,
  subcategories: 45,
  products: 381,
};

export type CatalogSearchLocale = 'ar' | 'fr' | 'en';

/**
 * Case- and diacritic-insensitive search over a product's canonical names +
 * aliases in the given locale. Returns an ordered, de-duplicated list of
 * products whose normalized searchable text includes the (normalized) query.
 * Deterministic: same input → same output order (catalog order).
 */
export function searchCatalogProducts(
  query: string,
  locale: CatalogSearchLocale = 'ar',
): readonly CatalogProduct[] {
  const q = normalizeCatalogText(query);
  if (q === '') return [];

  return getCatalogProducts().filter((p) => {
    const fields: string[] = [p.name_ar, p.name_fr, p.name_en];
    if (locale === 'ar') fields.push(...p.aliases_ar);
    if (locale === 'fr') fields.push(...p.aliases_fr);
    // name_en always the cross-locale token so a search resolves.
    if (locale !== 'en') fields.push(...p.aliases_ar, ...p.aliases_fr);
    return fields.some((field) => normalizeCatalogText(field).includes(q));
  });
}

/** Lowercase + trim + strip Arabic diacritics for stable token matching. */
export function normalizeCatalogText(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u0652\u0670]/g, ''); // Arabic harakat/tanwin
}

/**
 * Localized label for a product in the given locale (falls back to another
 * locale when the requested one is missing, then id as last resort).
 */
export function catalogProductLabel(
  product: CatalogProduct,
  locale: CatalogSearchLocale = 'ar',
): string {
  if (locale === 'ar' && product.name_ar) return product.name_ar;
  if (locale === 'fr' && product.name_fr) return product.name_fr;
  if (locale === 'en' && product.name_en) return product.name_en;
  return product.name_ar || product.name_fr || product.name_en || product.id;
}
