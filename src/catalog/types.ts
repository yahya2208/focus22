export interface CatalogVariant {
  storage: string;
  ram: string;
}

export interface CatalogModel {
  model: string;
  variants: CatalogVariant[];
  modelNumbers: string[];
  releaseYear: number;
  series: string;
}

export interface CatalogBrand {
  brand: string;
  aliases: string[];
  models: CatalogModel[];
}

export interface SearchResult {
  brand: string;
  model: string;
  matchScore: number;
  matchType: 'exact' | 'alias' | 'token' | 'model-number';
  variant?: CatalogVariant;
}

export interface CatalogIndex {
  brandIndex: Map<string, CatalogBrand>;
  modelNumberIndex: Map<string, { brand: string; model: string }>;
  aliasIndex: Map<string, string[]>;
  tokenIndex: Map<string, { brand: string; model: string }[]>;
}
