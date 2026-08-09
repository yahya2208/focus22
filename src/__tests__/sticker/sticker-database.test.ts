import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logScanWithMetadata, sanitizeStoredScans, loadStoredScans, getAllScans } from '../../services/sticker/sticker-database';
import type { StickerScanEvent } from '../../services/sticker/sticker-types';

/**
 * FOCUS v2 (2026-08-08): sticker scan flow is now PII-free.
 *  - logScanWithMetadata accepts ONLY anonymous fields (serial/campaign/cta/location).
 *  - sanitizeStoredScans() strips legacy ip/userAgent/referrer from persisted
 *    sticker_scans and is idempotent + safe when the key is absent/invalid.
 */

const STORAGE_KEY = 'sticker_scans';

function legacyStoredEvent(extra?: Record<string, unknown>) {
  return {
    id: 'SC-legacy-000001',
    serialNumber: 'ST-000042',
    campaign: 'q2-offers',
    scannedAt: '2026-07-01T10:00:00.000Z',
    cta: 'view_offers',
    location: 'Cairo',
    ip: '192.168.1.10',
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    referrer: 'https://shop.example.com/qr',
    ...extra,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('logScanWithMetadata records anonymous data only', () => {
  it('does not persist ip / userAgent / referrer fields', () => {
    const event = logScanWithMetadata('ST-000001', 'direct', 'view_offers', 'Cairo');
    const anonymous = event as unknown as Record<string, unknown>;

    expect(anonymous.ip).toBeUndefined();
    expect(anonymous.userAgent).toBeUndefined();
    expect(anonymous.referrer).toBeUndefined();
    expect(event.serialNumber).toBe('ST-000001');
    expect(event.campaign).toBe('direct');
    expect(event.cta).toBe('view_offers');
    expect(event.location).toBe('Cairo');
    expect(event.scannedAt).toBeTruthy();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty('ip');
    expect(stored[0]).not.toHaveProperty('userAgent');
    expect(stored[0]).not.toHaveProperty('referrer');
  });
});

describe('sanitizeStoredScans strips legacy PII', () => {
  it('strips ip / userAgent / referrer from a raw legacy event', () => {
    const raw = [legacyStoredEvent()];
    const sanitized = sanitizeStoredScans(raw);
    const first = sanitized[0] as StickerScanEvent | undefined;
    const anonymous = first as Record<string, unknown> | undefined;

    expect(sanitized).toHaveLength(1);
    expect(first).toBeDefined();
    expect(anonymous).not.toHaveProperty('ip');
    expect(anonymous).not.toHaveProperty('userAgent');
    expect(anonymous).not.toHaveProperty('referrer');
    expect(first!.serialNumber).toBe('ST-000042');
    expect(first!.campaign).toBe('q2-offers');
    expect(first!.location).toBe('Cairo');
  });

  it('persists the sanitized list back to localStorage when called without args', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([legacyStoredEvent()]));

    sanitizeStoredScans();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]') as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).not.toHaveProperty('ip');
    expect(stored[0]).not.toHaveProperty('userAgent');
    expect(stored[0]).not.toHaveProperty('referrer');
  });

  it('is idempotent — second pass produces identical output', () => {
    const first = sanitizeStoredScans([legacyStoredEvent()]);
    const second = sanitizeStoredScans(first);
    expect(second).toEqual(first);
  });

  it('is safe when the key is absent (no throw, nothing written)', () => {
    expect(() => sanitizeStoredScans()).not.toThrow();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('is safe when the stored value is invalid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json{');
    expect(() => sanitizeStoredScans()).not.toThrow();
  });

  it('drops malformed entries without serialNumber/campaign', () => {
    const raw = [legacyStoredEvent(), { id: 'SC-broken', scannedAt: 'x' }];
    const sanitized = sanitizeStoredScans(raw);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]!.id).toBe('SC-legacy-000001');
  });
});

describe('loadStoredScans sanitizes before importing to memory', () => {
  it('loaded legacy events carry no ip / userAgent / referrer', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([legacyStoredEvent()]));

    loadStoredScans();

    const loaded = getAllScans().filter((e) => e.id === 'SC-legacy-000001');
    const first = loaded[0] as Record<string, unknown> | undefined;

    expect(loaded).toHaveLength(1);
    expect(first).not.toHaveProperty('ip');
    expect(first).not.toHaveProperty('userAgent');
    expect(first).not.toHaveProperty('referrer');
    expect(loaded[0]!.serialNumber).toBe('ST-000042');
  });

  it('is idempotent — repeated loads do not duplicate events', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([legacyStoredEvent()]));

    loadStoredScans();
    loadStoredScans();
    loadStoredScans();

    const loaded = getAllScans().filter((e) => e.id === 'SC-legacy-000001');
    expect(loaded).toHaveLength(1);
  });
});
