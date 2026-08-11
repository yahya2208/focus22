import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService, type InventoryRecord } from '../../services/inventory-service';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { PHONE_VARIANTS, type PhoneVariant } from '../../data/phone-variants';
import { resetFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

function variant(label: string): PhoneVariant {
  const v = PHONE_VARIANTS.find(x => x.label === label);
  if (!v) throw new Error(`variant not found: ${label}`);
  return v;
}

// Exact formulas extracted from the two screens (kept in sync with source):
//   Inventory page  = src/screens/inventory/CatalogInventoryScreen.tsx  -> InventoryService.getAll()  (admin: shows EVERYTHING)
//   Exchange list   = src/screens/phone-services/CustomerPhoneFlow.tsx  -> InventoryService.getExchangeableDevices()
// Contract (single source, central cutover 2026-08-11): exchangeable =
//   PUBLISHED AND quantity>0 AND status NOT archived/discontinued/deleted.
function inventoryPageRecords(): InventoryRecord[] {
  return InventoryService.getAll();
}

function exchangeListFormula(): InventoryRecord[] {
  return InventoryService.getExchangeableDevices();
}

describe('P0-1: exchange phone list vs Inventory page (single source check)', () => {
  beforeEach(async () => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    await bootstrapCentralInventory();
  });

  it('shows the exact same phones on both screens when every record is in stock and published', async () => {
    const a = await InventoryService.addStock('Samsung', 'Galaxy S24 Ultra', variant('12/512'), 3, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    const b = await InventoryService.addStock('Apple', 'iPhone 15 Pro', variant('8/256'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    const c = await InventoryService.addStock('Xiaomi', 'Redmi Note 13', variant('8/256'), 5, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    for (const r of [a, b, c]) await InventoryService.publishRecord(r.id, true);

    const inventoryPage = inventoryPageRecords();
    const exchangeList = exchangeListFormula();

    expect(inventoryPage.length).toBe(3);
    expect(exchangeList.length).toBe(3);
    expect(exchangeList.map(r => r.modelId).sort()).toEqual(inventoryPage.map(r => r.modelId).sort());
  });

  it('reproduces the reported divergence: a quantity<=0 record appears on the Inventory page but is hidden in the exchange list', async () => {
    const a = await InventoryService.addStock('Samsung', 'Galaxy S24 Ultra', variant('12/512'), 3, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    const b = await InventoryService.addStock('Apple', 'iPhone 15 Pro', variant('8/256'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    for (const r of [a, b]) await InventoryService.publishRecord(r.id, true);

    const soldOut = InventoryService.getAll().find(r => r.model.toLowerCase() === 'galaxy s24 ultra')!;
    await InventoryService.removeStock(soldOut.id, 3);

    const inventoryPage = inventoryPageRecords();
    const exchangeList = exchangeListFormula();

    expect(inventoryPage.length).toBe(2);
    expect(exchangeList.length).toBe(1);
    expect(exchangeList.every(r => r.quantity > 0)).toBe(true);
    expect(inventoryPage.some(r => r.quantity <= 0)).toBe(true);
  });

  it('unpublished records stay on the Inventory page (admin) but are excluded from the exchange list', async () => {
    const rec = await InventoryService.addStock('Nokia', '3310', variant('8/64'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    expect(inventoryPageRecords().some(r => r.id === rec.id)).toBe(true);
    expect(exchangeListFormula().some(r => r.id === rec.id)).toBe(false);

    await InventoryService.publishRecord(rec.id, true);
    expect(exchangeListFormula().some(r => r.id === rec.id)).toBe(true);
  });

  it('archived records stay on the Inventory page (admin) but are excluded from the exchange list', async () => {
    const rec = await InventoryService.addStock('Nokia', '3310', variant('8/64'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    await InventoryService.publishRecord(rec.id, true);
    await InventoryService.setStatus(rec.id, 'archived');

    const inventoryPage = inventoryPageRecords();
    const exchangeList = exchangeListFormula();

    expect(inventoryPage.some(r => r.id === rec.id)).toBe(true);
    expect(exchangeList.some(r => r.id === rec.id)).toBe(false);
  });

  it('discontinued records are excluded from the exchange list while remaining on the Inventory page', async () => {
    const rec = await InventoryService.addStock('Apple', 'iPhone 13', variant('6/128'), 4, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    await InventoryService.publishRecord(rec.id, true);
    await InventoryService.setStatus(rec.id, 'discontinued');

    expect(inventoryPageRecords().some(r => r.id === rec.id)).toBe(true);
    expect(exchangeListFormula().some(r => r.id === rec.id)).toBe(false);
  });
});
