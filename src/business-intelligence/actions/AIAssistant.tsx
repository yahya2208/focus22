import { useState, useEffect } from 'react';
import { createBusinessAPI } from '../api';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Opportunity, DeviceInsight, CampaignInsight, FunnelStage } from '../types';

const api = createBusinessAPI();

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  chartData?: { labels: string[]; values: number[]; type: 'bar' | 'line' | 'doughnut' };
}

function analyzeQuery(query: string, data: {
  opportunities: Opportunity[];
  devices: DeviceInsight[];
  campaigns: CampaignInsight[];
  funnel: FunnelStage[];
}): Message {
  const lower = query.toLowerCase();

  if (lower.includes('زيارة') || lower.includes('زائر') || lower.includes('visitor')) {
    const total = data.opportunities.length;
    const returning = data.opportunities.filter(o => o.visitCount >= 2).length;
    const withTrade = data.opportunities.filter(o => o.tradeRequested).length;
    return {
      role: 'assistant',
      text: `إحصائيات الزوار:\n• إجمالي الزوار: ${total}\n• الزوار العائدون (2+ زيارات): ${returning} (${total ? Math.round(returning / total * 100) : 0}%)\n• طلبوا استبدال: ${withTrade}\n• حملات واتساب: ${data.opportunities.filter(o => o.whatsappClicked).length}`,
      chartData: { labels: ['جدد', 'عائدون'], values: [total - returning, returning], type: 'doughnut' },
      timestamp: new Date(),
    };
  }

  if (lower.includes('تحويل') || lower.includes('conversion') || lower.includes('funnel') || lower.includes('مبيعات')) {
    const stages = data.funnel;
    const conversionRate = stages.length > 0 && stages[0]!.count > 0
      ? Math.round(stages[stages.length - 1]!.count / stages[0]!.count * 100) : 0;
    return {
      role: 'assistant',
      text: `مسار التحويل:\n• الزوار: ${stages[0]?.count ?? 0}\n• المبيعات: ${stages[stages.length - 1]?.count ?? 0}\n• نسبة التحويل: ${conversionRate}%\n\n${
        conversionRate < 20 ? 'نسبة التحويل منخفضة — هناك فرصة للتحسين.' :
        conversionRate < 35 ? 'نسبة تحويل جيدة، لكن لا يزال هناك مجال للتحسين.' :
        'أداء ممتاز! حافظ على هذا المستوى.'
      }`,
      chartData: { labels: stages.map(s => s.name), values: stages.map(s => s.count), type: 'bar' },
      timestamp: new Date(),
    };
  }

  if (lower.includes('جهاز') || lower.includes('device') || lower.includes('هاتف') || lower.includes('phone')) {
    const topDevices = data.devices.slice(0, 8);
    return {
      role: 'assistant',
      text: `أشهر الأجهزة:\n${topDevices.map(d => `• ${d.os}: ${d.totalCount} زائر`).join('\n')}\n\nإجمالي أنظمة التشغيل المسجلة: ${data.devices.length}`,
      chartData: { labels: topDevices.map(d => d.os), values: topDevices.map(d => d.totalCount), type: 'bar' },
      timestamp: new Date(),
    };
  }

  if (lower.includes('حملة') || lower.includes('campaign') || lower.includes('اعلان') || lower.includes('ad')) {
    const activeCampaigns = data.campaigns.filter(c => c.isActive);
    return {
      role: 'assistant',
      text: `معلومات الحملات:\n• الحملات النشطة: ${activeCampaigns.length}\n• إجمالي الحملات: ${data.campaigns.length}\n\n${
        activeCampaigns.length === 0 ? 'لا توجد حملات نشطة حالياً. هل تريد إنشاء حملة جديدة؟' :
        activeCampaigns.map(c => `• ${c.name}: ${c.visitors} زائر، ${c.conversionRate}% تحويل`).join('\n')
      }`,
      timestamp: new Date(),
    };
  }

  if (lower.includes('ربح') || lower.includes('profit') || lower.includes('revenue') || lower.includes('إيراد') || lower.includes('مالي')) {
    const totalRevenue = data.campaigns.reduce((s, c) => s + (c.roi ?? 0), 0);
    return {
      role: 'assistant',
      text: `نظرة مالية:\n• إجمالي العائد: ${totalRevenue.toLocaleString()} د.ج\n• عدد الحملات المربحة: ${data.campaigns.filter(c => (c.roi ?? 0) > 0).length}\n\n• أفضل حملة: ${data.campaigns.sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))[0]?.name ?? '—'}`,
      timestamp: new Date(),
    };
  }

  if (lower.includes('توصية') || lower.includes('recommend') || lower.includes('اقتراح') || lower.includes('suggest')) {
    const lowConversion = data.opportunities.filter(o => o.visitCount >= 3 && !o.tradeRequested);
    return {
      role: 'assistant',
      text: `توصيات ذكية:\n1. استهدف ${lowConversion.length} زائراً عائداً بعروض خصم\n2. ${data.campaigns.filter(c => (c.roi ?? 0) < 0).length} حملات غير مربحة — راجع ميزانيتها\n3. ${data.devices.length > 5 ? 'نوّع مخزون الأجهزة الأكثر طلباً' : 'وسّع قائمة الأجهزة'}\n4. تابع الزوار الذين تفاعلوا عبر واتساب`,
      timestamp: new Date(),
    };
  }

  return {
    role: 'assistant',
    text: `مرحباً! أنا مساعد التحليل الذكي. يمكنني مساعدتك في:\n\n• إحصائيات الزوار والمبيعات\n• تحليل مسار التحويل (Funnel)\n• معلومات الأجهزة الأكثر طلباً\n• أداء الحملات التسويقية\n• التقارير المالية\n• التوصيات والاقتراحات\n\nاكتب سؤالك بأي لغة (عربي أو إنجليزي).`,
    timestamp: new Date(),
  };
}

