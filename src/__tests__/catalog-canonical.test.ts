import { describe, it, expect } from 'vitest';
import {
  createVariant,
  classifyConflicts,
  resolveVariantSelection,
  isModelSelectable,
  validateCanonicalCatalog,
  getVariantsForModelByIdentity,
  getVariantByIdentity,
  variantIdFor,
  slugify,
  brandIdFor,
  modelIdFor,
  type CanonicalCatalog,
  type Provenance,
  type CanonicalVariant,
} from '../catalog/canonical';

function prov(source: string, status: Provenance['status'], verifiedBy = 'catalog-test'): Provenance {
  return { source, status, verifiedAt: '2026-08-07', verifiedBy, url: `https://${source}` };
}

function variant(ram: string, storage: string, provenance: Provenance[], region: string[], modelCode?: string): CanonicalVariant {
  const brandId = 'b';
  const modelId = 'm';
  return createVariant({ brandId, modelId, ram, storage, region, provenance, modelCode });
}

describe('identity: stable + region-aware', () => {
  it('variantId is deterministic for identical identity', () => {
    const a = variantIdFor('samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['DZ']);
    const b = variantIdFor('samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['DZ']);
    expect(a).toBe(b);
  });

  it('variantId changes with region (region is part of identity)', () => {
    const dz = variantIdFor('samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['DZ']);
    const ma = variantIdFor('samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['MA']);
    expect(dz).not.toBe(ma);
  });

  it('same ram/storage in two regions are distinct variants (never merged)', () => {
    const dz = createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '4GB', storage: '128GB', modelCode: 'SM-A165F/DS', region: ['DZ'], provenance: [prov('samsung.com', 'official')] });
    const ma = createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '4GB', storage: '128GB', modelCode: 'SM-A165F', region: ['MA'], provenance: [prov('samsung.com', 'official')] });
    expect(dz.variantId).not.toBe(ma.variantId);
  });

  it('slug/ids are stable helpers', () => {
    expect(brandIdFor('Samsung')).toBe('samsung');
    expect(modelIdFor('samsung', 'Galaxy A16')).toBe('samsung-galaxy-a16');
    expect(slugify('X50')).toBe('x50');
  });
});

describe('cross-brand impossibility (Vivo X50 must never show Honor X50 variants)', () => {
  const catalog: CanonicalCatalog = {
    version: 'test',
    brands: [
      {
        brandId: 'honor', name: 'Honor', aliases: [],
        models: [{
          modelId: 'honor-x50', brandId: 'honor', name: 'X50', modelNumbers: ['ALI-AN00'],
          variants: [
            createVariant({ brandId: 'honor', modelId: 'honor-x50', ram: '8GB', storage: '128GB', region: ['DZ'], provenance: [prov('honor.com', 'official')] }),
            createVariant({ brandId: 'honor', modelId: 'honor-x50', ram: '8GB', storage: '256GB', region: ['DZ'], provenance: [prov('honor.com', 'official')] }),
            createVariant({ brandId: 'honor', modelId: 'honor-x50', ram: '12GB', storage: '512GB', region: ['DZ'], provenance: [prov('honor.com', 'official')] }),
          ],
        }],
      },
      {
        brandId: 'vivo', name: 'Vivo', aliases: [],
        models: [{
          modelId: 'vivo-x50', brandId: 'vivo', name: 'X50', modelNumbers: ['V2006'],
          variants: [
            createVariant({ brandId: 'vivo', modelId: 'vivo-x50', ram: '8GB', storage: '128GB', region: ['DZ'], provenance: [prov('vivo.com', 'official')] }),
            createVariant({ brandId: 'vivo', modelId: 'vivo-x50', ram: '12GB', storage: '256GB', region: ['DZ'], provenance: [prov('vivo.com', 'official')] }),
          ],
        }],
      },
    ],
  };

  it('vivo variant lookup returns only vivo specs', () => {
    const labels = getVariantsForModelByIdentity(catalog, 'vivo', 'vivo-x50').map(v => `${v.ram}/${v.storage}`);
    expect(labels).toContain('12GB/256GB');
    expect(labels).not.toContain('12GB/512GB');
    expect(labels).not.toContain('8GB/256GB');
  });

  it('honor 12/512 is unreachable through vivo identity', () => {
    expect(getVariantByIdentity(catalog, 'vivo', 'vivo-x50', '12GB', '512GB', ['DZ'])).toBeUndefined();
    expect(getVariantByIdentity(catalog, 'honor', 'honor-x50', '12GB', '512GB', ['DZ'])).toBeDefined();
    expect(resolveVariantSelection(catalog, 'vivo', 'vivo-x50', '12GB', '512GB', ['DZ']).outcome).toBe('variant-not-found');
  });

  it('catalog passes cross-brand integrity validation', () => {
    expect(validateCanonicalCatalog(catalog)).toHaveLength(0);
  });
});

