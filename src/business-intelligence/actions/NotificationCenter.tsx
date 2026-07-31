import { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DemoBadge, DemoNotice } from '../DemoBadge';
import type { DataSource } from '../data-source';
import type { StoreNotification } from './types';
const NOTIFICATIONS_KEY = 'bi_notifications';
const SOURCE_KEY = 'bi_notifications_source';

function loadNotifications(): { notifications: StoreNotification[]; source: DataSource } {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    const source = (localStorage.getItem(SOURCE_KEY) as DataSource) ?? 'demo';
    return { notifications: stored ? JSON.parse(stored) : [], source: stored ? source : 'demo' };
  } catch { return { notifications: [], source: 'demo' }; }
}

function saveNotifications(notes: StoreNotification[], source: DataSource) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notes));
  localStorage.setItem(SOURCE_KEY, source);
}

type Category = 'conversion' | 'inventory' | 'visitor' | 'campaign' | 'device' | 'all';
const categoryLabels: Record<Category, string> = {
  all: 'الكل', conversion: 'تحويل', inventory: 'مخزون', visitor: 'زوار', campaign: 'حملات', device: 'أجهزة',
};
const categoryColors: Record<Category, string> = {
  all: '#888', conversion: '#2ecc71', inventory: '#f39c12', visitor: '#3498db', campaign: '#9b59b6', device: '#e74c3c',
};

export function NotificationCenter() {
  const colors = useThemeColors();
  const [{ notifications, source }, setState] = useState(loadNotifications);
  const [filter, setFilter] = useState<Category>('all');
  const [showAll, setShowAll] = useState(false);

  const markRead = (id: string) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setState({ notifications: updated, source: 'live' });
    saveNotifications(updated, 'live');
  };

  const clearAll = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setState({ notifications: updated, source: 'live' });
    saveNotifications(updated, 'live');
  };

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.category === filter);
  const displayed = showAll ? filtered : filtered.slice(0, 15);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>
            الإشعارات {unreadCount > 0 && <span style={{ color: colors.accent, fontSize: '0.8rem' }}>({unreadCount})</span>}
          </h2>
          <DemoBadge source={source} />
        </div>
        <button onClick={clearAll} style={{
          padding: '4px 12px', borderRadius: '6px', border: 'none',
          background: colors.bgInput, color: colors.textMuted, fontSize: '0.72rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          تحديد الكل كمقروء
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {(Object.keys(categoryLabels) as Category[]).map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            padding: '4px 12px', borderRadius: '20px', border: 'none',
            background: filter === cat ? categoryColors[cat] + '30' : colors.bgInput,
            color: filter === cat ? categoryColors[cat] : colors.textMuted,
            fontSize: '0.72rem', fontWeight: filter === cat ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {categoryLabels[cat]}
            {cat !== 'all' && ` (${notifications.filter(n => n.category === cat).length})`}
          </button>
        ))}
      </div>

      {source !== 'live' && <DemoNotice />}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {displayed.length === 0 ? (
          <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
            لا توجد إشعارات
          </div>
        ) : (
          displayed.map(n => (
            <div key={n.id} onClick={() => markRead(n.id)} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '10px 12px', borderRadius: '10px',
              background: n.read ? colors.bgInput : colors.bgCard,
              border: `1px solid ${n.read ? 'transparent' : categoryColors[n.category] + '30'}`,
              cursor: 'pointer', opacity: n.read ? 0.7 : 1,
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%', marginTop: '4px', flexShrink: 0,
                background: n.read ? colors.border : categoryColors[n.category],
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', color: colors.text, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                <div style={{ fontSize: '0.74rem', color: colors.textSecondary, marginTop: '2px' }}>{n.message}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '0.65rem', color: colors.textMuted }}>
                  <span>{new Date(n.createdAt).toLocaleString('ar')}</span>
                  <span style={{
                    padding: '1px 6px', borderRadius: '3px',
                    background: categoryColors[n.category] + '20',
                    color: categoryColors[n.category],
                  }}>{categoryLabels[n.category]}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {filtered.length > 15 && !showAll && (
        <button onClick={() => setShowAll(true)} style={{
          padding: '8px', background: 'transparent', border: 'none',
          color: colors.accent, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          عرض الكل ({filtered.length})
        </button>
      )}
    </div>
  );
}
