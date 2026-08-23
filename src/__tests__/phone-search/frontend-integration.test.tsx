import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';

/**
 * Frontend integration tests for phone search analytics (Phase 1 wiring).
 *
 * Covers the six required scenarios:
 *   1. meaningful search → record_phone_search
 *   2. empty/short search is ignored
 *   3. search event ID is retained
 *   4. selecting a result → record_search_selection
 *   5. analytics RPC failure does not break UX
 *   6. duplicate search is handled safely
 *
 * The showroom and catalog surfaces share useSearchAnalytics; the hook tests
 * verify the shared debounce/retention/linking contract. Structural checks
 * pin both screens to that shared implementation.
 */

const mock = vi.hoisted(() => ({
  recordPhoneSearch: vi.fn(),
  recordSearchSelection: vi.fn(),
  getExchangeableDevices: vi.fn(() => []),
}));

vi.mock('../../services/phone-search-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/phone-search-service')>();
  return {
    ...actual,
    recordPhoneSearch: mock.recordPhoneSearch,
    recordSearchSelection: mock.recordSearchSelection,
  };
});

import { useSearchAnalytics, resetSearchAnalyticsRetention } from '../../hooks/useSearchAnalytics';
import { CustomerPhoneFlow } from '../../screens/phone-services/CustomerPhoneFlow';

