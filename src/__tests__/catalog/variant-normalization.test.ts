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

  it('every offered variant across all catalog models round-trips', () => {
    for (const brand of getAllBrands()) {
      for (const model of brand.models) {
        for (const v of getVariantsForModel(model.model, brand.brand)) {
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

  it('heuristic variants are offered ONLY for models with no real variants; never fabricated for the original 866', () => {
    let heuristicOnly = 0;
    let realBearing = 0;
    let aliasInherited = 0; // seeded models that resolve to an existing device's real variants
    for (const brand of getAllBrands()) {
      for (const model of brand.models) {
        const real = getRealVariantsForModel(model.model, brand.brand);
        const offered = getVariantsForModel(model.model, brand.brand).map(v => v.label);
        if (real.length === 0) {
          heuristicOnly++;
          // The JSON itself never fabricates variants...
          expect(model.variants.length).toBe(0);
          // ...but the display-only fallback still supplies selectable variants.
          expect(offered.length).toBeGreaterThan(0);
          continue;
        }
        realBearing++;
        // The 12 seeded "+" models carry variants: [] in JSON (DB truth) yet
        // resolve to their base device's real variants by normalized-name lookup.
        if (model.variants.length === 0) aliasInherited++;
        const realLabels = new Set(real.map(v => v.label));
        for (const label of offered) {
          expect(realLabels.has(label), `${brand.brand} ${model.model} -> ${label}`).toBe(true);
        }
      }
    }
    expect(heuristicOnly).toBe(1300); // 1312 seeded − 12 inherited-from-base
    expect(realBearing).toBe(878);    // 866 original + 12 alias
    expect(aliasInherited).toBe(12);
  });

  it('variant coverage: 878 full (866 original + 12 base-aliased seeded); 1,300 heuristic-only (no DB variants, display-only)', () => {
    const stats = getCoverageStats();
    expect(stats.totalModels).toBe(2178);
    expect(stats.fullCoverage).toBe(878);
    expect(stats.partialCoverage).toBe(0);
    expect(stats.noCoverage).toBe(1300);
    expect(stats.averageCoverage).toBe(0.4031);

    const reports = verifyAllModels();
    const withReal = reports.filter(r => getRealVariantsForModel(r.model, r.brand).length > 0);
    const heuristicOnly = reports.filter(r => getRealVariantsForModel(r.model, r.brand).length === 0);
    expect(withReal.length).toBe(878);
    expect(heuristicOnly.length).toBe(1300);

    for (const r of withReal) {
      expect(r.missing).toEqual([]);
      expect(r.extra).toEqual([]);
    }
    for (const r of heuristicOnly) {
      // no real variants invented, heuristic (display-only) expected labels present
      expect(r.actualVariants).toEqual([]);
      expect(r.expectedVariants.length).toBeGreaterThan(0);
    }
  });
});
