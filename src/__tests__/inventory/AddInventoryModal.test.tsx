import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import { ALL_CONDITIONS } from '../../services/price-memory';
import { AddInventoryModal } from '../../components/inventory/AddInventoryModal';

const mock = vi.hoisted(() => ({
  addStock: vi.fn(() => ({ id: 'rec-9' })),
  updateImages: vi.fn(() => ({})),
  selectResult: { brand: 'Samsung', model: 'Galaxy S22', normalized: 'galaxys22', score: 100 },
}));

vi.mock('../../services/inventory-service', () => ({
  InventoryService: { addStock: mock.addStock, updateImages: mock.updateImages },
}));

const VARIANT = { label: '128GB / 8GB', ram: '8GB', storage: '128GB' as const };

vi.mock('../../components/catalog/CatalogAutocomplete', () => ({
  CatalogAutocomplete: ({ onSelect }: { onSelect: (r: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(mock.selectResult)}>
      mock-autocomplete
    </button>
  ),
}));

vi.mock('../../components/catalog/VariantSelector', () => ({
  VariantSelector: ({ onSelect }: { onSelect: (v: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(VARIANT)}>
      mock-variant
    </button>
  ),
}));

vi.mock('../../components/showroom/PhoneImageUploader', () => ({
  PhoneImageUploader: () => null,
}));

function mockColors(): ThemeColors {
  return {
    bg: '', bgCard: '', bgInput: '', bgHover: '', border: '', borderLight: '',
    text: '', textSecondary: '', textMuted: '', textFaint: '', accent: '', accentLight: '',
    accentGlow: '', success: '', successBg: '', successText: '', danger: '', dangerBg: '',
    dangerText: '', warning: '', warningBg: '', warningText: '', info: '', infoBg: '',
    infoText: '', progressBg: '', shadow: '', glass: '', glassBorder: '', gradient: '',
  } as ThemeColors;
}

afterEach(() => {
  cleanup();
});

describe('AddInventoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.selectResult = { brand: 'Samsung', model: 'Galaxy S22', normalized: 'galaxys22', score: 100 };
  });

  function renderModal(onDone: () => void = vi.fn()) {
    return render(<AddInventoryModal colors={mockColors()} onDone={onDone} />);
  }

  it('starts on the model-selection step', () => {
    renderModal();
    expect(screen.getByText('1. اختيار الموديل')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'mock-autocomplete' })).toBeTruthy();
  });

  it('walks through variant → condition → quantity and saves the record', async () => {
    const onDone = vi.fn();
    renderModal(onDone);

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    expect(screen.getByText('Samsung Galaxy S22')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    expect(screen.getByText('اختر الحالة')).toBeTruthy();
    for (const cond of ALL_CONDITIONS) {
      expect(screen.getByRole('button', { name: cond })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('النسخة: 128GB / 8GB (8GB / 128GB)')).toBeTruthy();
    expect(screen.getByText('الحالة: New')).toBeTruthy();

    const saveButton = screen.getByRole('button', { name: 'حفظ (1 قطعة, New)' });
    fireEvent.click(saveButton);

    expect(mock.addStock).toHaveBeenCalledWith(
      'Samsung', 'Galaxy S22', VARIANT, 1,
      undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', undefined, undefined,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('saves the chosen quantity and buy/sell prices', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Box' }));

    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '3' } });
    fireEvent.change(screen.getAllByPlaceholderText('اختياري')[0]!, { target: { value: '100000' } });

    fireEvent.click(screen.getByRole('button', { name: 'حفظ (3 قطعة, Open Box)' }));

    expect(mock.addStock).toHaveBeenCalledWith(
      'Samsung', 'Galaxy S22', VARIANT, 3,
      100000, undefined, 'purchase', undefined, undefined, undefined, 'Open Box', undefined, undefined,
    );
  });

  it('lets the user go back to previous steps', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    expect(screen.getByText('اختر الحالة')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'تغيير' }));
    expect(screen.getByRole('button', { name: 'mock-variant' })).toBeTruthy();
  });

  it('"متابعة بدون تحديد إصدار" saves the no-variant representation ("" only where the schema is NOT NULL; ram resolves to NULL)', async () => {
    mock.selectResult = { brand: 'Apple', model: 'iPhone SE (2016)', normalized: 'iphone se 2016', score: 100 };
    const onDone = vi.fn();
    renderModal(onDone);

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    expect(screen.getByRole('button', { name: 'متابعة بدون تحديد إصدار' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'متابعة بدون تحديد إصدار' }));
    expect(screen.getByText('اختر الحالة')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText(/دون تحديد إصدار/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ (1 قطعة, New)' }));

    expect(mock.addStock).toHaveBeenCalledWith(
      'Apple', 'iPhone SE (2016)', '', 1,
      undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', undefined, undefined,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('J) Samsung: Battery Health field is NOT rendered', () => {
    mock.selectResult = { brand: 'Samsung', model: 'Galaxy S22', normalized: 'galaxys22', score: 100 };
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.queryByLabelText('Battery Health')).toBeNull();
  });

  it('Apple: Battery Health field IS rendered and battery=87 is passed to addStock', async () => {
    mock.selectResult = { brand: 'Apple', model: 'iPhone 13', normalized: 'iphone 13', score: 100 };
    const onDone = vi.fn();
    renderModal(onDone);

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.getByLabelText('Battery Health')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Battery Health'), { target: { value: '87' } });

    fireEvent.click(screen.getByRole('button', { name: 'حفظ (1 قطعة, New)' }));

    expect(mock.addStock).toHaveBeenCalledWith(
      'Apple', 'iPhone 13', VARIANT, 1,
      undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', 87, undefined,
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('I) Battery validation: -1 rejected, 101 rejected, 87 accepted', () => {
    mock.selectResult = { brand: 'Apple', model: 'iPhone 13', normalized: 'iphone 13', score: 100 };
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    const battery = screen.getByLabelText('Battery Health');
    const save = screen.getByRole('button', { name: 'حفظ (1 قطعة, New)' });

    fireEvent.change(battery, { target: { value: '-1' } });
    fireEvent.click(save);
    expect(screen.getByText('أدخل نسبة البطارية بين 0 و 100')).toBeTruthy();
    expect(mock.addStock).not.toHaveBeenCalled();

    fireEvent.change(battery, { target: { value: '101' } });
    fireEvent.click(save);
    expect(screen.getByText('أدخل نسبة البطارية بين 0 و 100')).toBeTruthy();
    expect(mock.addStock).not.toHaveBeenCalled();

    fireEvent.change(battery, { target: { value: '87' } });
    fireEvent.click(save);
    expect(mock.addStock).toHaveBeenCalledWith(
      'Apple', 'iPhone 13', VARIANT, 1,
      undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', 87, undefined,
    );
  });

  it('Apple + empty battery → battery passes as undefined (NULL downstream)', () => {
    mock.selectResult = { brand: 'Apple', model: 'iPhone 13', normalized: 'iphone 13', score: 100 };
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'mock-autocomplete' }));
    fireEvent.click(screen.getByRole('button', { name: 'mock-variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ (1 قطعة, New)' }));

    expect(mock.addStock).toHaveBeenCalledWith(
      'Apple', 'iPhone 13', VARIANT, 1,
      undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', undefined, undefined,
    );
  });
});
