import React, { useState, useEffect } from 'react';
import { subscribeToLiveSessions, type LiveSession } from '../../../core/supabase/live-sessions';
import { getSupabaseClient } from '../../../core/supabase/client';
import { markRender } from '../../../core/supabase/live-diagnostics';
import { StatCard, DashboardHeader } from '../../layout/ResearchLayout';
import { useTranslation } from '../../../hooks/useTranslation';

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface RecentEvent {
  id: string;
  type: 'finished' | 'registered' | 'abandoned' | 'error';
  userName: string;
  deviceName: string;
  campaignName: string;
  focusScore: number | null;
  avgRt: number | null;
  timestamp: string;
}

const deviceFieldLabels: Record<string, string> = {
  browser: 'Browser', browserVersion: 'Browser Version', os: 'OS', osVersion: 'OS Version',
  platform: 'Platform', screenWidth: 'Screen Width', screenHeight: 'Screen Height',
  pixelRatio: 'Pixel Ratio', refreshRate: 'Refresh Rate', touchSupport: 'Touch Support',
  pointerType: 'Pointer Type', cpuCores: 'CPU Cores', memoryGb: 'Memory (GB)',
  language: 'Language', timezone: 'Timezone', userAgent: 'User Agent', collectedAt: 'Collected At',
};

