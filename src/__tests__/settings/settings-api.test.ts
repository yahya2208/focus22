import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 7 — Admin Settings API.
 * Verifies the client routes through the secure RPCs get_settings/set_setting,
 * distinguishes transport failure (null) from permission denial, applies
 * safe fallback defaults, and validates ranges.
 */

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    rpc,
    getSupabaseClient: vi.fn(() => ({ rpc })),
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import {
  getSettings,
  setSetting,
  getSettingsAudit,
  isSettingsUnauthorized,
  isSettingsWriteDenied,
  resolveSetting,
  SETTING_REGISTRY,
  SETTING_DEFAULTS,
  SENSITIVE_SETTING_KEYS,
  isSensitiveSetting,
  isCustomizedSetting,
} from '../../business-intelligence/settings-api';

const READ_OK = {
  error: null,
  settings: {
    'game.rounds': { value: '7', category: 'game', type: 'integer' },
    'cache.max_entries': { value: '600', category: 'cache', type: 'integer' },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSettings — routes through the secure RPC', () => {
  it('calls get_settings and returns the typed result', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: READ_OK, error: null });
    const out = await getSettings();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('get_settings');
    expect(out?.error).toBeNull();
    expect(out?.settings?.['game.rounds']?.value).toBe('7');
  });

  it('surfaces a permission denial as {error:UNAUTHORIZED}, not null', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'UNAUTHORIZED' }, error: null });
    const out = await getSettings();
    expect(out).not.toBeNull();
    expect(out?.error).toBe('UNAUTHORIZED');
    expect(isSettingsUnauthorized(out)).toBe(true);
  });

  it('returns null on a transport/RPC failure (distinct from permission denial)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const out = await getSettings();
    expect(out).toBeNull();
    expect(isSettingsUnauthorized(out)).toBe(false);
  });
});

describe('setSetting — secure write', () => {
  it('calls set_setting with the mapped params', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: null, saved: { key: 'cache.max_entries', value: 600, category: 'cache', type: 'integer' } }, error: null });
    const out = await setSetting('cache.max_entries', 600);
    expect(mocks.rpc).toHaveBeenCalledWith('set_setting', { p_key: 'cache.max_entries', p_value: 600 });
    expect(out?.error).toBeNull();
    expect(out?.saved?.key).toBe('cache.max_entries');
  });

  it('surfaces FORBIDDEN (reader-but-not-writer)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'FORBIDDEN' }, error: null });
    const out = await setSetting('game.rounds', 7);
    expect(out?.error).toBe('FORBIDDEN');
    expect(isSettingsWriteDenied(out)).toBe(true);
  });

  it('surfaces OUT_OF_RANGE', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'OUT_OF_RANGE', min: 1, max: 50 }, error: null });
    const out = await setSetting('game.rounds', 999);
    expect(out?.error).toBe('OUT_OF_RANGE');
  });

  it('surfaces INVALID_KEY for unregistered keys', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'INVALID_KEY', key: 'security.xxx' }, error: null });
    const out = await setSetting('security.xxx', 1);
    expect(out?.error).toBe('INVALID_KEY');
  });

  it('returns null on transport failure', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'net' } });
    const out = await setSetting('game.rounds', 7);
    expect(out).toBeNull();
  });
});

describe('resolveSetting — safe fallback & bounds', () => {
  it('uses the DB value when present and within bounds', () => {
    expect(resolveSetting({ 'cache.max_entries': { value: '600', category: 'cache', type: 'integer' } }, 'cache.max_entries')).toBe(600);
  });

  it('falls back to the hardcoded default when the DB is absent', () => {
    expect(resolveSetting(undefined, 'game.rounds')).toBe(SETTING_DEFAULTS['game.rounds']);
    expect(resolveSetting({}, 'game.rounds')).toBe(SETTING_DEFAULTS['game.rounds']);
  });

  it('rejects an out-of-bounds DB value and falls back', () => {
    // game.rounds max is 50
    expect(resolveSetting({ 'game.rounds': { value: '99', category: 'game', type: 'integer' } }, 'game.rounds')).toBe(SETTING_DEFAULTS['game.rounds']);
  });

  it('rejects a non-finite DB value and falls back', () => {
    expect(resolveSetting({ 'game.rounds': { value: 'NaN', category: 'game', type: 'integer' } }, 'game.rounds')).toBe(SETTING_DEFAULTS['game.rounds']);
  });

  it('never exposes out-of-bounds values even with a malformed DB entry', () => {
    const v = resolveSetting({ 'cache.max_entries': { value: '999999999', category: 'cache', type: 'integer' } }, 'cache.max_entries');
    expect(v).toBe(SETTING_DEFAULTS['cache.max_entries']);
  });
});

