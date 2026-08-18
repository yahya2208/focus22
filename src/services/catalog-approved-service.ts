/**
 * Catalog Approved Service — DB-approved catalog models for Inventory.
 *
 * Fetches approved catalog models + variants from Supabase via the
 * `catalog_approved_models_for_inventory()` RPC. Returns data in
 * CatalogBrand[] shape (matching src/catalog/types.ts) for direct merge
 * with the static JSON catalog.
 *
 * Any model approved in catalog_models with at least one known/verified
 * variant becomes available automatically — no JSON file or rebuild needed.
 *
 * Caching:
 *   - Module-level singleton cache (like useCatalogBrands).
 *   - First call fetches from Supabase; subsequent calls return cached data.
 *   - `invalidateApprovedCatalogCache()` forces a re-fetch.
 */

import { getSupabaseClient } from '../core/supabase/client';
import type { CatalogBrand } from '../catalog/types';

let _cache: CatalogBrand[] | null = null;
let _fetching: Promise<CatalogBrand[]> | null = null;

/**
 * Fetch approved catalog models grouped by brand. Returns CatalogBrand[]
 * matching the shape of the static JSON files (src/catalog/brands/*.json).
 *
 * Results are cached in module memory. Call `invalidateApprovedCatalogCache()`
 * to force a fresh fetch (e.g. after admin approves a new model).
 */
export async function fetchApprovedCatalogModels(): Promise<CatalogBrand[]> {
  if (_cache) return _cache;

  // Deduplicate concurrent callers (single in-flight request).
  if (_fetching) return _fetching;

  _fetching = (async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('catalog_approved_models_for_inventory');
      if (error || !Array.isArray(data)) {
        _cache = [];
        return [];
      }
      // RPC returns CatalogBrand[] shape — cast is safe by design.
      _cache = data as CatalogBrand[];
      return _cache;
    } catch {
      _cache = [];
      return [];
    } finally {
      _fetching = null;
    }
  })();

  return _fetching;
}

/**
 * Return cached DB-approved models without triggering a fetch.
 * Returns null if the cache has not been populated yet.
 */
export function getApprovedCatalogModelsCached(): CatalogBrand[] | null {
  return _cache;
}

/**
 * Invalidate the cache so the next `fetchApprovedCatalogModels()` call
 * performs a fresh Supabase RPC fetch.
 */
export function invalidateApprovedCatalogCache(): void {
  _cache = null;
  _fetching = null;
}
