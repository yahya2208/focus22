/**
 * V1.6 technical-output scan: family-facing UI must never leak DB/engineering
 * vocabulary. Renders the family surfaces and fails on any banned literal
 * outside test fixtures/mocks themselves.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '../../../store/navigation';
import { PilotFamilyHomeScreen } from '../../../screens/pilot/PilotFamilyHomeScreen';
import { FamilyOrderTimeline } from '../../../screens/pilot/family/FamilyOrderTimeline';
import { OrderReceiptCard } from '../../../screens/pilot/family/OrderReceiptCard';

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ar', dir: 'rtl' }),
}));
vi.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));
vi.mock('../../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'authenticated' } }),
}));
vi.mock('../../../services/pilot-account-service', () => ({
  fetchMyFamily: vi.fn(async () => ({ family_id: 'f1', family_name: 'Al-Haddad', family_name_ar: 'عائلة الحداد' })),
  fetchMyAccount: vi.fn(async () => ({ linked: true, balance: 9230, debts: [] })),
  fetchMyFamilyContact: vi.fn(async () => ({
    family_id: 'f1', contact_name: 'أحمد', contact_phone: '0555', contact_address: 'شارع 12', contact_notes: '',
  })),
  saveMyFamilyContact: vi.fn(async (i: unknown) => i),
  fetchMyFamilyPreferences: vi.fn(async () => null),
  saveMyFamilyPreferences: vi.fn(async (i: unknown) => i),
}));
vi.mock('../../../services/order-tracking-service', () => ({
  fetchMyOrders: vi.fn(async () => [
    { order_id: 'o1', order_number: 'FC-31', status: 'preparing', total: 770, created_at: '2026-09-01', item_count: 2 },
  ]),
  mergeRealtimeOrderPayload: vi.fn((p: unknown) => p),
}));

const BANNED = [
  'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled',
  'actor_role', '(admin)', 'source_key',
];

function scan(container: HTMLElement, scope: string) {
  const text = container.textContent ?? '';
  for (const word of BANNED) {
    // Exact-token match: key names like pilot.stepConfirmed legitimately
    // contain substrings, so only standalone tokens count.
    const hit = text.split(/[^a-zA-Z_()]+/).includes(word);
    expect(hit, `${scope}: leaked technical token "${word}"`).toBe(false);
  }
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
}

describe('family UI — no technical output', () => {
  it('home hub is clean', async () => {
    const { container } = render(
      <AppProvider>
        <PilotFamilyHomeScreen />
      </AppProvider>,
    );
    await screen.findByText('pilot.familyWelcome');
    scan(container, 'family-home');
  });

  it('timeline + receipt are clean for every live status', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']) {
      const { container, unmount } = render(<FamilyOrderTimeline status={status} />);
      scan(container, `timeline:${status}`);
      unmount();
    }
    const { container } = render(
      <OrderReceiptCard
        lines={[{ name: 'طماطم', quantityText: '1.5 كغ', lineTotal: 180 }]}
        subtotal={180}
        deliveryFee={0}
        total={180}
        currency="دج"
      />,
    );
    scan(container, 'receipt');
  });
});
