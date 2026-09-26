/**
 * GATE B — home auth-gating (logged-out must not emit authenticated-only calls).
 *
 * A: logged-out bootstrap → fetchPublic only (no inventory_management_list RPC,
 *    no inventory_movements read).
 * B: authenticated bootstrap → public + admin + movements.
 * C: session restoration (SIGNED_IN after boot) → protected lanes hydrate.
 * D: sign-out → protected caches cleared, public cache preserved.
 * E: logged-out loadRuntimeSettings → safe defaults, no get_settings RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type AuthCb = (event: string, session: { user?: { id: string } } | null) => void;

const mockState = vi.hoisted(() => ({
  authed: false,
  rpcCalls: [] as string[],
  fromTables: [] as string[],
  authCbs: [] as AuthCb[],
}));

const PUBLIC_ROW = { id: 'p1', category: 'phone', status: 'in_stock' };
const ADMIN_ROW = { id: 'a1', category: 'phone', status: 'in_stock', is_published: true };
const MOVEMENT_ROW = { id: 'm1' };

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({
    rpc: async (fn: string) => {
      mockState.rpcCalls.push(fn);
      if (fn === 'inventory_management_list') return { data: [ADMIN_ROW], error: null };
      if (fn === 'get_settings') return { data: { settings: {} }, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      mockState.fromTables.push(table);
      const rows = table === 'v_public_inventory' ? [PUBLIC_ROW] : table === 'inventory_movements' ? [MOVEMENT_ROW] : [];
      return { select: () => ({ order: async () => ({ data: rows, error: null }) }) };
    },
    auth: {
      getSession: async () => ({
        data: { session: mockState.authed ? { user: { id: 'u1' } } : null },
      }),
      onAuthStateChange: (cb: AuthCb) => {
        mockState.authCbs.push(cb);
      },
    },
  }),
}));

import {
  bootstrapCentralInventory,
  getCachedPublic,
  getCachedAdmin,
  resetCentralInventoryState,
} from '../../services/inventory-central-service';
import {
  loadRuntimeSettings,
  clearRuntimeSettingsCache,
  getRuntimeSetting,
} from '../../core/config/runtime-settings';

function fireAuth(signedIn: boolean) {
  const session = signedIn ? { user: { id: 'u1' } } : null;
  for (const cb of mockState.authCbs) cb(signedIn ? 'SIGNED_IN' : 'SIGNED_OUT', session);
}

async function flush() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  mockState.authed = false;
  mockState.rpcCalls = [];
  mockState.fromTables = [];
  mockState.authCbs = [];
  resetCentralInventoryState();
  clearRuntimeSettingsCache();
});

describe('Gate B home auth-gating', () => {
  it('A: logged-out bootstrap fetches public only', async () => {
    await bootstrapCentralInventory();
    expect(mockState.fromTables).toContain('v_public_inventory');
    expect(mockState.rpcCalls).not.toContain('inventory_management_list');
    expect(mockState.fromTables).not.toContain('inventory_movements');
    expect(getCachedPublic().length).toBe(1);
    expect(getCachedAdmin()).toEqual(getCachedPublic());
  });

  it('B: authenticated bootstrap hydrates all three lanes', async () => {
    mockState.authed = true;
    await bootstrapCentralInventory();
    expect(mockState.fromTables).toContain('v_public_inventory');
    expect(mockState.rpcCalls).toContain('inventory_management_list');
    expect(mockState.fromTables).toContain('inventory_movements');
    expect(getCachedAdmin().some((r) => r.id === 'a1')).toBe(true);
  });

  it('C: post-boot sign-in hydrates the protected lanes', async () => {
    await bootstrapCentralInventory();
    expect(mockState.rpcCalls).not.toContain('inventory_management_list');
    mockState.authed = true;
    fireAuth(true);
    await flush();
    expect(mockState.rpcCalls).toContain('inventory_management_list');
    expect(mockState.fromTables).toContain('inventory_movements');
    expect(getCachedAdmin().some((r) => r.id === 'a1')).toBe(true);
  });

  it('D: sign-out clears protected caches and preserves public', async () => {
    mockState.authed = true;
    await bootstrapCentralInventory();
    expect(getCachedAdmin().some((r) => r.id === 'a1')).toBe(true);
    mockState.authed = false;
    fireAuth(false);
    await flush();
    expect(getCachedPublic().length).toBe(1);
    expect(getCachedAdmin()).toEqual(getCachedPublic());
    expect(getCachedAdmin().some((r) => r.id === 'a1')).toBe(false);
  });

  it('E: logged-out runtime settings use fallbacks with no get_settings RPC', async () => {
    const snapshot = await loadRuntimeSettings();
    expect(mockState.rpcCalls).not.toContain('get_settings');
    expect(snapshot['catalog.admin_page_size']).toBe(getRuntimeSetting('catalog.admin_page_size', 50));
    mockState.authed = true;
    clearRuntimeSettingsCache();
    await loadRuntimeSettings();
    expect(mockState.rpcCalls).toContain('get_settings');
  });
});