describe('registry defaults', () => {
  it('defaults exactly match the current hardcoded values (behavior-preserving)', () => {
    expect(SETTING_DEFAULTS).toMatchObject({
      'game.rounds': 7,
      'game.min_delay_ms': 750,
      'game.max_delay_ms': 2890,
      'game.min_position_distance_pct': 25,
      'offers.default_discount_percent': 5,
      'offers.default_max_usage': 50,
      'offers.return_discount_percent': 5,
      'offers.whatsapp_discount_percent': 8,
      'offers.whatsapp_max_usage': 30,
      'inventory.overstock_multiplier': 3,
      'rules.inventory_low_threshold': 5,
      'rules.device_visitors_threshold': 30,
      'rules.trade_conversion_threshold': 10,
      'rules.visitor_count_threshold': 90,
      'rules.default_threshold': 3,
      'rules.needs_discount_visit_count': 3,
      'cache.max_entries': 500,
      // Telemetry operational knobs (Phase 4.2) — defaults must match the
      // hardcoded fallbacks so centralization never changes behavior.
      'telemetry.max_batch': 10,
      'telemetry.flush_ms': 5000,
      'telemetry.max_buffer': 50,
    });
    expect(SETTING_REGISTRY).toHaveLength(38);
    expect(SETTING_DEFAULTS['catalog.admin_page_size']).toBe(50);
    expect(SETTING_DEFAULTS['catalog.search_result_limit']).toBe(20);
    expect(SETTING_DEFAULTS['inventory.max_images']).toBe(6);
    expect(SETTING_DEFAULTS['ads.placements']).toBe('home,phones,repair,results,exchange,phone-details,showroom');
    expect(SETTING_DEFAULTS['ads.internal_allowlist']).toBe('phone-details,showroom,phone-services,repair-home');
  });

  const ORIGINAL_33 = [
    'game.rounds', 'game.min_delay_ms', 'game.max_delay_ms', 'game.min_position_distance_pct',
    'offers.default_discount_percent', 'offers.default_max_usage', 'offers.return_discount_percent',
    'offers.whatsapp_discount_percent', 'offers.whatsapp_max_usage',
    'inventory.overstock_multiplier',
    'rules.inventory_low_threshold', 'rules.device_visitors_threshold', 'rules.trade_conversion_threshold',
    'rules.visitor_count_threshold', 'rules.default_threshold', 'rules.needs_discount_visit_count',
    'cache.max_entries',
    'telemetry.max_batch', 'telemetry.flush_ms', 'telemetry.max_buffer',
    'commerce.currencies', 'comm.whatsapp_phone', 'comm.whatsapp_guard_timeout_ms',
    'comm.whatsapp_min_digits', 'comm.whatsapp_max_digits', 'comm.whatsapp_message_max_length',
    'comm.double_exit_window_ms', 'marketplace.listing_page_limit', 'marketplace.similar_phones_limit',
    'ads.carousel_autoplay_ms', 'ads.carousel_swipe_threshold_px',
    'experience.results_auto_advance_ms', 'experience.gallery_autoplay_ms',
  ];

  it('regression: all 33 original keys are still registered exactly as before', () => {
    const byKey = new Map(SETTING_REGISTRY.map((s) => [s.key, s]));
    // 38 = 33 original + 5 new — nothing was removed or renamed.
    for (const key of ORIGINAL_33) {
      const meta = byKey.get(key);
      expect(meta, `missing original key ${key}`).toBeDefined();
      expect(meta!.key).toBe(key);
    }
    expect(SETTING_REGISTRY.some((s) => s.key === 'catalog.admin_page_size')).toBe(true);
  });

  it('00064: the five new keys mirror the DB registry shape (bounds + allow-lists)', () => {
    const byKey = new Map(SETTING_REGISTRY.map((s) => [s.key, s]));

    const adminPage = byKey.get('catalog.admin_page_size')!;
    expect(adminPage.type).toBe('integer');
    expect(adminPage.min).toBe(1);
    expect(adminPage.max).toBe(200);
    expect(adminPage.defaultValue).toBe(50);

    const search = byKey.get('catalog.search_result_limit')!;
    expect(search.type).toBe('integer');
    expect(search.min).toBe(1);
    expect(search.max).toBe(100);
    expect(search.defaultValue).toBe(20);

    const maxImages = byKey.get('inventory.max_images')!;
    expect(maxImages.type).toBe('integer');
    expect(maxImages.min).toBe(1);
    expect(maxImages.max).toBe(20);
    expect(maxImages.defaultValue).toBe(6);

    const placements = byKey.get('ads.placements')!;
    expect(placements.type).toBe('enum');
    expect([...(placements.options ?? [])]).toEqual(['home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom']);
    expect([...(placements.defaultValue as unknown as string[])]).toEqual(['home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom']);

    const allow = byKey.get('ads.internal_allowlist')!;
    expect(allow.type).toBe('enum');
    expect([...(allow.options ?? [])]).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
    expect([...(allow.defaultValue as unknown as string[])]).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
  });

  it('every numeric registry entry is within its own bounds', () => {
    for (const meta of SETTING_REGISTRY) {
      if (meta.type !== 'integer' && meta.type !== 'percent') continue;
      expect(meta.defaultValue).toBeGreaterThanOrEqual(meta.min!);
      expect(meta.defaultValue).toBeLessThanOrEqual(meta.max!);
    }
  });
});

