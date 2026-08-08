import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ShowroomControls } from '../../components/showroom/ShowroomControls';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { resetShowroomUiState, type ShowroomUiState } from '../../hooks/useShowroomState';
import type { InventoryRecord } from '../../services/inventory-service';

function makeDevice(overrides: Partial<InventoryRecord>): InventoryRecord {
  return {
    id: overrides.id ?? 'd',
    modelId: 'm',
    brand: 'B',
    model: 'M',
    variant: 'V',
    ram: '4GB',
    storage: '64GB',
    condition: 'Used',
    quantity: 1,
    sellPrice: 50000,
    city: 'الجزائر',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalPurchased: 0,
    totalSold: 0,
    ...overrides,
  };
}

const devices: InventoryRecord[] = [
  makeDevice({ id: 'a', brand: 'Apple', model: 'iPhone 13', condition: 'New', city: 'الجزائر' }),
  makeDevice({ id: 'b', brand: 'Samsung', model: 'A52', condition: 'Used', city: 'وهران' }),
];

const initial: ShowroomUiState = { scrollY: 0, query: '', condition: 'all', city: '', sort: 'latest' };

function renderControls(onChange: (patch: Partial<ShowroomUiState>) => void) {
  return render(
    <ThemeProvider>
      <TranslationProvider>
        <ShowroomControls devices={devices} state={initial} onChange={onChange} />
      </TranslationProvider>
    </ThemeProvider>,
  );
}

describe('Phase 3B §4/§5 — ShowroomControls', () => {
  beforeEach(() => {
    resetShowroomUiState();
  });

  it('search input propagates query', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'iphone' } });
    expect(onChange).toHaveBeenCalledWith({ query: 'iphone' });
  });

  it('condition chip propagates the value', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onChange).toHaveBeenCalledWith({ condition: 'new' });
  });

  it('city chip propagates the city', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.click(screen.getByRole('button', { name: /الجزائر/ }));
    expect(onChange).toHaveBeenCalledWith({ city: 'الجزائر' });
  });

  it('sort select propagates the value', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'expensive' } });
    expect(onChange).toHaveBeenCalledWith({ sort: 'expensive' });
  });

  it('re-selecting the active condition does not propagate', () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider>
        <TranslationProvider>
          <ShowroomControls devices={devices} state={{ ...initial, condition: 'new' }} onChange={onChange} />
        </TranslationProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
