import { useState, useEffect, useMemo } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';

/* ─── Constants ─── */

const STAGE_LABELS: Record<string, string> = {
  qr_scanned: 'QR Scan', landing_loaded: 'Landing', consent_granted: 'Consent',
  calibration_started: 'Cal Start', calibration_completed: 'Cal Done',
  game_started: 'Game Start', round_started: 'Round', lamp_appeared: 'Lamp',
  lamp_clicked: 'Click', miss_click: 'Miss', game_completed: 'Game Done',
  results_viewed: 'Results', auth_registered: 'Register', phone_service_opened: 'Phone',
  trade_requested: 'Trade', whatsapp_clicked: 'WhatsApp',
  game_abandoned: 'Abandon', error_occurred: 'Error',
};

const FUNNEL_PAIRS: [string, string][] = [
  ['qr_scanned', 'landing_loaded'],
  ['landing_loaded', 'consent_granted'],
  ['consent_granted', 'calibration_started'],
  ['calibration_started', 'calibration_completed'],
  ['calibration_completed', 'game_started'],
  ['game_started', 'game_completed'],
  ['game_completed', 'results_viewed'],
  ['results_viewed', 'auth_registered'],
  ['auth_registered', 'phone_service_opened'],
  ['phone_service_opened', 'trade_requested'],
  ['trade_requested', 'whatsapp_clicked'],
];

const TERMINAL_EVENTS = ['game_abandoned', 'error_occurred'];

/* ─── Helpers ─── */

function pct(a: number, b: number): string {
  if (b === 0) return '—';
  return ((a / b) * 100).toFixed(0) + '%';
}

