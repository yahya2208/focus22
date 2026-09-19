import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Gate P1 — 00064 integration, end to end.
 *
 * Proves the five Pass-2 settings travel from the database through
 * runtime-settings into their real consumers (catalog admin page size, catalog
 * search results, inventory image cap, ad placements, internal ad allow-list),
 * that safe hardcoded defaults preserve the pre-integration behavior when the
 * DB value is absent/invalid, and that Admin Save/Reset → refreshRuntimeSettings
 * propagate to consumers.
 *
 * That the 33 original settings remain untouched is proven in
 * settings-api.test.ts (registry subset + defaults parity) and
 * settings-pass1-registry.test.ts (the 13 Pass-1 keys).
 */

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, getSupabaseClient: vi.fn(() => ({ rpc })) };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

// src/core/telemetry/client.ts runs `void loadRuntimeSettings()` at import time;
// mocking the module keeps the singleton cache deterministic during these tests.
vi.mock('../../core/telemetry', () => ({ track: vi.fn() }));

import {
  loadRuntimeSettings,
  refreshRuntimeSettings,
  clearRuntimeSettingsCache,
  getRuntimeSetting,
  getRuntimeSettingList,
  adminCatalogPageSize,
  catalogSearchResultLimit,
  inventoryMaxImages,
} from '../../core/config/runtime-settings';
import { SETTING_REGISTRY, SETTING_DEFAULTS } from '../../business-intelligence/settings-api';
import { activeAdPlacements, internalAdAllowlist } from '../../services/ads-service';
import { searchCatalog } from '../../services/catalog-service';

type Entry = { value: string; category: string; type: string };

/** A full 38-key DB snapshot built from the registry defaults (no overrides). */
function fullSettings(overrides: Record<string, Entry> = {}): { error: null; settings: Record<string, Entry> } {
  const settings: Record<string, Entry> = {};
  for (const meta of SETTING_REGISTRY) {
    settings[meta.key] = { value: String(SETTING_DEFAULTS[meta.key]), category: meta.category, type: meta.type };
  }
  for (const [k, entry] of Object.entries(overrides)) settings[k] = entry;
  return { error: null, settings };
}

const CUSTOM: Record<string, Entry> = {
  'catalog.admin_page_size': { value: '75', category: 'catalog', type: 'integer' },
  'catalog.search_result_limit': { value: '5', category: 'catalog', type: 'integer' },
  'inventory.max_images': { value: '3', category: 'inventory', type: 'integer' },
  'ads.placements': { value: '["home","results"]', category: 'ads', type: 'enum' },
  'ads.internal_allowlist': { value: '["showroom"]', category: 'ads', type: 'enum' },
};

beforeEach(() => {
  vi.clearAllMocks();
  clearRuntimeSettingsCache(); // fully reset the singleton cache
});

describe('00064 — consumers keep the pre-integration behavior on default/absent DB values', () => {
  it('every accessor falls back to its exact legacy hardcoded value before any fetch', () => {
    expect(adminCatalogPageSize()).toBe(50);
    expect(catalogSearchResultLimit()).toBe(20);
    expect(inventoryMaxImages()).toBe(6);
    expect(activeAdPlacements()).toEqual(['home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom']);
    expect(internalAdAllowlist()).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
  });

  it('an RPC failure keeps every consumer on safe defaults', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await loadRuntimeSettings();
    expect(adminCatalogPageSize()).toBe(50);
    expect(catalogSearchResultLimit()).toBe(20);
    expect(inventoryMaxImages()).toBe(6);
    expect(activeAdPlacements()).toEqual(['home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom']);
    expect(internalAdAllowlist()).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
  });

  it('malformed DB values are sanitized, never propagated', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: fullSettings({
        'catalog.admin_page_size': { value: '999', category: 'catalog', type: 'integer' }, // out of range -> default
        'ads.placements': { value: '["home","BTC"]', category: 'ads', type: 'enum' }, // off-allow-list dropped -> ['home']
        'ads.internal_allowlist': { value: '{bad json', category: 'ads', type: 'enum' }, // parse failure -> default
      }),
      error: null,
    });
    await loadRuntimeSettings();
    expect(adminCatalogPageSize()).toBe(50);
    expect(catalogSearchResultLimit()).toBe(20);
    expect(inventoryMaxImages()).toBe(6);
    expect(activeAdPlacements()).toEqual(['home']);
    expect(internalAdAllowlist()).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
  });
});

