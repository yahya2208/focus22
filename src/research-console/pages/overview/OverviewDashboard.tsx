import { useState, useEffect, useMemo } from 'react';
import { createResearchAPI, type OverviewStats } from '../../../core/research/api-supabase';
import { StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart } from '../../components/charts/Charts';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';
import type { TranslationKey } from '../../../i18n';
import { getSupabaseClient } from '../../../core/supabase/client';

function trendSymbol(current: number, previous: number): { symbol: string; color: string } {
  if (previous === 0) return { symbol: '→', color: '#888' };
  const diff = ((current - previous) / previous) * 100;
  if (diff > 5) return { symbol: '↑', color: '#22c55e' };
  if (diff < -5) return { symbol: '↓', color: '#ef4444' };
  return { symbol: '→', color: '#888' };
}

function generateSummary(stats: OverviewStats): string[] {
  const lines: string[] = [];
  const todayTotal = stats.gamesToday;
  const regRate = stats.conversionRate * 100;
  const focus = stats.avgFocusScore;
  const retention = stats.retentionD1 * 100;
  const online = stats.currentOnline;

  if (online > 10) lines.push(`High traffic: ${online} players online now — peak engagement period.`);
  else if (online > 0) lines.push(`${online} players currently online — steady activity.`);
  else lines.push('No players online at the moment.');

  if (todayTotal > 100) lines.push(`Strong volume: ${todayTotal} sessions today.`);
  else if (todayTotal > 30) lines.push(`Moderate volume: ${todayTotal} sessions today.`);
  else lines.push(`Low volume: ${todayTotal} sessions today — consider promotional push.`);

  if (focus > 80) lines.push('Focus scores are excellent — game mechanics engaging well.');
  else if (focus > 60) lines.push('Focus scores are healthy — within normal range.');
  else if (focus > 40) lines.push('Focus scores declining — review game difficulty and session fatigue.');
  else lines.push('Critical: focus scores very low — immediate UX review recommended.');

  if (regRate > 30) lines.push(`Strong conversion: ${regRate.toFixed(0)}% of guests register.`);
  else if (regRate > 15) lines.push(`Moderate conversion (${regRate.toFixed(0)}%) — room for registration funnel improvement.`);
  else lines.push(`Low conversion (${regRate.toFixed(0)}%) — consider registration incentives.`);

  if (retention > 50) lines.push(`Excellent D1 retention (${retention.toFixed(0)}%) — users are coming back.`);
  else if (retention > 25) lines.push(`D1 retention at ${retention.toFixed(0)}% — average for the category.`);
  else lines.push(`Low D1 retention (${retention.toFixed(0)}%) — investigate onboarding and first-time experience.`);

  return lines;
}

function generateRecommendations(stats: OverviewStats, liveCounts: LiveCounts, t: (key: TranslationKey) => string): { type: 'warning' | 'info' | 'success'; title: string; description: string }[] {
  const recs: { type: 'warning' | 'info' | 'success'; title: string; description: string }[] = [];
  const regRate = stats.conversionRate * 100;
  const focus = stats.avgFocusScore;
  const retentionD1 = stats.retentionD1 * 100;
  const retentionD7 = stats.retentionD7 * 100;
  const consistency = stats.avgConsistency * 100;
  const fatigue = stats.avgFatigue * 100;

  if (regRate < 20) recs.push({ type: 'warning', title: t('overview.rec.boostRegistration'), description: `Only ${regRate.toFixed(0)}% of guests convert. Add a post-game registration prompt with incentive.` });
  if (focus < 50) recs.push({ type: 'warning', title: t('overview.rec.focusAlert'), description: `Average focus is ${focus.toFixed(1)}. Review game timing, reduce session length, add breaks.` });
  else if (focus > 80) recs.push({ type: 'success', title: t('overview.rec.highEngagement'), description: `Focus score of ${focus.toFixed(1)} indicates strong player engagement. Maintain current UX.` });
  if (stats.totalSessions > 100 && retentionD1 < 30) recs.push({ type: 'warning', title: t('overview.rec.retentionGap'), description: `D1 retention is ${retentionD1.toFixed(0)}% but D7 is ${retentionD7.toFixed(0)}%. Users try once but don't return — improve first-time experience.` });
  if (fatigue > 50) recs.push({ type: 'warning', title: t('overview.rec.fatigueRisk'), description: `Fatigue index at ${fatigue.toFixed(0)}%. Consider shorter game sessions or mandatory rest periods.` });
  if (consistency > 70) recs.push({ type: 'success', title: t('overview.rec.consistentPerformance'), description: `Player consistency is ${consistency.toFixed(0)}% — system calibration is working well.` });
  if (stats.campaigns === 0) recs.push({ type: 'info', title: t('overview.rec.noCampaigns'), description: 'Create campaigns to track marketing performance and segment player data.' });
  else recs.push({ type: 'info', title: `${stats.campaigns} ${t('overview.rec.campaignsActive')}`, description: 'Track performance in the Campaign Analytics dashboard.' });
  if (liveCounts.staleCount > 10) recs.push({ type: 'warning', title: t('overview.rec.staleSessions'), description: `${liveCounts.staleCount} stale sessions detected. Auto-cleanup is running to prevent data issues.` });

  return recs;
}

