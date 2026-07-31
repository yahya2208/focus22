import { describe, it, expect, beforeEach } from 'vitest';
import { PriceMemory, ALL_CONDITIONS } from '../services/price-memory';

const id = { brand: 'Samsung', model: 'Galaxy S25 Ultra', ram: '12GB', storage: '256GB', condition: 'New' as const };

describe('PriceMemory', () => {
  beforeEach(() => {
    PriceMemory.clear();
  });

  it('records buy events', () => {
    const ev = PriceMemory.recordBuy({ ...id, price: 20000 });
    expect(ev.operation).toBe('buy');
    expect(ev.price).toBe(20000);
    expect(PriceMemory.getHistory(id)).toHaveLength(1);
  });

  it('records sell events with profit calculation', () => {
    PriceMemory.recordBuy({ ...id, price: 20000, date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() });
    const ev = PriceMemory.recordSell(id, 25000, 20000, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    expect(ev.operation).toBe('sell');
    expect(ev.profit).toBe(5000);
    expect(ev.margin).toBeCloseTo(25);
    expect(ev.daysToSell).toBe(7);
  });

  it('records exchange events', () => {
    const ev = PriceMemory.recordExchange(id, 15000);
    expect(ev.operation).toBe('exchange');
    expect(ev.price).toBe(15000);
  });

  it('separates history by condition', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordBuy({ ...id, condition: 'Good', price: 15000 });
    expect(PriceMemory.getHistory(id)).toHaveLength(1);
    expect(PriceMemory.getHistory({ ...id, condition: 'Good' })).toHaveLength(1);
  });

  it('separates history by RAM/Storage', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordBuy({ ...id, ram: '8GB', storage: '128GB', price: 18000 });
    expect(PriceMemory.getHistory(id)).toHaveLength(1);
    expect(PriceMemory.getHistory({ ...id, ram: '8GB', storage: '128GB' })).toHaveLength(1);
  });

  it('getSummary returns correct stats for buys', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordBuy({ ...id, price: 21000 });
    PriceMemory.recordBuy({ ...id, price: 19000 });
    const summary = PriceMemory.getSummary(id);
    expect(summary.buyCount).toBe(3);
    expect(summary.lastBuyPrice).toBe(19000);
    expect(summary.avgBuyPrice).toBe(20000);
    expect(summary.highestBuyPrice).toBe(21000);
    expect(summary.lowestBuyPrice).toBe(19000);
  });

  it('getSummary returns correct stats for sells', () => {
    PriceMemory.recordBuy({ ...id, price: 20000, date: new Date(Date.now() - 14 * 86400000).toISOString() });
    PriceMemory.recordBuy({ ...id, price: 21000, date: new Date(Date.now() - 7 * 86400000).toISOString() });
    PriceMemory.recordSell(id, 25000, 20000, new Date(Date.now() - 14 * 86400000).toISOString());
    PriceMemory.recordSell(id, 26000, 21000, new Date(Date.now() - 7 * 86400000).toISOString());
    const summary = PriceMemory.getSummary(id);
    expect(summary.sellCount).toBe(2);
    expect(summary.lastSellPrice).toBe(26000);
    expect(summary.avgSellPrice).toBe(25500);
    expect(summary.totalProfit).toBe(10000);
    expect(summary.bestProfit).toBe(5000);
    expect(summary.worstProfit).toBe(5000);
  });

  it('getTimeline returns events sorted by date descending', () => {
    PriceMemory.recordBuy({ ...id, price: 20000, date: '2025-01-01T00:00:00Z' });
    PriceMemory.recordBuy({ ...id, price: 21000, date: '2025-06-01T00:00:00Z' });
    const timeline = PriceMemory.getTimeline(id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.date).toBe('2025-06-01T00:00:00Z');
    expect(timeline[1]!.date).toBe('2025-01-01T00:00:00Z');
  });

  it('getLearningInsight returns low confidence with <3 transactions', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    const insight = PriceMemory.getLearningInsight(id);
    expect(insight.confidence).toBe('low');
    expect(insight.usualBuyRange).not.toBeNull();
  });

  it('getLearningInsight returns medium confidence with 8-19 transactions', () => {
    for (let i = 0; i < 10; i++) {
      PriceMemory.recordBuy({ ...id, price: 20000 + i * 1000 });
    }
    const insight = PriceMemory.getLearningInsight(id);
    expect(insight.confidence).toBe('medium');
  });

  it('getLearningInsight returns high confidence with 20+ transactions', () => {
    for (let i = 0; i < 20; i++) {
      PriceMemory.recordBuy({ ...id, price: 20000 + i * 500 });
    }
    const insight = PriceMemory.getLearningInsight(id);
    expect(insight.confidence).toBe('high');
  });

  it('checkPriceAlert warns on overpriced buy', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordBuy({ ...id, price: 21000 });
    const alert = PriceMemory.checkPriceAlert(id, 30000, 'buy');
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe('danger');
  });

  it('checkPriceAlert warns on underpriced sell', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordSell(id, 24000, 20000);
    const alert = PriceMemory.checkPriceAlert(id, 12000, 'sell');
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe('warning');
  });

  it('checkPriceAlert warns on sell below avg buy price', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    const alert = PriceMemory.checkPriceAlert(id, 18000, 'sell');
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe('warning');
  });

  it('checkPriceAlert returns null for normal prices', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordSell(id, 25000, 20000);
    const alert = PriceMemory.checkPriceAlert(id, 22000, 'buy');
    expect(alert).toBeNull();
  });

  it('getStats returns correct totals', () => {
    PriceMemory.recordBuy({ ...id, price: 20000 });
    PriceMemory.recordSell(id, 25000, 20000);
    const stats = PriceMemory.getStats();
    expect(stats.totalEvents).toBe(2);
    expect(stats.totalBrands).toBe(1);
    expect(stats.totalProfit).toBe(5000);
  });

  it('all conditions are valid', () => {
    const expected = ['New', 'Open Box', 'Like New', 'Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'For Parts', 'Refurbished', 'Certified Used'];
    expect(ALL_CONDITIONS).toEqual(expected);
    expect(ALL_CONDITIONS).toHaveLength(11);
  });

  it('handles 5000+ events without performance issues', () => {
    for (let i = 0; i < 100; i++) {
      PriceMemory.recordBuy({ ...id, price: 20000 + i, date: new Date(Date.now() - i * 86400000).toISOString() });
    }
    const summary = PriceMemory.getSummary(id);
    expect(summary.buyCount).toBe(100);
  });
});
