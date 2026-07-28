import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../../core/supabase/client';
import { getDataService, type Campaign, type QRCode } from '../../../core/supabase/data-service';
import { FunnelChart } from '../../../research-console/components/FunnelChart';
import { BarChart, LineChart } from '../../../research-console/components/charts/Charts';
import { exportCSV, exportExcel } from '../../../research-console/components/ExportUtils';
import { useTranslation } from '../../../hooks/useTranslation';

interface Props {
  campaign: Campaign;
  qrCodes: QRCode[];
  sessionStats: { started: number; completed: number };
}

interface HourlyData { hour: number; count: number; }

interface SessionRow {
  id: string;
  status: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  memoryGb: number | null;
  cpuCores: number;
  timezone: string;
  language: string;
  createdAt: string;
}

export function CampaignAnalytics({ campaign, qrCodes, sessionStats }: Props) {
  const { t } = useTranslation();
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [dailyData, setDailyData] = useState<{ label: string; value: number }[]>([]);
  const [deviceStats, setDeviceStats] = useState<Record<string, number>>({});
  const [browserStats, setBrowserStats] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const stats = {
    scans: qrCodes.reduce((s, q) => s + q.scan_count, 0),
    started: sessionStats.started,
    completed: sessionStats.completed,
    registered: qrCodes.reduce((s, q) => s + q.registration_count, 0),
  };

  useEffect(() => {
    const load = async () => {
      try {
        const client = getSupabaseClient();
        const ds = getDataService(client);
        const events = await ds.getCampaignEvents(campaign.id!, 500);

        const hourCounts: Record<number, number> = {};
        const dayCounts: Record<string, number> = {};
        const devices: Record<string, number> = {};
        const browsers: Record<string, number> = {};

        for (const ev of events) {
          const d = new Date(ev.created_at ?? '');
          const hour = d.getHours();
          hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
          const dayKey = d.toISOString().slice(0, 10);
          dayCounts[dayKey] = (dayCounts[dayKey] ?? 0) + 1;
          const dev = (ev.event_data as Record<string, unknown>)?.device as string;
          if (dev) devices[dev] = (devices[dev] ?? 0) + 1;
          const ua = ev.user_agent ?? '';
          const br = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Other';
          browsers[br] = (browsers[br] ?? 0) + 1;
        }

        setHourlyData(Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hourCounts[i] ?? 0 })));
        const sortedDays = Object.entries(dayCounts).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
        setDailyData(sortedDays.map(([k, v]) => ({ label: k.slice(5), value: v })));
        setDeviceStats(devices);
        setBrowserStats(browsers);
      } catch {
        // silently ignore
      }
    };
    load();
  }, [campaign.id]);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const client = getSupabaseClient();
        const { data, error } = await client
          .from('sessions')
          .select(`
            id, status, created_at,
            _devices:devices(
              os, os_version, browser, browser_version, platform,
              screen_width, screen_height, memory_gb, cpu_cores,
              timezone, language
            )
          `)
          .eq('campaign_id', campaign.id)
          .order('created_at', { ascending: false })
          .limit(100);

        console.log('[CampaignAnalytics] raw query result', JSON.stringify(data, null, 2));
        if (error) console.warn('[CampaignAnalytics] query error', error);

        const mapped: SessionRow[] = (data ?? []).map((row: Record<string, unknown>) => {
          const dev = (row._devices as Record<string, unknown>) ?? {};
          return {
            id: row.id as string,
            status: row.status as string,
            os: (dev.os as string) ?? '',
            osVersion: (dev.os_version as string) ?? '',
            browser: (dev.browser as string) ?? '',
            browserVersion: (dev.browser_version as string) ?? '',
            platform: (dev.platform as string) ?? '',
            screenWidth: (dev.screen_width as number) ?? 0,
            screenHeight: (dev.screen_height as number) ?? 0,
            memoryGb: (dev.memory_gb as number | null) ?? null,
            cpuCores: (dev.cpu_cores as number) ?? 0,
            timezone: (dev.timezone as string) ?? '',
            language: (dev.language as string) ?? '',
            createdAt: row.created_at as string,
          };
        });

        console.log('[CampaignAnalytics] mapped result', mapped.length, 'sessions');
        console.log('[CampaignAnalytics] first row:', mapped[0]);
        setSessions(mapped);
      } catch (err) {
        console.warn('[CampaignAnalytics] load error', err);
      }
    };
    loadSessions();
  }, [campaign.id]);

  console.log('[CampaignAnalytics] rendered rows', sessions.length);

  const funnelSteps = [
    { label: t('campaign.totalScans'), value: stats.scans, color: '#6366f1' },
    { label: t('campaign.gameStarted'), value: stats.started, color: '#3b82f6' },
    { label: t('campaign.gameFinished'), value: stats.completed, color: '#22c55e' },
    { label: t('campaign.registered'), value: stats.registered, color: '#f59e0b' },
  ];

  const peakHour = hourlyData.reduce((best, h) => h.count > best.count ? h : best, { hour: 0, count: 0 });

  const exportData = () => {
    const headers = [t('campaign.analytics.hour'), t('campaign.analytics.scans')];
    const rows = hourlyData.map(h => [`${h.hour}:00`, h.count]);
    exportCSV(`${campaign.name}-analytics`, headers, rows);
  };

  const TH: React.CSSProperties = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' };
  const TD: React.CSSProperties = { padding: '0.5rem 0.6rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.75rem', color: '#ccc', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: t('campaign.totalScans'), value: stats.scans, color: '#6366f1' },
          { label: t('campaign.gameStarted'), value: stats.started, color: '#3b82f6' },
          { label: t('campaign.gameFinished'), value: stats.completed, color: '#22c55e' },
          { label: t('campaign.registered'), value: stats.registered, color: '#f59e0b' },
          { label: t('campaign.completion') + ' %', value: stats.scans > 0 ? `${((stats.completed / stats.scans) * 100).toFixed(1)}%` : '0%', color: '#22c55e' },
          { label: t('campaign.conversion') + ' %', value: stats.scans > 0 ? `${((stats.registered / stats.scans) * 100).toFixed(1)}%` : '0%', color: '#f59e0b' },
          { label: t('campaign.peakHour'), value: `${peakHour.count > 0 ? peakHour.hour + ':00' : '-'}`, color: '#ef4444' },
          { label: t('campaign.uniqueQRs'), value: qrCodes.length, color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.65rem', color: '#666', textTransform: 'uppercase' as const }}>{s.label}</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '1.3rem', fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <FunnelChart steps={funnelSteps} title={t('campaign.conversionFunnel')} />
        </div>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{t('campaign.peakScanTime')}</p>
          <p style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{peakHour.count > 0 ? `${peakHour.hour}:00` : '-'}</p>
          <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.25rem 0 0.75rem' }}>{peakHour.count} {t('campaign.analytics.scansAtPeak')}</p>
          <BarChart data={hourlyData.filter((_, i) => i % 3 === 0).map(h => ({ label: `${h.hour}`, value: h.count, color: h.hour === peakHour.hour ? '#ef4444' : '#6366f1' }))} title={t('campaign.scansByHour')} />
        </div>
      </div>

      {dailyData.length > 0 && (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <LineChart data={dailyData.map(d => ({ timestamp: new Date(`2025-${d.label}`).getTime() || 0, value: d.value }))} title={t('campaign.scansPerDay')} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {Object.keys(deviceStats).length > 0 && (
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
            <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{t('campaign.topDevices')}</p>
            {Object.entries(deviceStats).sort(([, a], [, b]) => b - a).slice(0, 5).map(([dev, count]) => (
              <div key={dev} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem' }}>
                <span style={{ color: '#ccc' }}>{dev}</span>
                <span style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
        {Object.keys(browserStats).length > 0 && (
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
            <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{t('campaign.topBrowsers')}</p>
            {Object.entries(browserStats).sort(([, a], [, b]) => b - a).map(([br, count]) => (
              <div key={br} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem' }}>
                <span style={{ color: '#ccc' }}>{br}</span>
                <span style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1rem 0.5rem' }}>
            <h3 style={{ margin: 0, color: '#f0f0f0', fontSize: '0.95rem' }}>
              {campaign.name} — Sessions ({sessions.length})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Session ID</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>OS</th>
                  <th style={TH}>Browser</th>
                  <th style={TH}>Platform</th>
                  <th style={TH}>Screen</th>
                  <th style={TH}>RAM</th>
                  <th style={TH}>CPU</th>
                  <th style={TH}>Timezone</th>
                  <th style={TH}>Language</th>
                  <th style={TH}>Created</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.65rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.id}>{s.id.slice(0, 8)}…</td>
                    <td style={TD}>
                      <span style={{
                        padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600,
                        background: s.status === 'completed' ? '#22c55e20' : s.status === 'running' ? '#3b82f620' : '#f59e0b20',
                        color: s.status === 'completed' ? '#22c55e' : s.status === 'running' ? '#3b82f6' : '#f59e0b',
                      }}>{s.status}</span>
                    </td>
                    <td style={TD}>{s.os} {s.osVersion}</td>
                    <td style={TD}>{s.browser} {s.browserVersion}</td>
                    <td style={TD}>{s.platform}</td>
                    <td style={TD}>{s.screenWidth}×{s.screenHeight}</td>
                    <td style={TD}>{s.memoryGb ? `${s.memoryGb} GB` : '-'}</td>
                    <td style={TD}>{s.cpuCores > 0 ? `${s.cpuCores} cores` : '-'}</td>
                    <td style={TD}>{s.timezone || '-'}</td>
                    <td style={TD}>{s.language || '-'}</td>
                    <td style={TD}>{s.createdAt ? new Date(s.createdAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={exportData} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>{t('campaign.exportCSV')}</button>
        <button onClick={() => exportExcel(`${campaign.name}-analytics`, [t('campaign.analytics.hour'), t('campaign.analytics.scans')], hourlyData.map(h => [`${h.hour}:00`, h.count]))} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>{t('campaign.exportExcel')}</button>
      </div>
    </div>
  );
}
