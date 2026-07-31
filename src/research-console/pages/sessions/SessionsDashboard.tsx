import { useState, useEffect, useMemo } from 'react';
import { createResearchAPI, type SessionRow } from '../../../core/research/api-supabase';
import { ResearchLayout, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import type { DashboardId } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';

const ROW_STYLE = { padding: '0.65rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.82rem', color: '#ccc', whiteSpace: 'nowrap' as const };
const TH_STYLE = { padding: '0.6rem 0.75rem', textAlign: 'left' as const, fontSize: '0.72rem', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' as const };

function statusColor(status: string): string {
  if (status === 'running') return '#3b82f6';
  if (status === 'completed') return '#22c55e';
  if (status === 'failed') return '#ef4444';
  if (status === 'paused') return '#f59e0b';
  return '#888';
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#22c55e';
  if (grade === 'B') return '#6366f1';
  if (grade === 'C') return '#f59e0b';
  return '#ef4444';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function MiniSparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 180;
  const h = 36;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={(i / (values.length - 1)) * w} cy={h - ((v - min) / range) * h} r="2"
          fill={v === min ? '#22c55e' : v === max ? '#ef4444' : '#6366f1'} />
      ))}
    </svg>
  );
}

function SessionDetail({ session: s }: { session: SessionRow }) {
  const rtData = s.correctedRts;
  const maxRt = rtData.length > 0 ? Math.max(...rtData) : 1;
  const sorted = [...rtData].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n > 0 ? (n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!) : 0;
  const mean = s.avgRt;
  const variance = n > 0 ? rtData.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n : 0;
  const sd = Math.sqrt(variance);
  const cv = mean > 0 ? sd / mean : 0;
  const worstRt = n > 0 ? Math.max(...rtData) : 0;
  const bestRt = n > 0 ? Math.min(...rtData) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
      <div>
        <h4 style={{ color: '#f0f0f0', margin: '0 0 0.75rem', fontSize: '0.85rem' }}>Reaction Times</h4>
        {rtData.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {rtData.map((rt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.72rem', width: '1.5rem', textAlign: 'right' }}>#{i + 1}</span>
                <div style={{ flex: 1, height: '8px', background: '#1e1e2e', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(rt / maxRt) * 100}%`, height: '100%',
                    background: rt === bestRt ? '#22c55e' : rt === worstRt ? '#ef4444' : '#6366f1',
                    borderRadius: '4px', transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ color: '#ccc', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', minWidth: '3.5rem', textAlign: 'right' }}>{Math.round(rt)}ms</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1e1e2e' }}>
              <span style={{ color: '#22c55e', fontSize: '0.75rem' }}>Best: {Math.round(bestRt)}ms</span>
              <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>Worst: {Math.round(worstRt)}ms</span>
            </div>
          </div>
        ) : (
          <p style={{ color: '#555', fontSize: '0.8rem' }}>No trial data</p>
        )}
        {rtData.length > 1 && (
          <div style={{ marginTop: '0.75rem' }}>
            <MiniSparkline values={rtData} />
          </div>
        )}
      </div>

      <div>
        <h4 style={{ color: '#f0f0f0', margin: '0 0 0.75rem', fontSize: '0.85rem' }}>Session Details</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'Session ID', value: s.id.slice(0, 8) + '...' },
            { label: 'Game', value: s.pluginId },
            { label: 'Status', value: s.status },
            { label: 'Status', value: s.status },
            { label: 'Last Activity', value: s.lastActivityAt ? formatDate(s.lastActivityAt) : '-' },
            { label: 'Median', value: `${Math.round(median)}ms` },
            { label: 'Std Dev', value: `${Math.round(sd)}ms` },
            { label: 'CV', value: `${(cv * 100).toFixed(1)}%` },
            { label: 'Consistency', value: s.consistencyRating },
            { label: 'Fatigue Score', value: s.fatigueScore != null ? s.fatigueScore.toFixed(2) : '-' },
            { label: 'Calibration', value: s.calibrationConfidence != null ? `${(s.calibrationConfidence * 100).toFixed(0)}%` : '-' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ color: '#666', fontSize: '0.65rem', margin: '0 0 0.1rem', textTransform: 'uppercase' as const }}>{label}</p>
              <p style={{ color: '#f0f0f0', fontSize: '0.8rem', margin: 0, wordBreak: 'break-all' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ color: '#f0f0f0', margin: '0 0 0.75rem', fontSize: '0.85rem' }}>Device Profile</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'OS', value: s.deviceOs },
            { label: 'Browser', value: s.deviceBrowser },
            { label: 'Brand', value: s.brand || '-' },
            { label: 'Model', value: s.marketingName || s.model || '-' },
            { label: 'Screen', value: s.screenWidth && s.screenHeight ? `${s.screenWidth}×${s.screenHeight}` : '-' },
            { label: 'Refresh Rate', value: s.refreshRate ? `${s.refreshRate}Hz` : '-' },
            { label: 'Pixel Ratio', value: s.pixelRatio != null ? s.pixelRatio.toFixed(1) : '-' },
            { label: 'RAM', value: s.memoryGb ? `${s.memoryGb}GB` : '-' },
            { label: 'CPU Cores', value: s.cpuCores ? `${s.cpuCores} cores` : '-' },
            { label: 'Pointer', value: s.pointerType || '-' },
            { label: 'Touch', value: s.touchSupport ? 'Yes' : 'No' },
            { label: 'Language', value: s.language || '-' },
            { label: 'Timezone', value: s.timezone || '-' },
            { label: 'Device', value: s.deviceInfo },
            { label: 'Source', value: s.campaignSource ?? 'Direct' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ color: '#666', fontSize: '0.65rem', margin: '0 0 0.1rem', textTransform: 'uppercase' as const }}>{label}</p>
              <p style={{ color: '#f0f0f0', fontSize: '0.8rem', margin: 0, wordBreak: 'break-all' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SessionsDashboard() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<DashboardId>('sessions');
  const [sessions, setSessions] = useState<readonly SessionRow[]>([]);
  const [filters, setFilters] = useState<ResearchFilters>(createEmptyFilters());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const api = createResearchAPI();
    api.getSessionList(filters).then(setSessions);
  }, [filters]);

  const csvData = useMemo(() => {
    const headers = ['Session ID', 'Created', 'Status', 'User', 'Type', 'Game', 'Avg (ms)', 'Best (ms)', 'Grade', 'Focus', 'Device', 'Brand', 'Model', 'OS', 'Browser', 'Screen', 'RAM', 'CPU', 'Refresh Rate', 'Campaign'];
    const rows = sessions.map(s => [
      s.id, s.createdAt, s.status, s.userName, s.userType, s.pluginId,
      String(s.avgRt), String(s.bestRt), s.grade, String(s.focusScore),
      s.deviceInfo, s.brand, s.marketingName, s.deviceOs, s.deviceBrowser,
      s.screenWidth && s.screenHeight ? `${s.screenWidth}x${s.screenHeight}` : '',
      s.memoryGb ? `${s.memoryGb}GB` : '', s.cpuCores ? `${s.cpuCores} cores` : '',
      s.refreshRate ? `${s.refreshRate}Hz` : '', s.campaignSource ?? '',
    ]);
    return { headers, rows };
  }, [sessions]);

  const downloadCSV = () => {
    const lines = [csvData.headers.join(','), ...csvData.rows.map(r => r.map(c => `"${c}"`).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (dashboard !== 'sessions') return null;

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader
        title={t('sessions.title')}
        subtitle={`${sessions.length} ${t('sessions.found')}`}
        actions={<button onClick={downloadCSV} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' }}>Export CSV</button>}
      />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />

      <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>{t('sessions.colTime')}</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>{t('sessions.colUser')}</th>
                <th style={TH_STYLE}>{t('sessions.colQr')}</th>
                <th style={TH_STYLE}>Device</th>
                <th style={TH_STYLE}>{t('sessions.colAvgMs')}</th>
                <th style={TH_STYLE}>{t('sessions.colBestMs')}</th>
                <th style={TH_STYLE}>{t('sessions.colGrade')}</th>
                <th style={TH_STYLE}>{t('sessions.colFocus')}</th>
                <th style={TH_STYLE}>Ended</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <>
                  <tr
                    key={s.id}
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    style={{ cursor: 'pointer', background: expandedId === s.id ? '#1a1a2e' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#16162a'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = expandedId === s.id ? '#1a1a2e' : 'transparent'; }}
                  >
                    <td style={ROW_STYLE}>{formatDate(s.createdAt)}</td>
                    <td style={ROW_STYLE}>
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, background: `${statusColor(s.status)}20`, color: statusColor(s.status) }}>{s.status}</span>
                    </td>
                    <td style={ROW_STYLE}>{s.userName}</td>
                    <td style={ROW_STYLE}>{s.campaignSource ?? '-'}</td>
                    <td style={{ ...ROW_STYLE, fontSize: '0.75rem' }}>{s.marketingName || s.deviceInfo}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }}>{s.avgRt || '-'}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }}>{s.bestRt || '-'}</td>
                    <td style={{ ...ROW_STYLE, color: gradeColor(s.grade), fontWeight: 600 }}>{s.grade}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }}>{s.focusScore ? s.focusScore.toFixed(1) : '-'}</td>
                    <td style={{ ...ROW_STYLE, fontSize: '0.7rem', color: '#888' }}>{s.status}</td>
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={10} style={{ padding: '1rem', background: '#0e0e18', borderBottom: '2px solid #6366f1' }}>
                        <SessionDetail session={s} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#555' }}>{t('sessions.noSessions')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ResearchLayout>
  );
}