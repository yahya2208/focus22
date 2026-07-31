import { useState, useEffect } from 'react';
import { createBusinessAPI, type BusinessAPI } from '../api';
import type { CommandCenterData } from '../types';
import { useThemeColors } from '../../hooks/useThemeColors';

const api: BusinessAPI = createBusinessAPI();

const cardStyle = (colors: ReturnType<typeof useThemeColors>, borderColor = colors.border): React.CSSProperties => ({
  background: colors.bgCard,
  border: `1px solid ${borderColor}`,
  borderRadius: '12px',
  padding: '16px',
});

export function CommandCenter() {
  const colors = useThemeColors();
  const [data, setData] = useState<CommandCenterData | null>(null);

  useEffect(() => {
    api.getCommandCenter().then(setData);
  }, []);

  const opportunities = data?.opportunities.filter(o => o.visitCount >= 2 && !o.tradeRequested) ?? [];

  if (!data) {
    return <div style={{ color: colors.textMuted, padding: '2rem', textAlign: 'center' }}>Loading Command Center...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Today's Summary */}
      <div style={cardStyle(colors, colors.border)}>
        <h2 style={{ color: colors.text, fontSize: '1rem', margin: '0 0 12px 0' }}>🟢 اليوم</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
          {[
            { label: 'دخل', value: data.today.visitors, color: '#22c55e' },
            { label: 'لعبوا', value: data.today.players, color: '#3b82f6' },
            { label: 'طلب استبدال', value: data.today.tradeRequests, color: '#f59e0b' },
            { label: 'واتساب', value: data.today.whatsappClicks, color: '#22c55e' },
            { label: 'زبائن', value: data.today.customers, color: '#8b5cf6' },
            { label: 'تحويل', value: `${data.today.conversionRate}%`, color: '#ef4444' },
          ].map(item => (
            <div key={item.label} style={{
              background: colors.bgInput, borderRadius: '8px', padding: '10px 12px',
              border: `1px solid ${colors.borderLight}`,
            }}>
              <div style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Device + Campaigns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={cardStyle(colors)}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 0' }}>أكثر هاتف يريد الناس استبداله</h3>
          {data.topTradeInDevice ? (
            <div>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: colors.accent }}>
                {data.topTradeInDevice.brand} {data.topTradeInDevice.model}
              </span>
              <span style={{ color: colors.textMuted, fontSize: '0.8rem', marginLeft: '8px' }}>
                ({data.topTradeInDevice.count} طلب)
              </span>
            </div>
          ) : (
            <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>لا توجد بيانات كافية</span>
          )}
        </div>

        <div style={cardStyle(colors)}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 0' }}>أفضل حملة اليوم</h3>
          {data.bestCampaign ? (
            <div>
              <span style={{ fontSize: '1.1rem', fontWeight: 600, color: colors.success }}>{data.bestCampaign.name}</span>
              <span style={{ color: colors.textMuted, fontSize: '0.8rem', marginLeft: '8px' }}>({data.bestCampaign.score})</span>
            </div>
          ) : (
            <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>لا توجد حملات</span>
          )}
          {data.worstCampaign && (
            <div style={{ marginTop: '8px' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.75rem' }}>أسوأ: </span>
              <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{data.worstCampaign.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div style={cardStyle(colors, colors.successBg)}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: colors.success }}>●</span>
            فرص — زوار عادوا ولم يطلبوا استبدال
          </h3>
          <div style={{ fontSize: '0.85rem', color: colors.textSecondary, marginBottom: '10px' }}>
            يوجد {opportunities.length} شخصا عادوا أكثر من مرة ولم يطلبوا الاستبدال. اعرض عليهم خصما.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {opportunities.slice(0, 20).map(o => (
              <div key={o.userId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', background: colors.bgInput, borderRadius: '6px',
              }}>
                <div>
                  <span style={{ color: colors.text, fontSize: '0.8rem' }}>{o.displayName}</span>
                  <span style={{ color: colors.textMuted, fontSize: '0.7rem', marginLeft: '8px' }}>
                    {o.visitCount} زيارات · {o.gameCount} ألعاب
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {o.whatsappClicked && <span style={{ color: colors.success, fontSize: '0.7rem' }}>واتساب</span>}
                  <span style={{ color: colors.info, fontSize: '0.7rem' }}>{o.deviceInfo}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly Distribution */}
      <div style={cardStyle(colors)}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>توزيع الزيارات حسب الساعة</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100px' }}>
          {data.hourlyDistribution.map(h => {
            const max = Math.max(...data.hourlyDistribution.map(x => x.visitors), 1);
            const height = (h.visitors / max) * 100;
            return (
              <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <div style={{
                  width: '100%', height: `${Math.max(height, 2)}%`,
                  background: h.visitors > 0 ? colors.accent : colors.border,
                  borderRadius: '2px 2px 0 0',
                  opacity: h.visitors > 0 ? 0.6 + (h.visitors / max) * 0.4 : 0.3,
                }} />
                <span style={{ color: colors.textMuted, fontSize: '0.55rem' }}>{h.hour}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