describe('Pass-2 — sensitive keys, customization detection, audit read', () => {
  it('marks exactly the 14 sensitive keys and nothing else', () => {
    expect(SENSITIVE_SETTING_KEYS).toHaveLength(14);
    for (const key of [
      'game.rounds', 'game.min_delay_ms', 'game.max_delay_ms', 'game.min_position_distance_pct',
      'offers.default_discount_percent', 'offers.default_max_usage',
      'offers.return_discount_percent', 'offers.whatsapp_discount_percent', 'offers.whatsapp_max_usage',
      'comm.whatsapp_phone', 'marketplace.listing_page_limit',
      'telemetry.max_batch', 'telemetry.flush_ms', 'telemetry.max_buffer',
    ]) {
      expect(isSensitiveSetting(key)).toBe(true);
    }
    expect(isSensitiveSetting('cache.max_entries')).toBe(false);
    expect(isSensitiveSetting('commerce.currencies')).toBe(false);
  });

  it('isCustomizedSetting compares normalized numeric/text values', () => {
    const cache = SETTING_REGISTRY.find((s) => s.key === 'cache.max_entries')!;
    expect(isCustomizedSetting(500, cache)).toBe(false);
    expect(isCustomizedSetting(600, cache)).toBe(true);
    expect(isCustomizedSetting(undefined, cache)).toBe(false);
    const phone = SETTING_REGISTRY.find((s) => s.key === 'comm.whatsapp_phone')!;
    expect(isCustomizedSetting(phone.defaultValue, phone)).toBe(false);
    expect(isCustomizedSetting('+213000000000', phone)).toBe(true);
  });

  it('detects enum customization by sorted-element equality (order irrelevant)', () => {
    const currencies = SETTING_REGISTRY.find((s) => s.key === 'commerce.currencies')!;
    const defaultList = [...(currencies.defaultValue as unknown as string[])];
    expect(isCustomizedSetting(defaultList, currencies)).toBe(false);
    expect(isCustomizedSetting(['USD', 'DA'], currencies)).toBe(true);
    // different order of the SAME set is NOT a customization
    expect(isCustomizedSetting([...defaultList].reverse(), currencies)).toBe(false);
  });

  it('getSettingsAudit routes through the read RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { error: null, changes: [{ setting_key: 'game.rounds', old_value: { value: 7 }, new_value: { value: 9 }, updated_by: 'abc', updated_at: 't' }] },
      error: null,
    });
    const out = await getSettingsAudit('game.rounds', 20);
    expect(mocks.rpc).toHaveBeenCalledWith('get_settings_audit', { p_key: 'game.rounds', p_limit: 20 });
    expect(out?.error).toBeNull();
    expect(out?.changes?.length).toBe(1);
  });

  it('getSettingsAudit returns null on transport failure', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'net' } });
    const out = await getSettingsAudit('game.rounds');
    expect(out).toBeNull();
  });

  it('getSettingsAudit surfaces a role denial (reader-but-not-auditor)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'FORBIDDEN', changes: null }, error: null });
    const out = await getSettingsAudit('game.rounds');
    expect(out?.error).toBe('FORBIDDEN');
  });
});
