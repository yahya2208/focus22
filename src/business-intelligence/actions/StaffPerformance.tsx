import { useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DemoBadge, DemoNotice } from '../DemoBadge';
import { generateId } from '../data-source';
import type { DataSource } from '../data-source';
import type { StaffMember } from './types';

const STAFF_KEY = 'bi_staff';
const SOURCE_KEY = 'bi_staff_source';

function loadStaff(): { staff: StaffMember[]; source: DataSource } {
  try {
    const stored = localStorage.getItem(STAFF_KEY);
    const source = (localStorage.getItem(SOURCE_KEY) as DataSource) ?? 'demo';
    return { staff: stored ? JSON.parse(stored) : [], source: stored ? source : 'demo' };
  } catch { return { staff: [], source: 'demo' }; }
}

function saveStaff(staff: StaffMember[], source: DataSource) {
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
  localStorage.setItem(SOURCE_KEY, source);
}

export function StaffPerformance() {
  const colors = useThemeColors();
  const [{ staff, source }, setState] = useState(loadStaff);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newStaff, setNewStaff] = useState<Partial<StaffMember>>({});

  const addStaff = () => {
    if (!newStaff.name) return;
    const member: StaffMember = {
      id: generateId(),
      name: newStaff.name,
      role: newStaff.role ?? 'مندوب مبيعات',
      phone: newStaff.phone ?? '',
      email: newStaff.email ?? '',
      joinDate: new Date().toISOString().split('T')[0]!,
      totalSales: 0, totalRevenue: 0, conversionRate: 0, avgTicket: 0, customersServed: 0, rating: 3.0, monthlyTrend: [],
    };
    const updated = [...staff, member];
    setState({ staff: updated, source: 'live' });
    saveStaff(updated, 'live');
    setShowAdd(false);
    setNewStaff({});
  };

  const teamTotalSales = staff.reduce((s, m) => s + m.totalSales, 0);
  const teamTotalRevenue = staff.reduce((s, m) => s + m.totalRevenue, 0);
  const avgConversion = staff.reduce((s, m) => s + m.conversionRate, 0) / staff.length;
  const topPerformer = [...staff].sort((a, b) => b.totalSales - a.totalSales)[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>Staff Performance</h2>
          <DemoBadge source={source} />
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          padding: '8px 18px', borderRadius: '8px', border: 'none',
          background: colors.accent, color: '#fff', fontSize: '0.82rem',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}>
          {showAdd ? 'إلغاء' : '+ إضافة موظف'}
        </button>
      </div>

      {/* Add Staff Form */}
      {showAdd && (
        <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '14px 16px' }}>
          <h3 style={{ color: colors.text, fontSize: '0.85rem', margin: '0 0 10px 0' }}>إضافة موظف جديد</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input placeholder="الاسم" value={newStaff.name ?? ''} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="المنصب" value={newStaff.role ?? ''} onChange={e => setNewStaff({ ...newStaff, role: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <input placeholder="رقم الهاتف" value={newStaff.phone ?? ''} onChange={e => setNewStaff({ ...newStaff, phone: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit' }} />
            <button onClick={addStaff} style={{
              padding: '10px', borderRadius: '8px', border: 'none', background: colors.accent, color: '#fff',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>إضافة</button>
          </div>
        </div>
      )}

      {source !== 'live' && <DemoNotice />}

      {/* Team Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
        <SummaryCard colors={colors} label="إجمالي المبيعات" value={teamTotalSales.toString()} color={colors.accent} />
        <SummaryCard colors={colors} label="إجمالي الإيرادات" value={`${(teamTotalRevenue / 1000000).toFixed(1)}M د.ج`} color={colors.success} />
        <SummaryCard colors={colors} label="متوسط التحويل" value={`${avgConversion.toFixed(0)}%`} color={colors.info} />
        <SummaryCard colors={colors} label="الأفضل" value={topPerformer?.name ?? '—'} color={colors.warning} />
      </div>

      {/* Staff List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {staff.map(s => (
          <div key={s.id} onClick={() => setSelectedStaff(selectedStaff === s.id ? null : s.id)} style={{
            background: colors.bgCard, border: `1px solid ${selectedStaff === s.id ? colors.accent + '40' : colors.border}`,
            borderRadius: '10px', padding: '10px 14px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{s.name}</div>
                <div style={{ color: colors.textMuted, fontSize: '0.72rem' }}>{s.role}</div>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.accent, fontSize: '0.9rem', fontWeight: 700 }}>{s.totalSales}</div>
                  <div style={{ color: colors.textMuted, fontSize: '0.6rem' }}>مبيعات</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: colors.success, fontSize: '0.9rem', fontWeight: 700 }}>{s.conversionRate}%</div>
                  <div style={{ color: colors.textMuted, fontSize: '0.6rem' }}>تحويل</div>
                </div>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <span key={star} style={{ color: star <= Math.round(s.rating) ? '#f1c40f' : colors.border, fontSize: '0.75rem' }}>★</span>
                  ))}
                </div>
              </div>
            </div>
            {selectedStaff === s.id && (
              <div style={{ marginTop: '12px', borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.72rem' }}>
                  <Detail colors={colors} label="متوسط التذكرة" value={`${s.avgTicket.toLocaleString()} د.ج`} />
                  <Detail colors={colors} label="الزبائن" value={s.customersServed.toString()} />
                  <Detail colors={colors} label="العمل منذ" value={s.joinDate} />
                  <Detail colors={colors} label="الهاتف" value={s.phone || '—'} />
                </div>
                {s.monthlyTrend.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ color: colors.textMuted, fontSize: '0.6rem', marginBottom: '4px' }}>الاتجاه الشهري</div>
                    <MiniTrend data={s.monthlyTrend} colors={colors} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ colors, label, value, color }: { colors: ReturnType<typeof useThemeColors>; label: string; value: string; color: string }) {
  return (
    <div style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '10px 14px' }}>
      <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color, marginTop: '2px' }}>{value}</div>
    </div>
  );
}

function Detail({ colors, label, value }: { colors: ReturnType<typeof useThemeColors>; label: string; value: string }) {
  return (
    <div>
      <span style={{ color: colors.textMuted }}>{label}: </span>
      <span style={{ color: colors.text }}>{value}</span>
    </div>
  );
}

function MiniTrend({ data, colors }: { data: number[]; colors: ReturnType<typeof useThemeColors> }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '40px' }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${(v / max) * 100}%`, minHeight: '4px',
          background: colors.accent, borderRadius: '2px 2px 0 0',
          opacity: 0.4 + (v / max) * 0.6,
        }} />
      ))}
    </div>
  );
}
