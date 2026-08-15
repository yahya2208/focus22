import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPhoneDestinationAdapter } from '../../services/ad-adapters/phone';
import type { AdImage } from '../../services/ads-service';
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

function adImage(path: string, overrides: Partial<AdImage> = {}): AdImage {
  return { id: `id-${path}`, path, url: `https://cdn/${path}`, position: 0, isCover: false, deviceId: '', ...overrides };
}

const PHONE_LINK = `#/phone-details?device=${DEVICE.id}`;
const UNRESOLVED_LINK = '#/phone-details?device=missing-device';

type AdapterDeps = Parameters<typeof createPhoneDestinationAdapter>[0];
type MockedDeps = AdapterDeps & {
  navigateToDetails: ReturnType<typeof vi.fn>;
  whatsappSend: ReturnType<typeof vi.fn>;
};

function makeDeps(overrides: Partial<Omit<AdapterDeps, 'navigateToDetails' | 'whatsappSend'>> = {}): MockedDeps {
  const navigateToDetails = vi.fn();
  const whatsappSend = vi.fn();
  return {
    placement: 'home',
    link: PHONE_LINK,
    images: [] as AdImage[],
    imageUrl: 'https://cdn/banner.png',
    navigateToDetails,
    whatsappSend,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PhoneDestinationAdapter (Phase 2 Step 2 — behavior-preserving extraction)', () => {
  it('exposes the four-operation destination contract with type phone', () => {
    const adapter = createPhoneDestinationAdapter(makeDeps());
    expect(adapter.type).toBe('phone');
    expect(typeof adapter.canOpenDetails).toBe('function');
    expect(typeof adapter.openDetails).toBe('function');
    expect(typeof adapter.canCallToAction).toBe('function');
    expect(typeof adapter.callToAction).toBe('function');
  });

  it('resolvable phone link → interactive contact (isContact) with the ad-level device', () => {
    const adapter = createPhoneDestinationAdapter(makeDeps());
    expect(adapter.isContact).toBe(true);
    expect(adapter.isUnresolvedPhoneLink).toBe(false);
    expect(adapter.deviceId).toBe(DEVICE.id);
    expect(adapter.canOpenDetails()).toBe(true);
    expect(adapter.canCallToAction()).toBe(true);
  });

  it('unresolvable phone link → non-interactive (never a dead target)', () => {
    const adapter = createPhoneDestinationAdapter(makeDeps({ link: UNRESOLVED_LINK }));
    expect(adapter.isContact).toBe(false);
    expect(adapter.isUnresolvedPhoneLink).toBe(true);
    expect(adapter.deviceId).toBeNull();
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
  });

  it('non-phone link → inert: no device, no interaction', () => {
    const adapter = createPhoneDestinationAdapter(makeDeps({ link: 'https://go.example' }));
    expect(adapter.isContact).toBe(false);
    expect(adapter.isUnresolvedPhoneLink).toBe(false);
    expect(adapter.deviceId).toBeNull();
    expect(adapter.canOpenDetails()).toBe(false);
    expect(adapter.canCallToAction()).toBe(false);
  });

  it('openDetails navigates to phone-details with the device id (never WhatsApp)', () => {
    const deps = makeDeps();
    const adapter = createPhoneDestinationAdapter(deps);
    adapter.openDetails();
    expect(deps.navigateToDetails).toHaveBeenCalledTimes(1);
    expect(deps.navigateToDetails).toHaveBeenCalledWith(DEVICE.id);
    expect(deps.whatsappSend).not.toHaveBeenCalled();
  });

  it('callToAction records ad_click + whatsapp_handoff_started then sends WhatsApp', () => {
    const deps = makeDeps();
    const adapter = createPhoneDestinationAdapter(deps);
    adapter.callToAction();
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: DEVICE.id });
    expect(mockRecordIntent).toHaveBeenCalledWith({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home', deviceId: DEVICE.id });
    expect(deps.whatsappSend).toHaveBeenCalledTimes(1);
    const [message, context] = deps.whatsappSend.mock.calls[0] as [string, { action: string; deviceId: string }];
    expect(context).toEqual({ action: 'inquiry', deviceId: DEVICE.id });
    expect(message).toContain(DEVICE.brand);
    expect(message).toContain('الموضع: home');
    expect(message).toContain('صورة الإعلان: https://cdn/banner.png');
  });

  it('single-frame CTA uses the ad cover URL when no slide is given', () => {
    const deps = makeDeps({ imageUrl: 'https://cdn/cover.png' });
    const adapter = createPhoneDestinationAdapter(deps);
    adapter.callToAction();
    const [message] = deps.whatsappSend.mock.calls[0] as [string];
    expect(message).toContain('صورة الإعلان: https://cdn/cover.png');
  });

  it('per-slide deviceId drives the carousel interactions (00021)', () => {
    const slide = adImage('a.jpg', { deviceId: DEVICE.id, url: 'https://cdn/a.jpg' });
    const deps = makeDeps({ images: [slide] });
    const adapter = createPhoneDestinationAdapter(deps);
    expect(adapter.hasSlideDevices).toBe(false); // single slide ≠ carousel
    expect(adapter.canOpenDetails(slide)).toBe(true);
    adapter.openDetails(slide);
    expect(deps.navigateToDetails).toHaveBeenCalledWith(DEVICE.id);
    adapter.callToAction(slide);
    const [message] = deps.whatsappSend.mock.calls[0] as [string];
    expect(message).toContain('صورة الإعلان: https://cdn/a.jpg');
  });

  it('hasSlideDevices is true only for multi-image galleries carrying a slide device', () => {
    const noDevice = makeDeps({ images: [adImage('a.jpg'), adImage('b.jpg')] });
    expect(createPhoneDestinationAdapter(noDevice).hasSlideDevices).toBe(false);
    const withDevice = makeDeps({ images: [adImage('a.jpg', { deviceId: DEVICE.id }), adImage('b.jpg')] });
    expect(createPhoneDestinationAdapter(withDevice).hasSlideDevices).toBe(true);
  });

  it('a slide without a deviceId falls back to the ad-level device', () => {
    const slide = adImage('a.jpg');
    const deps = makeDeps({ images: [slide] });
    const adapter = createPhoneDestinationAdapter(deps);
    expect(adapter.canOpenDetails(slide)).toBe(true);
    adapter.openDetails(slide);
    expect(deps.navigateToDetails).toHaveBeenCalledWith(DEVICE.id);
  });

  it('unresolvable targets are no-ops for openDetails and callToAction', () => {
    const deps = makeDeps({ link: UNRESOLVED_LINK });
    const adapter = createPhoneDestinationAdapter(deps);
    adapter.openDetails();
    adapter.callToAction();
    expect(deps.navigateToDetails).not.toHaveBeenCalled();
    expect(deps.whatsappSend).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });

  it('creates no side effects at creation time (render-safe resolve)', () => {
    const deps = makeDeps();
    createPhoneDestinationAdapter(deps);
    expect(deps.navigateToDetails).not.toHaveBeenCalled();
    expect(deps.whatsappSend).not.toHaveBeenCalled();
    expect(mockRecordIntent).not.toHaveBeenCalled();
  });
});
