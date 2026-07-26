import { useState, useEffect } from 'react';
import { createResearchAPI, type DeviceAnalytics } from '../../../core/research/api-supabase';
import { ResearchLayout, StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart, PieChart } from '../../components/charts/Charts';
import type { DashboardId } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';

export function DevicesDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardId>('devices');
  const [data, setData] = useState<DeviceAnalytics | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getDeviceAnalytics(filters).then(setData);
  }, [filters]);

  if (dashboard !== 'devices') return null;

  const totalDevices = (data?.osDistribution ?? []).reduce((s, d) => s + d.count, 0);

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader title={t('devices.title')} subtitle={t('devices.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('devices.totalDevices')} value={totalDevices} color="#6366f1" />
            <StatCard label={t('devices.osTypes')} value={data.osDistribution.length} color="#22c55e" />
            <StatCard label={t('devices.browserTypes')} value={data.browserDistribution.length} color="#3b82f6" />
            <StatCard label={t('devices.refreshRates')} value={data.refreshRateDistribution.length} />
            <StatCard label={t('devices.inputTypes')} value={data.inputTypeDistribution.length} color="#f59e0b" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {data.osDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <PieChart
                  data={data.osDistribution.map((d) => ({
                    label: d.os, value: d.count,
                  }))}
                  title={t('devices.osDistribution')}
                />
              </div>
            )}
            {data.browserDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <PieChart
                  data={data.browserDistribution.map((d) => ({
                    label: d.browser, value: d.count,
                  }))}
                  title={t('devices.browserDistribution')}
                />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {data.refreshRateDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart
                  data={data.refreshRateDistribution.map((d) => ({
                    label: `${d.rate}Hz`, value: d.count, color: '#6366f1',
                  }))}
                  title={t('devices.refreshRatesChart')}
                />
              </div>
            )}
            {data.inputTypeDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart
                  data={data.inputTypeDistribution.map((d) => ({
                    label: d.type, value: d.count, color: '#f59e0b',
                  }))}
                  title={t('devices.inputTypesChart')}
                />
              </div>
            )}
          </div>
        </>
      )}
    </ResearchLayout>
  );
}
