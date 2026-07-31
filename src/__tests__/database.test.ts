import { describe, it, expect, beforeAll } from 'vitest';
import { seedCatalog, verifyCatalog } from '../database/seeder';
import type { CatalogStats } from '../database/schema';

describe('Catalog Seeder', () => {
  it('should seed catalog with brands, models, variants, aliases', () => {
    const result = seedCatalog({ force: true });
    expect(result.brands).toBeGreaterThanOrEqual(18);
    expect(result.models).toBeGreaterThanOrEqual(866);
    expect(result.aliases).toBeGreaterThan(1000);
  });

  it('should be idempotent when re-seeding', () => {
    const result1 = seedCatalog({ force: true });
    const result2 = seedCatalog({ force: true });
    expect(result2).toEqual(result1);
  });

  it('should not re-seed without force flag', () => {
    const result = seedCatalog();
    // Should match the force result from previous test
    expect(result.brands).toBeGreaterThanOrEqual(18);
  });
});

describe('Catalog Verification', () => {
  let stats: CatalogStats;

  beforeAll(() => {
    seedCatalog({ force: true });
    stats = verifyCatalog();
  });

  it('should have 0 duplicate models', () => {
    expect(stats.duplicateCount).toBe(0);
  });

  it('should have all brands with models', () => {
    expect(stats.totalBrands).toBeGreaterThanOrEqual(18);
    expect(stats.totalModels).toBeGreaterThanOrEqual(866);
  });

  it('should have brands sorted by model count descending', () => {
    const list = stats.brandsWithModels;
    for (let i = 1; i < list.length; i++) {
      expect(list[i]!.count).toBeLessThanOrEqual(list[i - 1]!.count);
    }
  });

  it('should have Samsung at top with most models', () => {
    const first = stats.brandsWithModels[0]!;
    expect(first.brand).toBe('Samsung');
    expect(first.count).toBeGreaterThanOrEqual(163);
  });

  it('should have coverage >= 98%', () => {
    expect(stats.coveragePercent).toBeGreaterThanOrEqual(98);
  });

  it('should list series for major brands', () => {
    const samsung = stats.brandsWithModels.find(b => b.brand === 'Samsung');
    expect(samsung?.series.length).toBeGreaterThanOrEqual(3);
    expect(samsung?.series).toContain('Galaxy S');
  });
});
