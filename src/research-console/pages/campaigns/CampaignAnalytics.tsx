import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../../core/supabase/client';
import { getDataService, type Campaign, type QRCode, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { FunnelChart } from '../../../research-console/components/FunnelChart';
import { BarChart, LineChart } from '../../../research-console/components/charts/Charts';
import { exportCSV, exportExcel } from '../../../research-console/components/ExportUtils';
import { useThemeStyles } from '../../../hooks/useThemeStyles';
import { devError } from '../../../core/logging';
function parseDeviceUA(ua: string | null | undefined): { brand: string; model: string; marketingName: string } {
  if (!ua) return { brand: 'Unknown', model: 'Unknown', marketingName: 'Unknown' };
  const lower = ua.toLowerCase();
  if (lower.includes('iphone') || lower.includes('ipad')) return { brand: 'Apple', model: 'iPhone', marketingName: 'iPhone' };
  if (lower.includes('samsung') || ua.includes('SM-')) {
    const code = ua.match(/SM-[A-Z0-9]+/i);
    return { brand: 'Samsung', model: code?.[0] ?? 'Galaxy', marketingName: code?.[0] ?? 'Samsung Galaxy' };
  }
  if (lower.includes('xiaomi') || lower.includes('mi ') || lower.includes('redmi') || lower.includes('poco'))
    return { brand: 'Xiaomi', model: 'Xiaomi Device', marketingName: 'Xiaomi' };
  if (lower.includes('huawei') || lower.includes('honor'))
    return { brand: 'Huawei', model: 'Huawei Device', marketingName: 'Huawei' };
  if (lower.includes('pixel') || lower.includes('google'))
    return { brand: 'Google', model: ua.match(/Pixel\s*\d+/i)?.[0] ?? 'Pixel', marketingName: 'Google Pixel' };
  if (lower.includes('oppo')) return { brand: 'Oppo', model: 'Oppo', marketingName: 'Oppo' };
  if (lower.includes('oneplus')) return { brand: 'OnePlus', model: 'OnePlus', marketingName: 'OnePlus' };
  if (lower.includes('windows')) return { brand: 'Microsoft', model: 'Windows PC', marketingName: 'Windows PC' };
  if (lower.includes('macintosh') || lower.includes('mac os x'))
    return { brand: 'Apple', model: 'Mac', marketingName: 'Apple Mac' };
  if (lower.includes('linux')) return { brand: 'Linux', model: 'Linux PC', marketingName: 'Linux PC' };
  return { brand: 'Unknown', model: 'Unknown', marketingName: 'Unknown' };
}

interface Props {
  campaign: Campaign;
  qrCodes: QRCode[];
  sessionStats: { started: number; completed: number };
  scanCount?: number;
}

interface HourlyData { hour: number; count: number; }

interface SessionRow {
  id: string;
  userId: string | null;
  status: string;
  endedReason: string | null;
  duration: number | null;
  avgRt: number | null;
  focusScore: number | null;
  grade: string | null;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  platform: string;
  brand: string;
  model: string;
  marketingName: string;
  screenWidth: number;
  screenHeight: number;
  memoryGb: number | null;
  cpuCores: number;
  timezone: string;
  language: string;
  userAgent: string | null;
  createdAt: string;
  finishedAt: string | null;
  campaignId: string | null;
}

const TH: React.CSSProperties = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '0.5rem 0.6rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.75rem', color: '#ccc', whiteSpace: 'nowrap' };

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function endedReasonBadge(reason: string | null): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    completed: { label: 'Completed', color: '#22c55e' },
    running: { label: 'Running', color: '#6366f1' },
    failed: { label: 'Failed', color: '#dc2626' },
    paused: { label: 'Paused', color: '#f59e0b' },
  };
  return map[reason ?? ''] ?? { label: reason ?? '-', color: '#888' };
}

