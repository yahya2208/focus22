import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: rpcMock }),
}));

import {
  fetchApprovedCatalogModels,
  getApprovedCatalogModelsCached,
  invalidateApprovedCatalogCache,
} from '../../services/catalog-approved-service';
import { getAllBrands, getBrand, getBrandsList, getVariantsByName } from '../../catalog/loader';

const DB_BRANDS = [
  {
    brand: 'Itel',
    aliases: ['اي تل'],
    models: [
      {
        model: 'A70',
        series: '',
        variants: [{ storage: '128', ram: '4' }],
        modelNumbers: [],
        releaseYear: null,
      },
    ],
  },
  {
    brand: 'ZTE',
    aliases: [],
    models: [
      {
        model: 'Blade A54',
        series: 'Blade',
        variants: [{ storage: '64', ram: '4' }],
        modelNumbers: [],
        releaseYear: null,
      },
    ],
  },
];

beforeEach(() => {
  invalidateApprovedCatalogCache();
  rpcMock.mockReset();
});

describe('catalog-approved-service', () => {
  it('getApprovedCatalogModelsCached returns null before fetch', () => {
    expect(getApprovedCatalogModelsCached()).toBeNull();
  });

  it('fetchApprovedCatalogModels calls the RPC and caches result', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    const result = await fetchApprovedCatalogModels();

    expect(rpcMock).toHaveBeenCalledWith('catalog_approved_models_for_inventory');
    expect(result).toEqual(DB_BRANDS);
    expect(getApprovedCatalogModelsCached()).toEqual(DB_BRANDS);
  });

  it('returns empty array on RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const result = await fetchApprovedCatalogModels();

    expect(result).toEqual([]);
    expect(getApprovedCatalogModelsCached()).toEqual([]);
  });

  it('deduplicates concurrent fetch calls', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    const [a, b] = await Promise.all([
      fetchApprovedCatalogModels(),
      fetchApprovedCatalogModels(),
    ]);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('invalidateApprovedCatalogCache clears cache', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    await fetchApprovedCatalogModels();
    expect(getApprovedCatalogModelsCached()).toEqual(DB_BRANDS);

    invalidateApprovedCatalogCache();
    expect(getApprovedCatalogModelsCached()).toBeNull();
  });
});

describe('loader merge — DB-only brand added', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invalidateApprovedCatalogCache();
  });

  it('getAllBrands includes DB-only brand (Itel) when cache is populated', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    await fetchApprovedCatalogModels();

    const brands = getAllBrands().map((b) => b.brand);
    expect(brands).toContain('Itel');
    expect(brands).toContain('Samsung');
  });

  it('getBrand returns DB-only brand', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    await fetchApprovedCatalogModels();

    const brand = getBrand('Itel');
    expect(brand).toBeDefined();
    expect(brand!.brand).toBe('Itel');
    expect(brand!.models[0]!.model).toBe('A70');
  });

  it('getBrandsList includes DB-only brand', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    await fetchApprovedCatalogModels();

    const list = getBrandsList();
    expect(list).toContain('Itel');
  });

  it('static brand wins on name conflict — DB extras only fill gaps', async () => {
    const conflictBrands = [
      {
        brand: 'Samsung',
        aliases: [],
        models: [
          {
            model: 'Phantom Model',
            series: 'X',
            variants: [{ storage: '999', ram: '99' }],
            modelNumbers: [],
            releaseYear: null,
          },
        ],
      },
    ];
    rpcMock.mockResolvedValue({ data: conflictBrands, error: null });
    await fetchApprovedCatalogModels();

    const samsung = getBrand('Samsung');
    expect(samsung).toBeDefined();
    const hasPhantom = samsung!.models.some((m) => m.model === 'Phantom Model');
    expect(hasPhantom).toBe(false);
  });

  it('getVariantsByName finds DB-only model', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    await fetchApprovedCatalogModels();

    const variants = getVariantsByName('A70', 'Itel');
    expect(variants).toEqual([{ storage: '128', ram: '4' }]);
  });

  it('getVariantsByName falls back to DB when brand is unknown to static catalog', async () => {
    rpcMock.mockResolvedValue({ data: DB_BRANDS, error: null });
    await fetchApprovedCatalogModels();

    const variants = getVariantsByName('Blade A54', 'ZTE');
    expect(variants).toEqual([{ storage: '64', ram: '4' }]);
  });
});
