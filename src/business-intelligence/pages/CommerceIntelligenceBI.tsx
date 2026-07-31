import { useState, useEffect } from 'react';
import { createBusinessAPI, type BusinessAPI } from '../api';
import type { CommerceFunnel, AIInsight, Prediction } from '../types';
import { useThemeColors } from '../../hooks/useThemeColors';

const api: BusinessAPI = createBusinessAPI();

const stageLabels: Record<string, string> = {
  qr_scanned: 'مسح QR',
  landing_loaded: 'فتح الصفحة',
  consent_granted: 'قبول الشروط',
  calibration_completed: 'المعايرة',
  game_started: 'بدء اللعبة',
  game_completed: 'إكمال اللعبة',
  results_viewed: 'مشاهدة النتائج',
  register_cta_clicked: 'النقر على التسجيل',
  phone_service_opened: 'فتح الخدمات',
  trade_offer_viewed: 'مشاهدة العرض',
  trade_requested: 'طلب استبدال',
  whatsapp_clicked: 'واتساب',
};

export function CommerceIntelligenceBI() {
  const colors = useThemeColors();
  const [funnel, setFunnel] = useState<CommerceFunnel | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  useEffect(() => {
    Promise.all([
      api.getCommerceFunnel(),
      api.getAIInsights(),
      api.getPredictions(),
    ]).then(([f, i, p]) => {
      setFunnel(f);
      setInsights(i);
      setPredictions(p);
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Critical Drop-off Alert */}
      {funnel?.criticalDropOff && funnel.criticalDropOff.dropRate > 30 && (
        <div style={{
          background: colors.dangerBg, border: `1px solid ${colors.danger}`,
          borderRadius: '12px', padding: '14px 18px',
        }}>
          <div style={{ color: colors.danger, fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px' }}>
            ⚠ المشكلة ليست اللعبة — المشكلة {stageLabels[funnel.criticalDropOff.to] || funnel.criticalDropOff.to}
          </div>
          <div style={{ color: colors.textSecondary, fontSize: '0.8rem' }}>
            {funnel.criticalDropOff.dropRate}% من الزوار يغادرون عند "{stageLabels[funnel.criticalDropOff.to] || funnel.criticalDropOff.to}"
            (قادمين من "{stageLabels[funnel.criticalDropOff.from] || funnel.criticalDropOff.from}")
          </div>
        </div>
      )}

      {/* Funnel Visualization */}
      {funnel && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '12px', padding: '16px',
        }}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>مسار التحويل</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {funnel.stages.map((stage, i) => {
              const isCritical = funnel.criticalDropOff?.to === stage.name;
              const width = stage.percentage;
              return (
                <div key={stage.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ color: colors.text, fontSize: '0.8rem' }}>{stageLabels[stage.name] || stage.name}</span>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ color: colors.textSecondary, fontSize: '0.8rem', fontWeight: 600 }}>{stage.count}</span>
                      <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{stage.percentage}%</span>
                      {stage.dropFromPrevious > 0 && (
                        <span style={{ color: isCritical ? colors.danger : colors.warning, fontSize: '0.7rem' }}>
                          -{stage.dropFromPrevious}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    height: '24px', background: colors.bgInput, borderRadius: '6px', overflow: 'hidden',
                    border: isCritical ? `1px solid ${colors.danger}` : 'none',
                  }}>
                    <div style={{
                      width: `${Math.max(width, 2)}%`,
                      height: '100%',
                      background: isCritical ? colors.danger : i < 3 ? colors.info : i < 6 ? colors.accent : i < 9 ? colors.warning : colors.success,
                      borderRadius: '6px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Insights */}
      {insights.length > 0 && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '12px', padding: '16px',
        }}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>AI Insights</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {insights.map((insight, i) => (
              <div key={i} style={{
                display: 'flex', gap: '10px', alignItems: 'flex-start',
                padding: '10px 14px', borderRadius: '8px',
                background: insight.type === 'problem' ? colors.dangerBg
                  : insight.type === 'alert' ? colors.warningBg
                  : insight.type === 'recommendation' ? colors.infoBg
                  : colors.bgInput,
                border: `1px solid ${
                  insight.type === 'problem' ? colors.danger
                  : insight.type === 'alert' ? colors.warning
                  : insight.type === 'recommendation' ? colors.info
                  : colors.border
                }40`,
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', marginTop: '5px',
                  background: insight.type === 'problem' ? colors.danger
                    : insight.type === 'alert' ? colors.warning
                    : insight.type === 'recommendation' ? colors.info
                    : colors.success,
                }} />
                <div>
                  <div style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 600 }}>{insight.title}</div>
                  <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginTop: '2px' }}>{insight.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Predictions */}
      {predictions.length > 0 && (
        <div style={{
          background: colors.bgCard, border: `1px solid ${colors.border}`,
          borderRadius: '12px', padding: '16px',
        }}>
          <h3 style={{ color: colors.text, fontSize: '0.9rem', margin: '0 0 12px 0' }}>Prediction Engine</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {predictions.slice(0, 20).map(p => (
              <div key={p.visitorId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', background: colors.bgInput, borderRadius: '6px',
              }}>
                <span style={{ color: colors.text, fontSize: '0.8rem' }}>
                  {p.visitorId.slice(0, 8)}...
                </span>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: p.purchaseProbability > 70 ? colors.success : colors.text }}>{p.purchaseProbability}%</div>
                    <div style={{ fontSize: '0.6rem', color: colors.textMuted }}>شراء</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: p.whatsappProbability > 70 ? colors.success : colors.text }}>{p.whatsappProbability}%</div>
                    <div style={{ fontSize: '0.6rem', color: colors.textMuted }}>واتساب</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: p.returnProbability > 50 ? colors.success : colors.warning }}>{p.returnProbability}%</div>
                    <div style={{ fontSize: '0.6rem', color: colors.textMuted }}>عودة</div>
                  </div>
                  {p.needsDiscount && (
                    <span style={{ background: colors.warningBg, color: colors.warning, fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px' }}>
                      خصم
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
