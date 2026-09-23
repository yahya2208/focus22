import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider, useAppDispatch, useAppState } from '../../store/navigation';
import { CartProvider, useCart } from '../../core/cart/CartContext';
import { PilotStorefrontScreen } from '../../screens/pilot/PilotStorefrontScreen';
import type { Neighborhood, Store, PilotProduct } from '../../services/neighborhood-service';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'guest' }, service: { signInAsGuest: vi.fn() } }),
}));
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));
vi.mock('../../services/pilot-family-service', () => ({
  saveFamilyItem: vi.fn(async () => ({})),
}));

const fixtures = vi.hoisted(() => ({
  neighborhoods: [] as Neighborhood[],
  stores: [] as Store[],
  products: [] as PilotProduct[],
  images: [] as string[],
}));
vi.mock('../../services/neighborhood-service', () => ({
  fetchActiveNeighborhoods: () => Promise.resolve(fixtures.neighborhoods),
  fetchActiveStores: () => Promise.resolve(fixtures.stores),
  fetchStoreProducts: () => Promise.resolve(fixtures.products),
}));
vi.mock('../../hooks/useInventoryImages', () => ({
  useInventoryImages: () => fixtures.images,
}));

const NS: Neighborhood = { id: 'n1', name: 'N', name_ar: 'ح' } as Neighborhood;
const ST: Store = { id: 's1', name: 'S', name_ar: 'م' } as Store;
const TOMATO: PilotProduct = {
  id: 'veg-tomato',
  model_id: 'veg-tomato',
  brand: '',
  model: 'Tomato',
  variant: '',
  condition: 'Fresh',
  quantity: 10,
  status: 'in_stock',
  sell_price: 120,
  is_published: true,
  city: null,
  description: null,
  source_key: 'pilot:veg-tomato',
  category: 'produce',
  unit: 'kg',
} as PilotProduct;
const PHONE: PilotProduct = {
  id: 'ph-1',
  model_id: 'Apple iPhone 13',
  brand: 'Apple',
  model: 'iPhone 13',
  variant: '4/128',
  condition: 'Good',
  quantity: 2,
  status: 'in_stock',
  sell_price: 105000,
  is_published: true,
  city: null,
  description: null,
  source_key: null,
  category: 'phone',
  unit: null,
} as PilotProduct;

function GoProduce() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch({ type: 'NAVIGATE', screen: 'pilot-storefront', params: { category: 'produce' } });
  }, [dispatch]);
  return null;
}

function ScreenProbe() {
  const { screen: current, routeParams } = useAppState();
  return (
    <div data-testid="screen" data-params={JSON.stringify(routeParams ?? {})}>
      {current}
    </div>
  );
}

function CartProbe() {
  const { lines } = useCart();
  return (
    <div data-testid="cart">{JSON.stringify(lines.map((l) => [l.catalogRef, l.quantity, l.domain]))}</div>
  );
}

function cartLines(): [string, number, string][] {
  return JSON.parse(screen.getByTestId('cart').textContent ?? '[]');
}

function renderStorefront(produce: boolean) {
  return render(
    <AppProvider>
      <CartProvider>
        {produce ? <GoProduce /> : null}
        <PilotStorefrontScreen />
        <ScreenProbe />
        <CartProbe />
      </CartProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  fixtures.neighborhoods = [NS];
  fixtures.stores = [ST];
  fixtures.products = [TOMATO];
  fixtures.images = [];
  vi.clearAllMocks();
});

describe('PilotStorefrontScreen — produce family mode', () => {
  it('hides the operational selectors but shows the products', async () => {
    renderStorefront(true);

    await screen.findByText('Tomato');
    expect(screen.queryByLabelText('pilot.neighborhood')).toBeNull();
    expect(screen.queryByLabelText('pilot.store')).toBeNull();
  });

  it('keeps the selectors outside produce mode', async () => {
    fixtures.products = [PHONE];
    renderStorefront(false);

    await screen.findByText('Apple iPhone 13');
    expect(screen.getByLabelText('pilot.neighborhood')).toBeTruthy();
  });

  it('shows the empty-products message when the store has nothing buyable', async () => {
    fixtures.products = [];
    renderStorefront(true);

    await screen.findByText('pilot.emptyProducts');
    expect(screen.queryByText('Tomato')).toBeNull();
  });
});

describe('PilotStorefrontScreen — image tap-to-add ladder (produce)', () => {
  it('first image tap adds exactly 1 kg', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByLabelText('pilot.addToCart'));
    expect(cartLines()).toEqual([['veg-tomato', 1, 'produce']]);
  });

  it('second image tap merges to 1.5 kg (no second line)', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    const tap = screen.getByLabelText('pilot.addToCart');
    fireEvent.click(tap);
    fireEvent.click(tap);
    expect(cartLines()).toEqual([['veg-tomato', 1.5, 'produce']]);
  });

  it('plus steps +0.5 kg once the line exists', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByLabelText('pilot.addToCart'));
    fireEvent.click(screen.getByLabelText('increase'));
    expect(cartLines()).toEqual([['veg-tomato', 1.5, 'produce']]);
  });

  it('minus walks 1.5 → 1 → 0.5 without removing', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByLabelText('pilot.addToCart'));
    fireEvent.click(screen.getByLabelText('increase')); // 1.5
    fireEvent.click(screen.getByLabelText('decrease')); // 1
    expect(cartLines()).toEqual([['veg-tomato', 1, 'produce']]);
    fireEvent.click(screen.getByLabelText('decrease')); // 0.5, still present
    expect(cartLines()).toEqual([['veg-tomato', 0.5, 'produce']]);
  });

  it('minus at 0.5 kg removes the line', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByLabelText('pilot.addToCart')); // 1
    fireEvent.click(screen.getByLabelText('decrease')); // 0.5
    fireEvent.click(screen.getByLabelText('decrease')); // removed
    expect(cartLines()).toEqual([]);
  });
});

