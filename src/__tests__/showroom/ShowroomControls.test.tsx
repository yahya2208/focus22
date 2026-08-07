import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ShowroomControls } from '../../components/showroom/ShowroomControls';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { resetShowroomUiState, type ShowroomUiState } from '../../hooks/useShowroomState';
import type { InventoryRecord } from '../../services/inventory-service';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../core/telemetry', () => ({
  getGlobalTelemetry: () => ({ track, setCampaignId: vi.fn(), setPlacementId: vi.fn(), flush: vi.fn() }),
}));

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
    track.mockClear();
  });

  it('search input propagates query without telemetry', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'iphone' } });
    expect(onChange).toHaveBeenCalledWith({ query: 'iphone' });
    expect(track).not.toHaveBeenCalled();
  });

  it('condition chip emits showroom_filter_changed and propagates the value', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onChange).toHaveBeenCalledWith({ condition: 'new' });
    expect(track).toHaveBeenCalledWith('showroom_filter_changed', { filter: 'condition', value: 'new' });
  });

  it('city chip emits showroom_filter_changed and propagates the city', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.click(screen.getByRole('button', { name: /الجزائر/ }));
    expect(onChange).toHaveBeenCalledWith({ city: 'الجزائر' });
    expect(track).toHaveBeenCalledWith('showroom_filter_changed', { filter: 'city', value: 'الجزائر' });
  });

  it('sort select emits showroom_sort_changed and propagates the value', () => {
    const onChange = vi.fn();
    renderControls(onChange);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'expensive' } });
    expect(onChange).toHaveBeenCalledWith({ sort: 'expensive' });
    expect(track).toHaveBeenCalledWith('showroom_sort_changed', { sort: 'expensive' });
  });

  it('re-selecting the active condition does not emit telemetry', () => {
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
    expect(track).not.toHaveBeenCalled();
  });
});
