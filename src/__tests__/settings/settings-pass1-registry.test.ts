import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Admin Control Center — Pass 1 (00063).
 *
 * Proves the 13 A-class operational settings are correctly registered with the
 * right types/categories/defaults/bounds, that string (text) and enum settings
 * resolve with validation + safe fallback through both the settings-api layer
 * and the runtime-settings runtime accessors, and that the Pass-1 registry
 * never leaks scientific/security keys.
 */

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, getSupabaseClient: vi.fn(() => ({ rpc })) };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import {
  loadRuntimeSettings,
  getRuntimeSetting,
  getRuntimeSettingString,
  getRuntimeSettingList,
  clearRuntimeSettingsCache,
} from '../../core/config/runtime-settings';
import {
  SETTING_REGISTRY,
  SETTING_DEFAULTS,
  resolveSettingString,
  resolveSettingList,
  isNumericSetting,
  type SettingMeta,
} from '../../business-intelligence/settings-api';

const PASS1_KEYS = [
  'commerce.currencies',
  'comm.whatsapp_phone',
  'comm.whatsapp_guard_timeout_ms',
  'comm.whatsapp_min_digits',
  'comm.whatsapp_max_digits',
  'comm.whatsapp_message_max_length',
  'comm.double_exit_window_ms',
  'marketplace.listing_page_limit',
  'marketplace.similar_phones_limit',
  'ads.carousel_autoplay_ms',
  'ads.carousel_swipe_threshold_px',
  'experience.results_auto_advance_ms',
  'experience.gallery_autoplay_ms',
];

beforeEach(() => {
  vi.clearAllMocks();
  clearRuntimeSettingsCache();
});

describe('Pass-1 registry — 13 A-class keys present with correct shape', () => {
  it('registry contains all 13 Pass-1 keys', () => {
    for (const key of PASS1_KEYS) {
      expect(SETTING_REGISTRY.some((s) => s.key === key), `missing ${key}`).toBe(true);
    }
  });

  it('defaults map has 33 entries (20 base+telemetry + 13 Pass-1)', () => {
    expect(Object.keys(SETTING_DEFAULTS)).toHaveLength(33);
    expect(Object.keys(SETTING_DEFAULTS)).toEqual(expect.arrayContaining(PASS1_KEYS));
  });

  it('text/enum keys are correctly typed and categorized', () => {
    const byKey = new Map(SETTING_REGISTRY.map((s) => [s.key, s]));

    const phone = byKey.get('comm.whatsapp_phone') as SettingMeta;
    expect(phone.type).toBe('text');
    expect(phone.category).toBe('marketplace');
    expect(phone.pattern).toBe('^\\+[0-9]{8,15}$');
    expect(phone.defaultValue).toBe('+213556254007');

    const currencies = byKey.get('commerce.currencies') as SettingMeta;
    expect(currencies.type).toBe('enum');
    expect(currencies.category).toBe('general');
    expect([...(currencies.options ?? [])]).toEqual(['USD', 'DA', 'SAR', 'EUR', 'TRY']);
  });

  it('every numeric Pass-1 key has numeric bounds and in-range defaults', () => {
    for (const key of PASS1_KEYS) {
      const meta = SETTING_REGISTRY.find((s) => s.key === key)!;
      if (!isNumericSetting(meta)) continue;
      expect(meta.min).toBeDefined();
      expect(meta.max).toBeDefined();
      expect(meta.defaultValue).toBeGreaterThanOrEqual(meta.min!);
      expect(meta.defaultValue).toBeLessThanOrEqual(meta.max!);
    }
  });

  it('does not extend into scientific or security territory', () => {
    for (const key of PASS1_KEYS) {
      expect(key.startsWith('game.')).toBe(false); // game.* stays untouched in Pass 1
      expect(key.toLowerCase()).not.toContain('security');
      expect(key.toLowerCase()).not.toContain('secret');
      expect(key.toLowerCase()).not.toContain('credential');
      expect(key.toLowerCase()).not.toContain('capability');
    }
  });
});

