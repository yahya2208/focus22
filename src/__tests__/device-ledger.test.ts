import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceLedger } from '../services/device-ledger';

const base = {
  brand: 'Samsung',
  model: 'Galaxy S25 Ultra',
  ram: '12GB',
  storage: '256GB',
  condition: 'Excellent' as const,
};

describe('DeviceLedger', () => {
  beforeEach(() => {
    DeviceLedger.clear();
  });

  it('registers a device with sequential number', () => {
    const d = DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    expect(d.id).toBe('DEV-00001');
    expect(d.sequentialNumber).toBe(1);
    expect(d.status).toBe('in_stock');
    expect(d.events).toHaveLength(1);
    expect(d.events[0]!.type).toBe('purchase');
    expect(d.events[0]!.price).toBe(20000);
  });

  it('increments sequential number', () => {
    const d1 = DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    const d2 = DeviceLedger.registerDevice({ ...base, buyPrice: 21000 });
    expect(d1.sequentialNumber).toBe(1);
    expect(d2.sequentialNumber).toBe(2);
    expect(d2.id).toBe('DEV-00002');
  });

  it('records sale with profit calculation', () => {
    const d = DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    const sold = DeviceLedger.recordSale(d.id, { sellPrice: 25000, buyPrice: 20000 });
    expect(sold).not.toBeNull();
    expect(sold!.status).toBe('sold');
    expect(sold!.events).toHaveLength(2);
    const saleEvent = sold!.events[1]!;
    expect(saleEvent.type).toBe('sale');
    expect(saleEvent.price).toBe(25000);
    expect(saleEvent.profit).toBe(5000);
  });

  it('records exchange', () => {
    const d = DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    const exchanged = DeviceLedger.recordExchange(d.id, { tradeValue: 15000 });
    expect(exchanged).not.toBeNull();
    expect(exchanged!.status).toBe('exchanged');
  });

  it('records repair', () => {
    const d = DeviceLedger.registerDevice({ ...base });
    const repaired = DeviceLedger.recordRepair(d.id, { cost: 500, notes: 'شاشة' });
    expect(repaired).not.toBeNull();
    expect(repaired!.events).toHaveLength(2);
    expect(repaired!.events[1]!.type).toBe('repair');
  });

  it('records warranty', () => {
    const d = DeviceLedger.registerDevice({ ...base });
    const warranty = DeviceLedger.recordWarranty(d.id, { notes: 'بطارية' });
    expect(warranty).not.toBeNull();
    expect(warranty!.status).toBe('warranty_returned');
  });

  it('adds note', () => {
    const d = DeviceLedger.registerDevice({ ...base });
    const noted = DeviceLedger.addNote(d.id, 'تم فحص الجهاز');
    expect(noted).not.toBeNull();
    expect(noted!.events).toHaveLength(2);
    expect(noted!.events[1]!.type).toBe('note');
  });

  it('finds device by ID', () => {
    const d = DeviceLedger.registerDevice({ ...base });
    const found = DeviceLedger.getDevice(d.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(d.id);
  });

  it('finds device by IMEI', () => {
    DeviceLedger.registerDevice({ ...base, imei: '351234567890123' });
    const found = DeviceLedger.findByImei('351234567890123');
    expect(found).not.toBeNull();
    expect(found!.imei).toBe('351234567890123');
  });

  it('returns devices by model', () => {
    DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    DeviceLedger.registerDevice({ ...base, buyPrice: 21000 });
    DeviceLedger.registerDevice({ ...base, model: 'Galaxy A10', buyPrice: 5000 });
    const s25 = DeviceLedger.getByModel('Samsung', 'Galaxy S25 Ultra');
    expect(s25).toHaveLength(2);
  });

  it('getInStock returns only in-stock devices', () => {
    const d1 = DeviceLedger.registerDevice({ ...base });
    const d2 = DeviceLedger.registerDevice({ ...base });
    DeviceLedger.recordSale(d2.id, { sellPrice: 25000, buyPrice: 20000 });
    const inStock = DeviceLedger.getInStock();
    expect(inStock).toHaveLength(1);
    expect(inStock[0]!.id).toBe(d1.id);
  });

  it('getModelProfitSummary aggregates correctly', () => {
    // Device 1: S25 Ultra buy 20000 sell 25000
    const d1 = DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    DeviceLedger.recordSale(d1.id, { sellPrice: 25000, buyPrice: 20000 });

    // Device 2: S25 Ultra buy 21000 sell 27000
    const d2 = DeviceLedger.registerDevice({ ...base, buyPrice: 21000 });
    DeviceLedger.recordSale(d2.id, { sellPrice: 27000, buyPrice: 21000 });

    // Device 3: A10 buy 5000 sell 7000
    const d3 = DeviceLedger.registerDevice({ ...base, model: 'Galaxy A10', buyPrice: 5000 });
    DeviceLedger.recordSale(d3.id, { sellPrice: 7000, buyPrice: 5000 });

    const summary = DeviceLedger.getModelProfitSummary();
    const s25 = summary.find(s => s.model === 'Galaxy S25 Ultra');
    const a10 = summary.find(s => s.model === 'Galaxy A10');

    expect(s25).toBeDefined();
    expect(s25!.totalDevices).toBe(2);
    expect(s25!.totalSales).toBe(2);
    expect(s25!.totalProfit).toBe(5000 + 6000);
    expect(s25!.avgProfit).toBe(5500);
    expect(s25!.totalRevenue).toBe(25000 + 27000);
    expect(s25!.avgSalePrice).toBe(26000);

    expect(a10).toBeDefined();
    expect(a10!.totalProfit).toBe(2000);
  });

  it('getMostProfitableModels returns top models sorted by profit', () => {
    const d1 = DeviceLedger.registerDevice({ ...base, model: 'Galaxy A10', buyPrice: 5000 });
    DeviceLedger.recordSale(d1.id, { sellPrice: 7000, buyPrice: 5000 });

    const d2 = DeviceLedger.registerDevice({ ...base, buyPrice: 20000 });
    DeviceLedger.recordSale(d2.id, { sellPrice: 25000, buyPrice: 20000 });

    const top = DeviceLedger.getMostProfitableModels();
    expect(top[0]!.totalProfit).toBeGreaterThanOrEqual(top[1]!.totalProfit);
  });

  it('getStats returns correct totals', () => {
    const d1 = DeviceLedger.registerDevice({ ...base });
    const d2 = DeviceLedger.registerDevice({ ...base });
    DeviceLedger.recordSale(d1.id, { sellPrice: 25000, buyPrice: 20000 });
    DeviceLedger.recordExchange(d2.id, { tradeValue: 15000 });

    const stats = DeviceLedger.getStats();
    expect(stats.totalDevices).toBe(2);
    expect(stats.sold).toBe(1);
    expect(stats.exchanged).toBe(1);
    expect(stats.totalProfit).toBe(5000);
  });

  it('returns null for non-existent device operations', () => {
    expect(DeviceLedger.recordSale('nonexistent', { sellPrice: 10000 })).toBeNull();
    expect(DeviceLedger.recordExchange('nonexistent', { tradeValue: 10000 })).toBeNull();
    expect(DeviceLedger.recordRepair('nonexistent', {})).toBeNull();
    expect(DeviceLedger.getDevice('nonexistent')).toBeNull();
    expect(DeviceLedger.findByImei('nonexistent')).toBeNull();
  });

  it('handles 100+ device registrations', () => {
    for (let i = 0; i < 100; i++) {
      DeviceLedger.registerDevice({ ...base, buyPrice: 20000 + i });
    }
    expect(DeviceLedger.getAll()).toHaveLength(100);
    const last = DeviceLedger.getDevice('DEV-00100');
    expect(last).not.toBeNull();
    expect(last!.sequentialNumber).toBe(100);
  });
});