describe('no forced variant (Samsung A16 4/128 must never become 6/128)', () => {
  const a16: CanonicalCatalog = {
    version: 'test',
    brands: [{
      brandId: 'samsung', name: 'Samsung', aliases: [],
      models: [{
        modelId: 'samsung-galaxy-a16', brandId: 'samsung', name: 'Galaxy A16', modelNumbers: ['SM-A165F'],
        variants: [
          createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '6GB', storage: '128GB', modelCode: 'SM-A165F', region: ['DZ'], provenance: [prov('samsung.com', 'official'), prov('gsmarena.com', 'verified')] }),
          createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '8GB', storage: '256GB', modelCode: 'SM-A165F', region: ['DZ'], provenance: [prov('samsung.com', 'official')] }),
        ],
      }],
    }],
  };

  it('requesting 4/128 returns variant-not-found, never a different variant', () => {
    const result = resolveVariantSelection(a16, 'samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['DZ']);
    expect(result.outcome).toBe('variant-not-found');
    if (result.outcome === 'matched') {
      expect(result.variant.ram).toBe('4GB');
      expect(result.variant.storage).toBe('128GB');
    }
  });

  it('documented 4/128 becomes selectable only after it is proven by discovery/verification', () => {
    const with4128: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'samsung', name: 'Samsung', aliases: [],
        models: [{
          modelId: 'samsung-galaxy-a16', brandId: 'samsung', name: 'Galaxy A16', modelNumbers: ['SM-A165F'],
          variants: [
            ...a16.brands[0]!.models[0]!.variants,
            createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '4GB', storage: '128GB', modelCode: 'SM-A165F', region: ['DZ'], provenance: [prov('samsung.com', 'official'), prov('distributor-dz', 'unverified')] }),
          ],
        }],
      }],
    };
    const result = resolveVariantSelection(with4128, 'samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['DZ']);
    expect(result.outcome).toBe('matched');
    if (result.outcome === 'matched') {
      expect(result.variant.ram).toBe('4GB');
      expect(result.variant.storage).toBe('128GB');
    }
  });
});

describe('no model without valid variants', () => {
  it('a model with zero variants is invalid and not selectable', () => {
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{ brandId: 'x', name: 'X', aliases: [], models: [{ modelId: 'x-empty', brandId: 'x', name: 'Empty', modelNumbers: [], variants: [] }] }],
    };
    expect(isModelSelectable(catalog, 'x', 'x-empty')).toBe(false);
    const codes = validateCanonicalCatalog(catalog).map(v => v.code);
    expect(codes).toContain('model-without-variants');
  });

  it('a model whose variants are all unverified is invalid and not selectable', () => {
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'x', name: 'X', aliases: [],
        models: [{
          modelId: 'x-doubtful', brandId: 'x', name: 'Doubtful', modelNumbers: [],
          variants: [variant('4GB', '128GB', [prov('forum', 'unverified')], ['DZ'])],
        }],
      }],
    };
    expect(isModelSelectable(catalog, 'x', 'x-doubtful')).toBe(false);
    const codes = validateCanonicalCatalog(catalog).map(v => v.code);
    expect(codes).toContain('model-without-valid-variants');
  });
});

describe('no variant without provenance', () => {
  it('createVariant rejects a variant with no provenance', () => {
    expect(() => variant('4GB', '128GB', [], ['DZ'])).toThrow();
  });

  it('a catalog containing a variant with empty provenance is flagged', () => {
    const bad = createVariant({ brandId: 'x', modelId: 'x-m', ram: '4GB', storage: '128GB', region: ['DZ'], provenance: [prov('samsung.com', 'official')] });
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'x', name: 'X', aliases: [],
        models: [{ modelId: 'x-m', brandId: 'x', name: 'M', modelNumbers: [], variants: [{ ...bad, provenance: [] }] }],
      }],
    };
    const codes = validateCanonicalCatalog(catalog).map(v => v.code);
    expect(codes).toContain('variant-without-provenance');
  });

  it('incomplete provenance (missing verifier) is flagged', () => {
    const bad = createVariant({ brandId: 'x', modelId: 'x-m', ram: '4GB', storage: '128GB', region: ['DZ'], provenance: [prov('samsung.com', 'official')] });
    const incomplete: Provenance = { source: 'samsung.com', status: 'official', verifiedAt: '2026-08-07', verifiedBy: 'catalog-test' };
    delete (incomplete as Partial<Provenance>).verifiedBy;
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'x', name: 'X', aliases: [],
        models: [{ modelId: 'x-m', brandId: 'x', name: 'M', modelNumbers: [], variants: [{ ...bad, provenance: [incomplete] }] }],
      }],
    };
    const codes = validateCanonicalCatalog(catalog).map(v => v.code);
    expect(codes).toContain('invalid-provenance');
  });
});

