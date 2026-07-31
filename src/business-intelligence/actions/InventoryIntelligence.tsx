import { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DemoBadge, DemoNotice } from '../DemoBadge';
import { generateId } from '../data-source';
import type { DataSource } from '../data-source';
import type { InventoryItem } from './types';

const INVENTORY_KEY = 'bi_inventory';
const SOURCE_KEY = 'bi_inventory_source';

function loadInventory(): { items: InventoryItem[]; source: DataSource } {
  try {
    const stored = localStorage.getItem(INVENTORY_KEY);
    const source = (localStorage.getItem(SOURCE_KEY) as DataSource) ?? 'demo';
    return { items: stored ? JSON.parse(stored) : [], source: stored ? source : 'demo' };
  } catch { return { items: [], source: 'demo' }; }
}

function saveInventory(items: InventoryItem[], source: DataSource) {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(items));
  localStorage.setItem(SOURCE_KEY, source);
}

function getStockStatus(item: InventoryItem): 'out' | 'low' | 'normal' | 'over' {
  if (item.quantity <= 0) return 'out';
  if (item.quantity <= item.minThreshold) return 'low';
  if (item.quantity > item.minThreshold * 3) return 'over';
  return 'normal';
}

export function InventoryIntelligence() {
  const colors = useThemeColors();
  const [{ items, source }, setState] = useState(loadInventory);
  const [editId, setEditId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({});

  const addItem = () => {
    if (!newItem.brand || !newItem.model) return;
    const item: InventoryItem = {
      id: generateId(),
      brand: newItem.brand,
      model: newItem.model,
      storage: newItem.storage ?? '',
      sku: newItem.sku ?? `${(newItem.brand ?? '').slice(0, 3).toUpperCase()}-XX-XX`,
      quantity: newItem.quantity ?? 0,
      minThreshold: newItem.minThreshold ?? 3,
      buyPrice: newItem.buyPrice ?? 0,
      sellPrice: newItem.sellPrice ?? 0,
      location: newItem.location ?? '',
      lastRestocked: new Date().toISOString().split('T')[0]!,
    };
    const updated = [...items, item];
    setState({ items: updated, source: 'live' });
    saveInventory(updated, 'live');
    setShowAdd(false);
    setNewItem({});
  };

  const confirmEdit = () => {
    if (editId != null && editItem) {
      const updated = items.map(i => i.id === editId ? editItem : i);
      setState({ items: updated, source: 'live' });
      saveInventory(updated, 'live');
      setEditId(null);
      setEditItem(null);
    }
  };

  const deleteItem = (id: string) => {
    const updated = items.filter(i => i.id !== id);
    setState({ items: updated, source: 'live' });
    saveInventory(updated, 'live');
  };

  const lowStockItems = items.filter(i => getStockStatus(i) === 'low' || getStockStatus(i) === 'out');
  const totalStockValue = items.reduce((s, i) => s + i.quantity * i.buyPrice, 0);
  const totalPotentialRevenue = items.reduce((s, i) => s + i.quantity * i.sellPrice, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>Inventory Intelligence</h2>
          <DemoBadge source={source} />
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '8px 18px', borderRadius: '8px', border: 'none',
          background: colors.accent, color: '#fff', fontSize: '0.82rem',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}>
          {showAdd ? 'إلغاء' : '+ إضافة جهاز'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '14px 16px' }}>
          <h3 style={{ color: colors.text, fontSize: '0.85rem', margin: '0 0 10px 0' }}>إضافة جهاز للمخزون</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <input placeholder="العلامة" value={newItem.brand ?? ''} onChange={e => setNewItem({ ...newItem, brand: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="الموديل" value={newItem.model ?? ''} onChange={e => setNewItem({ ...newItem, model: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="السعة" value={newItem.storage ?? ''} onChange={e => setNewItem({ ...newItem, storage: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="الكمية" type="number" value={newItem.quantity ?? ''} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="الحد الأدنى" type="number" value={newItem.minThreshold ?? 3} onChange={e => setNewItem({ ...newItem, minThreshold: parseInt(e.target.value) || 1 })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="سعر الشراء" type="number" value={newItem.buyPrice ?? ''} onChange={e => setNewItem({ ...newItem, buyPrice: parseInt(e.target.value) || 0 })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="سعر البيع" type="number" value={newItem.sellPrice ?? ''} onChange={e => setNewItem({ ...newItem, sellPrice: parseInt(e.target.value) || 0 })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="الموقع" value={newItem.location ?? ''} onChange={e => setNewItem({ ...newItem, location: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
          </div>
          <button onClick={addItem} style={{
            marginTop: '10px', width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
            background: colors.accent, color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>إضافة</button>
        </div>
      )}

      {source !== 'live' && <DemoNotice />}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
        <SummaryBox colors={colors} label="إجمالي القطع" value={items.reduce((s, i) => s + i.quantity, 0).toString()} color={colors.text} />
        <SummaryBox colors={colors} label="قيمة المخزون" value={`${(totalStockValue / 1000000).toFixed(1)}M د.ج`} color={colors.warning} />
        <SummaryBox colors={colors} label="العائد المحتمل" value={`${(totalPotentialRevenue / 1000000).toFixed(1)}M د.ج`} color={colors.success} />
        <SummaryBox colors={colors} label="منخفض/منتهي" value={lowStockItems.length.toString()} color={colors.danger} />
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div style={{
          background: colors.dangerBg ?? '#e74c3c15', border: `1px solid #e74c3c40`,
          borderRadius: '10px', padding: '12px 14px',
        }}>
          <div style={{ color: '#e74c3c', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>
            ⚠️ مخزون منخفض — {lowStockItems.length} أجهزة تحتاج توريد
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {lowStockItems.map(item => (
              <span key={item.id} style={{
                padding: '3px 10px', borderRadius: '6px', background: '#e74c3c15',
                color: '#e74c3c', fontSize: '0.72rem',
              }}>
                {item.brand} {item.model} ({item.quantity}/{item.minThreshold})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map(item => {
          const status = getStockStatus(item);
          const statusColor = status === 'out' ? '#e74c3c' : status === 'low' ? '#f39c12' : status === 'over' ? '#3498db' : colors.success;
          return (
            <div key={item.id} style={{
              background: colors.bgCard, border: `1px solid ${editId === item.id ? colors.accent + '40' : colors.border}`,
              borderRadius: '8px', padding: '8px 12px',
            }}>
              {editId === item.id && editItem ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={editItem.brand} onChange={e => setEditItem({ ...editItem, brand: e.target.value })}
                    style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.72rem' }} />
                  <input value={editItem.model} onChange={e => setEditItem({ ...editItem, model: e.target.value })}
                    style={{ width: '80px', padding: '4px 6px', borderRadius: '4px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.72rem' }} />
                  <input type="number" value={editItem.quantity} onChange={e => setEditItem({ ...editItem, quantity: parseInt(e.target.value) || 0 })}
                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.72rem' }} />
                  <input type="number" value={editItem.sellPrice} onChange={e => setEditItem({ ...editItem, sellPrice: parseInt(e.target.value) || 0 })}
                    style={{ width: '70px', padding: '4px 6px', borderRadius: '4px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.72rem' }} />
                  <button onClick={confirmEdit} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: colors.success, color: '#fff', fontSize: '0.7rem', cursor: 'pointer' }}>حفظ</button>
                  <button onClick={() => setEditId(null)} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: colors.bgInput, color: colors.textMuted, fontSize: '0.7rem', cursor: 'pointer' }}>إلغاء</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '10px', height: '10px', borderRadius: '50%', background: statusColor, flexShrink: 0,
                    }} />
                    <div>
                      <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 600 }}>
                        {item.brand} {item.model}
                      </span>
                      <span style={{ color: colors.textMuted, fontSize: '0.68rem', marginLeft: '6px' }}>
                        {item.storage} · {item.sku} · {item.location}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: statusColor, fontSize: '0.9rem', fontWeight: 700 }}>{item.quantity}</div>
                      <div style={{ color: colors.textMuted, fontSize: '0.6rem' }}>{status === 'out' ? 'نفذ' : status === 'low' ? 'منخفض' : status === 'over' ? 'فائض' : 'جيد'}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: colors.success, fontSize: '0.75rem', fontWeight: 600 }}>{item.sellPrice.toLocaleString()}</div>
                      <div style={{ color: colors.textMuted, fontSize: '0.6rem' }}>د.ج</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => { setEditId(item.id); setEditItem({ ...item }); }}
                        style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: colors.infoBg, color: colors.info, fontSize: '0.65rem', cursor: 'pointer' }}>تعديل</button>
                      <button onClick={() => deleteItem(item.id)}
                        style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: '#e74c3c20', color: '#e74c3c', fontSize: '0.65rem', cursor: 'pointer' }}>حذف</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryBox({ colors, label, value, color }: { colors: ReturnType<typeof useThemeColors>; label: string; value: string; color?: string }) {
  return (
    <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '12px 14px', textAlign: 'center' }}>
      <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: color ?? colors.text, marginTop: '4px' }}>{value}</div>
    </div>
  );
}