interface LiveCounts {
  runningNow: number;
  completedToday: number;
  failedToday: number;
  staleCount: number;
  avgDurationSec: number;
}

export function OverviewDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [yesterdayStats, setYesterdayStats] = useState<OverviewStats | null>(null);
  const [liveCounts, setLiveCounts] = useState<LiveCounts | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  const api = useMemo(() => createResearchAPI(), []);

  useEffect(() => {
    api.getOverview(filters).then(setStats);
  }, [api, filters]);

  useEffect(() => {
    const client = getSupabaseClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    Promise.all([
      client.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      client.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', todayStr),
      client.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', todayStr),
      client.from('sessions').select('id, created_at, finished_at, status').eq('status', 'completed').not('finished_at', 'is', null),
      client.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'running').lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()),
    ]).then(([runningRes, completedTodayRes, failedTodayRes, completedAllRes, staleRes]) => {
      const completedSessions = completedAllRes.data ?? [];
      const durations = completedSessions
        .map(s => new Date(s.finished_at!).getTime() - new Date(s.created_at).getTime())
        .filter(d => d > 0 && d < 3600000);
      const avgDurationSec = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
        : 0;

      setLiveCounts({
        runningNow: runningRes.count ?? 0,
        completedToday: completedTodayRes.count ?? 0,
        failedToday: failedTodayRes.count ?? 0,
        staleCount: staleRes.count ?? 0,
        avgDurationSec,
      });
    });
  }, []);

  useEffect(() => {
    const yesterday = new Date(Date.now() - 86400000);
    yesterday.setHours(0, 0, 0, 0);
    const api2 = createResearchAPI();
    api2.getOverview({ ...filters, dateFrom: yesterday.toISOString(), dateTo: new Date(Date.now() - 86400000).toISOString() } as any).then(setYesterdayStats);
  }, [filters]);

  const summary = stats ? generateSummary(stats) : [];
  const recommendations = stats && liveCounts ? generateRecommendations(stats, liveCounts, t) : [];

  return (
    <>
      <DashboardHeader title={t('overview.title')} subtitle={t('overview.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />

      {liveCounts && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <StatCard label={t('overview.runningNow')} value={liveCounts.runningNow} color="#3b82f6" />
          <StatCard label={t('overview.completedToday')} value={liveCounts.completedToday} color="#22c55e" />
          <StatCard label={t('overview.failedToday')} value={liveCounts.failedToday} color="#ef4444" />
          <StatCard label={t('overview.staleSessions')} value={liveCounts.staleCount} color="#f59e0b" subtitle={t('overview.staleSubtitle')} />
          <StatCard label={t('overview.avgDuration')} value={`${liveCounts.avgDurationSec}s`} color="#6366f1" />
        </div>
      )}

      {stats && (
        <>
          {/* Daily Business Summary */}
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
            <h3 style={{ color: '#f0f0f0', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{t('overview.dailySummary')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {summary.map((line, i) => (
                <p key={i} style={{ color: '#bbb', fontSize: '0.82rem', margin: 0 }}>{line}</p>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {recommendations.map((rec, i) => (
              <div key={i} style={{
                background: '#12121a',
                border: `1px solid ${
                  rec.type === 'warning' ? '#ef444440' : rec.type === 'success' ? '#22c55e40' : '#6366f140'
                }`,
                borderRadius: '10px',
                padding: '0.85rem 1rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: rec.type === 'warning' ? '#ef4444' : rec.type === 'success' ? '#22c55e' : '#6366f1',
                  }} />
                  <span style={{ color: '#f0f0f0', fontSize: '0.82rem', fontWeight: 600 }}>{rec.title}</span>
                </div>
                <p style={{ color: '#aaa', fontSize: '0.75rem', margin: 0, marginLeft: '1rem' }}>{rec.description}</p>
              </div>
            ))}
          </div>

          {/* Key Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {([
              { label: t('overview.totalSessions'), value: stats.totalSessions, key: 'totalSessions', color: '' },
              { label: t('overview.gamesPlayed'), value: stats.gamesPlayed, key: 'gamesPlayed', color: '' },
              { label: t('overview.today'), value: stats.gamesToday, key: 'gamesToday', color: '#22c55e' },
              { label: t('overview.thisWeek'), value: stats.gamesThisWeek, key: 'gamesThisWeek', color: '' },
              { label: t('overview.thisMonth'), value: stats.gamesThisMonth, key: 'gamesThisMonth', color: '' },
              { label: t('overview.avgFocusScore'), value: stats.avgFocusScore.toFixed(1), key: 'avgFocusScore', color: '#6366f1' },
              { label: t('overview.avgRT'), value: `${stats.avgReactionTime.toFixed(0)}ms`, key: 'avgReactionTime', color: '#f59e0b' },
              { label: t('overview.retentionD1'), value: `${(stats.retentionD1 * 100).toFixed(0)}%`, key: 'retentionD1', color: '#22c55e' },
              { label: t('overview.retentionD7'), value: `${(stats.retentionD7 * 100).toFixed(0)}%`, key: 'retentionD7', color: '#3b82f6' },
              { label: t('overview.conversion'), value: `${(stats.conversionRate * 100).toFixed(1)}%`, key: 'conversionRate', color: '#8b5cf6' },
              { label: t('overview.devices'), value: stats.devices, key: 'devices', color: '' },
              { label: t('overview.campaigns'), value: stats.campaigns, key: 'campaigns', color: '' },
              { label: t('overview.countries'), value: stats.countries, key: 'countries', color: '' },
              { label: t('overview.onlineNow'), value: stats.currentOnline, key: 'currentOnline', color: '#22c55e' },
              { label: t('overview.peakToday'), value: stats.peakToday, key: 'peakToday', color: '#f59e0b' },
              { label: t('overview.users'), value: stats.totalUsers, key: 'totalUsers', color: '' },
            ] as { label: string; value: number | string; key: string; color: string }[]).map(item => {
              const prev = yesterdayStats ? (yesterdayStats as any)[item.key] as number : null;
              const tr = prev != null ? trendSymbol(typeof item.value === 'string' ? parseFloat(item.value) : item.value, prev) : null;
              return (
                <div key={item.key} style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#888', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</span>
                    {tr && <span style={{ color: tr.color, fontSize: '0.85rem', fontWeight: 700 }}>{tr.symbol}</span>}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: item.color || '#f0f0f0', fontVariantNumeric: 'tabular-nums' }}>
                    {item.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={[
                  { label: t('overview.chart.today'), value: stats.gamesToday, color: '#22c55e' },
                  { label: t('overview.chart.week'), value: stats.gamesThisWeek, color: '#6366f1' },
                  { label: t('overview.chart.month'), value: stats.gamesThisMonth, color: '#f59e0b' },
                ]}
                title={t('overview.gamesByPeriod')}
                emptyLabel={t('overview.chart.noData')}
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
                emptyLabel={t('overview.chart.noData')}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}