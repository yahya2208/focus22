import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useShowroomState,
  filterAndSortDevices,
  getAvailableCities,
  resetShowroomUiState,
  showroomUiState,
} from '../../hooks/useShowroomState';
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalPurchased: 0,
    totalSold: 0,
    ...overrides,
  };
}

const devices: InventoryRecord[] = [
  makeDevice({ id: 'a', brand: 'Apple', model: 'iPhone 13', variant: '128GB', sellPrice: 98000, city: 'الجزائر', condition: 'New', createdAt: '2026-03-01T00:00:00.000Z' }),
  makeDevice({ id: 'b', brand: 'Samsung', model: 'A52', variant: '128GB', sellPrice: 40000, city: 'وهران', condition: 'Used', createdAt: '2026-01-15T00:00:00.000Z' }),
  makeDevice({ id: 'c', brand: 'Samsung', model: 'S21', variant: '256GB', sellPrice: 120000, city: 'الجزائر', condition: 'New', createdAt: '2026-02-10T00:00:00.000Z' }),
  makeDevice({ id: 'd', brand: 'Xiaomi', model: 'Redmi', variant: '64GB', sellPrice: undefined, city: undefined, condition: 'Used', createdAt: '2026-01-01T00:00:00.000Z' }),
];

describe('Phase 3B §6/§8.1 — showroom UI-state registry (session-only)', () => {
  beforeEach(() => resetShowroomUiState());
  afterEach(() => resetShowroomUiState());

  it('update() writes to the shared registry and re-renders the hook', () => {
    const { result } = renderHook(() => useShowroomState());
    act(() => {
      result.current.update({ query: 'samsung', sort: 'expensive' });
    });
    expect(showroomUiState.query).toBe('samsung');
    expect(showroomUiState.sort).toBe('expensive');
    expect(result.current.state.query).toBe('samsung');
  });

  it('state survives a remount (registry outlives the component)', () => {
    const first = renderHook(() => useShowroomState());
    act(() => first.result.current.update({ condition: 'new', city: 'الجزائر' }));
    first.unmount();
    const second = renderHook(() => useShowroomState());
    expect(second.result.current.state.condition).toBe('new');
    expect(second.result.current.state.city).toBe('الجزائر');
  });

  it('resetShowroomUiState restores defaults', () => {
    showroomUiState.scrollY = 500;
    showroomUiState.query = 'x';
    showroomUiState.condition = 'used';
    showroomUiState.city = 'وهران';
    showroomUiState.sort = 'cheapest';
    resetShowroomUiState();
    expect(showroomUiState).toEqual({ scrollY: 0, query: '', condition: 'all', city: '', sort: 'latest' });
  });
});

describe('Phase 3B — filterAndSortDevices', () => {
  it('query matches brand/model/variant (case-insensitive)', () => {
    const out = filterAndSortDevices(devices, { query: 'samsung', condition: 'all', city: '', sort: 'latest' });
    expect(out.map((d) => d.id)).toEqual(['c', 'b']);
  });

  it('condition new/used filter', () => {
    const newOut = filterAndSortDevices(devices, { query: '', condition: 'new', city: '', sort: 'latest' });
    expect(newOut.map((d) => d.id)).toEqual(['a', 'c']);
    const usedOut = filterAndSortDevices(devices, { query: '', condition: 'used', city: '', sort: 'latest' });
    expect(usedOut.map((d) => d.id)).toEqual(['b', 'd']);
  });

  it('city filter', () => {
    const out = filterAndSortDevices(devices, { query: '', condition: 'all', city: 'الجزائر', sort: 'latest' });
    expect(out.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('sort latest = createdAt desc', () => {
    const out = filterAndSortDevices(devices, { query: '', condition: 'all', city: '', sort: 'latest' });
    expect(out.map((d) => d.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('sort cheapest = sellPrice asc, missing price last', () => {
    const out = filterAndSortDevices(devices, { query: '', condition: 'all', city: '', sort: 'cheapest' });
    expect(out.map((d) => d.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('sort expensive = sellPrice desc, missing price last', () => {
    const out = filterAndSortDevices(devices, { query: '', condition: 'all', city: '', sort: 'expensive' });
    expect(out.map((d) => d.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('does not mutate the input list', () => {
    const before = devices.map((d) => d.id);
    filterAndSortDevices(devices, { query: '', condition: 'all', city: '', sort: 'expensive' });
    expect(devices.map((d) => d.id)).toEqual(before);
  });
});

describe('Phase 3B — getAvailableCities', () => {
  it('returns unique non-empty cities in insertion order', () => {
    expect(getAvailableCities(devices)).toEqual(['الجزائر', 'وهران']);
  });
});