function msToStr(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

/* ─── Component ─── */

export function JourneyIntelligence() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<{ session_id: string; events: AnalyticsEvent[] }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const ds = getDataService();
        const data = await ds.getRecentSessions(200);
        if (!cancelled) setSessions(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ── 1. Most common paths ── */

  const commonPaths = useMemo(() => {
    const pathCounts: Record<string, number> = {};
    for (const s of sessions) {
      const types = s.events.map((e) => e.event_type);
      const key = types.slice(0, 6).join(' → ');
      pathCounts[key] = (pathCounts[key] ?? 0) + 1;
    }
    return Object.entries(pathCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [sessions]);

  /* ── 2. Drop-off points ── */

  const dropOffs = useMemo(() => {
    const entered: Record<string, number> = {};
    const exited: Record<string, number> = {};
    for (const s of sessions) {
      const types = s.events.map((e) => e.event_type);
      for (let i = 0; i < types.length; i++) {
        const t = types[i]!;
        entered[t] = (entered[t] ?? 0) + 1;
        const nextType = types[i + 1];
        if (i === types.length - 1 || (nextType && TERMINAL_EVENTS.includes(nextType))) {
          exited[t] = (exited[t] ?? 0) + 1;
        }
      }
    }
    return Object.entries(entered)
      .map(([et, total]) => ({
        event: et,
        label: STAGE_LABELS[et] ?? et,
        entered: total,
        dropped: exited[et] ?? 0,
        rate: total > 0 ? pct(total - (exited[et] ?? 0), total) : '—',
      }))
      .filter((d) => d.entered >= 5)
      .sort((a, b) => (parseInt(b.rate) || 0) - (parseInt(a.rate) || 0))
      .slice(0, 15);
  }, [sessions]);

  /* ── 3. Avg time between stages ── */

  const timing = useMemo(() => {
    const byPair: Record<string, number[]> = {};
    for (const s of sessions) {
      for (const [before, after] of FUNNEL_PAIRS) {
        const b = s.events.find((e) => e.event_type === before);
        const a = s.events.find((e) => e.event_type === after);
        if (b && a && b.created_at && a.created_at) {
          const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          if (diff >= 0) {
            const key = `${before} → ${after}`;
            if (!byPair[key]) byPair[key] = [];
            byPair[key]!.push(diff);
          }
        }
      }
    }
    return Object.entries(byPair)
      .map(([pair, times]) => ({
        pair,
        avg: Math.round(times.reduce((s, t) => s + t, 0) / times.length),
        min: Math.min(...times),
        max: Math.max(...times),
        samples: times.length,
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [sessions]);

  /* ── 4. Most common event preceding trade ── */

  const precedingTrade = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      const types = s.events.map((e) => e.event_type);
      const idx = types.indexOf('trade_requested');
      if (idx > 0) {
        const prev = types[idx - 1]!;
        counts[prev] = (counts[prev] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8);
  }, [sessions]);

  const precedingRegister = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      const types = s.events.map((e) => e.event_type);
      const idx = types.indexOf('auth_registered');
      if (idx > 0) {
        const prev = types[idx - 1]!;
        counts[prev] = (counts[prev] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8);
  }, [sessions]);

  const precedingAbandon = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      const types = s.events.map((e) => e.event_type);
      const idx = types.indexOf('game_abandoned');
      if (idx > 0) {
        const prev = types[idx - 1]!;
        counts[prev] = (counts[prev] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8);
  }, [sessions]);

  /* ── Render ── */

  if (loading) return (
    <div>
      <DashboardHeader title="Journey Intelligence" subtitle="Aggregate journey analytics — paths, timing, drop-offs" />
      <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Analyzing session journeys…</p></Card>
    </div>
  );

  if (error) return (
    <div>
      <DashboardHeader title="Journey Intelligence" />
      <Card><p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p></Card>
    </div>
  );

  return (
    <div>
      <DashboardHeader
        title="Journey Intelligence"
        subtitle={`Analyzing ${sessions.length} sessions — common paths, drop-off patterns, timing between stages, and event precedents`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Most common paths */}
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Most Common Paths</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {commonPaths.map(([path, count], i) => (
              <div key={path} style={{
                padding: '0.5rem 0.75rem', borderRadius: '6px',
                background: i === 0 ? '#0d1f0d' : '#12121a',
                border: `1px solid ${i === 0 ? '#1e3a1e' : '#1e1e2e'}`,
              }}>
                <div style={{ fontSize: '0.7rem', color: '#888', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '0.2rem' }}>
                  {path}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#f0f0f0' }}>
                  {count} session{count !== 1 ? 's' : ''}
                  <span style={{ color: '#666', marginLeft: '0.5rem' }}>({pct(count, sessions.length)} of total)</span>
                </div>
              </div>
            ))}
            {commonPaths.length === 0 && <p style={{ color: '#888', fontSize: '0.8rem' }}>No path data yet.</p>}
          </div>
        </Card>

        {/* Drop-off points */}
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Drop-off Points</h2>
          <p style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            Stages where users most frequently leave (sessions with ≥5 entries)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {dropOffs.map((d) => (
              <div key={d.event} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '80px', fontSize: '0.7rem', color: '#aaa', flexShrink: 0 }}>{d.label}</span>
                <div style={{ flex: 1, height: '14px', background: '#1e1e2e', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(parseInt(d.rate) || 0, 100)}%`, height: '100%',
                    background: (parseInt(d.rate) || 0) > 30 ? '#ef4444' : (parseInt(d.rate) || 0) > 10 ? '#f59e0b' : '#22c55e',
                    borderRadius: '3px',
                  }} />
                </div>
                <span style={{ width: '40px', fontSize: '0.7rem', color: '#f0f0f0', fontFamily: 'monospace', textAlign: 'right' }}>
                  {d.rate}
                </span>
              </div>
            ))}
            {dropOffs.length === 0 && <p style={{ color: '#888', fontSize: '0.8rem' }}>No drop-off data yet.</p>}
          </div>
        </Card>
      </div>

      {/* Timing between stages */}
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Average Time Between Stages
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Transition</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Samples</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#6366f1', borderBottom: '1px solid #333', fontWeight: 500 }}>Average</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Min</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Max</th>
              </tr>
            </thead>
            <tbody>
              {timing.map((t) => (
                <tr key={t.pair}>
                  <td style={{ padding: '0.4rem 0.6rem', color: '#f0f0f0', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {t.pair}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#888', borderBottom: '1px solid #1e1e2e' }}>{t.samples}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#6366f1', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace', fontWeight: 600 }}>
                    {msToStr(t.avg)}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#888', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace' }}>
                    {msToStr(t.min)}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#888', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace' }}>
                    {msToStr(t.max)}
                  </td>
                </tr>
              ))}
              {timing.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>No timing data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Preceding events */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <h3 style={{ color: '#ec4899', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Before Trade Request</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {precedingTrade.map(([ev, count]) => (
              <div key={ev} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid #1e1e2e' }}>
                <span style={{ color: '#aaa' }}>{STAGE_LABELS[ev] ?? ev}</span>
                <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>{count} ({pct(count, precedingTrade.reduce((s, [, c]) => s + c, 0))})</span>
              </div>
            ))}
            {precedingTrade.length === 0 && <p style={{ color: '#888', fontSize: '0.75rem' }}>No trade events yet.</p>}
          </div>
        </Card>

        <Card>
          <h3 style={{ color: '#f97316', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Before Registration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {precedingRegister.map(([ev, count]) => (
              <div key={ev} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid #1e1e2e' }}>
                <span style={{ color: '#aaa' }}>{STAGE_LABELS[ev] ?? ev}</span>
                <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>{count} ({pct(count, precedingRegister.reduce((s, [, c]) => s + c, 0))})</span>
              </div>
            ))}
            {precedingRegister.length === 0 && <p style={{ color: '#888', fontSize: '0.75rem' }}>No registration events yet.</p>}
          </div>
        </Card>

        <Card>
          <h3 style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Before Abandonment</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {precedingAbandon.map(([ev, count]) => (
              <div key={ev} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid #1e1e2e' }}>
                <span style={{ color: '#aaa' }}>{STAGE_LABELS[ev] ?? ev}</span>
                <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>{count} ({pct(count, precedingAbandon.reduce((s, [, c]) => s + c, 0))})</span>
              </div>
            ))}
            {precedingAbandon.length === 0 && <p style={{ color: '#888', fontSize: '0.75rem' }}>No abandon events yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
