import { useState, useEffect } from 'react';
import { createBusinessAPI } from '../api';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Opportunity } from '../types';
import type { BranchData } from './types';

const api = createBusinessAPI();

interface ScoredOpportunity extends Opportunity {
  score: number;
  actions: string[];
  priority: 'high' | 'medium' | 'low';
}

function scoreOpportunity(o: Opportunity): ScoredOpportunity {
  let score = 0;
  const actions: string[] = [];

  if (o.visitCount >= 3) { score += 30; actions.push('زائر مخلص (3+ زيارات)'); }
  else if (o.visitCount >= 2) { score += 15; actions.push('زائر عائد'); }

  if (o.tradeRequested) { score += 25; actions.push('طلب استبدال — فرصة بيع'); }

  if (o.whatsappClicked) { score += 15; actions.push('تفاعل عبر واتساب'); }

  if (o.campaignSource) { score += 10; actions.push('أتى عبر حملة'); }

  if (o.lastDevice) { score += 5; actions.push(`الجهاز: ${o.lastDevice}`); }

  if (o.timeSinceLastVisit) {
    const days = parseInt(o.timeSinceLastVisit);
    if (days <= 7) { score += 15; actions.push('زيارة حديثة (أقل من أسبوع)'); }
    else if (days <= 30) { score += 10; actions.push('زيارة خلال شهر'); }
  }

  let priority: 'high' | 'medium' | 'low' = 'low';
  if (score >= 50) priority = 'high';
  else if (score >= 25) priority = 'medium';

  return { ...o, score, actions, priority };
}

export function OpportunityScoring() {
  const colors = useThemeColors();
  const [scored, setScored] = useState<ScoredOpportunity[]>([]);
  const [sortBy, setSortBy] = useState<'score' | 'visitCount' | 'name'>('score');

  useEffect(() => {
    api.getCustomerList().then(customers => {
      setScored(customers.map(scoreOpportunity).sort((a, b) => b.score - a.score));
    });
  }, []);

  const sorted = [...scored].sort((a, b) => {
    if (sortBy === 'score') return b.score - a.score;
    if (sortBy === 'visitCount') return b.visitCount - a.visitCount;
    return a.displayName.localeCompare(b.displayName);
  });

  const priorityColors = { high: '#e74c3c', medium: '#f39c12', low: colors.textMuted };
  const scoreColors = { high: '#e74c3c20', medium: '#f39c1220', low: 'transparent' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>فرص البيع — تقييم ذكي</h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['score', 'visitCount', 'name'] as const).map(key => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              padding: '4px 10px', borderRadius: '6px', border: 'none',
              background: sortBy === key ? colors.accent + '30' : colors.bgInput,
              color: sortBy === key ? colors.accent : colors.textMuted,
              fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {key === 'score' ? 'التقييم' : key === 'visitCount' ? 'الزيارات' : 'الاسم'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <SummaryCard colors={colors} label="فرص عالية" value={scored.filter(s => s.priority === 'high').length.toString()} color="#e74c3c" />
        <SummaryCard colors={colors} label="فرص متوسطة" value={scored.filter(s => s.priority === 'medium').length.toString()} color="#f39c12" />
        <SummaryCard colors={colors} label="متوسط التقييم" value={scored.length > 0 ? Math.round(scored.reduce((s, o) => s + o.score, 0) / scored.length).toString() : '0'} color={colors.accent} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sorted.map(o => (
          <div key={o.userId} style={{
            background: colors.bgCard,
            border: `1px solid ${scoreColors[o.priority] || colors.border}`,
            borderRight: `4px solid ${priorityColors[o.priority]}`,
            borderRadius: '10px', padding: '10px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{o.displayName}</div>
                <div style={{ color: colors.textMuted, fontSize: '0.7rem', marginTop: '2px' }}>
                  {o.visitCount} زيارات
                  {o.lastDevice ? ` · آخر جهاز: ${o.lastDevice}` : ''}
                  {o.timeSinceLastVisit ? ` · آخر زيارة: ${o.timeSinceLastVisit}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: o.score >= 50 ? '#e74c3c' : o.score >= 25 ? '#f39c12' : colors.bgInput,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: o.score >= 25 ? '#fff' : colors.textMuted,
                  fontWeight: 700, fontSize: '0.85rem',
                }}>
                  {o.score}
                </div>
              </div>
            </div>
            {o.actions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {o.actions.map((action, i) => (
                  <span key={i} style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem',
                    background: colors.accent + '15', color: colors.accent,
                  }}>
                    {action}
                  </span>
                ))}
              </div>
            )}
            {o.campaignSource && (
              <div style={{ color: colors.textMuted, fontSize: '0.68rem', marginTop: '4px' }}>
                المصدر: {o.campaignSource}
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
    <div style={{
      flex: 1, background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '10px', padding: '10px 14px', textAlign: 'center',
    }}>
      <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color, marginTop: '2px' }}>{value}</div>
    </div>
  );
}

// Comparator Dashboard

export function CompetitiveDashboard() {
  const colors = useThemeColors();
  const [branches, setBranches] = useState<BranchData[]>([]);

  useEffect(() => {
    api.getBranchData().then(setBranches).catch(() => {});
  }, []);

  if (branches.length === 0) {
    return (
      <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
        لا توجد فروع للمقارنة. أضف فروعاً من إعدادات المتجر.
      </div>
    );
  }

  const metrics = [
    { key: 'totalVisitors' as const, label: 'الزوار', color: colors.info },
    { key: 'totalSales' as const, label: 'المبيعات', color: colors.success },
    { key: 'conversionRate' as const, label: 'نسبة التحويل', color: colors.accent, suffix: '%' },
    { key: 'revenue' as const, label: 'الإيرادات', color: colors.warning, format: (v: number) => `${(v / 1000000).toFixed(1)}M` },
  ];

  const maxVals: Record<string, number> = {};
  for (const metric of metrics) {
    maxVals[metric.key] = Math.max(...branches.map(b => b[metric.key] ?? 0), 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>مقارنة الفروع</h2>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>الفرع</th>
              {metrics.map(m => (
                <th key={m.key} style={{ textAlign: 'center', padding: '6px 8px', color: m.color, borderBottom: `1px solid ${colors.border}` }}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branches.map(b => (
              <tr key={b.id}>
                <td style={{ padding: '8px', borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ color: colors.text, fontWeight: 600 }}>{b.name}</span>
                  <span style={{ color: colors.textMuted, fontSize: '0.65rem', display: 'block' }}>{b.location}</span>
                </td>
                {metrics.map(m => (
                  <td key={m.key} style={{ textAlign: 'center', padding: '8px', borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ color: m.color, fontWeight: 600 }}>
                      {m.format ? m.format(b[m.key] ?? 0) : (b[m.key] ?? 0).toLocaleString()}{m.suffix ?? ''}
                    </div>
                    <div style={{
                      height: '3px', borderRadius: '2px', background: colors.bgInput, marginTop: '4px', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${((b[m.key] ?? 0) / (maxVals[m.key] ?? 1)) * 100}%`, height: '100%',
                        background: m.color, borderRadius: '2px',
                      }} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
