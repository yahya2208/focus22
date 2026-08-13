import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from '../../services/inventory-service';
import {
  bootstrapCentralInventory,
  resetCentralInventoryState,
  resolveVariantParams,
} from '../../services/inventory-central-service';
import { resetFakeCentralDb, getFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

/**
 * Schema contract (supabase/inventory-central/01-inventory-apply.sql):
 *   inventory_items.variant TEXT NOT NULL DEFAULT ''
 *   inventory_items.ram     TEXT (nullable — the ONLY nullable of the trio)
 *   inventory_items.storage TEXT NOT NULL DEFAULT ''
 * So "no variant" must be represented by real NULL on the nullable field (ram),
 * and '' ONLY where the schema mandates NOT NULL (variant / storage).
 */
describe('no-variant save contract: real NULL on nullable fields, no empty-string smuggling', () => {
  beforeEach(async () => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    await bootstrapCentralInventory();
  });

  it('resolveVariantParams("") maps the no-variant state to ram:null (never "")', () => {
    expect(resolveVariantParams('')).toEqual({ variantLabel: '', ram: null, storage: '' });
  });

  it('resolveVariantParams keeps real values for a real variant (contrast)', () => {
    expect(resolveVariantParams('8/256')).toEqual({ variantLabel: '8/256', ram: '8GB', storage: '256GB' });
  });

  it('addStock with the no-variant representation stores ram NULL in the DB row (variant/storage keep schema NOT NULL "")', async () => {
    await InventoryService.addStock('Nokia', '3310', '', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    const rows = getFakeCentralDb().rows.filter(r => r.brand === 'Nokia' && r.model === '3310');
    expect(rows.length).toBe(1);
    expect(rows[0]!.variant).toBe('');
    expect(rows[0]!.ram).toBeNull();
    expect(rows[0]!.storage).toBe('');
  });

  it('addStock with a real variant stores real ram/storage (contrast)', async () => {
    await InventoryService.addStock('Nokia', '3310', '8/256', 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    const rows = getFakeCentralDb().rows.filter(r => r.brand === 'Nokia' && r.model === '3310');
    expect(rows.length).toBe(1);
    expect(rows[0]!.variant).toBe('8/256');
    expect(rows[0]!.ram).toBe('8GB');
    expect(rows[0]!.storage).toBe('256GB');
  });
});