describe('Pass-1 resolvers — text & enum with validated fallback', () => {
  it('resolveSettingString validates the WhatsApp line against the pattern', () => {
    const good = { 'comm.whatsapp_phone': { value: '+213600000000', category: 'marketplace', type: 'text' } };
    expect(resolveSettingString(good, 'comm.whatsapp_phone')).toBe('+213600000000');
    // not a phone -> fallback to registered default
    const bad = { 'comm.whatsapp_phone': { value: 'not-a-phone', category: 'marketplace', type: 'text' } };
    expect(resolveSettingString(bad, 'comm.whatsapp_phone')).toBe('+213556254007');
    // missing -> default
    expect(resolveSettingString(undefined, 'comm.whatsapp_phone')).toBe('+213556254007');
  });

  it('resolveSettingList filters the closed allow-list and falls back on junk', () => {
    const allowed = { 'commerce.currencies': { value: '["USD","EUR"]', category: 'general', type: 'enum' } };
    expect(resolveSettingList(allowed, 'commerce.currencies')).toEqual(['USD', 'EUR']);
    // off-allow-list element is dropped; unknown-only -> fallback to full list
    const offList = { 'commerce.currencies': { value: '["USD","BTC"]', category: 'general', type: 'enum' } };
    expect(resolveSettingList(offList, 'commerce.currencies')).toEqual(['USD']);
    const junk = { 'commerce.currencies': { value: '{bad json', category: 'general', type: 'enum' } };
    expect(resolveSettingList(junk, 'commerce.currencies')).toEqual(['USD', 'DA', 'SAR', 'EUR', 'TRY']);
    expect(resolveSettingList(undefined, 'commerce.currencies')).toEqual(['USD', 'DA', 'SAR', 'EUR', 'TRY']);
  });
});

describe('Pass-1 runtime accessors — DB source of truth + safe fallback', () => {
  function settingsWith(overrides: Record<string, string> = {}) {
    const settings: Record<string, { value: string; category: string; type: string }> = {
      'commerce.currencies': { value: '["USD","DA"]', category: 'general', type: 'enum' },
      'comm.whatsapp_phone': { value: '+213555555555', category: 'marketplace', type: 'text' },
      'marketplace.listing_page_limit': { value: '60', category: 'marketplace', type: 'integer' },
      'experience.results_auto_advance_ms': { value: '4000', category: 'experience', type: 'integer' },
      'ads.carousel_autoplay_ms': { value: '2500', category: 'ads', type: 'integer' },
    };
    for (const [k, v] of Object.entries(overrides)) {
      settings[k] = { value: v, category: k.split('.')[0]!, type: 'enum' };
    }
    return { error: null as null, settings };
  }

  it('uses DB enum and text values when the RPC succeeds', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsWith(), error: null });
    await loadRuntimeSettings();
    expect(getRuntimeSettingList('commerce.currencies')).toEqual(['USD', 'DA']);
    expect(getRuntimeSettingString('comm.whatsapp_phone')).toBe('+213555555555');
    expect(getRuntimeSetting('marketplace.listing_page_limit')).toBe(60);
    expect(getRuntimeSetting('experience.results_auto_advance_ms')).toBe(4000);
  });

  it('falls back to safe defaults when the RPC fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await loadRuntimeSettings();
    expect(getRuntimeSettingString('comm.whatsapp_phone')).toBe('+213556254007');
    expect(getRuntimeSettingList('commerce.currencies')).toEqual(['USD', 'DA', 'SAR', 'EUR', 'TRY']);
    expect(getRuntimeSetting('marketplace.listing_page_limit')).toBe(48);
    expect(getRuntimeSetting('experience.gallery_autoplay_ms')).toBe(3000);
  });

  it('falls back to the safe default when a DB value is invalid/off-bounds', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: settingsWith({ 'commerce.currencies': '["USD","DOGE"]', 'marketplace.listing_page_limit': '999999' }),
      error: null,
    });
    await loadRuntimeSettings();
    // enum: allow-list filter keeps USD, drops DOGE
    expect(getRuntimeSettingList('commerce.currencies')).toEqual(['USD']);
    // numeric: out of range -> default 48
    expect(getRuntimeSetting('marketplace.listing_page_limit')).toBe(48);
  });

  it('never throws and never returns out-of-range when cache is empty', () => {
    expect(getRuntimeSetting('marketplace.listing_page_limit', 48)).toBe(48);
    expect(getRuntimeSettingString('comm.whatsapp_phone', '+213556254007')).toBe('+213556254007');
    expect(getRuntimeSettingList('commerce.currencies', ['USD', 'DA'])).toEqual(['USD', 'DA']);
  });
});
