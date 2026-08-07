import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PhoneIdentity } from '../components/catalog/CatalogIdentity';
import { ThemeProvider } from '../design-system/use-theme';
import { CatalogCascadeSelector } from '../components/catalog/CatalogCascadeSelector';
import { InventoryService } from '../services/inventory-service';
import { getStockForModel } from '../components/catalog/CatalogCascadeTypes';

/**
 * S4 Acceptance Gate — AT-24 (المصدر الحقيقي للتصفح، المعتمد 2026-08-07):
 *
 * يجب أن يعمل التصفح الكاسكيد من الكتالوج الحقيقي (JSON loader) دون أي قراءة
 * لأعمدة الكتالوج القديمة (catalog_brands_v1 / catalog_models_v1).
 * Vivo X50 → سلسلة X → X50 → النسخة 8/128 فقط (لا نسخ Honor X50 أبداً).
 *
 * القيود المعتمدة: لا تعديل JSON، لا canonical.ts، لا seeder/S5، والمخزون
 * (catalog_inventory) يبقى يعمل بنفس الصيغة النصية modelId = "Vivo X50".
 */

const localStorageKeys: string[] = [];
const originalGetItem = Storage.prototype.getItem;
const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

function Harness({ onEmit }: { onEmit: (v: Partial<PhoneIdentity>) => void }) {
  const [value, setValue] = useState<Partial<PhoneIdentity>>({});
  return (
    <CatalogCascadeSelector
      value={value}
      onChange={(v) => { onEmit(v); setValue({ ...v }); }}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  getItemSpy.mockClear();
  localStorageKeys.length = 0;
  getItemSpy.mockImplementation((key: string) => {
    localStorageKeys.push(key);
    return originalGetItem.call(window.localStorage, key);
  });
});

describe('S4 AT-24: التصفح يعمل من الكتالوج الحقيقي دون catalog_*_v1', () => {
  it('browse Vivo → X → X50 → 8/128 يعمل ولا يقرأ catalog_*_v1 إطلاقاً', () => {
    const emits: Partial<PhoneIdentity>[] = [];
    render(
      <ThemeProvider>
        <Harness onEmit={(v) => emits.push(v)} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'اختيار من القائمة' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'X' }));
    fireEvent.click(screen.getByRole('button', { name: 'X50' }));

    expect(screen.getByRole('button', { name: '8/128' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '8/256' })).toBeNull();
    expect(screen.queryByRole('button', { name: '12/512' })).toBeNull();

    expect(localStorageKeys.some((k) => k === 'catalog_brands_v1' || k === 'catalog_models_v1')).toBe(false);

    const modelEmit = emits.find((e) => e.modelName === 'X50');
    expect(modelEmit?.modelId).toBe('Vivo X50');
  });

  it('modelId النصي = "Vivo X50" يجلب المخزون دون اللجوء إلى catalog_models_v1', () => {
    InventoryService.addStock('Vivo', 'X50', '8/128', 5, 10000, 20000);

    getItemSpy.mockClear();
    localStorageKeys.length = 0;

    const stock = getStockForModel('Vivo X50');

    expect(stock).toEqual([{ variant: '8/128', stock: 5 }]);
    expect(localStorageKeys).not.toContain('catalog_models_v1');
    expect(localStorageKeys).not.toContain('catalog_brands_v1');
  });

  it('المخزون يظهر داخل خطوة النسخة عند التصفح (catalog_inventory لم يُكسر)', () => {
    InventoryService.addStock('Vivo', 'X50', '8/128', 5, 10000, 20000);

    render(
      <ThemeProvider>
        <Harness onEmit={() => undefined} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'اختيار من القائمة' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'X' }));
    fireEvent.click(screen.getByRole('button', { name: 'X50' }));

    expect(screen.getByText('8/128: 5 جهاز')).toBeTruthy();
  });
});
