import { useState, useEffect } from 'react';
import { useAppDispatch } from '../store/navigation';
import { useTranslation } from '../hooks/useTranslation';
import { useThemeColors } from '../hooks/useThemeColors';
import { createBusinessAPI, type BusinessAPI } from './api';
import type { TreasureModeData, BIDashboardId } from './types';
import { CommandCenter } from './pages/CommandCenter';
import { CustomerIntelligence } from './pages/CustomerIntelligence';
import { DeviceIntelligenceBI } from './pages/DeviceIntelligenceBI';
import { CampaignIntelligenceBI } from './pages/CampaignIntelligenceBI';
import { CommerceIntelligenceBI } from './pages/CommerceIntelligenceBI';
import {
  SmartOfferEngine, TradePriceEngine, NotificationCenter,
  AIAssistant, StaffPerformance, InventoryIntelligence,
  OpportunityScoring, CompetitiveDashboard,
} from './actions';
import { QualityDashboard } from './QualityDashboard';
import { CEOMode } from './actions/CEOMode';
import { RuleEngine } from './actions/RuleEngine';
import { AIFeedbackLoop } from './actions/AIFeedbackLoop';
import { RecommendationEngine } from './actions/RecommendationEngine';

const api: BusinessAPI = createBusinessAPI();

const dashboards: { id: BIDashboardId; label: string; icon: string }[] = [
  { id: 'treasure', label: 'Treasure Mode', icon: '👑' },
  { id: 'command', label: 'Command Center', icon: '📊' },
  { id: 'customers', label: 'Customer Intelligence', icon: '👤' },
  { id: 'devices', label: 'Device Intelligence', icon: '📱' },
  { id: 'campaigns', label: 'Campaign Intelligence', icon: '📢' },
  { id: 'commerce', label: 'Commerce Intelligence', icon: '💰' },
  { id: 'actions', label: 'Action Center', icon: '⚡' },
  { id: 'smart-offers', label: 'Smart Offers', icon: '🎯' },
  { id: 'trade-prices', label: 'Trade Prices', icon: '💲' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'staff', label: 'Staff', icon: '👥' },
  { id: 'notifications', label: 'Alerts', icon: '🔔' },
  { id: 'ai-assistant', label: 'AI Assistant', icon: '🤖' },
  { id: 'opportunities', label: 'Scoring', icon: '🏆' },
  { id: 'competitive', label: 'Competitive', icon: '🏪' },
  { id: 'ceo', label: 'CEO Mode', icon: '👔' },
  { id: 'recommendations', label: 'Recommendations', icon: '💡' },
  { id: 'feedback', label: 'AI Feedback', icon: '👍' },
  { id: 'rules', label: 'Rule Engine', icon: '⚙️' },
  { id: 'quality', label: 'Data Quality', icon: '🔍' },
];

export function BusinessIntelligenceCenter() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [active, setActive] = useState<BIDashboardId>('treasure');
  const [treasure, setTreasure] = useState<TreasureModeData | null>(null);

  useEffect(() => {
    if (active === 'treasure') {
      api.getTreasureMode().then(setTreasure);
    }
  }, [active]);

  const renderDashboard = () => {
    switch (active) {
      case 'treasure': return <TreasureMode data={treasure} onNavigate={setActive} />;
      case 'command': return <CommandCenter />;
      case 'customers': return <CustomerIntelligence />;
      case 'devices': return <DeviceIntelligenceBI />;
      case 'campaigns': return <CampaignIntelligenceBI />;
      case 'commerce': return <CommerceIntelligenceBI />;
      case 'actions': return <ActionCenter onNavigate={setActive} />;
      case 'smart-offers': return <SmartOfferEngine />;
      case 'trade-prices': return <TradePriceEngine />;
      case 'inventory': return <InventoryIntelligence />;
      case 'staff': return <StaffPerformance />;
      case 'notifications': return <NotificationCenter />;
      case 'ai-assistant': return <AIAssistant />;
      case 'opportunities': return <OpportunityScoring />;
      case 'competitive': return <CompetitiveDashboard />;
      case 'ceo': return <CEOMode />;
      case 'recommendations': return <RecommendationEngine recommendations={[]} />;
      case 'feedback': return <AIFeedbackLoop recommendations={[]} />;
      case 'rules': return <RuleEngine />;
      case 'quality': return <QualityDashboard />;
    }
  };

  return (
    <nav aria-label="Business Intelligence Center" style={{ minHeight: '100vh', background: colors.bg }}>
      {/* Navigation */}
      <div style={{
        display: 'flex', padding: '0.5rem', gap: '0.25rem',
        overflowX: 'auto', borderBottom: `1px solid ${colors.border}`,
        background: colors.bgCard,
      }}>
        {dashboards.map(d => (
          <button
            key={d.id}
            onClick={() => setActive(d.id)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
              background: active === d.id ? colors.accent : 'transparent',
              color: active === d.id ? '#fff' : colors.textMuted,
              cursor: 'pointer', fontSize: '0.8125rem',
              fontWeight: active === d.id ? 600 : 400,
              whiteSpace: 'nowrap', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <span>{d.icon}</span>
            <span>{d.label}</span>
          </button>
        ))}
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
          style={{
            padding: '0.5rem 1rem', borderRadius: '8px',
            border: `1px solid ${colors.borderLight}`,
            background: 'transparent', color: colors.textMuted,
            cursor: 'pointer', fontSize: '0.8125rem',
            whiteSpace: 'nowrap', fontFamily: 'inherit',
          }}
        >
          {t('research.back')}
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '1rem' }}>
        {renderDashboard()}
      </div>
    </nav>
  );
}