beforeEach(() => {
  vi.useFakeTimers();
  resetSearchAnalyticsRetention();
  mock.recordPhoneSearch.mockResolvedValue({ searchEventId: 42, deduped: false });
  mock.recordSearchSelection.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('useSearchAnalytics — shared showroom/catalog contract', () => {
  it('scenario 1: meaningful search records after 400ms debounce with trimmed query', async () => {
    const { result } = renderHook(() => useSearchAnalytics('showroom'));

    act(() => { result.current.recordSearch('  iphone 15 ', 3); });
    expect(mock.recordPhoneSearch).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);
    expect(mock.recordPhoneSearch).toHaveBeenCalledWith('iphone 15', 3, 'showroom');
  });

  it('scenario 2: empty or sub-2-char searches are never recorded and reset retention', async () => {
    const { result } = renderHook(() => useSearchAnalytics('catalog'));

    act(() => { result.current.recordSearch('', 5); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mock.recordPhoneSearch).not.toHaveBeenCalled();

    act(() => { result.current.recordSearch('a', 5); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mock.recordPhoneSearch).not.toHaveBeenCalled();

    // A short query also clears any previously retained event id.
    act(() => { result.current.recordSearch('galaxy s21', 4); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    act(() => { result.current.recordSearch('a', 0); });
    act(() => { result.current.linkSelection('dev-1'); });
    await flush();
    expect(mock.recordSearchSelection).not.toHaveBeenCalled();
  });

  it('scenario 3: returned search_event_id is retained and passed to selection linking', async () => {
    const { result } = renderHook(() => useSearchAnalytics('catalog'));

    act(() => { result.current.recordSearch('pixel 8', 2); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    act(() => { result.current.linkSelection('inventory-uuid-9'); });
    await flush();

    expect(mock.recordSearchSelection).toHaveBeenCalledTimes(1);
    expect(mock.recordSearchSelection).toHaveBeenCalledWith(42, 'inventory-uuid-9', 'catalog');
  });

  it('scenario 4: selection without a recorded search does not fire the RPC', async () => {
    const { result } = renderHook(() => useSearchAnalytics('showroom'));
    act(() => { result.current.linkSelection('orphan-device'); });
    await flush();
    expect(mock.recordSearchSelection).not.toHaveBeenCalled();
  });

  it('scenario 5: analytics failure is swallowed — no throw, later searches still work', async () => {
    mock.recordPhoneSearch.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => useSearchAnalytics('showroom'));

    act(() => { result.current.recordSearch('first query', 1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush(); // rejection swallowed inside hook

    // Failed recording must not retain an id → no selection link for it.
    act(() => { result.current.linkSelection('some-device'); });
    await flush();
    expect(mock.recordSearchSelection).not.toHaveBeenCalled();

    // Recovery: a different query is still recorded afterwards.
    mock.recordPhoneSearch.mockResolvedValueOnce({ searchEventId: 7, deduped: false });
    act(() => { result.current.recordSearch('second query', 6); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();
    expect(mock.recordPhoneSearch).toHaveBeenLastCalledWith('second query', 6, 'showroom');

    act(() => { result.current.linkSelection('device-x'); });
    await flush();
    expect(mock.recordSearchSelection).toHaveBeenCalledWith(7, 'device-x', 'showroom');
  });

  it('scenario 6: identical query is not re-recorded (client-side dedup)', async () => {
    const { result } = renderHook(() => useSearchAnalytics('showroom'));

    act(() => { result.current.recordSearch('iphone 15', 3); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    act(() => { result.current.recordSearch('iphone 15', 3); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);

    // A changed query re-arms normally.
    act(() => { result.current.recordSearch('iphone 15 pro', 2); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();
    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(2);
  });
});

// ─── CustomerPhoneFlow (context='catalog') ──────────────────────────────────

vi.mock('../../components/catalog/CatalogCascadeSelector', () => ({
  CatalogCascadeSelector: ({ onChange, onSearchCommitted }: {
    onChange: (id: { brandName?: string; modelName?: string }) => void;
    onSearchCommitted?: (q: string, n: number) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onSearchCommitted?.('iphone 15 pro', 2);
        onChange({ brandName: 'Apple', modelName: 'iPhone 15 Pro' });
      }}
    >
      mock-cascade
    </button>
  ),
}));

vi.mock('../../components/catalog/VariantSelector', () => ({
  VariantSelector: ({ onSelect }: { onSelect: (v: { label: string }) => void }) => (
    <button type="button" onClick={() => onSelect({ label: '8/128' })}>mock-variant</button>
  ),
}));

vi.mock('../../services/whatsapp-service', () => ({
  WHATSAPP_PHONE: '+213556254007',
  buildWhatsAppForActionMessage: vi.fn(() => ''),
  buildModelNotFoundMessage: vi.fn(() => ''),
}));

vi.mock('../../providers/WhatsAppProvider', () => ({
  WhatsAppProvider: ({ children }: { children: React.ReactNode }) => children,
  useWhatsApp: () => ({ send: vi.fn(), modal: null }),
}));

vi.mock('../../components/ad-contact/AdContactBanner', () => ({
  AdContactBanner: () => null,
}));

vi.mock('../../services/inventory-service', () => ({
  InventoryService: {
    getExchangeableDevices: mock.getExchangeableDevices,
  },
}));

const devices = [
  { id: 'inv-aaa', brand: 'Samsung', model: 'Galaxy S22', variant: '8/128', quantity: 2, sellPrice: 90000 },
  { id: 'inv-bbb', brand: 'Xiaomi', model: 'Redmi Note 12', variant: '6/128', quantity: 1, sellPrice: 40000 },
];

function renderFlow() {
  return render(
    <ThemeProvider>
      <CustomerPhoneFlow />
    </ThemeProvider>,
  );
}

describe('CustomerPhoneFlow — catalog context analytics', () => {
  beforeEach(() => {
    mock.getExchangeableDevices.mockReturnValue(devices as never[]);
  });

  it('records a single fire-and-forget event when a model search is committed', () => {
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'mock-cascade' }));
    expect(mock.recordPhoneSearch).toHaveBeenCalledWith('iphone 15 pro', 2, 'catalog');
  });

  it('exchange flow: filter search is debounced + target selection links real device id', async () => {
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'mock-cascade' })); // → variant
    fireEvent.click(screen.getByRole('button', { name: /متابعة بدون تحديد إصدار|mock-variant/i }));

    // Condition step
    fireEvent.click(screen.getByRole('button', { name: /^New$/ }));

    // Action step → exchange shows inventory picker
    fireEvent.click(screen.getByRole('button', { name: /استبدال/ }));

    const filterInput = screen.getByPlaceholderText('ابحث في المخزون...');
    fireEvent.change(filterInput, { target: { value: 'sam' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    expect(mock.recordPhoneSearch).toHaveBeenCalledWith('sam', 1, 'catalog');

    fireEvent.click(screen.getByRole('button', { name: /Galaxy S22/ }));
    await flush();

    expect(mock.recordSearchSelection).toHaveBeenCalledWith(42, 'inv-aaa', 'catalog');
  });

  it('short filter queries are never recorded even though filtering still works', async () => {
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'mock-cascade' }));
    fireEvent.click(screen.getByRole('button', { name: /متابعة بدون تحديد إصدار|mock-variant/i }));
    fireEvent.click(screen.getByRole('button', { name: /^New$/ }));
    fireEvent.click(screen.getByRole('button', { name: /استبدال/ }));

    const filterInput = screen.getByPlaceholderText('ابحث في المخزون...');
    fireEvent.change(filterInput, { target: { value: 'q' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    // Filtering itself still applied (UX untouched)…
    expect(screen.queryByRole('button', { name: /Galaxy S22/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Redmi Note 12/ })).toBeNull();
    // …but nothing was recorded.
    expect(mock.recordPhoneSearch).not.toHaveBeenCalledWith('q', expect.anything(), 'catalog');
  });
});

// ─── Structural pins: both screens share the same implementation ────────────

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readSrc = (p: string) =>
  readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('structural pins — single shared analytics path, no parallel systems', () => {
  it('ShowroomScreen delegates to useSearchAnalytics (no inline duplicates)', () => {
    const src = readSrc(join('screens', 'showroom', 'ShowroomScreen.tsx'));
    expect(src).toContain("useSearchAnalytics('showroom')");
    expect(src).toContain('linkSelection(device.id)');
    expect(src).not.toContain('record_phone_search');
    expect(src).toMatch(/recordSearch\(state\.query,\s*visible\.length\)/);
  });

  it('CustomerPhoneFlow wires both catalog integration points', () => {
    const src = readSrc(join('screens', 'phone-services', 'CustomerPhoneFlow.tsx'));
    expect(src).toContain("useSearchAnalytics('catalog')");
    expect(src).toContain("recordPhoneSearch(query, resultsCount, 'catalog')");
    expect(src).toContain('linkSelection(device.id)');
    expect(src).toContain('onSearchCommitted={handleModelSearchCommitted}');
  });

  it('CatalogCascadeSelector declares + fires onSearchCommitted only from typed-search commit', () => {
    const selector = readSrc(join('components', 'catalog', 'CatalogCascadeSelector.tsx'));
    expect(selector).toMatch(/onSearchCommitted\?\s*:\s*\(query: string, resultsCount: number\) => void/);
    expect(selector).toContain('onSearchCommitted?.(searchQuery.trim(), searchResults.length)');
  });
});
