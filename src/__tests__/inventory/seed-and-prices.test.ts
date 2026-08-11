import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from '../../services/inventory-service';
import { DEFAULT_INVENTORY_SEED, ensureInventorySeeded } from '../../services/inventory-seed';
import { bootstrapCentralInventory, resetCentralInventoryState } from '../../services/inventory-central-service';
import { PHONE_VARIANTS, type PhoneVariant } from '../../data/phone-variants';
import { resetFakeCentralDb, seedFakeCentralDb } from '../helpers/fake-central-inventory';

vi.mock('../../core/supabase/client', async () => {
  const { getFakeSupabaseClient } = await import('../helpers/fake-central-inventory');
  return { getSupabaseClient: () => getFakeSupabaseClient() };
});

function variant(label: string): PhoneVariant {
  const v = PHONE_VARIANTS.find(x => x.label === label);
  if (!v) throw new Error(`variant not found: ${label}`);
  return v;
}

describe('Used-phones default seed (Rev 4: seed is revoked — central bootstrap is the only seed path)', () => {
  beforeEach(async () => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    seedFakeCentralDb();
    await bootstrapCentralInventory();
  });

  it('ensureInventorySeeded() is a NO-OP returning false; the central seed hydrates the showroom', () => {
    expect(ensureInventorySeeded()).toBe(false);

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

  it('does not re-seed: the no-op never writes, so admin data is never overwritten', async () => {
    const before = InventoryService.getAll().length;
    expect(ensureInventorySeeded()).toBe(false);

    await InventoryService.addStock('Apple', 'iPhone 20', variant('8/256'), 1, undefined, undefined, 'purchase', undefined, undefined, undefined, 'New');

    expect(ensureInventorySeeded()).toBe(false);
    expect(InventoryService.getAll().length).toBe(before + 1);
  });

  it('seeded records are exchangeable (quantity > 0, not archived)', () => {
    const exchangeable = InventoryService.getExchangeableDevices();
    expect(exchangeable.length).toBeGreaterThan(0);
    expect(exchangeable.every(r => r.quantity > 0)).toBe(true);
  });
});

describe('Inventory price management (launch blocker: no price input)', () => {
  beforeEach(async () => {
    resetFakeCentralDb();
    resetCentralInventoryState();
    await bootstrapCentralInventory();
  });

  it('updatePrices sets buy/sell price and records a price_updated timeline event', async () => {
    const rec = await InventoryService.addStock('Samsung', 'Galaxy S22', variant('8/128'), 2, undefined, undefined, 'purchase', undefined, undefined, undefined, 'Good');
    const updated = await InventoryService.updatePrices(rec.id, 80000, 95000);
    expect(updated).not.toBeNull();
    expect(updated!.buyPrice).toBe(80000);
    expect(updated!.sellPrice).toBe(95000);

    const timeline = InventoryService.getTimeline(rec.id);
    expect(timeline.some(e => e.type === 'price_updated' && e.priceAfter === 95000 && e.priceBefore === undefined)).toBe(true);
  });

  it('hideRecord removes from exchangeable list, unhideRecord restores it (publishing stays explicit)', async () => {
    const rec = await InventoryService.addStock('Apple', 'iPhone 13', variant('6/128'), 4, 80000, 105000, 'purchase', undefined, undefined, undefined, 'Like New');
    await InventoryService.publishRecord(rec.id, true);

    await InventoryService.hideRecord(rec.id);
    expect(InventoryService.getExchangeableDevices().some(r => r.id === rec.id)).toBe(false);
    expect(InventoryService.getAll().some(r => r.id === rec.id)).toBe(true);

    await InventoryService.unhideRecord(rec.id);
    // unhide restores the row but does NOT republish — publishing is explicit.
    expect(InventoryService.getExchangeableDevices().some(r => r.id === rec.id)).toBe(false);

    await InventoryService.publishRecord(rec.id, true);
    expect(InventoryService.getExchangeableDevices().some(r => r.id === rec.id)).toBe(true);
  });
});
