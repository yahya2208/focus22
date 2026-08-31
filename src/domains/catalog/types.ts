/**
 * Master Product Catalog — domain types.
 *
 * This module mirrors the `ICONs.md` Master Product Catalog produced by
 * Perplexity (currently 8 of 18 categories: the fresh/grocery/deli sections).
 * It is a pure client-side DATA + LOOKUP layer: categories → subcategories →
 * products, each carrying locale names, emoji icon, search aliases and the
 * natural (default) sales unit. FOCUS never sells/pays in-app; this catalog is
 * the labelled, searchable vocabulary that future storefront/inventory work
 * will consume.
 *
 * SCOPE / EXTENSIBILITY: adding more categories later is a pure-data change —
 * drop the new category into `seed.ts`, never re-design these types. The types
 * are intentionally generic to the ICONs.md shape so the remaining 10 of the
 * 18 categories (fish-seafood, canned-preserved, beverages, frozen,
 * baking-supplies, baby-products, cleaning-household, personal-care,
 * pet-supplies, household-tools) can land without restructuring.
 */

/** Stable lowercase-ASCII dashed id, e.g. `vegetables-root-potato`. */
export type CatalogId = string;

/** Natural sales unit of a product (ICONs.md vocabulary, wider than produce). */
export type CatalogUnit =
  | 'kg'
  | 'g'
  | 'L'
  | 'ml'
  | 'pièce'
  | 'botte'
  | 'paquet'
  | 'boîte'
  | 'bouteille'
  | 'barquette'
  | 'sachet'
  | 'barre'
  | 'boule'
  | 'tranche';

/**
 * A single saleable product (PRODUCT ≠ VARIANT ≠ BRAND). No price/stock here —
 * the Master Catalog is labels + natural units only; prices/inventory are added
 * later per product by the admin.
 */
export interface CatalogProduct {
  id: CatalogId;
  category_id: string;
  subcategory_id: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  icon: string;
  aliases_ar: string[];
  aliases_fr: string[];
  default_unit: CatalogUnit;
  sort_order: number;
}

/** A category inside a catalog category (e.g. `vegetables-root`). */
export interface CatalogSubcategory {
  id: CatalogId;
  category_id: string;
  name_ar: string;
  name_fr: string;
  icon: string;
  sort_order: number;
  products: CatalogProduct[];
}

/** Top-level catalog category (e.g. `vegetables`). */
export interface CatalogCategory {
  id: CatalogId;
  name_ar: string;
  name_fr: string;
  icon: string;
  sort_order: number;
  subcategories: CatalogSubcategory[];
}

/** The whole catalog: an ordered list of root categories. */
export interface MasterCatalog {
  categories: CatalogCategory[];
}