describe('source conflict rule (no auto-choice)', () => {
  it('official=4/128 + local=4/128 vs gsmarena=6/128 → conflict-review for both specs', () => {
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'samsung', name: 'Samsung', aliases: [],
        models: [{
          modelId: 'samsung-galaxy-a16', brandId: 'samsung', name: 'Galaxy A16', modelNumbers: ['SM-A165F'],
          variants: [
            createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '4GB', storage: '128GB', region: ['DZ'], provenance: [prov('samsung.com', 'official'), prov('distributor-dz', 'unverified')] }),
            createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-a16', ram: '6GB', storage: '128GB', region: ['DZ'], provenance: [prov('gsmarena.com', 'verified')] }),
          ],
        }],
      }],
    };
    const conflicts = classifyConflicts(catalog);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.state).toBe('review');
    expect(conflicts[0]!.candidates.map(c => `${c.ram}/${c.storage}`).sort()).toEqual(['4GB/128GB', '6GB/128GB']);

    expect(resolveVariantSelection(catalog, 'samsung', 'samsung-galaxy-a16', '4GB', '128GB', ['DZ']).outcome).toBe('conflict-review');
    expect(resolveVariantSelection(catalog, 'samsung', 'samsung-galaxy-a16', '6GB', '128GB', ['DZ']).outcome).toBe('conflict-review');
  });

  it('a multi-variant model fully listed by one official source is coherent (no conflict)', () => {
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'samsung', name: 'Samsung', aliases: [],
        models: [{
          modelId: 'samsung-galaxy-s25', brandId: 'samsung', name: 'Galaxy S25', modelNumbers: ['SM-S931B'],
          variants: [
            createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-s25', ram: '12GB', storage: '128GB', region: ['DZ'], provenance: [prov('samsung.com', 'official'), prov('gsmarena.com', 'verified')] }),
            createVariant({ brandId: 'samsung', modelId: 'samsung-galaxy-s25', ram: '12GB', storage: '256GB', region: ['DZ'], provenance: [prov('samsung.com', 'official'), prov('gsmarena.com', 'verified')] }),
          ],
        }],
      }],
    };
    expect(classifyConflicts(catalog)).toHaveLength(0);
    const result = resolveVariantSelection(catalog, 'samsung', 'samsung-galaxy-s25', '12GB', '256GB', ['DZ']);
    expect(result.outcome).toBe('matched');
  });
});

describe('catalog integrity validation', () => {
  it('duplicate variant identity is flagged', () => {
    const v = variant('4GB', '128GB', [prov('samsung.com', 'official')], ['DZ']);
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{ brandId: 'x', name: 'X', aliases: [], models: [{ modelId: 'x-m', brandId: 'x', name: 'M', modelNumbers: [], variants: [v, { ...v }] }] }],
    };
    const codes = validateCanonicalCatalog(catalog).map(x => x.code);
    expect(codes).toContain('duplicate-variant');
  });

  it('invalid ram is flagged', () => {
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'x', name: 'X', aliases: [],
        models: [{ modelId: 'x-m', brandId: 'x', name: 'M', modelNumbers: [], variants: [{ ...variant('4GB', '128GB', [prov('samsung.com', 'official')], ['DZ']), ram: '5GB' }] }],
      }],
    };
    const codes = validateCanonicalCatalog(catalog).map(x => x.code);
    expect(codes).toContain('invalid-ram');
  });

  it('orphan variant (mismatched modelId) is flagged', () => {
    const bad = createVariant({ brandId: 'x', modelId: 'other-model', ram: '4GB', storage: '128GB', region: ['DZ'], provenance: [prov('samsung.com', 'official')] });
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'x', name: 'X', aliases: [],
        models: [{ modelId: 'x-m', brandId: 'x', name: 'M', modelNumbers: [], variants: [bad] }],
      }],
    };
    const codes = validateCanonicalCatalog(catalog).map(x => x.code);
    expect(codes).toContain('orphan-variant');
  });

  it('model nested under the wrong brand is flagged', () => {
    const catalog: CanonicalCatalog = {
      version: 'test',
      brands: [{
        brandId: 'vivo', name: 'Vivo', aliases: [],
        models: [{
          modelId: 'honor-x50', brandId: 'honor', name: 'X50', modelNumbers: [],
          variants: [createVariant({ brandId: 'honor', modelId: 'honor-x50', ram: '8GB', storage: '128GB', region: ['DZ'], provenance: [prov('honor.com', 'official')] })],
        }],
      }],
    };
    const codes = validateCanonicalCatalog(catalog).map(x => x.code);
    expect(codes).toContain('cross-brand-variant');
  });
});
