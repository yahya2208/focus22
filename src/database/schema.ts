export interface CatalogBrand {
  id: string;
  name: string;
  normalized: string;
  series: string[];
  modelCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSeries {
  id: string;
  brandId: string;
  name: string;
  normalized: string;
  modelCount: number;
}

export interface CatalogModel {
  id: string;
  brandId: string;
  brandName: string;
  seriesId: string | null;
  seriesName: string | null;
  name: string;
  normalized: string;
  aliases: string[];
  variantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVariant {
  id: string;
  modelId: string;
  brandName: string;
  modelName: string;
  ram: string;
  storage: string;
  label: string;
  normalized: string;
}

export interface CatalogAlias {
  id: string;
  modelId: string;
  alias: string;
  normalized: string;
  type: 'model_code' | 'arabic' | 'english' | 'abbreviation' | 'number_only' | 'other';
}

export interface CatalogStats {
  totalBrands: number;
  totalModels: number;
  totalVariants: number;
  totalAliases: number;
  brandsWithModels: { brand: string; count: number; series: string[] }[];
  duplicateCount: number;
  missingAliasCount: number;
  coveragePercent: number;
}

export interface CatalogVersion {
  version: string;
  previousVersion: string | null;
  timestamp: string;
  stats: {
    brands: number;
    models: number;
    variants: number;
    aliases: number;
  };
  changelog: CatalogChangeEntry[];
}

export interface CatalogChangeEntry {
  type: 'added' | 'removed' | 'modified';
  entity: 'brand' | 'model' | 'variant' | 'alias';
  id: string;
  name: string;
  detail?: string;
}

export const TABLES = {
  CATALOG_BRANDS: 'catalog_brands_v1',
  CATALOG_SERIES: 'catalog_series_v1',
  CATALOG_MODELS: 'catalog_models_v1',
  CATALOG_VARIANTS: 'catalog_variants_v1',
  CATALOG_ALIASES: 'catalog_aliases_v1',
  CATALOG_META: 'catalog_meta_v1',
  CATALOG_VERSION: 'catalog_version_v1',
  CATALOG_CHANGELOG: 'catalog_changelog_v1',
} as const;

export const CATALOG_CURRENT_VERSION = 'v2026.07';
