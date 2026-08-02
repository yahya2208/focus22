import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryService, type InventoryRecord } from '../../services/inventory-service';
import { PHONE_VARIANTS, type PhoneVariant } from '../../data/phone-variants';

function variant(label: string): PhoneVariant {
  const v = PHONE_VARIANTS.find(x => x.label === label);
  if (!v) throw new Error(`variant not found: ${label}`);
  return v;
}

// Exact formulas extracted from the two screens (kept in sync with source):
//   Inventory page  = src/screens/inventory/CatalogInventoryScreen.tsx  -> InventoryService.getAll()  (admin: shows EVERYTHING)
//   Exchange list   = src/screens/phone-services/CustomerPhoneFlow.tsx  -> InventoryService.getExchangeableDevices()
// Contract (single source): exchangeable = quantity>0 AND archived=false AND discontinued=false.
function inventoryPageRecords(): InventoryRecord[] {
  return InventoryService.getAll();
}

function exchangeListFormula(): InventoryRecord[] {
  return InventoryService.getExchangeableDevices();
}

describe('P0-1: exchange phone list vs Inventory page (single source check)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the exact same phones on both screens when every record is in stock', () => {
    InventoryService.addStock('Samsung', 'Galaxy S24 Ultra', variant('12/512'), 3, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    InventoryService.addStock('Apple', 'iPhone 15 Pro', variant('8/256'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    InventoryService.addStock('Xiaomi', 'Redmi Note 13', variant('8/256'), 5, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    const inventoryPage = inventoryPageRecords();
    const exchangeList = exchangeListFormula();

    expect(inventoryPage.length).toBe(3);
    expect(exchangeList.length).toBe(3);
    expect(exchangeList.map(r => r.modelId).sort()).toEqual(inventoryPage.map(r => r.modelId).sort());
  });

  it('reproduces the reported divergence: a quantity<=0 record appears on the Inventory page but is hidden in the exchange list', () => {
    InventoryService.addStock('Samsung', 'Galaxy S24 Ultra', variant('12/512'), 3, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    InventoryService.addStock('Apple', 'iPhone 15 Pro', variant('8/256'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    const soldOut = InventoryService.getAll().find(r => r.model.toLowerCase() === 'galaxy s24 ultra')!;
    InventoryService.removeStock(soldOut.id, 3);

    const inventoryPage = inventoryPageRecords();
    const exchangeList = exchangeListFormula();

    expect(inventoryPage.length).toBe(2);
    expect(exchangeList.length).toBe(1);
    expect(exchangeList.every(r => r.quantity > 0)).toBe(true);
    expect(inventoryPage.some(r => r.quantity <= 0)).toBe(true);
  });

  it('archived records stay on the Inventory page (admin) but are excluded from the exchange list', () => {
    const rec = InventoryService.addStock('Nokia', '3310', variant('8/64'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    InventoryService.setStatus(rec.id, 'archived');

    const inventoryPage = inventoryPageRecords();
    const exchangeList = exchangeListFormula();

    expect(inventoryPage.some(r => r.id === rec.id)).toBe(true);
    expect(exchangeList.some(r => r.id === rec.id)).toBe(false);
  });

  it('discontinued records are excluded from the exchange list while remaining on the Inventory page', () => {
    const rec = InventoryService.addStock('Apple', 'iPhone 13', variant('6/128'), 4, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    InventoryService.setStatus(rec.id, 'discontinued');

    expect(inventoryPageRecords().some(r => r.id === rec.id)).toBe(true);
    expect(exchangeListFormula().some(r => r.id === rec.id)).toBe(false);
  });
});