function TreasureMode({
  data,
  onNavigate,
}: {
  data: TreasureModeData | null;
  onNavigate: (id: BIDashboardId) => void;
}) {
  const colors = useThemeColors();

  if (!data) {
    return (
      <div style={{ color: colors.textMuted, textAlign: 'center', padding: '4rem', fontSize: '1.2rem' }}>
        🏴‍☠️ Loading Treasure Mode...
      </div>
    );
  }

  const cards = [
    {
      icon: '🟢',
      title: 'الفرص',
      subtitle: `${data.opportunities.filter(o => o.visitCount >= 3 && !o.tradeRequested).length} شخصا يمكن تحويلهم إلى زبائن`,
      color: colors.success,
      bg: colors.successBg,
      onClick: () => onNavigate('customers'),
    },
    {
      icon: '🔴',
      title: 'المشاكل',
      subtitle: data.problems.length > 0 ? data.problems[0]!.title : 'لا توجد مشاكل',
      color: colors.danger,
      bg: colors.dangerBg,
      onClick: () => onNavigate('commerce'),
    },
    {
      icon: '🟡',
      title: 'التنبيهات',
      subtitle: data.alerts.length > 0 ? data.alerts[0]!.title : 'لا توجد تنبيهات',
      color: colors.warning,
      bg: colors.warningBg,
      onClick: () => onNavigate('commerce'),
    },
    {
      icon: '🔵',
      title: 'التوصيات',
      subtitle: data.recommendations.length > 0 ? data.recommendations[0]!.title : 'لا توجد توصيات',
      color: colors.info,
      bg: colors.infoBg,
      onClick: () => onNavigate('command'),
    },
    {
      icon: '🟣',
      title: 'الأجهزة الرائجة',
      subtitle: data.hotDevices.slice(0, 3).map(d => `${d.brand} ${d.model}`).join(' · '),
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.1)',
      onClick: () => onNavigate('devices'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hero Section — Today Summary */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.bgCard}, ${colors.bgInput})`,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px', padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ color: colors.text, fontSize: '1.3rem', margin: 0 }}>🏴‍☠️ Treasure Mode</h1>
            <div style={{ color: colors.textMuted, fontSize: '0.8rem', marginTop: '4px' }}>
              Business Intelligence Center
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums' }}>
              {data.todaySummary.visitors}
            </div>
            <div style={{ fontSize: '0.65rem', color: colors.textMuted, letterSpacing: '0.04em' }}>زائر اليوم</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
          {[
            { label: 'لعبوا', value: data.todaySummary.players, color: colors.info },
            { label: 'استبدال', value: data.todaySummary.tradeRequests, color: colors.warning },
            { label: 'واتساب', value: data.todaySummary.whatsappClicks, color: colors.success },
            { label: 'تحويل', value: `${data.todaySummary.conversionRate}%`, color: colors.accent },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: '0.6rem', color: colors.textMuted }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Treasure Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {cards.map(card => (
          <button
            key={card.title}
            onClick={card.onClick}
            style={{
              background: colors.bgCard, border: `1px solid ${card.color}30`,
              borderRadius: '12px', padding: '16px', cursor: 'pointer',
              textAlign: 'right', fontFamily: 'inherit',
              transition: 'transform 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.5rem' }}>{card.icon}</span>
              <span style={{ color: colors.text, fontSize: '1rem', fontWeight: 700 }}>{card.title}</span>
            </div>
            <div style={{ color: colors.textSecondary, fontSize: '0.8rem', marginRight: '2.2rem' }}>
              {card.subtitle}
            </div>
          </button>
        ))}
      </div>

      {/* Insight Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Problems */}
        {data.problems.slice(0, 3).map((p, i) => (
          <div key={`problem-${i}`} style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            padding: '12px 16px', borderRadius: '10px',
            background: colors.dangerBg, border: `1px solid ${colors.danger}30`,
          }}>
            <span style={{ fontSize: '1.2rem' }}>🔴</span>
            <div>
              <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{p.title}</div>
              <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>{p.description}</div>
            </div>
          </div>
        ))}

        {/* Recommendations */}
        {data.recommendations.slice(0, 3).map((r, i) => (
          <div key={`rec-${i}`} style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            padding: '12px 16px', borderRadius: '10px',
            background: colors.infoBg, border: `1px solid ${colors.info}30`,
          }}>
            <span style={{ fontSize: '1.2rem' }}>🔵</span>
            <div>
              <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{r.title}</div>
              <div style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>{r.description}</div>
            </div>
          </div>
        ))}

        {/* Hot Devices */}
        {data.hotDevices.length > 0 && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px',
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.2rem' }}>🟣</span>
              <span style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>الأجهزة الرائجة</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {data.hotDevices.slice(0, 5).map(d => (
                <span key={`${d.brand}-${d.model}`} style={{
                  background: 'rgba(168, 85, 247, 0.15)',
                  color: '#d48aff', padding: '4px 12px', borderRadius: '6px',
                  fontSize: '0.75rem',
                }}>
                  {d.brand} {d.model}
                  <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                    {d.trend === 'up' ? '↑' : d.trend === 'down' ? '↓' : '→'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCenter({ onNavigate }: { onNavigate: (id: BIDashboardId) => void }) {
  const colors = useThemeColors();

  const actionCards = [
    { icon: '🎯', title: 'Smart Offers', desc: 'إنشاء عروض ذكية مخصصة للزوار بناءً على سلوكهم', action: 'smart-offers' as const },
    { icon: '💲', title: 'Trade Prices', desc: 'إدارة أسعار الشراء والبيع وحساب الأرباح', action: 'trade-prices' as const },
    { icon: '📦', title: 'Inventory Intelligence', desc: 'مراقبة المخزون والتنبيه عند انخفاض الكميات', action: 'inventory' as const },
    { icon: '👥', title: 'Staff Performance', desc: 'تتبع أداء الموظفين والمبيعات الفردية', action: 'staff' as const },
    { icon: '🔔', title: 'Notification Center', desc: 'إشعارات وتحليلات فورية عن المتجر', action: 'notifications' as const },
    { icon: '🤖', title: 'AI Assistant', desc: 'مساعد تحليل ذكي — اسأل عن متجرك بالعربية', action: 'ai-assistant' as const },
    { icon: '🏆', title: 'Opportunity Scoring', desc: 'تقييم ذكي لفرص البيع لكل زائر', action: 'opportunities' as const },
    { icon: '🏪', title: 'Competitive Dashboard', desc: 'مقارنة أداء الفروع', action: 'competitive' as const },
    { icon: '👔', title: 'CEO Mode', desc: 'نظرة تنفيذية سريعة على أهم المؤشرات', action: 'ceo' as const },
    { icon: '💡', title: 'Recommendations', desc: 'توصيات مدعومة بالأدلة ونسبة ثقة', action: 'recommendations' as const },
    { icon: '👍', title: 'AI Feedback', desc: 'سجل الموافقة على توصيات الذكاء الاصطناعي', action: 'feedback' as const },
    { icon: '⚙️', title: 'Rule Engine', desc: 'قواعد أتمتة IF-THEN لتنفيذ إجراءات تلقائية', action: 'rules' as const },
    { icon: '🔍', title: 'Data Quality', desc: 'فحص جودة البيانات واكتشاف المشاكل', action: 'quality' as const },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>⚡ Action Center</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
        {actionCards.map(card => (
          <button key={card.action} onClick={() => onNavigate(card.action)} style={{
            background: colors.bgCard, border: `1px solid ${colors.border}`,
            borderRadius: '12px', padding: '16px', cursor: 'pointer',
            textAlign: 'right', fontFamily: 'inherit',
            transition: 'transform 0.15s ease',
          }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{card.icon}</div>
            <div style={{ color: colors.text, fontSize: '0.9rem', fontWeight: 700 }}>{card.title}</div>
            <div style={{ color: colors.textSecondary, fontSize: '0.75rem', marginTop: '4px' }}>{card.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
