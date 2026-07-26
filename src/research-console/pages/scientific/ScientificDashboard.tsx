import { useState, useEffect } from 'react';
import { createResearchAPI, type ScientificMetrics } from '../../../core/research/api-supabase';
import { ResearchLayout, StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { Histogram, BarChart } from '../../components/charts/Charts';
import type { DashboardId } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';

export function ScientificDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardId>('scientific');
  const [metrics, setMetrics] = useState<ScientificMetrics | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getScientific(filters).then(setMetrics);
  }, [filters]);

  if (dashboard !== 'scientific') return null;

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader title={t('scientific.title')} subtitle={t('scientific.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {metrics && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('scientific.medianRT')} value={`${metrics.reactionTime.median.toFixed(0)}ms`} color="#6366f1" />
            <StatCard label={t('scientific.meanRT')} value={`${metrics.reactionTime.mean.toFixed(0)}ms`} />
            <StatCard label={t('scientific.stdDev')} value={`${metrics.reactionTime.stdDev.toFixed(1)}ms`} color="#f59e0b" />
            <StatCard label={t('scientific.p50')} value={`${metrics.percentiles.p50.toFixed(0)}ms`} />
            <StatCard label={t('scientific.p90')} value={`${metrics.percentiles.p90.toFixed(0)}ms`} />
            <StatCard label={t('scientific.p95')} value={`${metrics.percentiles.p95.toFixed(0)}ms`} />
            <StatCard label={t('scientific.accuracy')} value={`${(metrics.accuracy * 100).toFixed(1)}%`} color="#22c55e" />
            <StatCard label={t('scientific.consistency')} value={`${metrics.consistency.score.toFixed(1)}%`} color="#6366f1" />
            <StatCard label={t('scientific.fatigue')} value={`${metrics.fatigue.score.toFixed(1)}%`} color="#ef4444" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={[
                  { label: t('scientific.chart.p50'), value: metrics.percentiles.p50 },
                  { label: t('scientific.chart.p75'), value: metrics.percentiles.p75 },
                  { label: t('scientific.chart.p90'), value: metrics.percentiles.p90 },
                  { label: t('scientific.chart.p95'), value: metrics.percentiles.p95 },
                  { label: t('scientific.chart.p99'), value: metrics.percentiles.p99 },
                ]}
                title={t('scientific.rtPercentiles')}
              />
            </div>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <Histogram values={[]} title={t('scientific.rtDistribution')} />
            </div>
          </div>
          {Object.keys(metrics.byDimension).length > 0 && (
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={Object.entries(metrics.byDimension).map(([key, val]) => ({
                  label: key, value: val.mean,
                }))}
                title={t('scientific.rtByDimension')}
              />
            </div>
          )}
        </>
      )}
    </ResearchLayout>
  );
}
