import { useState, useEffect } from 'react';
import { createBusinessAPI, type BusinessAPI } from '../api';
import type { DeviceInsight, DeviceModelInsight } from '../types';
import { useThemeColors } from '../../hooks/useThemeColors';

const api: BusinessAPI = createBusinessAPI();

export function DeviceIntelligenceBI() {
  const colors = useThemeColors();
  const [data, setData] = useState<DeviceInsight[]>([]);
  const [expandedOs, setExpandedOs] = useState<string | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<DeviceModelInsight | null>(null);

  useEffect(() => {
    api.getDeviceInsights().then(setData);
  }, []);

  return (
    <div style={{ display: 'flex', gap: '12px', height: 'calc(100vh - 120px)' }}>
      {/* Hierarchy Tree */}
      <div style={{
        width: '320px', flexShrink: 0, overflowY: 'auto',
        background: colors.bgCard, border: `1px solid ${colors.border}`,
        borderRadius: '12px', padding: '8px',
      }}>
        <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 8px' }}>الأجهزة</h3>
        {data.map(os => (
          <div key={os.os}>
            <button
              onClick={() => setExpandedOs(expandedOs === os.os ? null : os.os)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '8px 10px', borderRadius: '8px', border: 'none',
                background: expandedOs === os.os ? colors.bgHover : 'transparent',
                color: colors.text, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', textAlign: 'right',
              }}
            >
              <span>{os.os} ({os.totalCount})</span>
              <span style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{expandedOs === os.os ? '▼' : '◀'}</span>
            </button>
            {expandedOs === os.os && os.brands.map(b => (
              <div key={b.brand} style={{ marginRight: '12px' }}>
                <button
                  onClick={() => setExpandedBrand(expandedBrand === b.brand ? null : b.brand)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '6px 10px', borderRadius: '6px', border: 'none',
                    background: expandedBrand === b.brand ? colors.bgHover : 'transparent',
                    color: colors.textSecondary, cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', textAlign: 'right',
                  }}
                >
                  <span>{b.brand} ({b.count})</span>
                  <span style={{ color: colors.textMuted, fontSize: '0.6rem' }}>{expandedBrand === b.brand ? '▼' : '◀'}</span>
                </button>
                {expandedBrand === b.brand && b.models.map(m => (
                  <button
                    key={m.model}
                    onClick={() => setSelectedModel(m)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '4px 10px', borderRadius: '4px', border: 'none',
                      background: selectedModel?.model === m.model ? colors.infoBg : 'transparent',
                      color: selectedModel?.model === m.model ? colors.info : colors.textMuted,
                      cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit', textAlign: 'right', marginRight: '12px',
                    }}
                  >
                    <span>{m.marketingName} ({m.count})</span>
                    <span style={{ fontSize: '0.6rem' }}>{m.tradeRate}%</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Model Detail */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selectedModel ? (
          <div style={{ color: colors.textMuted, textAlign: 'center', padding: '4rem' }}>
            اختر جهازا لعرض التفاصيل
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              background: colors.bgCard, border: `1px solid ${colors.border}`,
              borderRadius: '12px', padding: '16px',
            }}>
              <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: '0 0 12px 0' }}>
                {selectedModel.marketingName}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                {[
                  { label: 'RAM', value: selectedModel.specs.ram },
                  { label: 'CPU', value: `${selectedModel.specs.cpuCores ?? '?'} نوى` },
                  { label: 'Refresh Rate', value: `${selectedModel.specs.refreshRate ?? '?'}Hz` },
                  { label: 'الدقة', value: selectedModel.specs.resolution },
                  { label: 'المتصفح', value: selectedModel.specs.browser },
                  { label: 'متوسط التركيز', value: selectedModel.avgFocusScore.toFixed(1) },
                  { label: 'متوسط RT', value: `${selectedModel.avgReactionTime}ms` },
                  { label: 'طلبات استبدال', value: selectedModel.tradeRequests },
                  { label: 'واتساب', value: selectedModel.whatsappClicks },
                  { label: 'نسبة استبدال', value: `${selectedModel.tradeRate}%` },
                  { label: 'آخر ظهور', value: selectedModel.lastSeen ? new Date(selectedModel.lastSeen).toLocaleDateString('ar') : '—' },
                ].map(item => (
                  <div key={item.label} style={{ background: colors.bgInput, borderRadius: '6px', padding: '6px 10px' }}>
                    <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{item.label}</div>
                    <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaigns for this device */}
            {selectedModel.campaigns.length > 0 && (
              <div style={{
                background: colors.bgCard, border: `1px solid ${colors.border}`,
                borderRadius: '12px', padding: '16px',
              }}>
                <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 8px 0' }}>الحملات</h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedModel.campaigns.map(c => (
                    <span key={c} style={{
                      background: colors.infoBg, color: colors.info,
                      padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem',
                    }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
