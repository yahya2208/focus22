import { useState, useEffect } from 'react';
import { createResearchAPI, type OverviewStats } from '../../../core/research/api-supabase';
import { ResearchLayout, StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart } from '../../components/charts/Charts';
import type { DashboardId } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';

export function OverviewDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardId>('overview');
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getOverview(filters).then(setStats);
  }, [filters]);

  if (dashboard !== 'overview') return null;

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader title={t('overview.title')} subtitle={t('overview.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {stats && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('overview.totalSessions')} value={stats.totalSessions} />
            <StatCard label={t('overview.gamesPlayed')} value={stats.gamesPlayed} />
            <StatCard label={t('overview.gamesToday')} value={stats.gamesToday} color="#22c55e" />
            <StatCard label={t('overview.thisWeek')} value={stats.gamesThisWeek} />
            <StatCard label={t('overview.thisMonth')} value={stats.gamesThisMonth} />
            <StatCard label={t('overview.avgFocusScore')} value={stats.avgFocusScore.toFixed(1)} color="#6366f1" />
            <StatCard label={t('overview.devices')} value={stats.devices} />
            <StatCard label={t('overview.campaigns')} value={stats.campaigns} />
            <StatCard label={t('overview.countries')} value={stats.countries} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={[
                  { label: t('overview.chart.today'), value: stats.gamesToday, color: '#22c55e' },
                  { label: t('overview.chart.week'), value: stats.gamesThisWeek, color: '#6366f1' },
                  { label: t('overview.chart.month'), value: stats.gamesThisMonth, color: '#f59e0b' },
                ]}
                title={t('overview.gamesByPeriod')}
              />
            </div>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={[
                  { label: t('overview.chart.avgRt'), value: stats.avgReactionTime, color: '#ef4444' },
                  { label: t('overview.chart.avgScore'), value: stats.avgFocusScore, color: '#6366f1' },
                  { label: t('overview.chart.consistency'), value: stats.avgConsistency * 100, color: '#22c55e' },
                  { label: t('overview.chart.fatigue'), value: stats.avgFatigue * 100, color: '#f59e0b' },
                ]}
                title={t('overview.keyMetrics')}
              />
            </div>
          </div>
        </>
      )}
    </ResearchLayout>
  );
}
