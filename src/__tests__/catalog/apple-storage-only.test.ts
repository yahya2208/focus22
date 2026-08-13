import { describe, it, expect } from 'vitest';
import {
  getAppleStorageOnlyVariants,
  getDisplayVariants,
  getRealVariantsForModel,
  getVariantsForModel,
  isAppleBrand,
} from '../../data/phone-variants';
import { getAllBrands } from '../../catalog/loader';
import { resolveVariantParams } from '../../services/inventory-central-service';

/**
 * Apple iPhone/iPad storage-only projection + storage-only variant resolution.
 *
 * Rules under test:
 *   - The projection is built ONLY from the model's real variants (apple.json).
 *   - Storage is extracted → normalized → deduplicated → sorted. No fabrication.
 *   - Models without real variants (iPhone SE (2016)) → [] (empty state kept).
 *   - getVariantsForModel (the truth accessor) is NOT modified by this layer.
 *   - resolveVariantParams('128GB') → ram:null, storage:'128GB' (never '128GBGB').
 */

describe('Apple storage-only projection (display layer only)', () => {
  it('brand gate: only Apple brands get the projection', () => {
    expect(isAppleBrand('apple')).toBe(true);
    expect(isAppleBrand('Apple')).toBe(true);
    expect(isAppleBrand('samsung')).toBe(false);
    expect(isAppleBrand(undefined)).toBe(false);
    expect(getAppleStorageOnlyVariants('iPhone 13', 'samsung')).toEqual([]);
    expect(getAppleStorageOnlyVariants('iPhone 13', undefined)).toEqual([]);
  });

  it('D) iPhone 13: source 4/128,4/256,4/512 → UI 128GB,256GB,512GB', () => {
    const source = getRealVariantsForModel('iPhone 13', 'apple').map(v => v.label);
    expect(source).toEqual(['4/128', '4/256', '4/512']);

    const projected = getAppleStorageOnlyVariants('iPhone 13', 'apple').map(v => v.label);
    expect(projected).toEqual(['128GB', '256GB', '512GB']);
  });

  it('iPhone 15: source 6/128,6/256,6/512 → UI 128GB,256GB,512GB (no RAM shown)', () => {
    const projected = getAppleStorageOnlyVariants('iPhone 15', 'apple').map(v => v.label);
    expect(projected).toEqual(['128GB', '256GB', '512GB']);
  });

  it('iPhone 15 Pro: 8/1000 → 1TB is derived from the source value (unit conversion, not fabrication)', () => {
    const projected = getAppleStorageOnlyVariants('iPhone 15 Pro', 'apple').map(v => v.label);
    expect(projected).toEqual(['128GB', '256GB', '512GB', '1TB']);
  });

  it('iPhone 15 Pro Max: only the storages that exist in source', () => {
    const projected = getAppleStorageOnlyVariants('iPhone 15 Pro Max', 'apple').map(v => v.label);
    expect(projected).toEqual(['256GB', '512GB', '1TB']);
    expect(projected).not.toContain('128GB');
  });

  it('F) iPhone SE (2016) has NO real variants → [] and never 4/64/8/128', () => {
    expect(getAppleStorageOnlyVariants('iPhone SE (2016)', 'apple')).toEqual([]);
    expect(getDisplayVariants('iPhone SE (2016)', 'apple')).toEqual([]);
    expect(getAppleStorageOnlyVariants('iPhone SE (2016)', 'apple').map(v => v.label)).not.toContain('4/64');
    expect(getAppleStorageOnlyVariants('iPhone SE (2016)', 'apple').map(v => v.label)).not.toContain('8/128');
  });

  it('E) dedup: projected storage is always unique per model — never duplicated', () => {
    for (const model of getAllBrands().find(b => b.brand === 'Apple')!.models) {
      const projected = getAppleStorageOnlyVariants(model.model, 'apple');
      const storages = projected.map(v => v.storage);
      expect(new Set(storages).size, `${model.model} duplicates`).toBe(storages.length);
      expect(projected.length, `${model.model} inflates`).toBeLessThanOrEqual(
        getRealVariantsForModel(model.model, 'apple').length,
      );
    }
  });

  it('projection never produces a storage absent from the model source', () => {
    for (const model of getAllBrands().find(b => b.brand === 'Apple')!.models) {
      const sourceStorages = new Set(getRealVariantsForModel(model.model, 'apple').map(v => v.storage));
      for (const v of getAppleStorageOnlyVariants(model.model, 'apple')) {
        expect(sourceStorages.has(v.storage), `${model.model} -> ${v.storage}`).toBe(true);
      }
    }
  });

  it('getVariantsForModel (truth accessor) is untouched: iPhone 13 keeps real RAM/Storage labels', () => {
    expect(getVariantsForModel('iPhone 13', 'apple').map(v => v.label)).toEqual(['4/128', '4/256', '4/512']);
    expect(getVariantsForModel('iPhone SE (2016)', 'apple')).toEqual([]);
  });
});

describe('resolveVariantParams storage-only labels', () => {
  it('A) resolveVariantParams("128GB") → ram:null, storage:"128GB"', () => {
    expect(resolveVariantParams('128GB')).toEqual({ variantLabel: '128GB', ram: null, storage: '128GB' });
  });

  it('B) resolveVariantParams("256GB") → ram:null, storage:"256GB"', () => {
    expect(resolveVariantParams('256GB')).toEqual({ variantLabel: '256GB', ram: null, storage: '256GB' });
  });

  it('C) resolveVariantParams("4/128") keeps the real RAM/Storage mapping', () => {
    expect(resolveVariantParams('4/128')).toEqual({ variantLabel: '4/128', ram: '4GB', storage: '128GB' });
  });

  it('1TB storage-only resolves to ram:null (not mangled)', () => {
    expect(resolveVariantParams('1TB')).toEqual({ variantLabel: '1TB', ram: null, storage: '1TB' });
  });

  it('empty/no-variant still maps to the schema native empty + real NULL ram', () => {
    expect(resolveVariantParams('')).toEqual({ variantLabel: '', ram: null, storage: '' });
  });

  it('never produces the mangled "128GBGB" ram', () => {
    const r = resolveVariantParams('128GB');
    expect(r.ram).toBeNull();
    expect(r.ram).not.toBe('128GBGB');
  });
});
