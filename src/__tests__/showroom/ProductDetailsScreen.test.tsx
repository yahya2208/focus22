import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { ProductDetailsScreen } from '../../screens/showroom/ProductDetailsScreen';
import { InventoryService } from '../../services/inventory-service';
import { ensureInventorySeeded } from '../../services/inventory-seed';

vi.mock('../../components/ads/AdSpot', () => ({ AdSpot: () => null }));

const mockSend = vi.hoisted(() => vi.fn());
const mockRecordIntent = vi.hoisted(() => vi.fn());

vi.mock('../../providers/WhatsAppProvider', () => ({
  useWhatsApp: () => ({
    send: mockSend,
    modal: null,
    retryOpen: vi.fn(),
    copyMessage: vi.fn(async () => true),
    closeModal: vi.fn(),
  }),
}));

vi.mock('../../services/intent-tracking', () => ({
  recordIntent: mockRecordIntent,
}));

function GoTo({ id }: { id: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'phone-details', params: { device: id } });
  }, [dispatch, id]);
  return null;
}

function ParamProbe() {
  const { routeParams } = useAppState();
  return <div data-testid="param">{routeParams.device}</div>;
}

function renderScreen(id: string) {
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          <GoTo id={id} />
          <ProductDetailsScreen />
          <ParamProbe />
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

describe('Phase 3B §3.2/§3.3 — ProductDetailsScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    ensureInventorySeeded();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders all sections: gallery, info, price, description, specs, single contact CTA, similar carousel', async () => {
    const target = InventoryService.getExchangeableDevices()[0]!;
    renderScreen(target.id);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'product gallery' })).toBeTruthy();
    });
    expect(screen.getByRole('heading', { level: 1, name: new RegExp(target.brand) })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: new RegExp(target.model) })).toBeTruthy();
    expect(screen.getByText(`${target.sellPrice!.toLocaleString()} د.ج`)).toBeTruthy();
    expect(screen.getByText(/Specifications/i)).toBeTruthy();
    expect(screen.getByText(/Similar Phones/i)).toBeTruthy();
    // BATCH 3 — exactly ONE contact CTA; no buy/exchange/installment/inquiry/sell buttons.
    expect(screen.getByRole('button', { name: /Contact the ad owner/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Buy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exchange/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Installment/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Inquiry/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sell/i })).toBeNull();
  });

  it('missing/stale id → not-available state (no blank page) + similar carousel + back button', async () => {
    renderScreen('missing-id');
    await waitFor(() => {
      expect(screen.getByText('This listing is not available')).toBeTruthy();
    });
    expect(screen.getByText(/Back to Showroom/)).toBeTruthy();
    expect(screen.getByText(/Similar Phones/i)).toBeTruthy();
  });

  it('no route param → not-found branch, no crash', async () => {
    render(
      <AppProvider>
        <ThemeProvider>
          <TranslationProvider>
            <ProductDetailsScreen />
          </TranslationProvider>
        </ThemeProvider>
      </AppProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('This listing is not available')).toBeTruthy();
    });
  });

  it('favorite shows the قريباً toast', async () => {
    const target = InventoryService.getExchangeableDevices()[0]!;
    renderScreen(target.id);
    await waitFor(() => expect(screen.getByRole('button', { name: /Contact the ad owner/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Favorite/i }));
    await waitFor(() => expect(screen.getByText(/Coming soon/i)).toBeTruthy());
  });

  it('similar-phones card navigates to another phone-details (routeParams updated)', async () => {
    const target = InventoryService.getExchangeableDevices().find((r) => r.brand === 'Samsung')!;
    renderScreen(target.id);

    await waitFor(() => {
      expect(screen.getByText(/Similar Phones/i)).toBeTruthy();
    });

    const cards = screen.getAllByRole('button', { name: /Apple/ });
    expect(cards.length).toBeGreaterThan(0);
    fireEvent.click(cards[0]!);

    await waitFor(() => {
      const param = screen.getByTestId('param').textContent;
      expect(param).not.toBe(target.id);
      expect(param).toBeTruthy();
    });
  });

  it('records whatsapp_intent exactly once with the correct deviceId and opens the existing WhatsApp path (BATCH 3)', async () => {
    const target = InventoryService.getExchangeableDevices()[0]!;
    renderScreen(target.id);

    await waitFor(() => expect(screen.getByRole('button', { name: /Contact the ad owner/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Contact the ad owner/i }));

    expect(mockRecordIntent).toHaveBeenCalledTimes(1);
    expect(mockRecordIntent).toHaveBeenCalledWith({
      kind: 'whatsapp_intent',
      ctaType: 'inquiry',
      placement: 'phone-details',
      deviceId: target.id,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('FOCUS'), { action: 'inquiry', deviceId: target.id });
  });
});
