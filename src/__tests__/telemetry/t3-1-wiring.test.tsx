import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { CartProvider } from '../../core/cart/CartContext';
import { ShowroomControls } from '../../components/showroom/ShowroomControls';
import { PhoneShowroom } from '../../components/showroom/PhoneShowroom';
import { ProductDetailsScreen } from '../../screens/showroom/ProductDetailsScreen';
import { InventoryService } from '../../services/inventory-service';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { resetFakeCentralDb, seedFakeCentralDb } from '../helpers/fake-central-inventory';
import type { ShowroomUiState } from '../../hooks/useShowroomState';
import type { InventoryRecord } from '../../services/inventory-service';
import type { TelemetryEventInput } from '../../core/telemetry';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../core/telemetry', () => ({
  track: mockTrack,
}));

function trackEvents(): TelemetryEventInput[] {
  return (mockTrack.mock.calls as Array<[TelemetryEventInput]>).map((c) => c[0]);
}

vi.mock('../../components/ads/AdSpot', () => ({ AdSpot: () => null }));
const mockSend = vi.hoisted(() => vi.fn());
const mockRecordIntent = vi.hoisted(() => vi.fn());
vi.mock('../../providers/WhatsAppProvider', () => ({
  useWhatsApp: () => ({ send: mockSend, modal: null, retryOpen: vi.fn(), copyMessage: vi.fn(async () => true), closeModal: vi.fn(), setToast: vi.fn() }),
}));
vi.mock('../../services/intent-tracking', () => ({ recordIntent: mockRecordIntent }));

