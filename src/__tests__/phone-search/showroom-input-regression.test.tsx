import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';
import { AppProvider } from '../../store/navigation';

/**
 * REGRESSION: showroom search input must remain fully functional.
 * The analytics integration observes committed queries — it must never
 * own, reset, or block the typed search value.
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
  const actual = await importOriginal<typeof import('../../services/inventory-central-service')>();
  return {
    ...actual,
    getInventoryReady: vi.fn(() => true),
    subscribeCentralInventory: vi.fn(() => () => {}),
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
  { id: 'inv-sam', brand: 'Samsung', model: 'Galaxy S22', variant: '8/128', quantity: 2, sellPrice: 90000, createdAt: '2026-08-01T10:00:00Z', updatedAt: '2026-08-01T10:00:00Z' },
  { id: 'inv-xi', brand: 'Xiaomi', model: 'Redmi Note 12', variant: '6/128', quantity: 1, sellPrice: 40000, createdAt: '2026-08-02T10:00:00Z', updatedAt: '2026-08-02T10:00:00Z' },
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
  mock.recordPhoneSearch.mockResolvedValue({ searchEventId: 42, deduped: false });
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

describe('showroom search input regression (analytics must not own input state)', () => {
  it('typing a then 16 yields exactly "a16" (decisive sequence)', () => {
    renderScreen();
    const input = searchInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: input.value + 'a' } });
    expect(input.value).toBe('a');
    fireEvent.change(input, { target: { value: input.value + '1' } });
    fireEvent.change(input, { target: { value: input.value + '6' } });
    expect(input.value).toBe('a16');
    // No analytics activity is required for this behavior.
    expect(mock.recordPhoneSearch).not.toHaveBeenCalled();
  });

  it('typing Samsung updates input.value character by character', () => {
    renderScreen();
    const input = searchInput();
    fireEvent.focus(input);
    for (const char of 'Samsung') {
      fireEvent.change(input, { target: { value: input.value + char } });
      expect(input.value === 'Samsung' || input.value.endsWith(char)).toBe(true);
    }
    expect(input.value).toBe('Samsung');
  });

  it('existing filtering behavior still works while typing', () => {
    renderScreen();
    const input = searchInput();
    fireEvent.change(input, { target: { value: 'Samsung' } });

    expect(screen.getByText('Galaxy S22')).toBeTruthy();
    expect(screen.queryByText('Redmi Note 12')).toBeNull();
  });

  it('analytics records separately after the debounced commit — not per keystroke', async () => {
    renderScreen();
    const input = searchInput();

    let value = '';
    for (const char of 'Samsung') {
      value += char;
      fireEvent.change(input, { target: { value } });
    }

    // No keystroke-level recording.
    expect(mock.recordPhoneSearch).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush();

    expect(mock.recordPhoneSearch).toHaveBeenCalledTimes(1);
    expect(mock.recordPhoneSearch).toHaveBeenCalledWith('Samsung', 1, 'showroom');
    // Input still intact after async analytics resolved.
    expect(input.value).toBe('Samsung');
  });

  it('analytics RPC failure leaves input.value unchanged and typing continues to work', async () => {
    mock.recordPhoneSearch.mockRejectedValue(new Error('rpc down'));
    renderScreen();
    const input = searchInput();

    fireEvent.change(input, { target: { value: 'Samsung' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await flush(); // rejection swallowed

    expect(input.value).toBe('Samsung');

    // Typing continues to work after the failure.
    fireEvent.change(input, { target: { value: 'Samsung Galaxy' } });
    expect(input.value).toBe('Samsung Galaxy');
  });
});
