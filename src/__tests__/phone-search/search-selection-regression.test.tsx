import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { AppProvider } from '../../store/navigation';

/**
 * REGRESSION: a phone picked from search results MUST land in
 * phone_search_selections, linked to the ORIGINAL search event.
 *
 * Production evidence that exposed the defect: phone_search_events had 11 rows
 * while phone_search_selections stayed at 0 despite real picks. Root causes:
 *   A) The remount-after-navigation re-fired record_phone_search; the server
 *      deduped the repeat and returned no search_event_id, so selection
 *      linking was silently skipped (id coerced to 0 → falsy guard).
 *   B) ReelsFeed picks bypassed linkSelection entirely.
 */

const mock = vi.hoisted(() => ({
  recordPhoneSearch: vi.fn(),
  recordSearchSelection: vi.fn(),
  getExchangeableDevices: vi.fn(() => []),
}));

vi.mock('../../services/phone-search-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/phone-search-service')>();
  return { ...actual, recordPhoneSearch: mock.recordPhoneSearch, recordSearchSelection: mock.recordSearchSelection };
});

vi.mock('../../services/inventory-central-service', async (importOriginal) => {
  const actual = importOriginal<typeof import('../../services/inventory-central-service')>();
  return {
    ...actual,
    getInventoryReady: vi.fn(() => true),
    subscribeCentralInventory: vi.fn(() => () => {}),
    // ReelsFeed resolves slide images through this before rendering any slide.
    centralListImages: vi.fn(async (deviceId: string) => [`img-${deviceId}.jpg`]),
  };
});

vi.mock('../../services/inventory-service', () => ({
  InventoryService: {
    getExchangeableDevices: mock.getExchangeableDevices,
  },
}));

vi.mock('../../components/ad-contact/AdContactBanner', () => ({
  AdContactBanner: () => null,
}));

import { ShowroomScreen } from '../../screens/showroom/ShowroomScreen';
import { resetShowroomUiState } from '../../hooks/useShowroomState';
import { resetSearchAnalyticsRetention } from '../../hooks/useSearchAnalytics';

const devices = [
  { id: 'inv-sam', brand: 'Samsung', model: 'Galaxy S22', variant: '8/128', quantity: 2, sellPrice: 90000, images: ['sam-1.jpg'], createdAt: '2026-08-01T10:00:00Z', updatedAt: '2026-08-01T10:00:00Z' },
  { id: 'inv-xi', brand: 'Xiaomi', model: 'Redmi Note 12', variant: '6/128', quantity: 1, sellPrice: 40000, images: ['xi-1.jpg'], createdAt: '2026-08-02T10:00:00Z', updatedAt: '2026-08-02T10:00:00Z' },
];

