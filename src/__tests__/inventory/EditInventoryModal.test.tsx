import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';
import { EditInventoryModal } from '../../components/inventory/EditInventoryModal';

const mock = vi.hoisted(() => ({
  updateImages: vi.fn(() => ({})),
  updatePrices: vi.fn(() => ({})),
}));

vi.mock('../../services/inventory-service', () => ({
  InventoryService: { updateImages: mock.updateImages, updatePrices: mock.updatePrices },
}));

vi.mock('../../components/showroom/PhoneImageUploader', () => ({
  PhoneImageUploader: () => null,
}));

const record: InventoryRecord = {
  id: 'rec-1',
  modelId: 'Samsung Galaxy S22',
  brand: 'Samsung',
  model: 'Galaxy S22',
  variant: '128GB / 8GB',
  ram: '8GB',
  storage: '128GB',
  condition: 'New',
  quantity: 2,
  buyPrice: 120000,
  sellPrice: 140000,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  totalPurchased: 5,
  totalSold: 3,
};

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

describe('EditInventoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(overrides?: {
    onSave?: (r: InventoryRecord, q: number) => void;
    onClose?: () => void;
  }) {
    const onSave = overrides?.onSave ?? vi.fn();
    const onClose = overrides?.onClose ?? vi.fn();
    const utils = render(
      <EditInventoryModal record={record} colors={mockColors()} onSave={onSave} onClose={onClose} />,
    );
    return { onSave, onClose, ...utils };
  }

  it('shows the record header and its current quantity', () => {
    renderModal();
    expect(screen.getByText('تعديل الكمية - Samsung Galaxy S22')).toBeTruthy();
    expect(screen.getByText('128GB / 8GB · 128GB · New')).toBeTruthy();
    expect((screen.getByDisplayValue('2') as HTMLInputElement).value).toBe('2');
    expect((screen.getByDisplayValue('120000') as HTMLInputElement).value).toBe('120000');
    expect((screen.getByDisplayValue('140000') as HTMLInputElement).value).toBe('140000');
  });

  it('saves the edited quantity and prices, then calls onSave', () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '5' } });
    fireEvent.change(screen.getByDisplayValue('120000'), { target: { value: '115000' } });
    fireEvent.change(screen.getByDisplayValue('140000'), { target: { value: '150000' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(mock.updateImages).toHaveBeenCalledWith('rec-1', []);
    expect(mock.updatePrices).toHaveBeenCalledWith('rec-1', 115000, 150000);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-1' }), 5);
  });

  it('calls onClose when  إلغاء is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked but not the dialog body', () => {
    const { onClose, container } = renderModal();
    const backdrop = container.firstElementChild as HTMLElement;
    const dialog = backdrop.firstElementChild as HTMLElement;

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('parses empty price fields as undefined', () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '3' } });
    fireEvent.change(screen.getByDisplayValue('120000'), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('140000'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(mock.updatePrices).toHaveBeenCalledWith('rec-1', undefined, undefined);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec-1' }), 3);
  });
});
