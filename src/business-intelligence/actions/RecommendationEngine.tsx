import { useState, useEffect } from 'react';
import { createBusinessAPI } from '../api';
import { useThemeColors } from '../../hooks/useThemeColors';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { Opportunity, DeviceInsight } from '../types';

interface EvidenceItem {
  fact: string;
  value: string | number;
  weight: number;
}

interface ScoredRecommendation {
  id: string;
  title: string;
  description: string;
  evidence: EvidenceItem[];
  confidence: number;
  actionType: 'increase_stock' | 'create_campaign' | 'send_offer' | 'adjust_price' | 'alert';
  priority: 'high' | 'medium' | 'low';
}

const api = createBusinessAPI();

function pickId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calcConfidence(evidenceCount: number, sampleSize: number): number {
  const raw = evidenceCount * 15 + sampleSize / 10;
  const capped = Math.min(100, Math.round(raw));
  return sampleSize < 5 ? Math.min(capped, 30) : capped;
}

export function RecommendationEngine({ recommendations: propRecs = [] }: { recommendations?: ScoredRecommendation[] }) {
  const colors = useThemeColors();
  const [generated, setGenerated] = useState<ScoredRecommendation[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [devices, customers] = await Promise.all([
          api.getDeviceInsights(),
          api.getCustomerList(),
        ]);
        if (cancelled) return;
        setGenerated(buildRecommendations(devices, customers));
      } catch {
        // keep generated as empty array
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const allRecs = [...generated, ...propRecs];

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const actionLabels: Record<ScoredRecommendation['actionType'], string> = {
    increase_stock: 'زيادة المخزون',
    create_campaign: 'إنشاء حملة',
    send_offer: 'إرسال عرض',
    adjust_price: 'تعديل السعر',
    alert: 'تنبيه',
  };

  const actionColors: Record<ScoredRecommendation['actionType'], string> = {
    increase_stock: colors.success,
    create_campaign: colors.info,
    send_offer: colors.accent,
    adjust_price: colors.warning,
    alert: colors.danger,
  };

  const priorityBorder: Record<string, string> = {
    high: colors.danger,
    medium: colors.warning,
    low: colors.border,
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>توصيات مدعومة بالأدلة</h2>
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          جاري تحليل البيانات...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>توصيات مدعومة بالأدلة</h2>
        <span style={{ color: colors.textMuted, fontSize: '0.72rem' }}>
          {allRecs.length} توصية
        </span>
      </div>

      {allRecs.length === 0 ? (
        <div style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          لا توجد توصيات متاحة حالياً.
        </div>
      ) : (
        allRecs.map(rec => {
          const isExpanded = expandedIds.has(rec.id);
          return (
            <div key={rec.id} style={{
              background: colors.bgCard,
              border: `1px solid ${priorityBorder[rec.priority] ?? colors.border}`,
              borderRight: `4px solid ${priorityBorder[rec.priority] ?? colors.border}`,
              borderRadius: '12px', padding: '14px 16px',
            }}>
              <div
                onClick={() => toggleExpand(rec.id)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: colors.text, fontSize: '0.9rem', fontWeight: 600 }}>
                        اقتراح: {rec.title}
                      </span>
                      <ConfidenceBadge score={rec.confidence} size="sm" />
                    </div>
                    <div style={{ color: colors.textSecondary, fontSize: '0.78rem', marginTop: '4px' }}>
                      {rec.description}
                    </div>
                  </div>
                  <span style={{
                    color: colors.textMuted, fontSize: '0.75rem',
                    transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : '',
                  }}>
                    ▼
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '12px', borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
                  <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: '6px' }}>
                    الأدلة:
                  </div>
                  <ul style={{
                    margin: 0, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '4px',
                  }}>
                    {rec.evidence.map((ev, i) => (
                      <li key={i} style={{
                        color: colors.textSecondary, fontSize: '0.75rem',
                      }}>
                        {ev.fact}: <strong style={{ color: ev.weight >= 70 ? colors.accent : colors.text }}>{ev.value}</strong>
                        <span style={{ color: colors.textFaint, fontSize: '0.6rem', marginRight: '6px' }}>
                          (وزن: {ev.weight})
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                    <div style={{
                      flex: 1, height: '4px', borderRadius: '2px',
                      background: colors.progressBg, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${rec.confidence}%`, height: '100%',
                        borderRadius: '2px',
                        background: rec.confidence >= 80 ? colors.success
                          : rec.confidence >= 50 ? colors.info
                          : rec.confidence >= 30 ? colors.warning
                          : colors.danger,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted,
                    }}>
                      نسبة الثقة: {rec.confidence}%
                    </span>
                  </div>

                  <button onClick={(e) => { e.stopPropagation(); handleAction(rec.actionType); }} style={{
                    marginTop: '10px', padding: '7px 16px', borderRadius: '8px', border: 'none',
                    background: actionColors[rec.actionType], color: '#000',
                    fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    {actionLabels[rec.actionType]}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function handleAction(type: ScoredRecommendation['actionType']) {
  switch (type) {
    case 'increase_stock':
      alert('سيتم توجيهك إلى إدارة المخزون لزيادة الكمية.');
      break;
    case 'create_campaign':
      alert('سيتم فتح منشئ الحملات لإنشاء حملة جديدة.');
      break;
    case 'send_offer':
      alert('سيتم فتح نافذة إرسال العرض للزائر المحدد.');
      break;
    case 'adjust_price':
      alert('سيتم توجيهك إلى تعديل أسعار الأجهزة.');
      break;
    case 'alert':
      alert('تم تسجيل التنبيه. سيتم مراجعة المشكلة.');
      break;
  }
}

function buildRecommendations(
  devices: DeviceInsight[],
  customers: Opportunity[],
): ScoredRecommendation[] {
  const result: ScoredRecommendation[] = [];

  const allModels = devices.flatMap(os =>
    os.brands.flatMap(b =>
      b.models.map(m => ({ brand: b.brand, ...m })),
    ),
  );

  for (const m of allModels) {
    if (m.tradeRate > 30 && m.count > 10) {
      const evidence: EvidenceItem[] = [
        { fact: 'نسبة طلبات الاستبدال', value: `${m.tradeRate}%`, weight: 80 },
        { fact: 'عدد الزوار بهذا الجهاز', value: m.count, weight: 60 },
      ];
      result.push({
        id: pickId(),
        title: `زيادة مخزون ${m.brand} ${m.marketingName || m.model}`,
        description: `نسبة طلبات استبدال مرتفعة (${m.tradeRate}%) مع ${m.count} زائر — يوصى بزيادة المخزون.`,
        evidence,
        confidence: calcConfidence(evidence.length, m.count),
        actionType: 'increase_stock',
        priority: m.tradeRate > 50 ? 'high' : 'medium',
      });
    }
  }

  const returningCustomers = customers.filter(c => c.visitCount >= 3);
  if (returningCustomers.length >= 3) {
    const evidence: EvidenceItem[] = [
      { fact: 'عدد الزوار العائدين (3+ زيارات)', value: returningCustomers.length, weight: 90 },
      { fact: 'لم يطلبوا استبدال', value: returningCustomers.filter(c => !c.tradeRequested).length, weight: 70 },
    ];
    result.push({
      id: pickId(),
      title: 'حملة عودة للزوار المخلصين',
      description: `${returningCustomers.length} زائراً عادوا 3 مرات أو أكثر — فرصة لإنشاء حملة استهداف.`,
      evidence,
      confidence: calcConfidence(evidence.length, returningCustomers.length),
      actionType: 'create_campaign',
      priority: returningCustomers.length > 10 ? 'high' : 'medium',
    });
  }

  for (const c of customers) {
    const score = scoreVisitor(c);
    if (score > 70) {
      const evidence: EvidenceItem[] = [
        { fact: 'درجة الزائر', value: score, weight: 85 },
        { fact: 'عدد الزيارات', value: c.visitCount, weight: 50 },
      ];
      if (c.bestFocusScore > 0) {
        evidence.push({ fact: 'أفضل تركيز', value: c.bestFocusScore, weight: 40 });
      }
      result.push({
        id: pickId(),
        title: `إرسال عرض إلى ${c.displayName}`,
        description: `درجة الزائر ${score} — مؤهل للحصول على عرض مخصص.`,
        evidence,
        confidence: calcConfidence(evidence.length, c.visitCount),
        actionType: 'send_offer',
        priority: score > 85 ? 'high' : 'medium',
      });
    }
  }

  return result;
}

function scoreVisitor(o: Opportunity): number {
  let s = 0;
  if (o.visitCount >= 3) s += 30;
  else if (o.visitCount >= 2) s += 15;
  if (o.tradeRequested) s += 25;
  if (o.whatsappClicked) s += 15;
  if (o.campaignSource) s += 10;
  if (o.bestFocusScore > 70) s += 20;
  return s;
}
