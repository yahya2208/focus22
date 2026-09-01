import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 7 — Runtime centralization & fallback proof.
 *
 * Proves that consumers use the DB setting when available and fall back to the
 * safe hardcoded default when the RPC fails or the key/value is invalid — and
 * that the fallback defaults exactly match current hardcoded behavior, so
 * centralization never changes behavior when no DB override exists.
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
  runtimeSettingDefault,
  refreshRuntimeSettings,
  clearRuntimeSettingsCache,
} from '../../core/config/runtime-settings';
import { resolveSetting } from '../../business-intelligence/settings-api';

function okSettings(overrides: Record<string, string | number> = {}): { error: null; settings: Record<string, { value: string; category: string; type: string }> } {
  const settings: Record<string, { value: string; category: string; type: string }> = {
    'game.rounds': { value: '9', category: 'game', type: 'integer' }, // a DB override
    'game.min_delay_ms': { value: '750', category: 'game', type: 'integer' },
    'game.max_delay_ms': { value: '2890', category: 'game', type: 'integer' },
    'game.min_position_distance_pct': { value: '25', category: 'game', type: 'percent' },
    'offers.default_discount_percent': { value: '5', category: 'offers', type: 'percent' },
    'offers.default_max_usage': { value: '50', category: 'offers', type: 'integer' },
    'offers.return_discount_percent': { value: '5', category: 'offers', type: 'percent' },
    'offers.whatsapp_discount_percent': { value: '8', category: 'offers', type: 'percent' },
    'offers.whatsapp_max_usage': { value: '30', category: 'offers', type: 'integer' },
    'inventory.overstock_multiplier': { value: '3', category: 'inventory', type: 'integer' },
    'rules.inventory_low_threshold': { value: '5', category: 'rules', type: 'integer' },
    'rules.device_visitors_threshold': { value: '30', category: 'rules', type: 'integer' },
    'rules.trade_conversion_threshold': { value: '10', category: 'rules', type: 'integer' },
    'rules.visitor_count_threshold': { value: '90', category: 'rules', type: 'integer' },
    'rules.default_threshold': { value: '3', category: 'rules', type: 'integer' },
    'rules.needs_discount_visit_count': { value: '3', category: 'rules', type: 'integer' },
    'cache.max_entries': { value: '500', category: 'cache', type: 'integer' },
  };
  for (const [k, v] of Object.entries(overrides)) {
    settings[k] = { value: String(v), category: k.split('.')[0]!, type: 'integer' };
  }
  return { error: null, settings };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRuntimeSettingsCache(); // fully reset the singleton cache
});

describe('runtime settings — DB is source of truth, fallback is safe', () => {
  it('uses the DB value when the RPC succeeds', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: okSettings(), error: null });
    const flat = await loadRuntimeSettings();
    expect(flat['game.rounds']).toBe(9); // DB override applied
    expect(getRuntimeSetting('game.rounds')).toBe(9);
  });

  it('falls back to the hardcoded default when the RPC fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const flat = await loadRuntimeSettings();
    expect(flat['game.rounds']).toBe(7); // safe default, not a crash
    expect(getRuntimeSetting('game.rounds')).toBe(7);
    expect(getRuntimeSetting('game.min_delay_ms')).toBe(750);
    expect(getRuntimeSetting('cache.max_entries')).toBe(500);
  });

  it('falls back to the default when the DB value is missing or out of range', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: okSettings({ 'game.rounds': 999 }), error: null });
    const flat = await loadRuntimeSettings();
    // 999 is outside the registered bounds -> rejected -> default 7
    expect(flat['game.rounds']).toBe(7);
  });

  it('getRuntimeSetting never throws and never returns an unsafe value', async () => {
    // no load performed yet -> cache empty -> all defaults
    for (const key of ['game.rounds', 'game.min_delay_ms', 'cache.max_entries']) {
      const fallback = runtimeSettingDefault(key);
      expect(getRuntimeSetting(key, fallback)).toBe(fallback);
    }
  });

  it('runtimeSettingDefault matches the current hardcoded behavior (no change)', () => {
    // GameScreen defaults
    expect(runtimeSettingDefault('game.rounds')).toBe(7);
    expect(runtimeSettingDefault('game.min_delay_ms')).toBe(750);
    expect(runtimeSettingDefault('game.max_delay_ms')).toBe(2890);
    expect(runtimeSettingDefault('game.min_position_distance_pct')).toBe(25);
    // SmartOfferEngine defaults
    expect(runtimeSettingDefault('offers.default_discount_percent')).toBe(5);
    expect(runtimeSettingDefault('offers.default_max_usage')).toBe(50);
    // Inventory
    expect(runtimeSettingDefault('inventory.overstock_multiplier')).toBe(3);
    // UseViewCounter
    expect(runtimeSettingDefault('cache.max_entries')).toBe(500);
  });

  it('resolveSetting applies the same bounds/fallback defensively', () => {
    // with DB present and valid -> DB value
    expect(resolveSetting({ 'game.rounds': { value: '9', category: 'game', type: 'integer' } }, 'game.rounds')).toBe(9);
    // with DB absent -> default
    expect(resolveSetting(undefined, 'game.rounds')).toBe(7);
  });

  it('a transport failure does not break the app afterward (subsequent reads use defaults)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await loadRuntimeSettings();
    mocks.rpc.mockResolvedValueOnce({ data: okSettings(), error: null });
    const refreshed = await refreshRuntimeSettings();
    expect(refreshed['game.rounds']).toBe(9); // recovers once DB is back
  });
});
