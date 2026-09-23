/**
 * GATE V1.6.2 — single-merchant wording gate.
 * The family vegetables path must never suggest store choice: the three
 * customer-facing keys below are asserted VALUE-level (real dictionaries,
 * all four locales) to contain no store/marketplace-selection wording.
 */
import { describe, it, expect } from 'vitest';
import ar from '../../i18n/translations/ar';
import en from '../../i18n/translations/en';
import fr from '../../i18n/translations/fr';
import tr from '../../i18n/translations/tr';

const KEYS = ['pilot.backToStore', 'pilot.backToStorefront', 'pilot.storefrontVegetablesTitle'] as const;

const BANNED: Array<[string, Record<string, string>, RegExp]> = [
  ['ar', ar as Record<string, string>, /متجر|متاجر|مخزن|بائع|فرع|سوق/],
  ['en', en as Record<string, string>, /store|stores|shop|market|merchant|seller|branch/i],
  ['fr', fr as Record<string, string>, /magasin|marché|vendeur|boutique|succursale/i],
  ['tr', tr as Record<string, string>, /mağaza|market|satıcı|şube|magaza/i],
];

describe('single-merchant wording (V1.6.2)', () => {
  it('family vegetables keys carry no store-selection wording in any locale', () => {
    for (const [locale, dict, pattern] of BANNED) {
      for (const key of KEYS) {
        const value = dict[key];
        expect(value, `${locale}:${key} must exist`).toBeTruthy();
        expect(value, `${locale}:${key} must not suggest stores`).not.toMatch(pattern);
      }
    }
  });

  it('back actions point at the vegetables, and the title names the day', () => {
    expect((ar as Record<string, string>)['pilot.backToStore']).toContain('للخضار');
    expect((en as Record<string, string>)['pilot.backToStore']).toContain('vegetables');
    expect((ar as Record<string, string>)['pilot.storefrontVegetablesTitle']).toContain('خضار');
    expect((en as Record<string, string>)['pilot.storefrontVegetablesTitle']).toMatch(/today|day/i);
  });
});