export function AIAssistant() {
  const colors = useThemeColors();
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    text: 'مرحباً! أنا مساعد التحليل الذكي. اسألني عن زوارك، مبيعاتك، أجهزتك، أو أي شيء يتعلق بمتجرك.',
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [data, setData] = useState<{ opportunities: Opportunity[]; devices: DeviceInsight[]; campaigns: CampaignInsight[]; funnel: FunnelStage[] }>({
    opportunities: [], devices: [], campaigns: [], funnel: [],
  });

  useEffect(() => {
    Promise.all([
      api.getCustomerList(),
      api.getDeviceInsights(),
      api.getCampaignInsights(),
      api.getCommerceFunnel(),
    ]).then(([opportunities, devices, campaigns, funnel]) => {
      setData({ opportunities, devices, campaigns, funnel: funnel.stages });
    }).catch(() => {});
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', text: input.trim(), timestamp: new Date() };
    const response = analyzeQuery(input.trim(), data);
    setMessages(prev => [...prev, userMsg, response]);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: 'calc(100vh - 220px)', minHeight: '400px' }}>
      <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>AI Assistant</h2>

      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '4px',
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: msg.role === 'user' ? colors.accent + '20' : colors.bgCard,
            border: `1px solid ${msg.role === 'user' ? colors.accent + '30' : colors.border}`,
            borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: '0.8rem', color: colors.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.text}</div>
            {msg.chartData && (
              <div style={{ marginTop: '8px' }}>
                <MiniChart data={msg.chartData} colors={colors} />
              </div>
            )}
            <div style={{ fontSize: '0.6rem', color: colors.textMuted, marginTop: '6px', textAlign: 'right' }}>
              {msg.timestamp.toLocaleTimeString('ar')}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="اكتب سؤالك هنا..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '8px',
            border: `1px solid ${colors.border}`, background: colors.bgInput,
            color: colors.text, fontSize: '0.82rem', fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button onClick={handleSend} style={{
          padding: '10px 20px', borderRadius: '8px', border: 'none',
          background: colors.accent, color: '#fff', fontSize: '0.82rem',
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          إرسال
        </button>
      </div>
    </div>
  );
}

function MiniChart({ data: chartData, colors }: { data: NonNullable<Message['chartData']>; colors: ReturnType<typeof useThemeColors> }) {
  const max = Math.max(...chartData.values, 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px 0' }}>
      {chartData.labels.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem' }}>
          <span style={{ color: colors.textMuted, width: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <div style={{
            flex: 1, height: '14px', borderRadius: '4px',
            background: colors.bgInput, overflow: 'hidden',
          }}>
            <div style={{
              width: `${(chartData.values[i]! / max) * 100}%`, height: '100%',
              background: colors.accent, borderRadius: '4px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{ color: colors.text, fontWeight: 600, width: '40px', textAlign: 'right' }}>{chartData.values[i]}</span>
        </div>
      ))}
    </div>
  );
}
