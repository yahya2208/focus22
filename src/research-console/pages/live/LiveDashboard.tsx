import React, { useState, useEffect } from 'react';
import { subscribeToLiveSessions, type LiveSession } from '../../../core/supabase/live-sessions';
import { ResearchLayout, StatCard, DashboardHeader } from '../../layout/ResearchLayout';
import type { DashboardId } from '../../layout/ResearchLayout';
import { useTranslation } from '../../../hooks/useTranslation';

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

const deviceFieldLabels: Record<string, string> = {
  browser: 'Browser',
  browserVersion: 'Browser Version',
  os: 'OS',
  osVersion: 'OS Version',
  platform: 'Platform',
  screenWidth: 'Screen Width',
  screenHeight: 'Screen Height',
  pixelRatio: 'Pixel Ratio',
  refreshRate: 'Refresh Rate',
  touchSupport: 'Touch Support',
  pointerType: 'Pointer Type',
  cpuCores: 'CPU Cores',
  memoryGb: 'Memory (GB)',
  language: 'Language',
  timezone: 'Timezone',
  userAgent: 'User Agent',
  collectedAt: 'Collected At',
};

function DeviceDetailsPanel({ device }: { device: LiveSession['deviceDetails'] }) {
  if (!device) {
    return <p style={{ color: '#888', padding: '1rem', fontSize: '0.8rem' }}>No device data</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1.5rem', padding: '0.75rem 1rem' }}>
      {Object.entries(deviceFieldLabels).map(([key, label]) => {
        let value = (device as unknown as Record<string, unknown>)[key];
        if (typeof value === 'boolean') value = value ? 'Yes' : 'No';
        if (value === null || value === undefined || value === '') value = '-';
        return (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e1e2e', fontSize: '0.78rem' }}>
            <span style={{ color: '#999', minWidth: '120px' }}>{label}</span>
            <span style={{ color: '#ddd', fontFamily: 'monospace', textAlign: 'right', wordBreak: 'break-all' }}>
              {String(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function LiveDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardId>('live');
  const [sessions, setSessions] = useState<readonly LiveSession[]>([]);
  const [now, setNow] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToLiveSessions((data) => {
      console.log('[LiveDashboard] received sessions in component:', data.length);
      console.log('[LiveDashboard] full session list:', JSON.stringify(data, null, 2));
      setSessions(data);
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { unsub(); clearInterval(tick); };
  }, []);

  if (dashboard !== 'live') return null;

  const running = sessions.filter(s => s.status === 'running');
  const paused = sessions.filter(s => s.status === 'paused');
  const guests = sessions.filter(s => s.userType === 'guest').length;
  const registered = sessions.filter(s => s.userType === 'registered').length;
  const campaignCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    const name = s.campaignName ?? 'Direct';
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const platformCounts = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.platform] = (acc[s.platform] ?? 0) + 1;
    return acc;
  }, {});

  const uniqueSessions = Array.from(
    new Map(sessions.map(s => [s.sessionId, s])).values()
  );

  if (uniqueSessions.length !== sessions.length) {
    console.warn('[LiveDashboard] duplicate sessionIds detected, deduplicated:', sessions.length, '->', uniqueSessions.length);
  }

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader title={t('live.title')} subtitle={t('live.subtitle')} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <StatCard label={t('live.currentlyPlaying')} value={running.length} color="#22c55e" />
        <StatCard label={t('live.paused')} value={paused.length} color="#f59e0b" />
        <StatCard label={t('live.totalActive')} value={uniqueSessions.length} color="#6366f1" />
        <StatCard label={t('live.guests')} value={guests} color="#888" />
        <StatCard label={t('live.registered')} value={registered} color="#6366f1" />
      </div>

      {uniqueSessions.length === 0 ? (
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: '1rem' }}>{t('live.noActiveSessions')}</p>
          <p style={{ color: '#555', fontSize: '0.85rem', marginTop: '0.5rem' }}>{t('live.waitingForPlayers')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem' }}>
          <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      t('live.player'),
                      t('live.status'),
                      t('live.elapsed'),
                      t('live.device'),
                      t('live.campaign'),
                      t('live.reaction'),
                      t('live.type'),
                    ].map(h => (
                      <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueSessions.map(s => (
                    <React.Fragment key={s.sessionId}>
                      <tr
                        style={{ borderBottom: '1px solid #1e1e2e', cursor: 'pointer' }}
                        onClick={() => setExpandedId(expandedId === s.sessionId ? null : s.sessionId)}
                      >
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#ccc' }}>
                          {s.userName}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                            background: s.status === 'running' ? '#22c55e20' : '#f59e0b20',
                            color: s.status === 'running' ? '#22c55e' : '#f59e0b',
                          }}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                          {formatElapsed(now - s.startedAt)}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.75rem', color: '#888' }}>
                          {s.os} / {s.browser}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#888' }}>
                          {s.campaignName ?? '-'}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
                          {s.currentRound}/{s.totalRounds}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.75rem' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem',
                            background: s.userType === 'registered' ? '#6366f120' : '#33333320',
                            color: s.userType === 'registered' ? '#6366f1' : '#888',
                          }}>
                            {s.userType}
                          </span>
                        </td>
                      </tr>
                      {expandedId === s.sessionId && (
                        <tr key={`${s.sessionId}-details`}>
                          <td colSpan={7} style={{ padding: 0, background: '#0a0a12' }}>
                            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #22c55e40', fontSize: '0.7rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              Device Details — click row to toggle
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
    </ResearchLayout>
  );
}
