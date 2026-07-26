import { useState, useEffect } from 'react';
import { createResearchAPI, type SystemHealth } from '../../../core/research/api-supabase';
import { ResearchLayout, StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart } from '../../components/charts/Charts';
import type { DashboardId } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { realMetric, comingSoonMetric } from '../../../core/research/types';
import { useTranslation } from '../../../hooks/useTranslation';

const BUILD_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';
const GIT_TAG = import.meta.env.VITE_GIT_SHA ?? 'unknown';

export function SystemDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardId>('system');
  const [data, setData] = useState<SystemHealth | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getSystemHealth().then(setData);
  }, []);

  if (dashboard !== 'system') return null;

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader title={t('system.title')} subtitle={t('system.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {data && <SystemHealthPanel data={data} />}
    </ResearchLayout>
  );
}

function SystemHealthPanel({ data }: { data: SystemHealth }) {
  const { t } = useTranslation();
  const metrics = {
    supabaseStatus: realMetric(data.supabaseStatus, 'users'),
    dbLatency: realMetric(`${data.dbLatencyMs.toFixed(1)}ms`, 'users'),
    apiResponseTime: realMetric(`${data.apiResponseTimeMs.toFixed(1)}ms`, 'users'),
    buildVersion: realMetric(BUILD_VERSION, 'build'),
    gitTag: realMetric(GIT_TAG, 'build'),
    realtimeStatus: comingSoonMetric(),
    errors24h: comingSoonMetric(),
    warnings24h: comingSoonMetric(),
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <StatCard label={t('system.supabaseStatus')} value={metrics.supabaseStatus} />
        <StatCard label={t('system.realtimeStatus')} value={metrics.realtimeStatus} />
        <StatCard label={t('system.dbLatency')} value={metrics.dbLatency} />
        <StatCard label={t('system.apiResponseTime')} value={metrics.apiResponseTime} />
        <StatCard label={t('system.errors24h')} value={metrics.errors24h} />
        <StatCard label={t('system.warnings24h')} value={metrics.warnings24h} />
        <StatCard label={t('system.buildVersion')} value={metrics.buildVersion} />
        <StatCard label={t('system.gitTag')} value={metrics.gitTag} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <BarChart
            data={[
              { label: t('system.chart.dbLatency'), value: data.dbLatencyMs, color: '#6366f1' },
              { label: t('system.chart.apiTime'), value: data.apiResponseTimeMs, color: '#22c55e' },
            ]}
            title={t('system.performanceMetrics')}
          />
        </div>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <BarChart
            data={[]}
            title={t('system.queueStorage')}
          />
        </div>
      </div>
    </>
  );
}
