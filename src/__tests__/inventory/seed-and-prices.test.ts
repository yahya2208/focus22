import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryService } from '../../services/inventory-service';
import { DEFAULT_INVENTORY_SEED, ensureInventorySeeded } from '../../services/inventory-seed';
import { PHONE_VARIANTS, type PhoneVariant } from '../../data/phone-variants';

function variant(label: string): PhoneVariant {
  const v = PHONE_VARIANTS.find(x => x.label === label);
  if (!v) throw new Error(`variant not found: ${label}`);
  return v;
}

describe('Used-phones default seed (launch blocker: showroom empty on fresh origins)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds the bundled catalog on first run only', () => {
    const seeded = ensureInventorySeeded();
    expect(seeded).toBe(true);

    const records = InventoryService.getAll();
    expect(records.length).toBe(DEFAULT_INVENTORY_SEED.length);
    for (const phone of DEFAULT_INVENTORY_SEED) {
      const rec = records.find(r => r.brand === phone.brand && r.model === phone.model && r.variant === phone.variant);
      expect(rec).toBeTruthy();
      expect(rec!.quantity).toBe(phone.quantity);
      expect(rec!.sellPrice).toBe(phone.sellPrice);
      expect(rec!.buyPrice).toBe(phone.buyPrice);
    }
  });

  it('does not re-seed when inventory already exists (never overwrites admin data)', () => {
    ensureInventorySeeded();
    InventoryService.addStock('Apple', 'iPhone 20', variant('8/256'), 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');
    const before = InventoryService.getAll().length;
    expect(ensureInventorySeeded()).toBe(false);
    expect(InventoryService.getAll().length).toBe(before);
  });

  it('seeded records are exchangeable (quantity > 0, not archived)', () => {
    ensureInventorySeeded();
    const exchangeable = InventoryService.getExchangeableDevices();
    expect(exchangeable.length).toBeGreaterThan(0);
    expect(exchangeable.every(r => r.quantity > 0)).toBe(true);
  });
});

describe('Inventory price management (launch blocker: no price input)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updatePrices sets buy/sell price and records a price_updated timeline event', () => {
    const rec = InventoryService.addStock('Samsung', 'Galaxy S22', variant('8/128'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'Good');
    const updated = InventoryService.updatePrices(rec.id, 80000, 95000);
    expect(updated).not.toBeNull();
    expect(updated!.buyPrice).toBe(80000);
    expect(updated!.sellPrice).toBe(95000);

    const timeline = InventoryService.getTimeline(rec.id);
    expect(timeline.some(e => e.type === 'price_updated' && e.priceAfter === 95000 && e.priceBefore === undefined)).toBe(true);
  });

  it('hideRecord removes from exchangeable list, unhideRecord restores it', () => {
    const rec = InventoryService.addStock('Apple', 'iPhone 13', variant('6/128'), 4, 80000, 105000, 'purchase', undefined, undefined, undefined, 'Like New');

    InventoryService.hideRecord(rec.id);
    expect(InventoryService.getExchangeableDevices().some(r => r.id === rec.id)).toBe(false);
    expect(InventoryService.getAll().some(r => r.id === rec.id)).toBe(true);

    InventoryService.unhideRecord(rec.id);
    expect(InventoryService.getExchangeableDevices().some(r => r.id === rec.id)).toBe(true);
  });
});
