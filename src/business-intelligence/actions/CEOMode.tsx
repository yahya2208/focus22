import { useState, useEffect } from 'react';
import { createBusinessAPI } from '../api';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DemoBadge } from '../DemoBadge';
import { isDemoMode } from '../data-source';
import type { Opportunity, AIInsight } from '../types';

const api = createBusinessAPI();

function calcConversionRating(rate: number): { label: string; color: string } {
  if (rate >= 20) return { label: 'ممتاز', color: '#b8f24c' };
  if (rate >= 10) return { label: 'جيد', color: '#00e4b8' };
  return { label: 'ضعيف', color: '#ff6b7a' };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export function CEOMode() {
  const colors = useThemeColors();
  const [data, setData] = useState<{
    expectedRevenue: number;
    todayCustomers: number;
    conversionRate: number;
    bestCampaign: { name: string; roi: number } | null;
    biggestProblem: AIInsight | null;
    topOpportunity: Opportunity | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cc, customerList, campaignInsights, aiInsights] = await Promise.all([
          api.getCommandCenter(),
          api.getCustomerList(),
          api.getCampaignInsights(),
          api.getAIInsights(),
        ]);
        if (cancelled) return;

        const expectedRevenue = campaignInsights.reduce((sum, c) => {
          return sum + c.visitors * (c.roi / 100) * 50000;
        }, 0);

        const bestCampaign = campaignInsights.length > 0
          ? campaignInsights.reduce((best, c) => c.roi > best.roi ? c : best, campaignInsights[0]!)
          : null;

        const problems = aiInsights.filter(i => i.type === 'problem');
        const biggestProblem = problems.length > 0
          ? problems.reduce((worst, p) => {
              const sev = { high: 3, medium: 2, low: 1 };
              return (sev[p.severity] ?? 0) > (sev[worst.severity] ?? 0) ? p : worst;
            })
          : null;

        const sorted = [...customerList].sort((a, b) => b.visitCount - a.visitCount);
        const topOpportunity = sorted.length > 0 ? sorted[0]! : null;

        setData({
          expectedRevenue,
          todayCustomers: cc.today.visitors,
          conversionRate: cc.today.conversionRate,
          bestCampaign: bestCampaign ? { name: bestCampaign.name, roi: bestCampaign.roi } : null,
          biggestProblem,
          topOpportunity,
        });
      } catch {
        // keep data null
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '400px', color: colors.textMuted, fontSize: '0.85rem',
      }}>
        جاري تحميل لوحة القيادة...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '400px', color: colors.textMuted, fontSize: '0.85rem',
      }}>
        تعذر تحميل البيانات.
      </div>
    );
  }

  const convRating = calcConversionRating(data.conversionRate);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0 }}>لوحة القيادة التنفيذية</h2>
        <DemoBadge source={isDemoMode() ? 'demo' : 'live'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <KpiCard
          colors={colors}
          label="الإيرادات المتوقعة"
          value={formatNumber(data.expectedRevenue)}
          prefix="د.ج "
          color={colors.accent}
          size="lg"
        />
        <KpiCard
          colors={colors}
          label="زوار اليوم"
          value={data.todayCustomers.toString()}
          color={colors.info}
          size="lg"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <KpiCard
          colors={colors}
          label="نسبة التحويل"
          value={`${data.conversionRate}%`}
          badge={convRating.label}
          badgeColor={convRating.color}
          color={convRating.color}
        />
        <KpiCard
          colors={colors}
          label="أفضل حملة"
          value={data.bestCampaign ? data.bestCampaign.name : '—'}
          subtitle={data.bestCampaign ? `${data.bestCampaign.roi}% ROI` : ''}
          color={colors.success}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <KpiCard
          colors={colors}
          label="أكبر مشكلة"
          value={data.biggestProblem ? data.biggestProblem.title : 'لا توجد'}
          subtitle={data.biggestProblem?.description ?? ''}
          color={data.biggestProblem ? colors.danger : colors.textMuted}
        />
        <KpiCard
          colors={colors}
          label="أفضل فرصة"
          value={data.topOpportunity ? data.topOpportunity.displayName : '—'}
          subtitle={data.topOpportunity ? `درجة: ${data.topOpportunity.visitCount * 10}` : ''}
          color={colors.warning}
        />
      </div>
    </div>
  );
}

function KpiCard({
  colors, label, value, subtitle, prefix, badge, badgeColor, color, size,
}: {
  colors: ReturnType<typeof useThemeColors>;
  label: string;
  value: string;
  subtitle?: string;
  prefix?: string;
  badge?: string;
  badgeColor?: string;
  color: string;
  size?: 'sm' | 'lg';
}) {
  return (
    <div style={{
      background: colors.bgCard, border: `1px solid ${colors.border}`,
      borderRadius: '12px', padding: size === 'lg' ? '14px 16px' : '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: colors.textMuted, fontSize: size === 'lg' ? '0.7rem' : '0.65rem', fontWeight: 500 }}>
          {label}
        </span>
        {badge && badgeColor && (
          <span style={{
            padding: '2px 8px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 700,
            background: badgeColor + '20', color: badgeColor,
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{
        fontSize: size === 'lg' ? '1.5rem' : '1.1rem', fontWeight: 700, color,
        marginTop: '4px', direction: 'ltr', textAlign: 'right',
      }}>
        {prefix}{value}
      </div>
      {subtitle && (
        <div style={{ color: colors.textSecondary, fontSize: '0.68rem', marginTop: '2px', lineHeight: 1.4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
