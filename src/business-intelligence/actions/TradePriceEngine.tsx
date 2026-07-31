import { useState } from 'react';
import type { TradePrice } from './types';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DemoBadge, DemoNotice } from '../DemoBadge';
import type { DataSource } from '../data-source';

const PRICES_KEY = 'bi_trade_prices';
const SOURCE_KEY = 'bi_trade_prices_source';

function loadPrices(): { prices: TradePrice[]; source: DataSource } {
  try {
    const stored = localStorage.getItem(PRICES_KEY);
    const source = (localStorage.getItem(SOURCE_KEY) as DataSource) ?? 'demo';
    return { prices: stored ? JSON.parse(stored) : [], source: stored ? source : 'demo' };
  } catch { return { prices: [], source: 'demo' }; }
}
function savePrices(prices: TradePrice[], source: DataSource) {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  localStorage.setItem(SOURCE_KEY, source);
}

export function TradePriceEngine() {
  const colors = useThemeColors();
  const [{ prices, source }, setState] = useState(loadPrices);
  const [newPrice, setNewPrice] = useState<Partial<TradePrice>>({});

  const addPrice = () => {
    if (newPrice.brand && newPrice.model && newPrice.storage && newPrice.buyPrice && newPrice.sellPrice) {
      const entry: TradePrice = {
        brand: newPrice.brand,
        model: newPrice.model,
        storage: newPrice.storage,
        condition: newPrice.condition ?? 'good',
        buyPrice: newPrice.buyPrice,
        sellPrice: newPrice.sellPrice,
        profitMargin: newPrice.sellPrice - newPrice.buyPrice,
        suggestedSellPrice: Math.round(newPrice.sellPrice * 1.05),
        updatedAt: new Date().toISOString(),
      };
      const updated = [...prices, entry];
      setState({ prices: updated, source: 'live' });
      savePrices(updated, 'live');
      setNewPrice({});
    }
  };

  const totalProfit = prices.reduce((sum, p) => sum + p.profitMargin, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>Trade Price Engine</h2>
          <DemoBadge source={source} />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>إجمالي الربح المقدر:</span>
          <span style={{ color: colors.success, fontSize: '1.1rem', fontWeight: 700 }}>{totalProfit.toLocaleString()} د.ج</span>
        </div>
      </div>

      {source !== 'live' && <DemoNotice />}

      {prices.length === 0 && (
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          لا توجد أسعار مسجلة بعد. أضف أول سعر للبدء.
        </div>
      )}

      {prices.length > 0 && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '12px', padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 60px 70px 70px 70px 50px', gap: '6px', padding: '6px 8px', fontSize: '0.65rem', color: colors.textMuted, fontWeight: 600 }}>
              <span>العلامة</span><span>الموديل</span><span>السعة</span><span>شراء</span><span>بيع</span><span>الربح</span><span>مقترح</span>
            </div>
            {prices.map((p, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '80px 80px 60px 70px 70px 70px 50px', gap: '6px',
                padding: '6px 8px', borderRadius: '6px', background: colors.bgInput,
                fontSize: '0.75rem', alignItems: 'center',
              }}>
                <span style={{ color: colors.text }}>{p.brand}</span>
                <span style={{ color: colors.text }}>{p.model}</span>
                <span style={{ color: colors.textMuted }}>{p.storage}</span>
                <span style={{ color: colors.warning }}>{p.buyPrice.toLocaleString()}</span>
                <span style={{ color: colors.success }}>{p.sellPrice.toLocaleString()}</span>
                <span style={{ color: colors.accent, fontWeight: 600 }}>{p.profitMargin.toLocaleString()}</span>
                <span style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{p.suggestedSellPrice.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '14px 16px',
      }}>
        <h3 style={{ color: colors.text, fontSize: '0.85rem', margin: '0 0 10px 0' }}>إضافة سعر جديد</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
          <input placeholder="العلامة" value={newPrice.brand ?? ''}
            onChange={e => setNewPrice({ ...newPrice, brand: e.target.value })}
            style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.78rem', fontFamily: 'inherit' }} />
          <input placeholder="الموديل" value={newPrice.model ?? ''}
            onChange={e => setNewPrice({ ...newPrice, model: e.target.value })}
            style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.78rem', fontFamily: 'inherit' }} />
          <input placeholder="السعة" value={newPrice.storage ?? ''}
            onChange={e => setNewPrice({ ...newPrice, storage: e.target.value })}
            style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.78rem', fontFamily: 'inherit' }} />
          <input placeholder="سعر الشراء" type="number" value={newPrice.buyPrice ?? ''}
            onChange={e => setNewPrice({ ...newPrice, buyPrice: parseInt(e.target.value) || 0 })}
            style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.78rem', fontFamily: 'inherit' }} />
          <input placeholder="سعر البيع" type="number" value={newPrice.sellPrice ?? ''}
            onChange={e => setNewPrice({ ...newPrice, sellPrice: parseInt(e.target.value) || 0 })}
            style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.78rem', fontFamily: 'inherit' }} />
          <button onClick={addPrice} style={{
            padding: '6px 10px', borderRadius: '6px', border: 'none',
            background: colors.accent, color: '#fff', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>إضافة</button>
        </div>
      </div>
    </div>
  );
}
