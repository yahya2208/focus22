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
  isSettingsUnauthorized,
  isSettingsWriteDenied,
  resolveSetting,
  SETTING_REGISTRY,
  SETTING_DEFAULTS,
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
    });
    expect(SETTING_REGISTRY).toHaveLength(17);
  });

  it('every registry entry is within its own bounds', () => {
    for (const meta of SETTING_REGISTRY) {
      expect(meta.defaultValue).toBeGreaterThanOrEqual(meta.min);
      expect(meta.defaultValue).toBeLessThanOrEqual(meta.max);
    }
  });
});
