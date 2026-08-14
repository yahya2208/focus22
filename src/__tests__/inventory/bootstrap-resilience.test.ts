import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  bootstrapCentralInventory,
  getCachedPublic,
  getInventoryReady,
  resetCentralInventoryState,
  subscribeCentralInventory,
} from '../../services/inventory-central-service';
import { DEFAULT_INVENTORY_SEED } from '../../services/inventory-seed';
import { resetFakeCentralDb, seedFakeCentralDb, getFakeCentralDb, getFakeSupabaseClient } from '../helpers/fake-central-inventory';

/**
 * Wraps the fake central DB with a client whose `v_public_inventory` read
 * fails (transient network error) for the first `publicFailures` attempts,
 * then succeeds. Admin/movements keep their normal (RLS-error) behavior.
 */
function makeFlakyPublicClient(publicFailures: number) {
  let remaining = publicFailures;
  const db = getFakeCentralDb();
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => {
          if (table === 'v_public_inventory' && remaining > 0) {
            remaining -= 1;
            return Promise.resolve({ data: null, error: { message: 'transient cold-start failure' } });
          }
          if (table === 'v_public_inventory') return Promise.resolve({ data: db.publicList(), error: null });
          if (table === 'inventory_movements') return Promise.resolve({ data: db.movementsList(), error: null });
          return Promise.resolve({ data: [], error: null });
        },
      };
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null, data: { path: 'x' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
  };
}

const clientState = vi.hoisted(() => ({ flakyFailures: 0, useFlaky: false }));

let flakyClient: ReturnType<typeof makeFlakyPublicClient> | null = null;

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => {
    if (!clientState.useFlaky) return getFakeSupabaseClient();
    if (!flakyClient) flakyClient = makeFlakyPublicClient(clientState.flakyFailures);
    return flakyClient;
  },
}));

describe('central inventory bootstrap — first-load resilience', () => {
  beforeEach(() => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    clientState.useFlaky = false;
    clientState.flakyFailures = 0;
    flakyClient = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates the public cache on first load (no transient failure)', async () => {
    await bootstrapCentralInventory();
    expect(getInventoryReady()).toBe(true);
    expect(getCachedPublic().length).toBe(DEFAULT_INVENTORY_SEED.length);
  });

  it('notifies a subscriber registered BEFORE bootstrap completes (normal flow)', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCentralInventory(listener);
    await bootstrapCentralInventory();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getInventoryReady()).toBe(true);
    unsubscribe();
  });

  it('replays current state to a subscriber registered AFTER bootstrap settled (missed-update race)', async () => {
    await bootstrapCentralInventory();
    const listener = vi.fn();
    const unsubscribe = subscribeCentralInventory(listener);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('retries a transient public fetch failure so first load self-heals without refresh', async () => {
    vi.useFakeTimers();
    clientState.useFlaky = true;
    clientState.flakyFailures = 2;

    const boot = bootstrapCentralInventory();
    await vi.advanceTimersByTimeAsync(500); // 1st retry backoff
    await vi.advanceTimersByTimeAsync(1500); // 2nd retry backoff
    await boot;

    expect(getInventoryReady()).toBe(true);
    expect(getCachedPublic().length).toBe(DEFAULT_INVENTORY_SEED.length);
  });

  it('settles with an empty cache after the retry budget is exhausted (network genuinely down)', async () => {
    vi.useFakeTimers();
    clientState.useFlaky = true;
    clientState.flakyFailures = 99;

    const boot = bootstrapCentralInventory();
    await vi.advanceTimersByTimeAsync(2000); // both backoffs elapse
    await vi.advanceTimersByTimeAsync(5000); // extra margin
    await boot;

    expect(getInventoryReady()).toBe(true);
    expect(getCachedPublic()).toEqual([]);
  });
});