function DeviceDetailsPanel({ device }: { device: LiveSession['deviceDetails'] }) {
  if (!device) return <p style={{ color: '#888', padding: '1rem', fontSize: '0.8rem' }}>No device data</p>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1.5rem', padding: '0.75rem 1rem' }}>
      {Object.entries(deviceFieldLabels).map(([key, label]) => {
        let value = (device as unknown as Record<string, unknown>)[key];
        if (typeof value === 'boolean') value = value ? 'Yes' : 'No';
        if (value === null || value === undefined || value === '') value = '-';
        return (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.78rem' }}>
            <span style={{ color: '#999', minWidth: '120px' }}>{label}</span>
            <span style={{ color: '#ddd', fontFamily: 'monospace', textAlign: 'right', wordBreak: 'break-all' }}>{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecentEventCard({ event }: { readonly event: RecentEvent }) {
  const colors: Record<string, string> = { finished: '#22c55e', registered: '#6366f1', abandoned: '#ef4444', error: '#dc2626' };
  const icons: Record<string, string> = { finished: '✓', registered: '→', abandoned: '✕', error: '⚠' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.78rem' }}>
      <span style={{ color: colors[event.type] ?? '#888', fontWeight: 700, width: '1.2rem', textAlign: 'center' }}>{icons[event.type] ?? '?'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: '#ccc' }}>{event.userName}</span>
        <span style={{ color: '#666', marginLeft: '0.25rem' }}>{event.type}</span>
        {event.deviceName && <span style={{ color: '#555', marginLeft: '0.25rem', fontSize: '0.7rem' }}>· {event.deviceName}</span>}
        {event.campaignName && <span style={{ color: '#555', marginLeft: '0.25rem', fontSize: '0.7rem' }}>· {event.campaignName}</span>}
        {event.focusScore != null && <span style={{ color: '#f59e0b', marginLeft: '0.25rem', fontWeight: 600 }}>{event.focusScore.toFixed(0)}</span>}
      </div>
      <span style={{ color: '#555', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>{timeAgo(event.timestamp)}</span>
    </div>
  );
}

export function LiveDashboard() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<readonly LiveSession[]>([]);
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [stats28, setStats28] = useState<{ registrations: number; qrScans: number; campaigns: number }>({ registrations: 0, qrScans: 0, campaigns: 0 });

  useEffect(() => {
    const unsub = subscribeToLiveSessions(setSessions);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { unsub(); clearInterval(tick); };
  }, []);

  useEffect(() => {
    markRender();
  }, [sessions]);

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const client = getSupabaseClient();
        const ago = new Date(Date.now() - 3600000).toISOString();

        const [completedRes, abandonedRes, regRes] = await Promise.all([
          client.from('sessions')
            .select('id, user_id, status, campaign_id, created_at, finished_at, measurements, scientific_results, _devices:devices(browser, os)', { count: 'exact' })
            .in('status', ['completed', 'failed'])
            .gte('finished_at', ago)
            .order('finished_at', { ascending: false })
            .limit(10),
          client.from('sessions')
            .select('id, user_id, status, campaign_id, finished_at, measurements, scientific_results')
            .eq('status', 'abandoned')
            .gte('finished_at', ago)
            .order('finished_at', { ascending: false })
            .limit(5),
          client.from('analytics_events')
            .select('id, event_type, event_data, campaign_id, created_at')
            .eq('event_type', 'registration')
            .gte('created_at', ago)
            .order('created_at', { ascending: false })
            .limit(5),
        ]);
        if (completedRes.error) console.error({ code: completedRes.error.code, message: completedRes.error.message, details: completedRes.error.details, hint: completedRes.error.hint });
        if (abandonedRes.error) console.error({ code: abandonedRes.error.code, message: abandonedRes.error.message, details: abandonedRes.error.details, hint: abandonedRes.error.hint });
        if (regRes.error) console.error({ code: regRes.error.code, message: regRes.error.message, details: regRes.error.details, hint: regRes.error.hint });

        const events: RecentEvent[] = [];

        for (const s of completedRes.data ?? []) {
          const dev = s._devices as unknown as Record<string, unknown> ?? {};
          const results = s.scientific_results as Record<string, unknown> ?? {};
          const measurements = s.measurements as Record<string, unknown> ?? {};
          const corr = (measurements.corrected_rts as number[]) ?? [];
          const avgRt = corr.length > 0 ? corr.reduce((a: number, b: number) => a + b, 0) / corr.length : null;
          events.push({
            id: s.id, type: 'finished',
            userName: s.user_id?.slice(0, 8) ?? 'User',
            deviceName: `${dev.browser ?? ''} / ${dev.os ?? ''}`.trim() || '-',
            campaignName: s.campaign_id ?? '',
            focusScore: (results.focus_score as number) ?? null,
            avgRt: Math.round(avgRt ?? 0) || null,
            timestamp: s.finished_at ?? s.created_at,
          });
        }
        for (const s of abandonedRes.data ?? []) {
          const results = s.scientific_results as Record<string, unknown> ?? {};
          const measurements = s.measurements as Record<string, unknown> ?? {};
          const corr = (measurements.corrected_rts as number[]) ?? [];
          const avgRt = corr.length > 0 ? corr.reduce((a: number, b: number) => a + b, 0) / corr.length : null;
          events.push({
            id: s.id, type: 'abandoned',
            userName: s.user_id?.slice(0, 8) ?? 'User',
            deviceName: '-', campaignName: s.campaign_id ?? '',
            focusScore: (results.focus_score as number) ?? null,
            avgRt: Math.round(avgRt ?? 0) || null,
            timestamp: s.finished_at ?? new Date().toISOString(),
          });
        }
        for (const ev of regRes.data ?? []) {
          events.push({
            id: ev.id, type: 'registered',
            userName: ev.event_data?.user_name ?? 'User',
            deviceName: '-', campaignName: ev.campaign_id ?? '',
            focusScore: null, avgRt: null, timestamp: ev.created_at,
          });
        }

        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setRecentEvents(events.slice(0, 20));
      } catch (err) { console.error('[LiveDashboard] loadRecent error', err); }
    };

    loadRecent();
    const interval = setInterval(loadRecent, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const load28 = async () => {
      try {
        const client = getSupabaseClient();
        const monthAgo = new Date(Date.now() - 28 * 86400000).toISOString();
        const [regCount, qrRes, campRes] = await Promise.all([
          client.from('analytics_events').select('id', { count: 'exact', head: true }).eq('event_type', 'registration').gte('created_at', monthAgo),
          client.from('qr_codes').select('scan_count'),
          client.from('campaigns').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ]);
        const totalScans = (qrRes.data ?? []).reduce((s, q) => s + (q.scan_count ?? 0), 0);
        setStats28({ registrations: regCount.count ?? 0, qrScans: totalScans, campaigns: campRes.count ?? 0 });
      } catch (err) { console.error('[LiveDashboard] load28 error', err); }
    };
    load28();
  }, []);

  const running = sessions.filter(s => s.status === 'running');
  const campaignCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.campaignName ?? 'Direct'] = (acc[s.campaignName ?? 'Direct'] ?? 0) + 1;
    return acc;
  }, {});
  const platformCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.platform] = (acc[s.platform] ?? 0) + 1;
    return acc;
  }, {});

  const uniqueSessions = Array.from(new Map(sessions.map(s => [s.sessionId, s])).values());

  const latestFinish = recentEvents.find(e => e.type === 'finished');
  const latestReg = recentEvents.find(e => e.type === 'registered');
  const latestAbandon = recentEvents.find(e => e.type === 'abandoned');

  return (
    <>
      <DashboardHeader title={t('live.title')} subtitle={t('live.subtitle')} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <StatCard label={t('live.currentlyPlaying')} value={running.length} color="#22c55e" />
        <StatCard label={t('live.totalActive')} value={uniqueSessions.length} color="#6366f1" />
        {latestFinish && <StatCard label="Latest Finish" value={timeAgo(latestFinish.timestamp)} color="#22c55e" subtitle={latestFinish.deviceName} />}
        {latestReg && <StatCard label="Latest Registration" value={timeAgo(latestReg.timestamp)} color="#6366f1" />}
        {latestAbandon && <StatCard label="Latest Abandon" value={timeAgo(latestAbandon.timestamp)} color="#ef4444" />}
        <StatCard label="28d Registrations" value={stats28.registrations} color="#f59e0b" />
        <StatCard label="28d QR Scans" value={stats28.qrScans.toLocaleString()} color="#8b5cf6" />
        <StatCard label="Active Campaigns" value={stats28.campaigns} color="#22c55e" />
      </div>

      {uniqueSessions.length === 0 ? (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: '1rem' }}>{t('live.noActiveSessions')}</p>
          <p style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.5rem' }}>{t('live.waitingForPlayers')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Live Sessions — {t('live.currentlyPlaying')}: {running.length}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Player', 'Status', 'Elapsed', 'Device', 'Campaign', 'Round', 'Type'].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueSessions.map(s => (
                    <React.Fragment key={s.sessionId}>
                      <tr style={{ borderBottom: '1px solid #1e1e2e', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === s.sessionId ? null : s.sessionId)}>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#ccc' }}>{s.userName}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: s.status === 'running' ? '#22c55e20' : '#f59e0b20', color: s.status === 'running' ? '#22c55e' : '#f59e0b' }}>{s.status}</span>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(now - s.startedAt)}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.75rem', color: '#888' }}>{s.os} / {s.browser}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#888' }}>{s.campaignName ?? '-'}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#888', fontVariantNumeric: 'tabular-nums' }}>{s.currentRound}/{s.totalRounds}</td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.75rem' }}>
                          <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', background: s.userType === 'registered' ? '#6366f120' : '#33333320', color: s.userType === 'registered' ? '#6366f1' : '#888' }}>{s.userType}</span>
                        </td>
                      </tr>
                      {expandedId === s.sessionId && (
                        <tr key={`${s.sessionId}-details`}>
                          <td colSpan={7} style={{ padding: 0, background: '#0a0a12' }}>
                            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #22c55e40', fontSize: '0.7rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Device Details
                            </div>
                            <DeviceDetailsPanel device={s.deviceDetails} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Realtime Event Feed */}
            <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.72rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                ● Live Feed — Last 60min
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {recentEvents.length > 0 ? recentEvents.map(ev => (
                  <RecentEventCard key={ev.id + ev.type} event={ev} />
                )) : (
                  <p style={{ color: '#555', padding: '1rem', textAlign: 'center', fontSize: '0.8rem' }}>No recent events</p>
                )}
              </div>
            </div>

            {Object.keys(campaignCounts).length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <h3 style={{ color: '#f0f0f0', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{t('live.byCampaign')}</h3>
                {Object.entries(campaignCounts).sort(([, a], [, b]) => b - a).map(([name, count]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem' }}>
                    <span style={{ color: '#ccc' }}>{name}</span>
                    <span style={{ color: '#6366f1', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(platformCounts).length > 0 && (
              <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '1rem' }}>
                <h3 style={{ color: '#f0f0f0', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{t('live.byPlatform')}</h3>
                {Object.entries(platformCounts).sort(([, a], [, b]) => b - a).map(([platform, count]) => (
                  <div key={platform} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem' }}>
                    <span style={{ color: '#ccc' }}>{platform}</span>
                    <span style={{ color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}