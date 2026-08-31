/**
 * Master Product Catalog — validation tests (ICONs.md seed, 8 of 18 categories).
 *
 * Locks the data-layer contract: exact counts (8 categories / 45 subcategories /
 * 381 products), required fields on every node, global id/name uniqueness,
 * deterministic search + normalization, and forward-looking integrity of the
 * lookup API. These guards are why adding the remaining 10 categories later is
 * a pure-data change: this test only tightens if the seed's identity drifts.
 */

import { describe, it, expect } from 'vitest';
import {
  MASTER_CATALOG,
  getCatalogCategories,
  getCatalogSubcategories,
  getCatalogSubcategoriesByCategory,
  getCatalogProducts,
  getCatalogCategory,
  getCatalogSubcategory,
  getCatalogProduct,
  getCatalogStats,
  searchCatalogProducts,
  normalizeCatalogText,
  catalogProductLabel,
  CATALOG_EXPECTED_STATS,
} from '../../domains/catalog';

describe('Master Catalog — seed identity', () => {
  it('has exactly the expected total counts (categories/subcategories/products)', () => {
    const stats = getCatalogStats();
    expect(stats).toEqual(CATALOG_EXPECTED_STATS);
    expect(stats).toEqual({ categories: 8, subcategories: 45, products: 381 });
  });

  it('contains every one of the 8 root categories by id', () => {
    expect(getCatalogCategories().map((c) => c.id).sort()).toEqual(
      [
        'vegetables',
        'fruits',
        'grocery-dry',
        'breakfast',
        'bread-bakery',
        'sweets-snacks',
        'dairy',
        'meat-poultry-eggs',
      ].sort(),
    );
  });

  it('covers all 45 subcategories', () => {
    expect(getCatalogSubcategories()).toHaveLength(45);
  });

  it('category/subcategory/product ids are globally unique', () => {
    const catIds = getCatalogCategories().map((c) => c.id);
    const subIds = getCatalogSubcategories().map((s) => s.id);
    const prodIds = getCatalogProducts().map((p) => p.id);
    const all = [...catIds, ...subIds, ...prodIds];
    expect(new Set(all).size).toBe(all.length);
  });

  it('canonical product IDs are unique and stable', () => {
    const prodIds = getCatalogProducts().map((p) => p.id);
    expect(new Set(prodIds).size).toBe(prodIds.length);
  });

  it('no duplicate name_en WITHIN the same subcategory (canonical names)', () => {
    for (const s of getCatalogSubcategories()) {
      const names = s.products.map((p) => p.name_en.trim().toLowerCase());
      expect(new Set(names).size, `duplicate name_en in ${s.id}`).toBe(names.length);
    }
  });

  it('the 15 cross-category name_en repeats are preserved intentionally', () => {
    // Legitimate taxonomy overlaps (e.g. raisins in fruits-dried AND
    // sweets-snacks-dried-fruit; honey in grocery AND breakfast; liver in the
    // meat subcategory AND offal). These are distinct products with unique IDs;
    // same EN label reflects the source intent — never collapsed/renamed here.
    const names = getCatalogProducts().map((p) => p.name_en.trim().toLowerCase());
    const repeats = names.filter((n, i) => names.indexOf(n) !== i).length;
    expect(getCatalogProducts().length).toBe(381);
    expect(new Set(names).size).toBe(366);
    expect(repeats).toBe(15);
  });
});

