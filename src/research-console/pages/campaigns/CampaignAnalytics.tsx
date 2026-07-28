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

export function CampaignAnalytics({ campaign, qrCodes, sessionStats }: Props) {
  const { t } = useTranslation();
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [dailyData, setDailyData] = useState<{ label: string; value: number }[]>([]);
  const [deviceStats, setDeviceStats] = useState<Record<string, number>>({});
  const [browserStats, setBrowserStats] = useState<Record<string, number>>({});

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

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={exportData} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>{t('campaign.exportCSV')}</button>
        <button onClick={() => exportExcel(`${campaign.name}-analytics`, [t('campaign.analytics.hour'), t('campaign.analytics.scans')], hourlyData.map(h => [`${h.hour}:00`, h.count]))} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>{t('campaign.exportExcel')}</button>
      </div>
    </div>
  );
}