function renderScreen() {
  return render(
    <AppProvider>
      <ThemeProvider>
        <ShowroomScreen />
      </ThemeProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  resetShowroomUiState();
  resetSearchAnalyticsRetention();
  mock.getExchangeableDevices.mockReturnValue(devices as never[]);
  // Default: server accepts the event and returns its id.
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

function searchInput(): HTMLInputElement {
  return screen.getByPlaceholderText('showroom.search') as HTMLInputElement;
}

/** Search "Samsung", let the debounce + RPC resolve. */
async function commitSamsungSearch() {
  fireEvent.change(searchInput(), { target: { value: 'Samsung' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  await flush();
}

describe('search → selection linking (phone_search_selections must receive rows)', () => {
  it('picking a grid result records the selection linked to the SAME search event — and never creates a new one', async () => {
    renderScreen();
    await commitSamsungSearch();

    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);
    expect(mock.recordPhoneSearch).toHaveBeenCalledWith('Samsung', 1, 'showroom');

    fireEvent.click(screen.getByRole('button', { name: /Galaxy S22/ }));
    await flush();

    expect(mock.recordSearchSelection).toHaveBeenCalledTimes(1);
    expect(mock.recordSearchSelection).toHaveBeenCalledWith(42, 'inv-sam', 'showroom');
    // Selection must link to the existing event, not spawn another search.
    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);
  });

  it('navigating away and back (remount with preserved query) still links the pick to the original event', async () => {
    // Reproduce production poisoning: any REPEAT recording is deduped by the
    // server and returns no id. The fix must avoid re-firing it at all.
    mock.recordPhoneSearch.mockResolvedValueOnce({ searchEventId: 42, deduped: false });
    mock.recordPhoneSearch.mockResolvedValue({ searchEventId: 0, deduped: true });

    const first = renderScreen();
    await commitSamsungSearch();
    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);

    // Simulate BACK navigation: unmount, then remount — the module-singleton
    // UI state preserves query="Samsung", fresh hook refs do not.
    first.unmount();
    renderScreen();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    // No duplicate event for the preserved query (cache hit restores the id).
    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Galaxy S22/ }));
    await flush();

    expect(mock.recordSearchSelection).toHaveBeenCalledTimes(1);
    expect(mock.recordSearchSelection).toHaveBeenCalledWith(42, 'inv-sam', 'showroom');
  });

  it('case-variant retype of a recorded query relinks from retention without a second event', async () => {
    renderScreen();
    await commitSamsungSearch(); // caches samsung → 42

    fireEvent.change(searchInput(), { target: { value: '' } }); // <2 chars resets live ref only
    fireEvent.change(searchInput(), { target: { value: 'SAMSUNG' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Galaxy S22/ }));
    await flush();

    expect(mock.recordSearchSelection).toHaveBeenCalledWith(42, 'inv-sam', 'showroom');
  });

  it('picking inside the reels feed also records the selection', async () => {
    renderScreen();
    await commitSamsungSearch();

    fireEvent.click(screen.getByRole('button', { name: /Browse all phones/ }));
    // Feed resolves slide images asynchronously before rendering slides.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await flush();
    const slide = document.querySelector('[data-testid="reels-slide-0"]') as HTMLElement;
    expect(slide).toBeTruthy();
    expect(slide.getAttribute('data-device-id')).toBe('inv-sam');
    fireEvent.click(slide);
    await flush();

    expect(mock.recordSearchSelection).toHaveBeenCalledTimes(1);
    expect(mock.recordSearchSelection).toHaveBeenCalledWith(42, 'inv-sam', 'showroom');
  });

  it('a pick with no recorded search behind it stays silent (never mis-attributed)', async () => {
    renderScreen();
    // No search committed — click straight through the grid.
    fireEvent.click(screen.getByRole('button', { name: /Galaxy S22/ }));
    await flush();
    expect(mock.recordSearchSelection).not.toHaveBeenCalled();
    expect(mock.recordPhoneSearch).not.toHaveBeenCalled();
  });
});

// ─── Structural pins: both showroom pick paths share the analytics link ─────

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readSrc = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

describe('structural pins — every pick path links selections', () => {
  it('grid AND feed handlers both call linkSelection before navigating', () => {
    const src = readSrc(join('screens', 'showroom', 'ShowroomScreen.tsx'));
    const handleSelect = src.match(/const handleSelect = [\s\S]*?\}, \[/)?.[0] ?? '';
    const handleFeedSelect = src.match(/const handleFeedSelect = [\s\S]*?\}, \[/)?.[0] ?? '';
    expect(handleSelect).toContain('linkSelection(device.id)');
    expect(handleFeedSelect).toContain('linkSelection(deviceId)');
  });

  it('hook retains cross-mount cache and resolves deduped responses without losing the id chain', () => {
    const hook = readSrc(join('hooks', 'useSearchAnalytics.ts'));
    expect(hook).toContain('resetSearchAnalyticsRetention');
    expect(hook).toContain('lastSearchByContext');
    expect(hook).toContain('result.deduped');
    expect(hook).toMatch(/normalizeQuery/);
  });

  it('service contract unchanged — same two RPC names', () => {
    const svc = readSrc(join('services', 'phone-search-service.ts'));
    expect(svc).toContain("'record_phone_search'");
    expect(svc).toContain("'record_search_selection'");
  });
});
