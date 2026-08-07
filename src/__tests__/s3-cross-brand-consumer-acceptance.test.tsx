import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { ThemeProvider } from '../design-system/use-theme';
import { VariantSelector } from '../components/catalog/VariantSelector';
import { verifyModelVariants, verifyAllModels } from '../services/variant-verification';
import { CatalogQuality } from '../services/catalog-quality';

/**
 * S3 Acceptance Gate — سلسلة الهوية Brand → Model → Variant.
 *
 * القاعدة الثابتة المعتمدة (S3): كل مستهلكٍ للنسخ يجب أن يقيّدها بعلامته قبل
 * أي عرض أو تحقق. المستهلكون المغطّون هنا: variant-verification، catalog-quality،
 * ومكوّن VariantSelector نفسه.
 *
 * الوضع الحالي (قبل تنفيذ S3): هذه البوابة حمراء — العلامة متاحة عند كل مستهلك
 * لكنها لا تُمرَّر (أول علامة تفوز). بعد S3 يجب أن تصبح خضراء بالكامل.
 */

describe('S3 Acceptance Gate: سلسلة الهوية Brand → Model → Variant (Vivo X50 ↔ Honor X50)', () => {
  it('R1: verifyModelVariants(model, actual, brand) must scope expected variants to the brand', () => {
    const vivo = verifyModelVariants('X50', [{ ram: '8GB', storage: '128GB' }], 'vivo');
    expect(vivo.expectedVariants).toEqual(['8/128']);
    expect(vivo.missing).toEqual([]);
    expect(vivo.extra).toEqual([]);
    expect(vivo.coverage).toBe(1);
    expect(vivo.expectedVariants).not.toContain('8/256');
    expect(vivo.expectedVariants).not.toContain('12/512');

    const honor = verifyModelVariants('X50', [
      { ram: '8GB', storage: '128GB' },
      { ram: '8GB', storage: '256GB' },
      { ram: '12GB', storage: '512GB' },
    ], 'honor');
    expect(honor.expectedVariants).toEqual(['8/128', '8/256', '12/512']);
    expect(honor.coverage).toBe(1);
  });

  it('R2: verifyAllModels() must evaluate each model against its own brand variants (Vivo X50 = 8/128 only)', () => {
    const reports = verifyAllModels();
    const vivoX50 = reports.find(r => r.brand === 'Vivo' && r.model === 'X50');
    expect(vivoX50).toBeDefined();
    expect(vivoX50!.expectedVariants).toEqual(['8/128']);
    expect(vivoX50!.actualVariants).toEqual(['8/128']);
    expect(vivoX50!.missing).toEqual([]);
    expect(vivoX50!.coverage).toBe(1);
  });

  it('R3: CatalogQuality.suggestVariants(brand, model) must respect the brand parameter', () => {
    const vivo = CatalogQuality.suggestVariants('Vivo', 'X50');
    expect(vivo).toEqual(['8/128']);
    expect(vivo).not.toContain('8/256');
    expect(vivo).not.toContain('12/512');
  });

  it('R4: VariantSelector must accept brand and render only that brand variants', () => {
    const props = {
      modelName: 'X50',
      brand: 'vivo',
      onSelect: vi.fn(),
    } as unknown as ComponentProps<typeof VariantSelector>;

    render(
      <ThemeProvider>
        <VariantSelector {...props} />
      </ThemeProvider>,
    );

    expect(screen.getByText('8/128')).toBeTruthy();
    expect(screen.queryByText('8/256')).toBeNull();
    expect(screen.queryByText('12/512')).toBeNull();
  });
});
