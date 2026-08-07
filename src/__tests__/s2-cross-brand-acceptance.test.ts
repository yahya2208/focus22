import { describe, it, expect } from 'vitest';
import { getVariantsForModel, type PhoneVariant } from '../data/phone-variants';

/**
 * S2 Acceptance Gate — AT-23 (القاعدة الثابتة المعتمدة 2026-08-07):
 * لا يجوز أبداً أن يُظهر البحث عن هاتفٍ نسخةً (variant) تابعة لعلامة تجارية أخرى.
 * Vivo X50 ↔ Honor X50 هو أول اختبار في S2 وبوابة مرور إلزامية.
 *
 * التوقيع المعتمد لـ S2: getVariantsForModel(modelName, brand?)
 *   - brand مقدم  → نسخ تلك العلامة حصراً
 *   - brand غائب  → السلوك القديم (متوافق، أول علامة تفوز)
 */

function labels(variants: PhoneVariant[]): string[] {
  return variants.map(v => v.label).sort();
}

describe('S2 Acceptance Gate AT-23: cross-brand isolation (Vivo X50 ↔ Honor X50)', () => {
  it('RULES: Vivo X50 must never surface Honor variants', () => {
    const vivo = getVariantsForModel('X50', 'vivo');
    expect(vivo.length).toBeGreaterThan(0);
    for (const v of vivo) {
      expect(['8/256', '12/512']).not.toContain(v.label);
    }
  });

  it('Vivo X50 (brand=vivo) returns only Vivo real variants: 8/128', () => {
    expect(labels(getVariantsForModel('X50', 'vivo'))).toEqual(['8/128']);
  });

  it('Honor X50 (brand=honor) returns only Honor real variants: 8/128, 8/256, 12/512', () => {
    expect(labels(getVariantsForModel('X50', 'honor'))).toEqual(['12/512', '8/128', '8/256']);
  });

  it('brand is respected in both directions — no first-brand-wins leakage', () => {
    const vivo = labels(getVariantsForModel('X50', 'vivo'));
    const honor = labels(getVariantsForModel('X50', 'honor'));
    expect(vivo).not.toEqual(honor);
    expect(vivo).toEqual(['8/128']);
    expect(honor).toEqual(['12/512', '8/128', '8/256']);
  });

  it('compatibility: brand absent keeps legacy behavior (first brand wins = Honor)', () => {
    expect(labels(getVariantsForModel('X50'))).toEqual(['12/512', '8/128', '8/256']);
  });
});
