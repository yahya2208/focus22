import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from '../../services/inventory-service';
import {
  bootstrapCentralInventory,
  resetCentralInventoryState,
} from '../../services/inventory-central-service';
import { resetFakeCentralDb, getFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

/**
 * Apple storage-only add-stock contract:
 *   variant='128GB', ram=NULL, storage='128GB', battery_health=<input>
 * The RPC (inventory_add_item) already supports p_battery_health (integer,
 * DEFAULT NULL). This layer only threads the value through addStock →
 * centralAddItem → p_battery_health. No SQL touched.
 */
describe('Apple storage-only + battery-at-creation', () => {
  beforeEach(async () => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    await bootstrapCentralInventory();
  });

  function appleRows() {
    return getFakeCentralDb().rows.filter(r => r.brand === 'Apple' && r.model === 'iPhone 13');
  }

  it('G) Apple + battery=87 → row: variant="128GB", ram=NULL, storage="128GB", battery_health=87', async () => {
    await InventoryService.addStock('Apple', 'iPhone 13', '128GB', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', 87);

    const rows = appleRows();
    expect(rows.length).toBe(1);
    expect(rows[0]!.variant).toBe('128GB');
    expect(rows[0]!.ram).toBeNull();
    expect(rows[0]!.storage).toBe('128GB');
    expect(rows[0]!.battery_health).toBe(87);
  });

  it('H) Apple + no battery → battery_health=NULL (never 0, never "")', async () => {
    await InventoryService.addStock('Apple', 'iPhone 13', '256GB', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    const rows = appleRows();
    expect(rows.length).toBe(1);
    expect(rows[0]!.variant).toBe('256GB');
    expect(rows[0]!.ram).toBeNull();
    expect(rows[0]!.storage).toBe('256GB');
    expect(rows[0]!.battery_health).toBeNull();
  });

  it('1TB storage-only: variant="1TB", ram=NULL, storage="1TB"', async () => {
    await InventoryService.addStock('Apple', 'iPhone 15 Pro', '1TB', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', 100);

    const rows = getFakeCentralDb().rows.filter(r => r.model === 'iPhone 15 Pro');
    expect(rows[0]!.variant).toBe('1TB');
    expect(rows[0]!.ram).toBeNull();
    expect(rows[0]!.storage).toBe('1TB');
    expect(rows[0]!.battery_health).toBe(100);
  });

  it('battery never overrides the ram mapping of a real variant when passed together', async () => {
    await InventoryService.addStock('Apple', 'iPhone 13', '4/128', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', 90);

    const rows = appleRows();
    expect(rows[0]!.variant).toBe('4/128');
    expect(rows[0]!.ram).toBe('4GB');
    expect(rows[0]!.storage).toBe('128GB');
    expect(rows[0]!.battery_health).toBe(90);
  });

  it('K) Android unchanged: real variant keeps RAM/Storage and battery stays NULL', async () => {
    await InventoryService.addStock('Samsung', 'Galaxy S24 Ultra', '12/512', 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    const rows = getFakeCentralDb().rows.filter(r => r.brand === 'Samsung');
    expect(rows[0]!.variant).toBe('12/512');
    expect(rows[0]!.ram).toBe('12GB');
    expect(rows[0]!.storage).toBe('512GB');
    expect(rows[0]!.battery_health).toBeNull();
  });

  it('existing compatibility: old "4/128" Apple rows are left untouched when a new "128GB" row is added', async () => {
    await InventoryService.addStock('Apple', 'iPhone 13', '4/128', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    await InventoryService.addStock('Apple', 'iPhone 13', '128GB', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New', 85);

    const rows = appleRows();
    const old = rows.find(r => r.variant === '4/128')!;
    const fresh = rows.find(r => r.variant === '128GB')!;
    expect(old.ram).toBe('4GB');
    expect(old.storage).toBe('128GB');
    expect(old.battery_health).toBeNull();
    expect(fresh.ram).toBeNull();
    expect(fresh.storage).toBe('128GB');
    expect(fresh.battery_health).toBe(85);
  });
});
