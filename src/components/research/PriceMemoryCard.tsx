import { memo, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DashboardHeader, StatCard } from '../../research-console/layout/ResearchLayout';
import { getAllPriceMemory, type ModelPriceHistory } from '../../services/price-memory';

function TrendIndicator({ trend }: { trend: ModelPriceHistory['trend'] }) {
  const colors = useThemeColors();
  if (trend === 'up') return <span style={{ color: colors.success }}>↑</span>;
  if (trend === 'down') return <span style={{ color: colors.danger }}>↓</span>;
  if (trend === 'stable') return <span style={{ color: colors.textMuted }}>→</span>;
  return <span style={{ color: colors.textMuted }}>—</span>;
}

function formatPrice(price: number | null): string {
  if (price === null) return '—';
  return price.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString();
}

export const PriceMemoryCard = memo(function PriceMemoryCard() {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const histories = useMemo(() => getAllPriceMemory(), []);

  const totalModels = histories.length;
  const totalRecords = histories.reduce((s, h) => s + h.records.length, 0);
  const modelsWithTrend = histories.filter(h => h.trend !== 'unknown').length;
  const avgPrice = histories.length > 0
    ? histories.reduce((s, h) => s + (h.averagePrice ?? 0), 0) / histories.length
    : null;

  const sorted = useMemo(() => [...histories].sort(
    (a, b) => new Date(b.records[b.records.length - 1]?.date ?? 0).getTime()
      - new Date(a.records[a.records.length - 1]?.date ?? 0).getTime(),
  ), [histories]);

  const summaryCards = [
    { label: t('research.priceMemory.title'), value: totalModels, color: colors.accent },
    { label: t('research.priceMemory.records'), value: totalRecords, color: colors.accent },
    { label: t('research.priceMemory.trend'), value: modelsWithTrend, color: colors.success },
    { label: t('research.priceMemory.average'), value: formatPrice(avgPrice), color: colors.text },
  ];

  return (
    <div>
      <DashboardHeader title={t('research.priceMemory.title')} subtitle="Price history across tracked phone models" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {summaryCards.map(card => (
          <StatCard key={card.label} label={card.label} value={card.value} color={card.color} />
        ))}
      </div>

      {sorted.length === 0 ? (
        <p style={{ color: colors.textMuted, textAlign: 'center', padding: '2rem' }}>
          {t('research.priceMemory.noData')}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>
                <th style={{ padding: '0.5rem', textAlign: 'left' }}>{t('research.priceMemory.title')}</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('research.priceMemory.currentPrice')}</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('research.priceMemory.lowest')}</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('research.priceMemory.highest')}</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('research.priceMemory.average')}</th>
                <th style={{ padding: '0.5rem', textAlign: 'center' }}>{t('research.priceMemory.trend')}</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>{t('research.priceMemory.lastUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((h) => {
                const lastDate = h.records.length > 0 ? h.records[h.records.length - 1]!.date : null;
                return (
                  <tr key={`${h.brand}-${h.model}`} style={{ borderBottom: `1px solid ${colors.borderLight}`, color: colors.text }}>
                    <td style={{ padding: '0.5rem', fontWeight: 500 }}>
                      <span style={{ color: colors.textSecondary }}>{h.brand}</span>{' '}
                      <span>{h.model}</span>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: colors.accent, fontWeight: 600 }}>
                      {formatPrice(h.currentPrice)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: colors.success }}>
                      {formatPrice(h.lowestPrice)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: colors.danger }}>
                      {formatPrice(h.highestPrice)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: colors.textMuted }}>
                      {formatPrice(h.averagePrice)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                      <TrendIndicator trend={h.trend} />
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', color: colors.textMuted, fontSize: '0.8rem' }}>
                      {formatDate(lastDate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
