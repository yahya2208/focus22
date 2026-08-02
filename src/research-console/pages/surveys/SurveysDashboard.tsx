import { useState, useEffect } from 'react';
import { createResearchAPI, type SurveyAnalytics } from '../../../core/research/api-supabase';
import { StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart, PieChart } from '../../components/charts/Charts';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { comingSoonMetric } from '../../../core/research/types';
import { useTranslation } from '../../../hooks/useTranslation';

export function SurveysDashboard() {
  const { t } = useTranslation();
  const [data, setData] = useState<SurveyAnalytics | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    api.getSurveyAnalytics(filters).then(setData);
  }, [filters]);

  return (
    <>
      <DashboardHeader title={t('surveys.title')} subtitle={t('surveys.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('surveys.completionRate')} value={comingSoonMetric()} />
            <StatCard label={t('surveys.ageRanges')} value={data.ageDistribution.length} color="#6366f1" />
            <StatCard label={t('surveys.genderGroups')} value={data.genderDistribution.length} color="#ec4899" />
            <StatCard label={t('surveys.educationLevels')} value={data.educationDistribution.length} color="#3b82f6" />
            <StatCard label={t('surveys.countries')} value={data.countryDistribution.length} color="#f59e0b" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {data.ageDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <PieChart
                  data={data.ageDistribution.map((d) => ({
                    label: d.range, value: d.count,
                  }))}
                  title={t('surveys.ageDistribution')}
                />
              </div>
            )}
            {data.genderDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <PieChart
                  data={data.genderDistribution.map((d) => ({
                    label: d.gender, value: d.count,
                  }))}
                  title={t('surveys.genderDistribution')}
                />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {data.educationDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart
                  data={data.educationDistribution.map((d) => ({
                    label: d.level, value: d.count, color: '#3b82f6',
                  }))}
                  title={t('surveys.education')}
                />
              </div>
            )}
            {data.countryDistribution.length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <BarChart
                  data={data.countryDistribution.slice(0, 10).map((d) => ({
                    label: d.country, value: d.count, color: '#f59e0b',
                  }))}
                  title={t('surveys.countriesTop10')}
                />
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