describe('00064 — DB overrides reach the real consumers', () => {
  it('runtime + consumers all reflect a DB customization', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: fullSettings(CUSTOM), error: null });
    await loadRuntimeSettings();
    expect(getRuntimeSetting('catalog.admin_page_size')).toBe(75);
    expect(getRuntimeSetting('catalog.search_result_limit')).toBe(5);
    expect(getRuntimeSetting('inventory.max_images')).toBe(3);
    expect(getRuntimeSettingList('ads.placements')).toEqual(['home', 'results']);
    expect(getRuntimeSettingList('ads.internal_allowlist')).toEqual(['showroom']);
    // consumers
    expect(adminCatalogPageSize()).toBe(75);
    expect(catalogSearchResultLimit()).toBe(5);
    expect(inventoryMaxImages()).toBe(3);
    expect(activeAdPlacements()).toEqual(['home', 'results']);
    expect(internalAdAllowlist()).toEqual(['showroom']);
  });

  it('searchCatalog applies the runtime search-result limit by default', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: fullSettings({ 'catalog.search_result_limit': { value: '5', category: 'catalog', type: 'integer' } }), error: null });
    await loadRuntimeSettings();
    const limited = searchCatalog('iphone').length;
    const permissive = searchCatalog('iphone', 50).length;
    expect(permissive).toBeGreaterThanOrEqual(limited);
    expect(limited).toBeLessThanOrEqual(catalogSearchResultLimit());
  });
});

describe('00064 — Admin Save / Reset → refreshRuntimeSettings propagates to consumers', () => {
  it('Save: a successful refresh gives consumers the newly saved DB value', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: fullSettings(), error: null }); // baseline defaults
    await loadRuntimeSettings();
    expect(adminCatalogPageSize()).toBe(50);

    mocks.rpc.mockResolvedValueOnce({ data: fullSettings(CUSTOM), error: null }); // post-save DB state
    await refreshRuntimeSettings();

    expect(adminCatalogPageSize()).toBe(75);
    expect(catalogSearchResultLimit()).toBe(5);
    expect(inventoryMaxImages()).toBe(3);
    expect(activeAdPlacements()).toEqual(['home', 'results']);
    expect(internalAdAllowlist()).toEqual(['showroom']);
  });

  it('Reset: a successful refresh returns consumers to the registered defaults', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: fullSettings(CUSTOM), error: null });
    await loadRuntimeSettings();
    expect(adminCatalogPageSize()).toBe(75);

    mocks.rpc.mockResolvedValueOnce({ data: fullSettings(), error: null }); // post-reset DB state
    await refreshRuntimeSettings();

    expect(adminCatalogPageSize()).toBe(50);
    expect(catalogSearchResultLimit()).toBe(20);
    expect(inventoryMaxImages()).toBe(6);
    expect(activeAdPlacements()).toEqual(['home', 'phones', 'repair', 'results', 'exchange', 'phone-details', 'showroom']);
    expect(internalAdAllowlist()).toEqual(['phone-details', 'showroom', 'phone-services', 'repair-home']);
  });

  it('Pass-2: a failed refresh keeps the last good snapshot for 00064 keys', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: fullSettings(CUSTOM), error: null });
    await loadRuntimeSettings();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await refreshRuntimeSettings();
    expect(adminCatalogPageSize()).toBe(75); // never degraded to defaults
    expect(getRuntimeSetting('inventory.max_images')).toBe(3);
  });
});