/**
 * Fakes IntersectionObserver so impression tests can simulate real visibility
 * without a DOM environment. The observer immediately reports a (configurable)
 * intersection ratio; the hook then requires ratio >= threshold for durationMs
 * (mocked to near-zero) before firing.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  static ratio = 0;
  callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void;
  constructor(cb: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void) {
    this.callback = cb;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  static emit(): void {
    for (const inst of FakeIntersectionObserver.instances) {
      inst.callback([{ isIntersecting: FakeIntersectionObserver.ratio >= 0.6, intersectionRatio: FakeIntersectionObserver.ratio }]);
    }
  }
  static reset(): void {
    FakeIntersectionObserver.instances = [];
    FakeIntersectionObserver.ratio = 0;
  }
}

function installObserver() {
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
}
function cleanupObserver() {
  vi.unstubAllGlobals();
}

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

const initial: ShowroomUiState = { scrollY: 0, query: '', condition: 'all', city: '', sort: 'latest', category: 'phone' };
const otDevice = makeDevice({ id: 'ot', brand: 'X', model: 'Y', city: 'الجزائر' });

describe('T3.1 wiring — ShowroomControls telemetry', () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  function renderControls(state: Partial<ShowroomUiState> = {}, onChange = vi.fn(), devices: InventoryRecord[] = [otDevice]) {
    render(
      <ThemeProvider>
        <TranslationProvider>
          <ShowroomControls devices={devices} state={{ ...initial, ...state }} onChange={onChange} />
        </TranslationProvider>
      </ThemeProvider>,
    );
    return onChange;
  }

  it('category_filter — condition change sends filter/active with category identifier', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(mockTrack).toHaveBeenCalledWith({
      event: 'category_filter',
      entityType: 'category',
      entityId: 'phone',
      properties: { filter: 'condition', active: true },
    });
  });

  it('category_filter — city change sends filter/active', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: /الجزائر/ }));
    expect(mockTrack).toHaveBeenCalledWith({
      event: 'category_filter',
      entityType: 'category',
      entityId: 'phone',
      properties: { filter: 'city', active: true },
    });
  });

  it('category_sort — sends sort value with category identifier', () => {
    renderControls();
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'expensive' } });
    expect(mockTrack).toHaveBeenCalledWith({
      event: 'category_sort',
      entityType: 'category',
      entityId: 'phone',
      properties: { sort: 'expensive' },
    });
  });

  it('no telemetry on duplicate selection (guard prevents refire)', () => {
    renderControls({ condition: 'new' });
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

describe('T3.1 wiring — PhoneShowroom product_impression', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    installObserver();
    FakeIntersectionObserver.reset();
  });
  afterEach(() => {
    cleanupObserver();
    vi.useRealTimers();
  });

  function renderShowroom() {
    const devices = [makeDevice({ id: 'p0' }), makeDevice({ id: 'p1' })];
    const onSelect = vi.fn();
    render(
      <ThemeProvider>
        <TranslationProvider>
          <PhoneShowroom devices={devices} onSelect={onSelect} />
        </TranslationProvider>
      </ThemeProvider>,
    );
    return onSelect;
  }

  it('does NOT fire product_impression on mount/render alone (no real visibility)', () => {
    renderShowroom();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('fires product_impression with position once a phone is actually visible', () => {
    vi.useFakeTimers();
    renderShowroom();
    act(() => {
      FakeIntersectionObserver.ratio = 1;
      FakeIntersectionObserver.emit();
    });
    expect(mockTrack).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    const calls = trackEvents();
    const impressions = calls.filter((c) => c.event === 'product_impression');
    expect(impressions.length).toBeGreaterThan(0);
    const p0 = impressions.find((c) => c.entityId === 'p0');
    const p1 = impressions.find((c) => c.entityId === 'p1');
    expect(p0).toMatchObject({ entityType: 'product', properties: { position: 0 } });
    expect(p1).toMatchObject({ entityType: 'product', properties: { position: 1 } });
  });

  it('does not fire before the visibility window elapses', () => {
    vi.useFakeTimers();
    renderShowroom();
    act(() => {
      FakeIntersectionObserver.ratio = 1;
      FakeIntersectionObserver.emit();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockTrack).not.toHaveBeenCalled();
  });
});

describe('T3.1 wiring — ProductDetailsScreen', () => {
  beforeEach(async () => {
    mockTrack.mockClear();
    localStorage.clear();
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    await bootstrapCentralInventory();
  });
  afterEach(() => {
    localStorage.clear();
  });

  function GoTo({ id }: { id: string }) {
    const dispatch = useAppDispatch();
    useEffect(() => {
      dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: id } });
    }, [dispatch, id]);
    return null;
  }

  function renderScreen(id: string) {
    return render(
      <AppProvider>
        <ThemeProvider>
          <TranslationProvider>
            <CartProvider>
              <GoTo id={id} />
              <ProductDetailsScreen />
            </CartProvider>
          </TranslationProvider>
        </ThemeProvider>
      </AppProvider>,
    );
  }

  it('product_view fires once with the loaded product id', async () => {
    const target = InventoryService.getExchangeableDevices()[0]!;
    renderScreen(target.id);
    await waitFor(() => {
      const view = trackEvents().find((c) => c.event === 'product_view');
      expect(view).toBeTruthy();
      expect(view).toMatchObject({ entityType: 'product', entityId: target.id });
    });
  });

  it('cart_add sends entityId + qty only', async () => {
    const target = InventoryService.getExchangeableDevices()[0]!;
    renderScreen(target.id);
    const addBtn = await screen.findByRole('button', { name: /Add to request cart/i });
    fireEvent.click(addBtn);
    await waitFor(() => {
      const add = trackEvents().find((c) => c.event === 'cart_add');
      expect(add).toMatchObject({ entityType: 'product', entityId: target.id, properties: { qty: 1 } });
    });
  });

  it('product_share sends method only', async () => {
    const target = InventoryService.getExchangeableDevices()[0]!;
    renderScreen(target.id);
    const shareBtn = await screen.findByRole('button', { name: /Share/i });
    // jsdom has no navigator.share, so the component takes the clipboard branch
    // (method: 'clipboard').
    fireEvent.click(shareBtn);
    await waitFor(() => {
      const shareEvt = trackEvents().find((c) => c.event === 'product_share');
      expect(shareEvt).toMatchObject({ entityType: 'product', entityId: target.id, properties: { method: 'clipboard' } });
    });
  });
});

