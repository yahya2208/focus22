import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInternalDestinationAdapter, INTERNAL_AD_ALLOWLIST, type InternalScreen } from '../../services/ad-adapters/internal';
import type { InventoryRecord } from '../../services/inventory-service';

const mockRecordIntent = vi.hoisted(() => vi.fn());

vi.mock('../../services/intent-tracking', () => ({
  recordIntent: mockRecordIntent,
}));

const DEVICE: InventoryRecord = {
  id: 'rec_abcdef12',
  modelId: 'apple-iphone-13',
  brand: 'Apple',
  model: 'iPhone 13',
  variant: '128GB',
  ram: '4GB',
  storage: '128GB',
  condition: 'New',
  quantity: 1,
  sellPrice: 98000,
  city: 'الجزائر',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  totalPurchased: 1,
  totalSold: 0,
};

vi.mock('../../services/inventory-service', () => ({
  InventoryService: {
    getExchangeableDevices: () => [DEVICE],
  },
}));

type AdapterDeps = Parameters<typeof createInternalDestinationAdapter>[0];
type MockedDeps = AdapterDeps & {
  navigateTo: ReturnType<typeof vi.fn>;
};

function makeDeps(overrides: Partial<Omit<AdapterDeps, 'navigateTo'>> = {}): MockedDeps {
  const navigateTo = vi.fn();
  return {
    placement: 'home',
    screen: 'showroom',
    params: undefined,
    navigateTo,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InternalDestinationAdapter (Phase 2 Step 6)', () => {
  it('exposes the four-operation destination contract with type internal', () => {
    const adapter = createInternalDestinationAdapter(makeDeps());
    expect(adapter.type).toBe('internal');
    expect(typeof adapter.canOpenDetails).toBe('function');
    expect(typeof adapter.openDetails).toBe('function');
    expect(typeof adapter.canCallToAction).toBe('function');
    expect(typeof adapter.callToAction).toBe('function');
  });

  it('the allowlist is a FIXED literal (no auto-expansion to all ScreenName)', () => {
    expect(INTERNAL_AD_ALLOWLIST).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
    // Deliberately NOT derived from ALL_SCREEN_NAMES — other valid screens
    // (e.g. home, game, settings) must stay rejected below.
    const typed: readonly InternalScreen[] = [...INTERNAL_AD_ALLOWLIST];
    expect(typed.length).toBe(4);
  });

  it('accepts every allowlisted screen with string params', () => {
    for (const screen of INTERNAL_AD_ALLOWLIST) {
      const params = screen === 'phone-details' ? { device: DEVICE.id } : { tab: 'offers' };
      const adapter = createInternalDestinationAdapter(makeDeps({ screen, params }));
      expect(adapter.isValid).toBe(true);
      expect(adapter.screen).toBe(screen);
      expect(adapter.canOpenDetails()).toBe(true);
      expect(adapter.canCallToAction()).toBe(true);
    }
  });

  it('rejects a valid-but-not-allowlisted screen (auto-expansion guard)', () => {
    // 'game' IS a ScreenName — the allowlist must still reject it.
    const adapter = createInternalDestinationAdapter(makeDeps({ screen: 'game' }));
    expect(adapter.isValid).toBe(false);
    expect(adapter.screen).toBeNull();
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
  });

  it('rejects an empty / non-string screen', () => {
    expect(createInternalDestinationAdapter(makeDeps({ screen: '' })).isValid).toBe(false);
    expect(createInternalDestinationAdapter(makeDeps({ screen: '   ' })).isValid).toBe(false);
    // The resolver passes '' for non-string payloads; the adapter also guards.
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom ' })).isValid).toBe(true);
  });

  it('phone-details without a device param is non-interactive (never-dead-target)', () => {
    const deps = makeDeps({ screen: 'phone-details', params: {} });
    const adapter = createInternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(false);
    adapter.openDetails();
    adapter.callToAction();
    expect(deps.navigateTo).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('phone-details with a stale/unresolvable device is non-interactive (no fallback to legacy deviceId)', () => {
    // The ad payload names a device NOT in the inventory — the adapter must
    // NOT fall back to any legacy ads.link / ads.deviceId.
    const deps = makeDeps({ screen: 'phone-details', params: { device: 'ghost-device' } });
    const adapter = createInternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(false);
    adapter.openDetails();
    adapter.callToAction();
    expect(deps.navigateTo).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('rejects non-plain params (array, null, primitive) — no coercion', () => {
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: ['x'] })).isValid).toBe(false);
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: null })).isValid).toBe(false);
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: 'offers' })).isValid).toBe(false);
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: 42 })).isValid).toBe(false);
  });

  it('rejects nested-object params and non-string values — no coercion', () => {
    expect(
      createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: { nested: { deep: true } } })).isValid,
    ).toBe(false);
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: { tab: 123 } })).isValid).toBe(false);
    expect(createInternalDestinationAdapter(makeDeps({ screen: 'showroom', params: { tab: null } })).isValid).toBe(false);
  });

  it('params are optional — absent → {} and valid for non-phone-details screens', () => {
    const adapter = createInternalDestinationAdapter(makeDeps({ screen: 'phone-services' }));
    expect(adapter.isValid).toBe(true);
    expect(adapter.params).toEqual({});
  });

  it('callToAction navigates to the SAME internal target with screen + params', () => {
    const deps = makeDeps({ screen: 'showroom', params: { tab: 'offers' } });
    const adapter = createInternalDestinationAdapter(deps);
    adapter.callToAction();
    expect(deps.navigateTo).toHaveBeenCalledTimes(1);
    expect(deps.navigateTo).toHaveBeenCalledWith('showroom', { tab: 'offers' });
    // ad_click placement-only (no device — target is not phone-details).
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: undefined });
    expect(mockRecordIntent).toHaveBeenCalledTimes(1);
  });

  it('openDetails routes to the same internal target (symmetric)', () => {
    const deps = makeDeps({ screen: 'showroom' });
    const adapter = createInternalDestinationAdapter(deps);
    adapter.openDetails();
    expect(deps.navigateTo).toHaveBeenCalledTimes(1);
    expect(deps.navigateTo).toHaveBeenCalledWith('showroom', {});
    expect(mockRecordIntent).toHaveBeenCalledTimes(1);
  });

  it('phone-details ad_click passes deviceId only for the phone-details target', () => {
    const deps = makeDeps({ screen: 'phone-details', params: { device: DEVICE.id } });
    const adapter = createInternalDestinationAdapter(deps);
    adapter.callToAction();
    expect(deps.navigateTo).toHaveBeenCalledWith('phone-details', { device: DEVICE.id });
    expect(mockRecordIntent).toHaveBeenCalledWith({
      kind: 'click',
      ctaType: 'ad_click',
      placement: 'home',
      deviceId: DEVICE.id,
    });
  });

  it('tracking failure never blocks navigation (fire-and-forget)', () => {
    mockRecordIntent.mockImplementation(() => {
      throw new Error('tracking down');
    });
    const deps = makeDeps({ screen: 'showroom' });
    const adapter = createInternalDestinationAdapter(deps);
    expect(() => adapter.callToAction()).not.toThrow();
    expect(deps.navigateTo).toHaveBeenCalledTimes(1);
  });

  it('never-dead-target: an invalid adapter is non-interactive with no side effects', () => {
    const deps = makeDeps({ screen: 'settings', params: { x: 'y' } });
    const adapter = createInternalDestinationAdapter(deps);
    expect(adapter.isValid).toBe(false);
    expect(adapter.screen).toBeNull();
    expect(adapter.params).toEqual({});
    adapter.openDetails();
    adapter.callToAction();
    expect(deps.navigateTo).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('never exposes phone surfaces (no deviceId, no isContact leak)', () => {
    const adapter = createInternalDestinationAdapter(makeDeps({ screen: 'phone-details', params: { device: DEVICE.id } }));
    expect(adapter).not.toHaveProperty('deviceId');
    expect(adapter).not.toHaveProperty('isContact');
    expect(adapter).not.toHaveProperty('hasSlideDevices');
  });

  it('creates no side effects at creation time (render-safe resolve)', () => {
    const deps = makeDeps({ screen: 'showroom', params: { tab: 'offers' } });
    createInternalDestinationAdapter(deps);
    expect(deps.navigateTo).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });
});
