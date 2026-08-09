import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractAdDeviceId, resolveAdDevice } from '../services/ad-device-resolver';
import type { InventoryRecord } from '../services/inventory-service';

vi.mock('../services/inventory-service', () => {
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
  return {
    InventoryService: { getExchangeableDevices: () => [DEVICE] },
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('M1 — ad link → phone resolver', () => {
  it('extracts a device id from a phone-details deep link', () => {
    expect(extractAdDeviceId('#/phone-details?device=rec_abcdef12')).toBe('rec_abcdef12');
    expect(extractAdDeviceId('/#/phone-details?device=rec_abcdef12&utm=1')).toBe('rec_abcdef12');
  });

  it('returns null for empty, external, or non-device links', () => {
    expect(extractAdDeviceId('')).toBeNull();
    expect(extractAdDeviceId('https://go.example')).toBeNull();
    expect(extractAdDeviceId('#/showroom')).toBeNull();
    expect(extractAdDeviceId('#/phone-details')).toBeNull();
  });

  it('resolves a known phone-linked ad to the matching listing', () => {
    const device = resolveAdDevice('#/phone-details?device=rec_abcdef12');
    expect(device).not.toBeNull();
    expect(device!.brand).toBe('Apple');
    expect(device!.model).toBe('iPhone 13');
  });

  it('returns null for an unknown device id (ad stays a normal link)', () => {
    expect(resolveAdDevice('#/phone-details?device=rec_nope')).toBeNull();
  });

  it('returns null for non-phone links even when an ad image is configured', () => {
    expect(resolveAdDevice('https://go.example')).toBeNull();
  });
});
