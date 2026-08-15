import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDestination } from '../../services/ad-destination-resolver';
import type { AdConfig } from '../../services/ads-service';
import type { InventoryRecord } from '../../services/inventory-service';
import type { PhoneDestinationAdapter } from '../../services/ad-adapters/phone';
import type { ExternalDestinationAdapter } from '../../services/ad-adapters/external';
import type { WhatsAppDestinationAdapter } from '../../services/ad-adapters/whatsapp';
import type { InternalDestinationAdapter } from '../../services/ad-adapters/internal';

vi.mock('../../services/intent-tracking', () => ({
  recordIntent: vi.fn(),
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

const PHONE_LINK = `#/phone-details?device=${DEVICE.id}`;

function makeAd(overrides: Partial<AdConfig> = {}): AdConfig {
  return {
    enabled: true,
    image: 'https://cdn/banner.png',
    link: PHONE_LINK,
    alt: 'Contact for this phone',
    deviceId: DEVICE.id,
    destinationType: 'phone',
    destination: {},
    title: '',
    images: [],
    ...overrides,
  };
}

function makeDeps() {
  const navigateToDetails = vi.fn();
  const whatsappSend = vi.fn();
  const openInNewTab = vi.fn();
  const openChat = vi.fn();
  const navigateTo = vi.fn();
  return { placement: 'home' as const, navigateToDetails, whatsappSend, openInNewTab, openChat, navigateTo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveDestination (Phase 2 Steps 3–6 — phone/external/whatsapp/internal)', () => {
  it('destinationType=phone resolves through the PhoneDestinationAdapter', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(makeAd(), deps) as PhoneDestinationAdapter;
    expect(adapter.type).toBe('phone');
    expect(adapter.deviceId).toBe(DEVICE.id);
    expect(adapter.isContact).toBe(true);
    expect(adapter.canOpenDetails()).toBe(true);
  });

  it('missing/undefined destinationType is treated as phone', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(makeAd({ destinationType: undefined }), deps) as PhoneDestinationAdapter;
    expect(adapter.type).toBe('phone');
    expect(adapter.deviceId).toBe(DEVICE.id);
    expect(adapter.isContact).toBe(true);
  });

  it('destination={} with a legacy link/device_id keeps working without re-save', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(makeAd({ destination: {} }), deps) as PhoneDestinationAdapter;
    expect(adapter.type).toBe('phone');
    expect(adapter.isContact).toBe(true);
    adapter.openDetails();
    expect(deps.navigateToDetails).toHaveBeenCalledWith(DEVICE.id);
    adapter.callToAction();
    expect(deps.whatsappSend).toHaveBeenCalledTimes(1);
  });

  it('destinationType=external resolves through the ExternalDestinationAdapter', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(
      makeAd({ destinationType: 'external', destination: { external: { url: 'https://go.example' } } }),
      deps,
    ) as ExternalDestinationAdapter;
    expect(adapter.type).toBe('external');
    expect(adapter.isValid).toBe(true);
    expect(adapter.url).toBe('https://go.example');
    expect(adapter.canCallToAction()).toBe(true);
  });

  it('external uses the destination payload URL, never the legacy phone link/device_id', () => {
    const deps = makeDeps();
    // The ad ALSO carries a legacy phone link + deviceId — the external adapter
    // must ignore them completely (no extractAdDeviceId/resolveAdDevice leak).
    const adapter = resolveDestination(
      makeAd({
        link: PHONE_LINK,
        deviceId: DEVICE.id,
        destinationType: 'external',
        destination: { external: { url: 'https://go.example' } },
      }),
      deps,
    ) as ExternalDestinationAdapter;
    expect(adapter.type).toBe('external');
    expect(adapter.url).toBe('https://go.example');
    expect(adapter.isValid).toBe(true);
    // No phone surface leaks onto the external adapter.
    expect(adapter).not.toHaveProperty('deviceId');
    expect(adapter).not.toHaveProperty('isContact');
  });

  it('external with no/invalid payload URL is non-interactive (never-dead-target)', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(
      makeAd({ destinationType: 'external', destination: {} }),
      deps,
    ) as ExternalDestinationAdapter;
    expect(adapter.type).toBe('external');
    expect(adapter.isValid).toBe(false);
    expect(adapter.url).toBe('');
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
    adapter.callToAction();
    expect(deps.openInNewTab).not.toHaveBeenCalled();
  });

  it('destinationType=whatsapp resolves through the WhatsAppDestinationAdapter', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(
      makeAd({ destinationType: 'whatsapp', destination: { whatsapp: { number: '0556254007', message: 'مرحبا' } } }),
      deps,
    ) as WhatsAppDestinationAdapter;
    expect(adapter.type).toBe('whatsapp');
    expect(adapter.isValid).toBe(true);
    expect(adapter.number).toBe('213556254007');
    expect(adapter.message).toBe('مرحبا');
    expect(adapter.canCallToAction()).toBe(true);
  });

  it('whatsapp uses the destination payload, never the legacy phone link/device_id', () => {
    const deps = makeDeps();
    // The ad ALSO carries a legacy phone link + deviceId — the whatsapp adapter
    // must ignore them completely (strict separation).
    const adapter = resolveDestination(
      makeAd({
        link: PHONE_LINK,
        deviceId: DEVICE.id,
        destinationType: 'whatsapp',
        destination: { whatsapp: { number: '+213556254007' } },
      }),
      deps,
    ) as WhatsAppDestinationAdapter;
    expect(adapter.type).toBe('whatsapp');
    expect(adapter.number).toBe('213556254007');
    expect(adapter.isValid).toBe(true);
    expect(adapter).not.toHaveProperty('deviceId');
    expect(adapter).not.toHaveProperty('isContact');
  });

  it('whatsapp with no/invalid payload number is non-interactive (never-dead-target)', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(
      makeAd({ destinationType: 'whatsapp', destination: { whatsapp: {} } }),
      deps,
    ) as WhatsAppDestinationAdapter;
    expect(adapter.type).toBe('whatsapp');
    expect(adapter.isValid).toBe(false);
    expect(adapter.number).toBe('');
    adapter.callToAction();
    expect(deps.openChat).not.toHaveBeenCalled();
  });

  it('destinationType=internal resolves through the InternalDestinationAdapter', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(
      makeAd({ destinationType: 'internal', destination: { internal: { screen: 'showroom' } } }),
      deps,
    ) as InternalDestinationAdapter;
    expect(adapter.type).toBe('internal');
    expect(adapter.isValid).toBe(true);
    expect(adapter.screen).toBe('showroom');
    expect(adapter.canCallToAction()).toBe(true);
  });

  it('internal uses the destination payload, never the legacy phone link/device_id', () => {
    const deps = makeDeps();
    // The ad ALSO carries a legacy phone link + deviceId — the internal adapter
    // must ignore them completely (strict separation).
    const adapter = resolveDestination(
      makeAd({
        link: PHONE_LINK,
        deviceId: DEVICE.id,
        destinationType: 'internal',
        destination: { internal: { screen: 'showroom' } },
      }),
      deps,
    ) as InternalDestinationAdapter;
    expect(adapter.type).toBe('internal');
    expect(adapter.screen).toBe('showroom');
    expect(adapter.isValid).toBe(true);
    expect(adapter).not.toHaveProperty('deviceId');
    expect(adapter).not.toHaveProperty('isContact');
  });

  it('internal with an invalid payload is non-interactive (never-dead-target)', () => {
    const deps = makeDeps();
    const adapter = resolveDestination(
      makeAd({ destinationType: 'internal', destination: { internal: { screen: 'not-allowlisted' } } }),
      deps,
    ) as InternalDestinationAdapter;
    expect(adapter.type).toBe('internal');
    expect(adapter.isValid).toBe(false);
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
    adapter.callToAction();
    expect(deps.navigateTo).not.toHaveBeenCalled();
  });

  it('creates no side effects at resolve time (render-safe)', () => {
    const deps = makeDeps();
    resolveDestination(makeAd(), deps);
    resolveDestination(makeAd({ destinationType: 'external', destination: { external: { url: 'https://go.example' } } }), deps);
    resolveDestination(makeAd({ destinationType: 'whatsapp', destination: { whatsapp: { number: '0556254007' } } }), deps);
    resolveDestination(makeAd({ destinationType: 'internal', destination: { internal: { screen: 'showroom' } } }), deps);
    expect(deps.navigateToDetails).not.toHaveBeenCalled();
    expect(deps.whatsappSend).not.toHaveBeenCalled();
    expect(deps.openInNewTab).not.toHaveBeenCalled();
    expect(deps.openChat).not.toHaveBeenCalled();
    expect(deps.navigateTo).not.toHaveBeenCalled();
  });
});
