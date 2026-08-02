import { useState, useEffect } from 'react';
import { createResearchAPI, type UserAnalytics, type CampaignAnalytics, type OverviewStats } from '../../../core/research/api-supabase';
import { getDataService } from '../../../core/supabase/data-service';
import { getSupabaseClient } from '../../../core/supabase/client';
import { StatCard, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import { BarChart } from '../../components/charts/Charts';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { comingSoonMetric } from '../../../core/research/types';
import { useTranslation } from '../../../hooks/useTranslation';

interface AcquisitionStats {
  overview: OverviewStats;
  users: UserAnalytics;
  campaigns: CampaignAnalytics;
  qrScans: number;
  gamesStarted: number;
  gamesCompleted: number;
  guestGames: number;
  registeredGames: number;
  registerClicks: number;
  registrations: number;
  conversionRate: number;
  avgReactionTime: number;
  avgGameDuration: number;
  dropOffRate: number;
  bestCampaign: string;
  bestQr: string;
  topDevice: string;
  returnRateDay1: number;
  returnRateDay7: number;
}

export function AcquisitionDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AcquisitionStats | null>(null);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());

  useEffect(() => {
    const api = createResearchAPI();
    const client = getSupabaseClient();
    const dataService = getDataService(client);
    
    Promise.all([
      api.getOverview(filters),
      api.getUserAnalytics(filters),
      api.getCampaignAnalytics(filters),
      dataService.getQRStats(),
      client.from('sessions').select('user_id, created_at, status, finished_at, device_id'),
      client.from('devices').select('os, browser, screen_width, screen_height'),
    ]).then(([overview, users, campaigns, qrStats, sessionsResult, devicesResult]) => {
      const qrScans = qrStats.totalScans;
      const registrations = users.conversions;
      const gamesCompleted = overview.gamesPlayed;
      const gamesStarted = qrStats.totalGameStarts || gamesCompleted;
      const sessions = sessionsResult.data ?? [];
      const devices = devicesResult.data ?? [];

      const guestGames = sessions.filter(s => !s.user_id).length;
      const registeredGames = guestGames === 0 && sessions.length > 0 ? sessions.length : Math.max(0, gamesCompleted - guestGames);
      const conversionRate = qrScans > 0 ? (registrations / qrScans) * 100 : 0;
      const bestCampaign = campaigns.campaigns[0]?.name ?? t('acquisition.noData');
      const bestQr = campaigns.referralPerformance[0]?.code ?? t('acquisition.noData');

      const osCounts = new Map<string, number>();
      devices.forEach(d => { osCounts.set(d.os, (osCounts.get(d.os) ?? 0) + 1); });
      const topDevice = osCounts.size > 0
        ? (Array.from(osCounts.entries()).sort(([,a], [,b]) => b - a)[0]?.[0] ?? t('acquisition.noData'))
        : t('acquisition.noData');

      const durations = sessions
        .filter(s => s.finished_at && s.created_at)
        .map(s => new Date(s.finished_at).getTime() - new Date(s.created_at).getTime());
      const avgGameDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000 * 10) / 10 : 0;

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const uniqueUsers = new Set(sessions.map(s => s.user_id).filter(Boolean));
      const usersDayAgo = new Set(sessions.filter(s => s.created_at < dayAgo).map(s => s.user_id).filter(Boolean));
      const usersWeekAgo = new Set(sessions.filter(s => s.created_at < weekAgo).map(s => s.user_id).filter(Boolean));
      const returnRateDay1 = uniqueUsers.size > 0 && usersDayAgo.size > 0
        ? Math.round(Array.from(usersDayAgo).filter(uid => sessions.some(s => s.user_id === uid && s.created_at >= dayAgo)).length / usersDayAgo.size * 100)
        : 0;
      const returnRateDay7 = uniqueUsers.size > 0 && usersWeekAgo.size > 0
        ? Math.round(Array.from(usersWeekAgo).filter(uid => sessions.some(s => s.user_id === uid && s.created_at >= weekAgo)).length / usersWeekAgo.size * 100)
        : 0;

      setStats({
        overview,
        users,
        campaigns,
        qrScans,
        gamesStarted,
        gamesCompleted,
        guestGames: Math.max(0, guestGames),
        registeredGames: Math.max(0, registeredGames),
        registerClicks: qrStats.totalGameStarts,
        registrations,
        conversionRate,
        avgReactionTime: overview.avgReactionTime,
        avgGameDuration,
        dropOffRate: Math.round(((gamesStarted - gamesCompleted) / Math.max(1, gamesStarted)) * 100 * 10) / 10,
        bestCampaign,
        bestQr,
        topDevice,
        returnRateDay1,
        returnRateDay7,
      });
    });
  }, [filters, t]);

  return (
    <>
      <DashboardHeader title={t('acquisition.title')} subtitle={t('acquisition.subtitle')} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />

      {stats && (
        <>
          {/* QR Funnel */}
          <h2 style={{ color: '#f0f0f0', fontSize: '1.1rem', marginBottom: '0.75rem' }}>{t('dashboard.qrFunnel')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('acquisition.qrScans')} value={stats.qrScans} color="#6366f1" />
            <StatCard label={t('acquisition.gamesStarted')} value={stats.gamesStarted} color="#22c55e" />
            <StatCard label={t('acquisition.gamesCompleted')} value={stats.gamesCompleted} color="#22c55e" />
            <StatCard label={t('acquisition.dropOffRate')} value={`${stats.dropOffRate}%`} subtitle={t('acquisition.dropOffSubtitle')} color="#ef4444" />
            <StatCard label={t('acquisition.conversionRate')} value={`${stats.conversionRate.toFixed(1)}%`} color="#f59e0b" />
          </div>

          {/* Guest vs Registered */}
          <h2 style={{ color: '#f0f0f0', fontSize: '1.1rem', marginBottom: '0.75rem' }}>{t('dashboard.guestVsRegistered')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('acquisition.guestGames')} value={stats.guestGames} subtitle={t('acquisition.guestSubtitle')} color="#888" />
            <StatCard label={t('acquisition.registeredGames')} value={stats.registeredGames} subtitle={t('acquisition.registeredSubtitle')} color="#6366f1" />
            <StatCard label={t('acquisition.registerClicks')} value={stats.registerClicks} subtitle={t('acquisition.ctaSubtitle')} color="#f59e0b" />
            <StatCard label={t('acquisition.registrations')} value={stats.registrations} subtitle={t('acquisition.accountSubtitle')} color="#22c55e" />
            <StatCard label={t('acquisition.avgTimeToRegister')} value={comingSoonMetric()} subtitle={t('acquisition.firstScanSubtitle')} />
          </div>

          {/* Performance & Engagement */}
          <h2 style={{ color: '#f0f0f0', fontSize: '1.1rem', marginBottom: '0.75rem' }}>{t('dashboard.performanceEngagement')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('acquisition.avgReactionTime')} value={`${stats.avgReactionTime.toFixed(0)}ms`} color="#ef4444" />
            <StatCard label={t('acquisition.avgGameDuration')} value={`${stats.avgGameDuration}s`} color="#f59e0b" />
            <StatCard label={t('acquisition.topDevice')} value={stats.topDevice} color="#8b5cf6" />
            <StatCard label={t('acquisition.bestCampaign')} value={stats.bestCampaign} color="#6366f1" />
            <StatCard label={t('acquisition.bestQrCode')} value={stats.bestQr} color="#22c55e" />
          </div>

          {/* Retention */}
          <h2 style={{ color: '#f0f0f0', fontSize: '1.1rem', marginBottom: '0.75rem' }}>{t('dashboard.retention')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <StatCard label={t('acquisition.returnRateDay1')} value={`${stats.returnRateDay1}%`} subtitle={t('acquisition.nextDayRetention')} color="#22c55e" />
            <StatCard label={t('acquisition.returnRateDay7')} value={`${stats.returnRateDay7}%`} subtitle={t('acquisition.weeklyRetention')} color="#f59e0b" />
            <StatCard label={t('acquisition.totalUsers')} value={stats.overview.totalUsers} color="#f0f0f0" />
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={[
                  { label: t('acquisition.chart.scans'), value: stats.qrScans, color: '#6366f1' },
                  { label: t('acquisition.chart.started'), value: stats.gamesStarted, color: '#22c55e' },
                  { label: t('acquisition.chart.completed'), value: stats.gamesCompleted, color: '#22c55e' },
                  { label: t('acquisition.chart.registered'), value: stats.registrations, color: '#f59e0b' },
                ]}
                title={t('acquisition.qrConversionFunnel')}
              />
            </div>
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
              <BarChart
                data={[
                  { label: t('acquisition.chart.guest'), value: stats.guestGames, color: '#888' },
                  { label: t('acquisition.chart.registered'), value: stats.registeredGames, color: '#6366f1' },
                ]}
                title={t('acquisition.gamesByUserType')}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
