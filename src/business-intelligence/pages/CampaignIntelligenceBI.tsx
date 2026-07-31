import { useState, useEffect } from 'react';
import { createBusinessAPI, type BusinessAPI } from '../api';
import type { CampaignInsight } from '../types';
import { useThemeColors } from '../../hooks/useThemeColors';

const api: BusinessAPI = createBusinessAPI();

export function CampaignIntelligenceBI() {
  const colors = useThemeColors();
  const [data, setData] = useState<CampaignInsight[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.getCampaignInsights().then(setData);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {data.length === 0 && (
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem' }}>لا توجد حملات بعد</div>
      )}
      {data.map(c => (
        <div key={c.id} style={{
          background: colors.bgCard, border: `1px solid ${c.isActive ? colors.border : colors.borderLight}`,
          borderRadius: '12px', padding: '16px', opacity: c.isActive ? 1 : 0.5,
        }}>
          <div
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <h3 style={{ color: colors.text, fontSize: '0.95rem', margin: 0 }}>
                {c.name}
                {!c.isActive && <span style={{ color: colors.textMuted, fontSize: '0.7rem', marginRight: '8px' }}>(غير نشطة)</span>}
              </h3>
              <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '4px' }}>
                ROI: {c.roi}% · زوار: {c.visitors} · تحويل: {c.conversionRate}%
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: c.completionRate > 70 ? colors.success : colors.danger }}>{c.completionRate}%</div>
                <div style={{ fontSize: '0.6rem', color: colors.textMuted }}>إكمال</div>
              </div>
              <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{expandedId === c.id ? '▲' : '▼'}</span>
            </div>
          </div>

          {expandedId === c.id && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                {[
                  { label: 'ROI', value: `${c.roi}%` },
                  { label: 'الزوار', value: c.visitors },
                  { label: 'الألعاب', value: c.games },
                  { label: 'نسبة إكمال', value: `${c.completionRate}%` },
                  { label: 'طلبات استبدال', value: c.tradeRequests },
                  { label: 'واتساب', value: c.whatsappClicks },
                  { label: 'نسبة تحويل', value: `${c.conversionRate}%` },
                  { label: 'متوسط التركيز', value: c.avgFocusScore.toFixed(1) },
                  { label: 'الزوار العائدون', value: c.returningVisitors },
                ].map(item => (
                  <div key={item.label} style={{ background: colors.bgInput, borderRadius: '6px', padding: '6px 10px' }}>
                    <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{item.label}</div>
                    <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* AI Summary */}
              <div style={{
                marginTop: '12px', padding: '10px 14px',
                background: colors.infoBg, borderRadius: '8px',
                border: `1px solid ${colors.infoBg}`,
              }}>
                <div style={{ color: colors.info, fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>AI تحليل</div>
                <div style={{ color: colors.textSecondary, fontSize: '0.82rem' }}>{c.aiSummary}</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