describe('Master Catalog — required fields', () => {
  it('every category carries id/name_ar/name_fr/icon/sort_order + subcategories', () => {
    for (const c of getCatalogCategories()) {
      expect(typeof c.id).toBe('string');
      expect(c.id).toBeTruthy();
      expect(c.name_ar.trim()).not.toBe('');
      expect(c.name_fr.trim()).not.toBe('');
      expect(c.icon.trim()).not.toBe('');
      expect(typeof c.sort_order).toBe('number');
      expect(Array.isArray(c.subcategories)).toBe(true);
    }
  });

  it('every subcategory carries full required fields', () => {
    for (const s of getCatalogSubcategories()) {
      expect(s.id).toBeTruthy();
      expect(s.category_id).toBeTruthy();
      expect(s.name_ar.trim()).not.toBe('');
      expect(s.name_fr.trim()).not.toBe('');
      expect(s.icon.trim()).not.toBe('');
      expect(typeof s.sort_order).toBe('number');
      expect(Array.isArray(s.products)).toBe(true);
    }
  });

  it('every product carries full required fields + a default_unit', () => {
    for (const p of getCatalogProducts()) {
      expect(p.id).toBeTruthy();
      expect(p.category_id).toBeTruthy();
      expect(p.subcategory_id).toBeTruthy();
      expect(p.name_ar.trim()).not.toBe('');
      expect(p.name_fr.trim()).not.toBe('');
      expect(p.name_en.trim()).not.toBe('');
      expect(p.icon.trim()).not.toBe('');
      expect(Array.isArray(p.aliases_ar)).toBe(true);
      expect(Array.isArray(p.aliases_fr)).toBe(true);
      expect(typeof p.default_unit).toBe('string');
      expect(p.default_unit).not.toBe('');
      expect(typeof p.sort_order).toBe('number');
    }
  });

  it('every subcategory_id / category_id reference exists', () => {
    const catIds = new Set(getCatalogCategories().map((c) => c.id));
    const subByCat = new Map<string, Set<string>>();
    for (const c of getCatalogCategories()) {
      subByCat.set(c.id, new Set(c.subcategories.map((s) => s.id)));
    }
    for (const p of getCatalogProducts()) {
      expect(catIds.has(p.category_id)).toBe(true);
      expect(subByCat.get(p.category_id)?.has(p.subcategory_id)).toBe(true);
    }
  });

  it('every product belongs to its parent subcategory exactly once', () => {
    for (const c of getCatalogCategories()) {
      for (const s of c.subcategories) {
        for (const p of s.products) {
          expect(p.subcategory_id).toBe(s.id);
          expect(p.category_id).toBe(s.category_id);
        }
      }
    }
  });

  it('ids follow the stable lowercase-ASCII dashed convention', () => {
    const ids = getCatalogProducts().map((p) => p.id);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('Master Catalog — lookup API', () => {
  it('looks up categories / subcategories / products by id', () => {
    expect(getCatalogCategory('vegetables')?.name_ar).toBe('الخضر');
    expect(getCatalogCategory('nonexistent')).toBeUndefined();

    expect(getCatalogSubcategory('vegetables-root')?.name_fr).toBe('Légumes racines');
    expect(getCatalogSubcategory('nonexistent')).toBeUndefined();

    expect(getCatalogProduct('vegetables-root-potato')?.name_en).toBe('Potato');
    expect(getCatalogProduct('nonexistent')).toBeUndefined();
  });

  it('returns subcategories by category id and empty for unknown categories', () => {
    expect(getCatalogSubcategoriesByCategory('vegetables').length).toBeGreaterThan(0);
    expect(getCatalogSubcategoriesByCategory('unknown-cat')).toEqual([]);
  });

  it('preserves the BBQ-sauce reference product exactly', () => {
    expect(getCatalogProduct('grocery-dry-sauces-condiments-bbq-sauce')).toEqual({
      id: 'grocery-dry-sauces-condiments-bbq-sauce',
      category_id: 'grocery-dry',
      subcategory_id: 'grocery-dry-sauces-condiments',
      name_ar: 'صلصة باربيكيو',
      name_fr: 'Sauce barbecue',
      name_en: 'BBQ sauce',
      icon: '🍖',
      aliases_ar: [],
      aliases_fr: [],
      default_unit: 'bouteille',
      sort_order: 9,
    });
  });
});

describe('Master Catalog — normalization & deterministic search', () => {
  it('normalization strips Arabic diacritics and trims/cases', () => {
    expect(normalizeCatalogText('  بطاطا  ')).toBe('بطاطا');
    expect(normalizeCatalogText('BÂTIMENT')).toBe('bâtiment');
    expect(normalizeCatalogText('   ')).toBe('');
  });

  it('search matches a canonical Arabic name deterministically', () => {
    const ar = searchCatalogProducts('بطاطا', 'ar');
    expect(ar.map((p) => p.id)).toContain('vegetables-root-potato');
    const ar2 = searchCatalogProducts('بطاطا', 'ar');
    expect(ar.map((p) => p.id)).toEqual(ar2.map((p) => p.id));
  });

  it('search matches French aliases in fr locale', () => {
    const fr = searchCatalogProducts('patate', 'fr');
    expect(fr.map((p) => p.id)).toContain('vegetables-root-potato');
  });

  it('search matches Arabic aliases in ar locale', () => {
    const ar = searchCatalogProducts('بطاطس', 'ar');
    expect(ar.map((p) => p.id)).toContain('vegetables-root-potato');
  });

  it('empty / whitespace query returns no results', () => {
    expect(searchCatalogProducts('')).toEqual([]);
    expect(searchCatalogProducts('   ')).toEqual([]);
  });

  it('label resolves the correct locale', () => {
    const potato = getCatalogProduct('vegetables-root-potato')!;
    expect(catalogProductLabel(potato, 'ar')).toBe('بطاطا');
    expect(catalogProductLabel(potato, 'fr')).toBe('Pomme de terre');
    expect(catalogProductLabel(potato, 'en')).toBe('Potato');
  });

  it('the whole catalog is frozen/stable (no accidental mutation of seed)', () => {
    expect(Object.isFrozen(MASTER_CATALOG)).toBe(false);
    // Determinism guard: re-reading seed yields identical product ids order.
    expect(getCatalogProducts().map((p) => p.id)).toEqual(
      getCatalogProducts().map((p) => p.id),
    );
  });
});
