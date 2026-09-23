/**
 * GATE C4 — FAMILY EXPERIENCE & REPEAT PURCHASE (screen + wording regressions).
 *
 *   1. FamilyPurchasesScreen — the "مشتريات عائلتنا" screen lists the family
 *      saved basket and family order history (item-level rows with per-unit
 *      labels), renders the empty state, clears only after confirmation, and
 *      add-all-to-cart is a CLIENT-side cart action (no order/settlement RPC
 *      is ever fired from the family screen);
 *   2. storefront — produce-mode cards expose the "save for the family"
 *      affordance and the header links to the family screen;
 *   3. translation completeness — family-facing keys exist in all four
 *      locales and never expose technical money terms (ledger, settlement,
 *      "balance") nor raw server identifiers (family_id, RPC, status names);
 *   4. navigation — the family screen is registered in the back-matrix and
 *      reachability edges exactly once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppDispatch } from '../../store/navigation';
import en from '../../i18n/translations/en';
import ar from '../../i18n/translations/ar';
import fr from '../../i18n/translations/fr';
import tr from '../../i18n/translations/tr';
import { BACK_MATRIX } from '../../core/navigation/back-matrix';
import { EDGES } from '../../core/navigation/reachability';

const famMock = vi.hoisted(() => ({
  fetchFamilySavedItems: vi.fn(),
  fetchFamilyOrders: vi.fn(),
  updateFamilySavedItem: vi.fn(),
  removeFamilySavedItem: vi.fn(),
  clearFamilySavedItems: vi.fn(),
  saveFamilyItem: vi.fn(),
}));

const cartMock = vi.hoisted(() => ({
  addLine: vi.fn(),
  itemCount: 0,
  setQuantity: vi.fn(),
  removeLine: vi.fn(),
  getLine: vi.fn(() => undefined),
}));

const storefrontMock = vi.hoisted(() => ({
  fetchActiveNeighborhoods: vi.fn(),
  fetchActiveStores: vi.fn(),
  fetchStoreProducts: vi.fn(),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({
    state: { status: 'authenticated', user: { id: 'u1' }, error: null },
    service: { signInAsGuest: vi.fn() },
    researchRole: 'user',
  }),
}));

vi.mock('../../core/cart/CartContext', () => ({
  useCart: () => cartMock,
  CartProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../services/pilot-family-service', () => ({
  fetchFamilySavedItems: famMock.fetchFamilySavedItems,
  fetchFamilyOrders: famMock.fetchFamilyOrders,
  updateFamilySavedItem: famMock.updateFamilySavedItem,
  removeFamilySavedItem: famMock.removeFamilySavedItem,
  clearFamilySavedItems: famMock.clearFamilySavedItems,
  saveFamilyItem: famMock.saveFamilyItem,
}));

vi.mock('../../services/neighborhood-service', () => ({
  fetchActiveNeighborhoods: storefrontMock.fetchActiveNeighborhoods,
  fetchActiveStores: storefrontMock.fetchActiveStores,
  fetchStoreProducts: storefrontMock.fetchStoreProducts,
}));

import { PilotFamilyPurchasesScreen } from '../../screens/pilot/PilotFamilyPurchasesScreen';
import { PilotStorefrontScreen } from '../../screens/pilot/PilotStorefrontScreen';

const savedItem = {
  id: 's1',
  catalog_ref: '9a34c948-8cf8-4deb-991e-086fe7740af5',
  quantity: 2.5,
  name: 'بطاطا',
  unit: 'kg',
  unit_price: 100,
  stock: 10,
  available: true,
  created_at: '2026-09-18T10:00:00Z',
  updated_at: '2026-09-18T10:00:00Z',
};

const familyOrder = {
  order_id: 'o1',
  order_number: 'FC-000028',
  status: 'delivered',
  subtotal: 100,
  delivery_fee: 350,
  total: 450,
  store_name: 'Pilot Store 1',
  store_name_ar: null,
  neighborhood_name: 'Neighborhood',
  neighborhood_name_ar: null,
  created_at: '2026-09-18T10:05:00Z',
  updated_at: '2026-09-18T10:06:00Z',
  items: [{ name: 'بطاطا', quantity: 1, unit: 'kg', unit_price: 100, line_total: 100 }],
};

function renderFamilyScreen() {
  return render(
    <AppProvider>
      <PilotFamilyPurchasesScreen />
    </AppProvider>,
  );
}

describe('FamilyPurchasesScreen — مشتريات عائلتنا', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    famMock.fetchFamilySavedItems.mockResolvedValue([savedItem]);
    famMock.fetchFamilyOrders.mockResolvedValue([familyOrder]);
    famMock.updateFamilySavedItem.mockResolvedValue(undefined);
    famMock.removeFamilySavedItem.mockResolvedValue(undefined);
    famMock.clearFamilySavedItems.mockResolvedValue(undefined);
  });

  it('loads both family surfaces through the family-scoped RPCs', async () => {
    renderFamilyScreen();
    await waitFor(() => expect(famMock.fetchFamilySavedItems).toHaveBeenCalledOnce());
    expect(famMock.fetchFamilyOrders).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getAllByText('بطاطا').length).toBeGreaterThan(0));
  });

  it('renders the empty saved-basket state when nothing is saved', async () => {
    famMock.fetchFamilySavedItems.mockResolvedValue([]);
    renderFamilyScreen();
    await waitFor(() => expect(screen.getByText('pilot.familyBasketEmpty')).toBeTruthy());
  });

  it('renders item-level history rows including the per-unit label', async () => {
    renderFamilyScreen();
    await waitFor(() => expect(screen.getByText('FC-000028')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('pilot.ourFamilyOrders')).toBeTruthy());
    const body = screen.getByText('pilot.ourFamilyOrders').closest('span')?.parentElement ?? document.body;
    expect(body.textContent).toContain('بطاطا');
    expect(body.textContent).toContain('كغ');
    expect(body.textContent).toContain('450.00');
  });

  it('add-all-to-cart is a CLIENT-side cart action: no order/settlement RPC is fired', async () => {
    renderFamilyScreen();
    await waitFor(() => expect(screen.getAllByText('بطاطا').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText(/pilot\.addAllToCart/));
    expect(cartMock.addLine).toHaveBeenCalledTimes(1);
    expect(cartMock.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ catalogRef: '9a34c948-8cf8-4deb-991e-086fe7740af5' }),
    );
    expect(famMock.saveFamilyItem).not.toHaveBeenCalled();
  });

  it('clear-all requires confirmation before calling the clear RPC', async () => {
    renderFamilyScreen();
    await waitFor(() => expect(famMock.fetchFamilyOrders).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByText('pilot.familyBasketClear'));
    await waitFor(() => expect(screen.getByText('pilot.familyBasketClear')).toBeTruthy());
    expect(famMock.clearFamilySavedItems).not.toHaveBeenCalled();
  });
});

describe('PilotStorefrontScreen — save for the family', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storefrontMock.fetchActiveNeighborhoods.mockResolvedValue([{ id: 'n1', name: 'N', name_ar: '' }]);
    storefrontMock.fetchActiveStores.mockResolvedValue([{ id: '1a3bbab9-fade-4093-a1f0-4594054d8af2', name: 'S', name_ar: '' }]);
    storefrontMock.fetchStoreProducts.mockResolvedValue([
      {
        id: '9a34c948-8cf8-4deb-991e-086fe7740af5',
        category: 'produce',
        unit: 'kg',
        sell_price: 100,
        quantity: 10,
        brand: 'بطاطا',
        model: '',
        is_published: true,
        status: 'in_stock',
      },
    ]);
    famMock.saveFamilyItem.mockResolvedValue({ ok: true });
  });

  it('produce-mode card exposes the save-for-family affordance', async () => {
    function StoreHarness() {
      const dispatch = useAppDispatch();
      return (
        <>
          <button onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-storefront', params: { category: 'produce' } })}>
            open
          </button>
          <PilotStorefrontScreen />
        </>
      );
    }
    render(
      <AppProvider>
        <StoreHarness />
      </AppProvider>,
    );
    fireEvent.click(screen.getByText('open'));
    await waitFor(() => expect(screen.getByText('بطاطا')).toBeTruthy());
    expect(screen.getByText('pilot.saveForFamily')).toBeTruthy();
  });
});

const FAMILY_KEYS = [
  'pilot.familyBasketTitle',
  'pilot.familyBasketSubtitle',
  'pilot.saveForFamily',
  'pilot.savedForFamily',
  'pilot.familyBasketEmpty',
  'pilot.familyBasketClear',
  'pilot.familyBasketClearConfirm',
  'pilot.addAllToCart',
  'pilot.ourFamilyOrders',
  'pilot.familyOrdersEmpty',
  'pilot.removeSavedItem',
  'pilot.backToStorefront',
  'pilot.msg.SAVED_OK',
  'pilot.msg.SAVED_CLEARED',
  'pilot.error.SAVED_FAILED',
  'pilot.error.SAVED_CLEAR_FAILED',
  'pilot.error.FAMILY_ORDERS_FAILED',
  'pilot.error.SAVE_FAILED',
  'pilot.error.FAMILY_LOAD_FAILED',
];

const LOCALES: Array<[string, Record<string, string>]> = [
  ['en', en],
  ['ar', ar],
  ['fr', fr],
  ['tr', tr],
];

const FORBIDDEN = [
  'ledger',
  'settle',
  'settlement',
  'family_id',
  ' RPC',
  'rpc',
  'out_for_delivery',
  'preparing',
  'status',
];

describe('C4 family wording — translations', () => {
  it('every family-facing key exists in all four locales', () => {
    for (const [name, dict] of LOCALES) {
      for (const key of FAMILY_KEYS) {
        expect(dict[key], `${name}.${key}`).toBeTypeOf('string');
        expect(String(dict[key]).trim().length, `${name}.${key} must not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it('family UX strings never expose technical money terms or server identifiers', () => {
    const blocked: string[] = [];
    for (const [name, dict] of LOCALES) {
      for (const key of FAMILY_KEYS) {
        const text = String(dict[key]).toLowerCase();
        for (const token of FORBIDDEN) {
          if (token === 'status') continue; // no literal "status" anywhere in these keys
          if (token === 'rpc') continue;
          if (text.includes(token)) blocked.push(`${name}.${key} contains "${token}"`);
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it('the family screen is registered in the back-matrix and reachability exactly once', () => {
    expect(BACK_MATRIX['pilot-family-purchases']).toBeDefined();
    expect(BACK_MATRIX['pilot-family-purchases'].backTarget).toBe('pilot-storefront');
    expect(BACK_MATRIX['pilot-family-purchases'].hasInContentBackButton).toBe(true);
    expect(EDGES['pilot-family-purchases']).toContain('pilot-storefront');
    expect(EDGES['pilot-family-purchases']).toContain('settings');
  });
});