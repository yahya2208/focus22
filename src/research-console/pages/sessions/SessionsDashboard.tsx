import { useState, useEffect } from 'react';
import { createResearchAPI, type SessionRow } from '../../../core/research/api-supabase';
import { ResearchLayout, DashboardHeader, FilterBar } from '../../layout/ResearchLayout';
import type { DashboardId } from '../../layout/ResearchLayout';
import type { ResearchFilters } from '../../../core/research/filters';
import { createEmptyFilters } from '../../../core/research/filters';
import { useTranslation } from '../../../hooks/useTranslation';

const ROW_STYLE = { padding: '0.65rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.82rem', color: '#ccc', whiteSpace: 'nowrap' as const };
const TH_STYLE = { padding: '0.6rem 0.75rem', textAlign: 'left' as const, fontSize: '0.72rem', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.06em', borderBottom: '2px solid #1e1e2e', whiteSpace: 'nowrap' as const };

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#22c55e';
  if (grade === 'B') return '#6366f1';
  if (grade === 'C') return '#f59e0b';
  return '#ef4444';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' });
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${mon} ${time}`;
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

  if (dashboard !== 'sessions') return null;

  return (
    <ResearchLayout activeDashboard={dashboard} onNavigate={setDashboard}>
      <DashboardHeader title={t('sessions.title')} subtitle={`${sessions.length} ${t('sessions.found')}`} />
      <FilterBar filters={filters} onFilterChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} onReset={() => setFilters(createEmptyFilters())} />

      <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>{t('sessions.colTime')}</th>
                <th style={TH_STYLE}>{t('sessions.colUser')}</th>
                <th style={TH_STYLE}>{t('sessions.colType')}</th>
                <th style={TH_STYLE}>{t('sessions.colQr')}</th>
                <th style={TH_STYLE}>{t('sessions.colAvgMs')}</th>
                <th style={TH_STYLE}>{t('sessions.colBestMs')}</th>
                <th style={TH_STYLE}>{t('sessions.colGrade')}</th>
                <th style={TH_STYLE}>{t('sessions.colFocus')}</th>
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
                    <td style={ROW_STYLE}>{s.userName}</td>
                    <td style={ROW_STYLE}>{s.userType}</td>
                    <td style={ROW_STYLE}>{s.campaignSource ?? '-'}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }}>{s.avgRt || '-'}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }}>{s.bestRt || '-'}</td>
                    <td style={{ ...ROW_STYLE, color: gradeColor(s.grade), fontWeight: 600 }}>{s.grade}</td>
                    <td style={{ ...ROW_STYLE, fontVariantNumeric: 'tabular-nums' }}>{s.focusScore ? s.focusScore.toFixed(1) : '-'}</td>
                  </tr>
                  {expandedId === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={8} style={{ padding: '1rem', background: '#0e0e18', borderBottom: '2px solid #6366f1' }}>
                        <SessionDetail session={s} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#555' }}>{t('sessions.noSessions')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ResearchLayout>
  );
}

function SessionDetail({ session: s }: { session: SessionRow }) {
  const { t } = useTranslation();
  const rtData = s.correctedRts;
  const maxRt = rtData.length > 0 ? Math.max(...rtData) : 1;
  const sorted = [...rtData].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n > 0 ? (n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!) : 0;
  const mean = s.avgRt;
  const variance = n > 0 ? rtData.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n : 0;
  const sd = Math.sqrt(variance);
  const cv = mean > 0 ? sd / mean : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
      <div>
        <h4 style={{ color: '#f0f0f0', margin: '0 0 0.75rem', fontSize: '0.85rem' }}>{t('sessions.reactionTimes')}</h4>
        {rtData.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {rtData.map((rt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.72rem', width: '1.5rem', textAlign: 'right' }}>#{i + 1}</span>
                <div style={{ flex: 1, height: '8px', background: '#1e1e2e', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(rt / maxRt) * 100}%`,
                    height: '100%',
                    background: rt === Math.min(...rtData) ? '#22c55e' : rt === Math.max(...rtData) ? '#ef4444' : '#6366f1',
                    borderRadius: '4px',
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ color: '#ccc', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', minWidth: '3.5rem', textAlign: 'right' }}>{Math.round(rt)}ms</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#555', fontSize: '0.8rem' }}>{t('sessions.noTrialData')}</p>
        )}

        {rtData.length > 1 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <MiniSparkline values={rtData} />
          </div>
        )}
      </div>

      <div>
        <h4 style={{ color: '#f0f0f0', margin: '0 0 0.75rem', fontSize: '0.85rem' }}>{t('sessions.sessionDetails')}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: t('sessions.sessionId'), value: s.id.slice(0, 8) + '...' },
            { label: t('sessions.game'), value: s.pluginId },
            { label: t('sessions.median'), value: `${Math.round(median)}ms` },
            { label: t('sessions.stdDev'), value: `${Math.round(sd)}ms` },
            { label: t('sessions.cv'), value: `${(cv * 100).toFixed(1)}%` },
            { label: t('sessions.consistency'), value: s.consistencyRating },
            { label: t('sessions.device'), value: s.deviceInfo },
            { label: t('sessions.source'), value: s.campaignSource ?? t('sessions.direct') },
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
