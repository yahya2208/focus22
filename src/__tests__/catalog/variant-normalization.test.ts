import { describe, it, expect } from 'vitest';
import {
  PHONE_VARIANTS,
  parseVariant,
  formatVariant,
  getVariantsForModel,
  getRealVariantsForModel,
} from '../../data/phone-variants';
import { getAllBrands } from '../../catalog/loader';
import { verifyAllModels, getCoverageStats } from '../../services/variant-verification';

describe('P2-C C-1 variant normalization', () => {
  it('formatVariant emits canonical TB label (X/T)', () => {
    expect(formatVariant('12GB', '1TB')).toBe('12/1T');
    expect(formatVariant('16GB', '2TB')).toBe('16/2T');
    expect(formatVariant('8GB', '256GB')).toBe('8/256');
    expect(formatVariant('0.25GB', '4GB')).toBe('0.25/4');
  });

  it('parseVariant is backward compatible: X/TB === X/T', () => {
    expect(parseVariant('12/1TB')).toEqual(parseVariant('12/1T'));
    expect(parseVariant('12/1T')).toEqual({ ram: '12GB', storage: '1TB' });
    expect(parseVariant('8/256')).toEqual({ ram: '8GB', storage: '256GB' });
    expect(parseVariant('0.25/4')).toEqual({ ram: '0.25GB', storage: '4GB' });
    expect(parseVariant('not-a-variant')).toBeNull();
  });

  it('round-trip is 100% over the entire PHONE_VARIANTS universe', () => {
    for (const v of PHONE_VARIANTS) {
      const parsed = parseVariant(v.label);
      expect(parsed, `parse ${v.label}`).not.toBeNull();
      expect(formatVariant(parsed!.ram, parsed!.storage), `reformat ${v.label}`).toBe(v.label);
      const back = parseVariant(formatVariant(v.ram, v.storage));
      expect(back, `fmt ${v.label}`).not.toBeNull();
      expect(back).toEqual({ ram: v.ram, storage: v.storage });
    }
  });

  it('every offered variant across all 866 models round-trips', () => {
    for (const brand of getAllBrands()) {
      for (const model of brand.models) {
        for (const v of getVariantsForModel(model.model)) {
          const parsed = parseVariant(v.label);
          expect(parsed, `${brand.brand} ${model.model} ${v.label}`).not.toBeNull();
          expect(formatVariant(parsed!.ram, parsed!.storage)).toBe(v.label);
        }
      }
    }
  });

  it('getVariantsForModel returns the real JSON variants (iPhone 3G, Galaxy A10)', () => {
    const iphone3g = getRealVariantsForModel('iPhone 3G').map(v => v.label);
    expect(iphone3g).toContain('0.25/8');
    expect(iphone3g).toContain('0.25/16');
    const a10 = getRealVariantsForModel('Galaxy A10').map(v => v.label);
    expect(a10.length).toBeGreaterThan(0);
  });

  it('no offered variant leaks outside the real JSON set (heuristic unused today)', () => {
    for (const brand of getAllBrands()) {
      for (const model of brand.models) {
        const realLabels = new Set(getRealVariantsForModel(model.model).map(v => v.label));
        const offered = getVariantsForModel(model.model).map(v => v.label);
        for (const label of offered) {
          expect(realLabels.has(label), `${brand.brand} ${model.model} -> ${label}`).toBe(true);
        }
      }
    }
  });

  it('variant coverage is 100% after C-1', () => {
    const stats = getCoverageStats();
    expect(stats.totalModels).toBe(866);
    expect(stats.fullCoverage).toBe(866);
    expect(stats.partialCoverage).toBe(0);
    expect(stats.noCoverage).toBe(0);
    expect(stats.averageCoverage).toBe(1);
    for (const r of verifyAllModels()) {
      expect(r.missing).toEqual([]);
      expect(r.extra).toEqual([]);
    }
  });
});