describe('PilotStorefrontScreen — non-produce behavior unchanged', () => {
  it('phone tap adds a phone-domain line; minus clamps instead of removing', async () => {
    fixtures.products = [PHONE];
    renderStorefront(false);
    await screen.findByText('Apple iPhone 13');

    fireEvent.click(screen.getByLabelText('pilot.addToCart'));
    expect(cartLines()).toEqual([['ph-1', 1, 'phone']]);
    fireEvent.click(screen.getByLabelText('decrease'));
    expect(cartLines()).toEqual([['ph-1', 1, 'phone']]);
  });
});

describe('PilotStorefrontScreen — produce artwork (no images dependency)', () => {
  it('renders the tomato artwork even when bucket images exist', async () => {
    fixtures.images = ['https://img.test/tomato.jpg'];
    const { container } = renderStorefront(true);
    await screen.findByText('Tomato');

    expect(container.querySelector('svg[data-art="veg-tomato"]')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the placeholder artwork for unknown produce keys', async () => {
    fixtures.products = [{ ...TOMATO, id: 'veg-mystery', model_id: 'veg-mystery', source_key: 'veg-dragonfruit' }];
    const { container } = renderStorefront(true);
    await screen.findByText('Tomato');

    expect(container.querySelector('svg[data-art="placeholder"]')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('non-produce cards keep the bucket image path with deterministic fallback', async () => {
    fixtures.images = ['https://img.test/phone.jpg'];
    fixtures.products = [PHONE];
    const withImage = renderStorefront(false);
    await screen.findByText('Apple iPhone 13');
    expect(withImage.container.querySelector('img')?.getAttribute('src')).toBe(
      'https://img.test/phone.jpg',
    );
    withImage.unmount();

    fixtures.images = [];
    const withoutImage = renderStorefront(false);
    await screen.findByText('Apple iPhone 13');
    expect(withoutImage.container.querySelector('img')).toBeNull();
    expect(screen.getByText('📱')).toBeTruthy();
  });
});

describe('PilotStorefrontScreen — card layout containment (V1.2)', () => {
  it('lays products out in a wrapping grid so cards never squeeze each other', async () => {
    const { container } = renderStorefront(true);
    await screen.findByText('Tomato');

    const grid = container.querySelector('[data-testid="produce-grid"]') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.style.display).toBe('grid');
  });

  it('keeps the save-for-family button inside its own product card', async () => {
    const { container } = renderStorefront(true);
    await screen.findByText('Tomato');

    const saveButton = screen.getByText('pilot.saveForFamily');
    const card = saveButton.closest('div');
    expect(card).toBeTruthy();
    // Same card contains the artwork, the title and the add button.
    expect(card!.querySelector('svg[data-art="veg-tomato"]')).toBeTruthy();
    expect(card!.textContent).toContain('Tomato');
    expect(card!.textContent).toContain('pilot.addToCart');
    void container;
  });

  it('keeps price and stock on unbreakable lines', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    const price = screen.getByText(/120\.00/) as HTMLElement;
    expect(price.style.whiteSpace).toBe('nowrap');
  });
});
describe('PilotStorefrontScreen — bottom cart button', () => {
  it('navigates to pilot-checkout with the auto-selected store', async () => {
    renderStorefront(true);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByLabelText('pilot.addToCart'));
    const buttons = screen.getAllByText(/pilot\.cart/);
    fireEvent.click(buttons[buttons.length - 1]!);

    const probe = screen.getByTestId('screen');
    expect(probe.textContent).toBe('pilot-checkout');
    expect(JSON.parse(probe.getAttribute('data-params') ?? '{}')).toEqual(
      expect.objectContaining({ storeId: 's1' }),
    );
  });
});

describe('PilotStorefrontScreen — cart survives screen remount', () => {
  function Shell({ show }: { show: boolean }) {
    return (
      <AppProvider>
        <CartProvider>
          <GoProduce />
          {show ? <PilotStorefrontScreen /> : null}
          <CartProbe />
        </CartProvider>
      </AppProvider>
    );
  }

  it('keeps the line when the screen unmounts and remounts (route-change mechanism)', async () => {
    const r = render(<Shell show />);
    await screen.findByText('Tomato');

    fireEvent.click(screen.getByLabelText('pilot.addToCart'));
    expect(cartLines()).toEqual([['veg-tomato', 1, 'produce']]);

    r.rerender(<Shell show={false} />);
    expect(screen.queryByText('Tomato')).toBeNull();

    r.rerender(<Shell show />);
    await screen.findByText('Tomato');
    expect(cartLines()).toEqual([['veg-tomato', 1, 'produce']]);
  });
});
