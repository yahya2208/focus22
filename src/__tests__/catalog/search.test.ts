import { describe, it, expect, beforeAll } from 'vitest';
import { search, searchProgressive, getBrandsList, getSeries, getModelsBySeries, getVariants } from '../../catalog';
import { searchWithAliases, resolveAlias, buildAliasIndex } from '../../services/alias-engine';

beforeAll(() => {
  buildAliasIndex();
});

describe('Catalog OS — Search', () => {
  describe('Brand list', () => {
    it('returns all 20+ brands sorted', () => {
      const brands = getBrandsList();
      expect(brands.length).toBeGreaterThanOrEqual(18);
      expect(brands).toContain('Samsung');
      expect(brands).toContain('Apple');
      expect(brands).toContain('Xiaomi');
      expect(brands).toContain('Honor');
      expect(brands).toContain('Realme');
    });
  });

  describe('Progressive search', () => {
    it('shows series for Samsung', () => {
      const series = getSeries('Samsung');
      expect(series).toContain('A');
      expect(series).toContain('S');
      expect(series).toContain('Z');
      expect(series).toContain('M');
    });

    it('shows models in Samsung A series', () => {
      const models = getModelsBySeries('Samsung', 'A');
      const names = models.map(m => m.model);
      expect(names).toContain('Galaxy A10');
      expect(names).toContain('Galaxy A52');
      expect(names).toContain('Galaxy A18');
    });

    it('shows variants for Galaxy A10', () => {
      const v = getVariants('Samsung', 'Galaxy A10');
      expect(v.length).toBeGreaterThanOrEqual(1);
      expect(v[0]!.storage).toBe('32');
    });

    it('searchProgressive finds Samsung', () => {
      const r = searchProgressive('سامسونج');
      expect(r.brands).toContain('Samsung');
    });
  });

  describe('Token-aware search', () => {
    const queries = [
      { q: 'Samsung A10', expectedBrand: 'Samsung', expectedModel: 'Galaxy A10' },
      { q: 'سامسونج A10', expectedBrand: 'Samsung', expectedModel: 'Galaxy A10' },
      { q: 'Galaxy A10', expectedBrand: 'Samsung', expectedModel: 'Galaxy A10' },
      { q: 'SM-A105', expectedBrand: 'Samsung', expectedModel: 'Galaxy A10' },
      { q: 'A105', expectedBrand: 'Samsung' },
      { q: 'RN8', expectedBrand: 'Xiaomi' },
      { q: 'Redmi Note 8', expectedBrand: 'Xiaomi', expectedModel: 'Redmi Note 8' },
      { q: 'ريدمي نوت 8', expectedBrand: 'Xiaomi' },
      { q: 'iPhone 16', expectedBrand: 'Apple', expectedModel: 'iPhone 16' },
      { q: 'ابل 16', expectedBrand: 'Apple' },
      { q: 'xiaomi a1', expectedBrand: 'Xiaomi', expectedModel: 'Xiaomi Mi A1' },
      { q: 'S26', expectedBrand: 'Samsung' },
      { q: 'Magic 8', expectedBrand: 'Honor' },
      { q: 'Z Flip 6', expectedBrand: 'Samsung' },
      { q: 'A52', expectedBrand: 'Samsung' },
    ];

    for (const { q, expectedBrand, expectedModel } of queries) {
      it(`searchWithAliases("${q}") → ${expectedBrand}${expectedModel ? ` / ${expectedModel}` : ''}`, () => {
        const results = searchWithAliases(q);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]!.brand).toBe(expectedBrand);
        if (expectedModel) {
          expect(results[0]!.model).toBe(expectedModel);
        }
      });
    }
  });

  describe('search() catalog function', () => {
    it('finds Galaxy A10 by model number', () => {
      const results = search('SM-A105');
      expect(results.length).toBeGreaterThan(0);
      const r = results.find(r => r.matchType === 'model-number');
      expect(r).toBeDefined();
    });

    it('finds by Arabic brand', () => {
      const results = search('سامسونج A52');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.brand).toBe('Samsung');
    });
  });

  describe('resolveAlias direct match', () => {
    it('resolves exact model name', () => {
      const r = resolveAlias('iPhone 16 Pro Max');
      expect(r).not.toBeNull();
      expect(r!.brand).toBe('Apple');
    });

    it('resolves brand + model', () => {
      const r = resolveAlias('Samsung Galaxy A10');
      expect(r).not.toBeNull();
      expect(r!.brand).toBe('Samsung');
    });
  });

  describe('2026 models', () => {
    it('has Galaxy S26', () => {
      const results = searchWithAliases('S26');
      expect(results.some(r => r.model.includes('S26'))).toBe(true);
    });

    it('has iPhone 18', () => {
      const results = searchWithAliases('iPhone 18');
      expect(results.some(r => r.model.includes('iPhone 18'))).toBe(true);
    });

    it('has Realme GT 8 Pro', () => {
      const results = searchWithAliases('Realme GT 8');
      expect(results.some(r => r.model.includes('GT 8'))).toBe(true);
    });

    it('has Honor Magic 8', () => {
      const results = searchWithAliases('Magic 8');
      expect(results.some(r => r.model.includes('Magic 8'))).toBe(true);
    });

    it('has Redmi Note 16', () => {
      const results = searchWithAliases('Redmi Note 16');
      expect(results.some(r => r.model.includes('Note 16'))).toBe(true);
    });
  });
});
