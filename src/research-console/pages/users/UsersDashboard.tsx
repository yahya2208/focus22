import { useState, useEffect } from 'react';
import { createResearchAPI, type UserAnalytics } from '../../../core/research/api-supabase';
import { StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart } from '../../components/charts/Charts';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { comingSoonMetric } from '../../../core/research/types';
import { useTranslation } from '../../../hooks/useTranslation';

export function UsersDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<UserAnalytics | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getUserAnalytics(filters).then(setData);
  }, [filters]);

  return (
    <>
      <DashboardHeader title={t('users.title')} subtitle={t('users.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('users.guestUsers')} value={data.guestUsers} color="#888" />
            <StatCard label={t('users.registeredUsers')} value={data.registeredUsers} color="#6366f1" />
            <StatCard label={t('users.conversions')} value={data.conversions} color="#22c55e" />
            <StatCard label={t('users.newUsers')} value={data.newUsers} color="#3b82f6" />
            <StatCard label={t('users.returningUsers')} value={comingSoonMetric()} />
            <StatCard label={t('users.dau')} value={data.dailyActiveUsers} color="#6366f1" />
            <StatCard label={t('users.wau')} value={data.weeklyActiveUsers} color="#8b5cf6" />
            <StatCard label={t('users.mau')} value={data.monthlyActiveUsers} color="#ec4899" />
            <StatCard label={t('users.avgSessions')} value={data.avgSessionsPerUser.toFixed(1)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {data.registrationFunnel.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart
                  data={data.registrationFunnel.map((s) => ({
                    label: s.stage, value: s.count, color: '#6366f1',
                  }))}
                  title={t('users.registrationFunnel')}
                />
              </div>
            )}
            {data.acquisitionSources.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart
                  data={data.acquisitionSources.map((s) => ({
                    label: s.source, value: s.count, color: '#22c55e',
                  }))}
                  title={t('users.acquisitionSources')}
                />
              </div>
            )}
          </div>
          {data.referralSuccess.length > 0 && (
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem', marginTop: '1rem' }}>
              <BarChart
                data={data.referralSuccess.map((r) => ({
                  label: r.code, value: r.conversions, color: '#f59e0b',
                }))}
                title={t('users.referralConversions')}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
