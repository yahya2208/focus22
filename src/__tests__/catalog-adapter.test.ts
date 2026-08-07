import { describe, it, expect } from 'vitest';
import { getAllBrands } from '../catalog/loader';
import {
  buildCanonicalCatalog,
  getMigrationReport,
  toCanonicalRam,
  toCanonicalStorage,
  resolveModelId,
  MODEL_ID_OVERRIDES,
  LEGACY_SOURCE,
  MIGRATION_VERIFIER,
  MIGRATION_AT,
} from '../catalog/canonical-adapter';
import {
  validateCanonicalCatalog,
  getVariantByIdentity,
  isValidRam,
  isValidStorage,
  regionKeyOf,
  brandIdFor,
  type CanonicalCatalog,
  type CanonicalVariant,
} from '../catalog/canonical';

function allVariants(catalog: CanonicalCatalog): CanonicalVariant[] {
  return catalog.brands.flatMap(b => b.models.flatMap(m => m.variants));
}

describe('S1 adapter: lossless legacy → canonical', () => {
  it('preserves counts: brands, models, variants (no loss)', () => {
    const { catalog, report } = buildCanonicalCatalog();
    const legacyBrands = getAllBrands();
    const legacyModels = legacyBrands.flatMap(b => b.models);
    const legacyVariants = legacyModels.flatMap(m => m.variants);

    expect(catalog.brands.length).toBe(18);
    expect(catalog.brands.length).toBe(legacyBrands.length);
    expect(catalog.brands.flatMap(b => b.models).length).toBe(legacyModels.length);
    expect(allVariants(catalog).length).toBe(legacyVariants.length);
    expect(report.totalLegacy).toBe(legacyVariants.length);
  });

  it('exactly 866 models and 1,816 variants migrate with zero dropped', () => {
    const { catalog, report } = buildCanonicalCatalog();
    expect(catalog.brands.flatMap(b => b.models).length).toBe(866);
    expect(allVariants(catalog).length).toBe(1816);
    expect(report.totalLegacy).toBe(1816);
    expect(report.migrated).toBe(1816);
    expect(report.dropped).toBe(0);
  });

  it('before/after: 1,806 direct matches + 10 remapped via declared override, zero loss', () => {
    const { report } = buildCanonicalCatalog();
    expect(report.beforeAfterMatches).toBe(1806);
    expect(report.remappedViaOverride).toBe(10);
    expect(report.beforeAfterMatches + report.remappedViaOverride).toBe(report.migrated);
    expect(report.migrated).toBe(report.totalLegacy);
  });

  it('is fully deterministic: two builds produce identical catalog and report', () => {
    const a = buildCanonicalCatalog();
    const b = buildCanonicalCatalog();
    expect(a.catalog).toEqual(b.catalog);
    expect(a.report).toEqual(b.report);
  });

  it('variantIds are globally unique (no accidental merge)', () => {
    const { catalog } = buildCanonicalCatalog();
    const ids = allVariants(catalog).map(v => v.variantId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('region is preserved as empty for every variant (legacy has no region data)', () => {
    const { catalog } = buildCanonicalCatalog();
    for (const v of allVariants(catalog)) {
      expect(regionKeyOf(v.region)).toBe('');
    }
  });
});

describe('S1 adapter: Pro / Pro+ collision resolved via scoped overrides (no silent workaround)', () => {
  it('documents 6 collision exceptions with legacyId → canonicalId and reason', () => {
    const { report } = buildCanonicalCatalog();
    const exceptions = report.exceptions.filter(e => e.kind === 'model-id-override');
    expect(exceptions).toHaveLength(6);
    const allowedIds = [
      'xiaomi-redmi-note-13-pro-plus',
      'xiaomi-redmi-note-14-pro-plus',
      'xiaomi-redmi-note-15-pro-plus',
      'xiaomi-redmi-note-16-pro-plus',
    ];
    for (const e of exceptions) {
      expect(allowedIds).toContain(e.canonicalModelId);
      expect(e.legacyModelId).not.toBe(e.canonicalModelId);
      expect(e.canonicalVariantId).toBeTruthy();
      expect(e.reason).toContain('slug collision');
      expect(e.reason).toContain('scoped override');
    }
  });

  it('documents 4 model overrides covering all 10 affected variants', () => {
    const { report } = buildCanonicalCatalog();
    expect(report.overrides).toHaveLength(4);
    expect(report.overrides.reduce((n, o) => n + o.affectedVariants, 0)).toBe(10);
    const ids = report.overrides.map(o => o.canonicalModelId).sort();
    expect(ids).toEqual([
      'xiaomi-redmi-note-13-pro-plus',
      'xiaomi-redmi-note-14-pro-plus',
      'xiaomi-redmi-note-15-pro-plus',
      'xiaomi-redmi-note-16-pro-plus',
    ]);
  });

  it('override canonical ids are fixed literals, not derived from slugify', () => {
    expect(resolveModelId('xiaomi', 'Redmi Note 13 Pro+')).toBe('xiaomi-redmi-note-13-pro-plus');
    expect(resolveModelId('xiaomi', 'Redmi Note 16 Pro+')).toBe('xiaomi-redmi-note-16-pro-plus');
    expect(resolveModelId('xiaomi', 'Redmi Note 13 Pro')).toBe('xiaomi-redmi-note-13-pro');
    expect(MODEL_ID_OVERRIDES.xiaomi).toMatchObject({
      'Redmi Note 13 Pro+': 'xiaomi-redmi-note-13-pro-plus',
      'Redmi Note 14 Pro+': 'xiaomi-redmi-note-14-pro-plus',
      'Redmi Note 15 Pro+': 'xiaomi-redmi-note-15-pro-plus',
      'Redmi Note 16 Pro+': 'xiaomi-redmi-note-16-pro-plus',
    });
  });

  it('Pro and Pro+ become distinct models with their own variants (no mis-nesting)', () => {
    const { catalog } = buildCanonicalCatalog();
    const xiaomi = catalog.brands.find(b => b.brandId === 'xiaomi')!;
    const pro = xiaomi.models.find(m => m.modelId === 'xiaomi-redmi-note-13-pro')!;
    const plus = xiaomi.models.find(m => m.modelId === 'xiaomi-redmi-note-13-pro-plus')!;
    expect(pro.name).toBe('Redmi Note 13 Pro');
    expect(plus.name).toBe('Redmi Note 13 Pro+');
    expect(pro.variants).toHaveLength(3);
    expect(plus.variants).toHaveLength(3);
    const plusSpecs = plus.variants.map(v => `${v.ram}/${v.storage}`).sort();
    expect(plusSpecs).toEqual(['12GB/256GB', '12GB/512GB', '8GB/256GB']);
    const proSpecs = pro.variants.map(v => `${v.ram}/${v.storage}`).sort();
    expect(proSpecs).toEqual(['12GB/512GB', '8GB/128GB', '8GB/256GB']);
  });

  it('no variant is shared between Pro and Pro+ (distinct variantIds)', () => {
    const { catalog } = buildCanonicalCatalog();
    const xiaomi = catalog.brands.find(b => b.brandId === 'xiaomi')!;
    const proIds = new Set(xiaomi.models.filter(m => m.modelId.endsWith('-pro')).flatMap(m => m.variants.map(v => v.variantId)));
    const plusIds = xiaomi.models.filter(m => m.modelId.endsWith('-pro-plus')).flatMap(m => m.variants.map(v => v.variantId));
    for (const id of plusIds) {
      expect(proIds.has(id)).toBe(false);
    }
  });

  it('regression guard: no two distinct (brand, model) pairs derive to the same canonical modelId', () => {
    const owner = new Map<string, string>();
    let collisions = 0;
    for (const brand of getAllBrands()) {
      for (const model of brand.models) {
        const id = resolveModelId(brandIdFor(brand.brand), model.model);
        const key = `${brand.brand}|${model.model}`;
        const prior = owner.get(id);
        if (prior && prior !== key) {
          collisions++;
          throw new Error(`model identity collision: "${prior}" and "${key}" both map to ${id}; add an entry to MODEL_ID_OVERRIDES`);
        }
        owner.set(id, key);
      }
    }
    expect(collisions).toBe(0);
  });
});

describe('S1 adapter: provenance discipline (no auto-promotion to verified)', () => {
  it('every variant is unverified-imported and carries full provenance', () => {
    const { catalog } = buildCanonicalCatalog();
    for (const v of allVariants(catalog)) {
      expect(v.status).toBe('unverified');
      expect(v.provenance.length).toBeGreaterThan(0);
      for (const p of v.provenance) {
        expect(p.status).toBe('unverified');
        expect(p.source).toBe(LEGACY_SOURCE);
        expect(p.verifiedBy).toBe(MIGRATION_VERIFIER);
        expect(p.verifiedAt).toBe(MIGRATION_AT);
      }
    }
  });

  it('no variant was promoted to verified or official', () => {
    const { catalog } = buildCanonicalCatalog();
    const promoted = allVariants(catalog).filter(v => v.status === 'verified' || v.status === 'official');
    expect(promoted).toHaveLength(0);
  });

  it('catalog integrity holds: the ONLY expected violation is models lacking verified variants', () => {
    const { catalog } = buildCanonicalCatalog();
    const violations = validateCanonicalCatalog(catalog);
    const codes = violations.map(v => v.code);
    for (const forbidden of ['cross-brand-variant', 'orphan-variant', 'duplicate-variant', 'variant-without-provenance', 'invalid-provenance', 'invalid-ram', 'invalid-storage']) {
      expect(codes).not.toContain(forbidden);
    }
    expect(violations.length).toBe(866);
    expect(codes.every(c => c === 'model-without-valid-variants')).toBe(true);
  });
});

describe('S1 adapter: Samsung A16 case preserved exactly (no new variants invented)', () => {
  it('Galaxy A16 keeps exactly 6/128 and 8/256; 4/128 is absent', () => {
    const { catalog } = buildCanonicalCatalog();
    const a16 = getVariantByIdentity(catalog, 'samsung', 'samsung-galaxy-a16', '6GB', '128GB');
    const a16_256 = getVariantByIdentity(catalog, 'samsung', 'samsung-galaxy-a16', '8GB', '256GB');
    const a16_4128 = getVariantByIdentity(catalog, 'samsung', 'samsung-galaxy-a16', '4GB', '128GB');
    expect(a16).toBeDefined();
    expect(a16_256).toBeDefined();
    expect(a16_4128).toBeUndefined();
  });
});

describe('S1 adapter: no cross-brand mixing (Honor X50 vs Vivo X50)', () => {
  it('Honor and Vivo X50 keep distinct identities', () => {
    const { catalog } = buildCanonicalCatalog();
    const honor = getVariantByIdentity(catalog, 'honor', 'honor-x50', '12GB', '512GB');
    const vivo = getVariantByIdentity(catalog, 'vivo', 'vivo-x50', '12GB', '512GB');
    expect(honor).toBeDefined();
    expect(vivo).toBeUndefined();
  });
});

describe('S1 adapter: deterministic converters never guess', () => {
  it('maps legacy values to canonical format', () => {
    expect(toCanonicalRam('0.25')).toBe('0.25GB');
    expect(toCanonicalRam('0.5')).toBe('0.5GB');
    expect(toCanonicalRam('6')).toBe('6GB');
    expect(toCanonicalRam('4GB')).toBe('4GB');
    expect(toCanonicalStorage('128')).toBe('128GB');
    expect(toCanonicalStorage('1000')).toBe('1TB');
    expect(toCanonicalStorage('2TB')).toBe('2TB');
  });

  it('unmappable values surface as migration exceptions, never guessed', () => {
    const badRam = toCanonicalRam('abc');
    const badStorage = toCanonicalStorage('xyz');
    expect(isValidRam(badRam)).toBe(false);
    expect(isValidStorage(badStorage)).toBe(false);
    expect(badRam).toBe('abc');
    expect(badStorage).toBe('xyz');
  });

  it('current dataset is fully mappable: zero dropped, migration exceptions are only the 6 documented Pro+ collisions', () => {
    const report = getMigrationReport();
    expect(report.dropped).toBe(0);
    expect(report.migrated).toBe(report.totalLegacy);
    const kinds = new Set(report.exceptions.map(e => e.kind));
    expect(kinds).toEqual(new Set(['model-id-override']));
  });
});