function SessionExpandRow({ session: s }: { readonly session: SessionRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', background: expanded ? '#16162a' : 'transparent' }}
      >
        <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.65rem', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.id}>{s.id.slice(0, 8)}â€¦</td>
        <td style={TD}>
          <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600,
            background: s.status === 'completed' ? '#22c55e20' : s.status === 'running' ? '#3b82f620' : '#f59e0b20',
            color: s.status === 'completed' ? '#22c55e' : s.status === 'running' ? '#3b82f6' : '#f59e0b',
          }}>{s.status}</span>
        </td>
        <td style={TD}>
          <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', background: `${endedReasonBadge(s.status).color}20`, color: endedReasonBadge(s.status).color }}>
            {endedReasonBadge(s.status).label}
          </span>
        </td>
        <td style={TD}>{formatDuration(s.duration)}</td>
        <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{s.avgRt ? `${s.avgRt.toFixed(0)}ms` : '-'}</td>
        <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{s.focusScore ? s.focusScore.toFixed(1) : '-'}</td>
        <td style={TD}>{s.marketingName || s.brand || s.os || '-'}</td>
        <td style={{ ...TD, fontSize: '0.7rem', color: '#888' }}>{formatDateFull(s.createdAt)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: '0.75rem 1rem', background: '#0e0e18', borderBottom: '2px solid #6366f1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', fontSize: '0.78rem' }}>
              <div>
                <h5 style={{ color: '#6366f1', margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Player</h5>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>ID: {s.userId ? s.userId.slice(0, 12) + '...' : 'Guest'}</p>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Campaign: {s.campaignId ?? 'Direct'}</p>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Status: {s.status}</p>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Status: {endedReasonBadge(s.status).label}</p>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Duration: {formatDuration(s.duration)}</p>
              </div>
              <div>
                <h5 style={{ color: '#6366f1', margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Device</h5>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>{s.marketingName || s.model || s.browser || 'Unknown'}</p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>Brand: {s.brand || '-'} / Model: {s.model || '-'}</p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>OS: {s.os} {s.osVersion} / {s.platform}</p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>Browser: {s.browser} {s.browserVersion}</p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>Screen: {s.screenWidth}Ã—{s.screenHeight}</p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>RAM: {s.memoryGb ? `${s.memoryGb}GB` : '-'} / CPU: {s.cpuCores > 0 ? `${s.cpuCores} cores` : '-'}</p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>Timezone: {s.timezone || '-'} / Lang: {s.language || '-'}</p>
              </div>
              <div>
                <h5 style={{ color: '#6366f1', margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Performance</h5>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Avg RT: <span style={{ color: '#3b82f6' }}>{s.avgRt ? `${s.avgRt.toFixed(0)}ms` : '-'}</span></p>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Focus Score: <span style={{ color: '#f59e0b' }}>{s.focusScore ? s.focusScore.toFixed(1) : '-'}</span></p>
                <p style={{ color: '#ccc', margin: '0.15rem 0' }}>Grade: <span style={{ color: s.grade?.startsWith('A') ? '#22c55e' : s.grade === 'B' ? '#6366f1' : s.grade === 'C' ? '#f59e0b' : '#ef4444' }}>{s.grade || '-'}</span></p>
                <p style={{ color: '#888', margin: '0.15rem 0' }}>Created: {formatDateFull(s.createdAt)}</p>
                {s.finishedAt && <p style={{ color: '#888', margin: '0.15rem 0' }}>Finished: {formatDateFull(s.finishedAt)}</p>}
                {s.userAgent && <p style={{ color: '#555', margin: '0.15rem 0', fontSize: '0.65rem', wordBreak: 'break-all' }}>UA: {s.userAgent.substring(0, 100)}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function CampaignAnalytics({ campaign, qrCodes, sessionStats, scanCount = 0 }: Props) {
  const styles = useThemeStyles();
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [dailyData, setDailyData] = useState<{ label: string; value: number }[]>([]);
  const [browserStats, setBrowserStats] = useState<Record<string, number>>({});
  const [osStats, setOsStats] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);

  const stats = {
    scans: scanCount,
    started: sessionStats.started,
    completed: sessionStats.completed,
    abandoned: sessionStats.started - sessionStats.completed,
    registered: qrCodes.reduce((s, q) => s + q.registration_count, 0),
  };

  const [eventFunnel, setEventFunnel] = useState<{ label: string; value: number; color: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const client = getSupabaseClient();
        const ds = getDataService(client);
        const evts = await ds.getCampaignEvents(campaign.id!, 500);
        setEvents(evts);

        const hourCounts: Record<number, number> = {};
        const dayCounts: Record<string, number> = {};
        const browsers: Record<string, number> = {};
        const osCounts: Record<string, number> = {};
        const eventCounts: Record<string, number> = {};

        for (const ev of evts) {
          eventCounts[ev.event_type] = (eventCounts[ev.event_type] ?? 0) + 1;
          const d = new Date(ev.created_at ?? '');
          const hour = d.getHours();
          hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
          const dayKey = d.toISOString().slice(0, 10);
          dayCounts[dayKey] = (dayCounts[dayKey] ?? 0) + 1;
          const ua = ev.user_agent ?? '';
          const br = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : ua.includes('Edg') ? 'Edge' : 'Other';
          browsers[br] = (browsers[br] ?? 0) + 1;

          if (ev.event_type === 'session_started' || ev.event_type === 'game_started') {
            const parsed = parseDeviceUA(ua);
            osCounts[parsed.brand || 'Unknown'] = (osCounts[parsed.brand || 'Unknown'] ?? 0) + 1;
          }
        }

        const sortedDays = Object.entries(dayCounts).sort(([a], [b]) => a.localeCompare(b));

        setHourlyData(Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hourCounts[i] ?? 0 })));
        setDailyData(sortedDays.slice(-30).map(([k, v]) => ({ label: k.slice(5), value: v })));
        setBrowserStats(browsers);
        setOsStats(osCounts);

        const funnelOrder = ['qr_scanned', 'landing_loaded', 'consent_granted', 'calibration_started', 'calibration_completed', 'game_started', 'game_completed', 'registration_completed', 'phone_service_opened', 'trade_requested', 'whatsapp_clicked'];
        const funnelLabels: Record<string, { label: string; color: string }> = {
          qr_scanned: { label: 'QR Scan', color: '#6366f1' },
          landing_loaded: { label: 'Landing', color: '#3b82f6' },
          consent_granted: { label: 'Consent', color: '#8b5cf6' },
          calibration_started: { label: 'Calibration', color: '#f59e0b' },
          calibration_completed: { label: 'Calibrated', color: '#f97316' },
          game_started: { label: 'Game Started', color: '#3b82f6' },
          game_completed: { label: 'Completed', color: '#22c55e' },
          registration_completed: { label: 'Registered', color: '#f59e0b' },
          phone_service_opened: { label: 'Phone Services', color: '#a855f7' },
          trade_requested: { label: 'Trade Request', color: '#ec4899' },
          whatsapp_clicked: { label: 'WhatsApp', color: '#22c55e' },
        };
        setEventFunnel(funnelOrder
          .filter(et => (eventCounts[et] ?? 0) > 0)
          .map(et => ({ label: funnelLabels[et]?.label ?? et, value: eventCounts[et] ?? 0, color: funnelLabels[et]?.color ?? '#888' })));
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
            id, user_id, status, campaign_id, created_at, finished_at, measurements, scientific_results,
            _devices:devices(
              os, os_version, browser, browser_version, platform,
              screen_width, screen_height, memory_gb, cpu_cores,
              timezone, language, user_agent
            )
          `)
          .eq('campaign_id', campaign.id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) devError({ code: error.code, message: error.message, details: error.details, hint: error.hint });

        const mapped: SessionRow[] = (data ?? []).map((row: Record<string, unknown>) => {
          const dev = (row._devices as Record<string, unknown>) ?? {};
          const ua = (dev.user_agent as string) ?? '';
          const { brand, model, marketingName } = parseDeviceUA(ua);
          const results = (row.scientific_results as Record<string, unknown>) ?? {};
          const measurements = (row.measurements as Record<string, unknown>) ?? {};
          const corr = (measurements.corrected_rts as number[]) ?? [];
          const avgRt = corr.length > 0 ? corr.reduce((a: number, b: number) => a + b, 0) / corr.length : null;
          const finished = (row.finished_at as string) ?? null;
          const created = (row.created_at as string) ?? null;
          const duration = finished && created ? (new Date(finished).getTime() - new Date(created).getTime()) / 1000 : null;
          return {
            id: row.id as string,
            userId: (row.user_id as string) ?? null,
            status: row.status as string,
            endedReason: null,
            duration,
            avgRt: avgRt ? Math.round(avgRt) : null,
            focusScore: (results.focus_score as number) ?? null,
            grade: (results.grade as string) ?? null,
            os: (dev.os as string) ?? '',
            osVersion: (dev.os_version as string) ?? '',
            browser: (dev.browser as string) ?? '',
            browserVersion: (dev.browser_version as string) ?? '',
            platform: (dev.platform as string) ?? '',
            brand,
            model,
            marketingName,
            screenWidth: (dev.screen_width as number) ?? 0,
            screenHeight: (dev.screen_height as number) ?? 0,
            memoryGb: (dev.memory_gb as number | null) ?? null,
            cpuCores: (dev.cpu_cores as number) ?? 0,
            timezone: (dev.timezone as string) ?? '',
            language: (dev.language as string) ?? '',
            userAgent: ua || null,
            createdAt: row.created_at as string,
            finishedAt: (row.finished_at as string) ?? null,
            campaignId: (row.campaign_id as string) ?? null,
          };
        });

        setSessions(mapped);
      } catch (err) {
        devError('[CampaignAnalytics] load error', err);
      }
    };
    loadSessions();
  }, [campaign.id]);

  const durations = sessions.filter(s => s.duration != null).map(s => s.duration!) as number[];
  const avgRts = sessions.filter(s => s.avgRt != null).map(s => s.avgRt!) as number[];
  const focusScores = sessions.filter(s => s.focusScore != null).map(s => s.focusScore!) as number[];
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const avgRt = avgRts.length > 0 ? avgRts.reduce((a, b) => a + b, 0) / avgRts.length : 0;
  const avgFocus = focusScores.length > 0 ? focusScores.reduce((a, b) => a + b, 0) / focusScores.length : 0;
  const peakHour = hourlyData.reduce((best, h) => h.count > best.count ? h : best, { hour: 0, count: 0 });

  const topBrand = Object.entries(osStats).sort(([, a], [, b]) => b - a)[0];
  const topBrowser = Object.entries(browserStats).sort(([, a], [, b]) => b - a)[0];
  const returningPlayers = new Set(sessions.filter(s => s.userId).map(s => s.userId)).size;
  const newPlayers = sessions.filter(s => !s.userId).length;
  const totalPlayers = returningPlayers + newPlayers;
  const returnRate = totalPlayers > 0 ? Math.round((returningPlayers / totalPlayers) * 100) : 0;

  const funnelSteps = [
    { label: 'QR Scans', value: stats.scans, color: '#6366f1' },
    { label: 'Game Started', value: stats.started, color: '#3b82f6' },
    { label: 'Game Finished', value: stats.completed, color: '#22c55e' },
    { label: 'Registered', value: stats.registered, color: '#f59e0b' },
  ];

  const exportData = () => {
    const headers = ['Session ID', 'Status', 'Duration', 'Avg RT', 'Focus', 'Device', 'Brand', 'Model', 'OS', 'Browser', 'Created'];
    const rows = sessions.map(s => [
      s.id, s.status, String(s.duration ?? ''), String(s.avgRt ?? ''),
      String(s.focusScore ?? ''), s.marketingName, s.brand, s.model, `${s.os} ${s.osVersion}`,
      `${s.browser} ${s.browserVersion}`, s.createdAt,
    ]);
    exportCSV(`${campaign.name}-analytics`, headers, rows);
  };

  const campaignStartDate = campaign.created_at ? new Date(campaign.created_at) : null;
  const firstEventDate = events.length > 0 ? new Date(events[events.length - 1]?.created_at ?? '') : null;
  const peakDay = dailyData.length > 0 ? dailyData.reduce((best, d) => d.value > best.value ? d : best, dailyData[0]!) : null;

  return (
    <div style={{ ...styles.flexCol, gap: '1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: 'Total Scans', value: stats.scans.toLocaleString(), color: '#6366f1' },
          { label: 'Game Started', value: stats.started.toLocaleString(), color: '#3b82f6' },
          { label: 'Completed', value: stats.completed.toLocaleString(), color: '#22c55e' },
          { label: 'Abandoned', value: stats.abandoned.toLocaleString(), color: '#ef4444' },
          { label: 'Registered', value: stats.registered.toLocaleString(), color: '#f59e0b' },
          { label: 'Conversion', value: stats.scans > 0 ? `${((stats.registered / stats.scans) * 100).toFixed(1)}%` : '0%', color: '#f59e0b' },
          { label: 'Avg RT', value: avgRt > 0 ? `${avgRt.toFixed(0)}ms` : '-', color: '#ef4444' },
          { label: 'Avg Focus', value: avgFocus > 0 ? avgFocus.toFixed(1) : '-', color: '#6366f1' },
          { label: 'Avg Duration', value: formatDuration(avgDuration), color: '#22c55e' },
          { label: 'Top Brand', value: topBrand?.[0] ?? '-', color: '#8b5cf6' },
          { label: 'Top Browser', value: topBrowser?.[0] ?? '-', color: '#3b82f6' },
          { label: 'Peak Hour', value: peakHour.count > 0 ? `${peakHour.hour}:00` : '-', color: '#ef4444' },
          { label: 'Returning', value: `${returnRate}%`, color: '#22c55e' },
          { label: 'New Players', value: newPlayers.toLocaleString(), color: '#888' },
        ].map(s => (
          <div key={s.label} style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '10px', padding: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.6rem', color: '#666', textTransform: 'uppercase' }}>{s.label}</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '1.2rem', fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Campaign Timeline */}
      {campaignStartDate && (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Campaign Timeline</p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Created', date: campaignStartDate },
              { label: 'First Activity', date: firstEventDate },
              { label: 'Peak Day', date: peakDay ? new Date(peakDay.label) : null },
              { label: 'Latest Session', date: sessions.length > 0 ? new Date(sessions[0]!.createdAt) : null },
            ].map(({ label, date }) => (
              <div key={label} style={{ padding: '0.5rem 0.75rem', background: '#0e0e18', borderRadius: '8px', border: '1px solid #1e1e2e', minWidth: '140px' }}>
                <p style={{ margin: 0, fontSize: '0.6rem', color: '#666', textTransform: 'uppercase' }}>{label}</p>
                <p style={{ margin: '0.25rem 0 0', color: '#ccc', fontSize: '0.85rem' }}>{date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: eventFunnel.length > 0 ? '1fr 1fr' : '1fr 1fr', gap: '1rem' }}>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          {eventFunnel.length > 0 ? (
            <FunnelChart steps={eventFunnel} title="Event Funnel (Real Data)" />
          ) : (
            <FunnelChart steps={funnelSteps} title="Conversion Funnel (Sessions)" />
          )}
          <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: '#555', textAlign: 'center' }}>
            {eventFunnel.length > 0 ? 'Based on analytics_events' : 'Based on session stats'}
          </div>
        </div>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Peak Scan Time</p>
          <p style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{peakHour.count > 0 ? `${peakHour.hour}:00` : '-'}</p>
          <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.25rem 0 0.75rem' }}>{peakHour.count} scans at peak</p>
          <BarChart data={hourlyData.filter((_, i) => i % 3 === 0).map(h => ({ label: `${h.hour}`, value: h.count, color: h.hour === peakHour.hour ? '#ef4444' : '#6366f1' }))} title="Scans by Hour" />
        </div>
      </div>

      {dailyData.length > 0 && (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
          <LineChart data={dailyData.map((d, i) => ({ timestamp: new Date(`2025-${d.label}`).getTime() || i * 86400000, value: d.value }))} title="Scans per Day" />
        </div>
      )}

      {/* Top Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {Object.keys(osStats).length > 0 && (
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
            <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Top Brands</p>
            {Object.entries(osStats).sort(([, a], [, b]) => b - a).slice(0, 10).map(([brand, count]) => {
              const pct = stats.started > 0 ? ((count / stats.started) * 100).toFixed(1) : '0';
              return (
                <div key={brand} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem' }}>
                  <span style={{ color: '#ccc' }}>{brand}</span>
                  <span style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        )}
        {Object.keys(browserStats).length > 0 && (
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
            <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Top Browsers</p>
            {Object.entries(browserStats).sort(([, a], [, b]) => b - a).map(([br, count]) => (
              <div key={br} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem' }}>
                <span style={{ color: '#ccc' }}>{br}</span>
                <span style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sessions Table */}
      {sessions.length > 0 && (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ ...styles.flexBetween, padding: '1rem 1rem 0.5rem' }}>
            <h3 style={{ margin: 0, color: '#f0f0f0', fontSize: '0.95rem' }}>
              {campaign.name} â€” Sessions ({sessions.length})
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>ID</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Ended</th>
                  <th style={TH}>Duration</th>
                  <th style={TH}>Avg RT</th>
                  <th style={TH}>Focus</th>
                  <th style={TH}>Device</th>
                  <th style={TH}>Created</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => <SessionExpandRow key={s.id} session={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={exportData} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>Export CSV</button>
        <button onClick={() => exportExcel(`${campaign.name}-analytics`, ['Hour', 'Scans'], hourlyData.map(h => [`${h.hour}:00`, h.count]))} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>Export Excel</button>
      </div>
    </div>
  );
}