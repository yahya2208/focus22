import { useEffect, useState } from 'react';
import { getLiveDiagnostics, type LiveDiagnostics } from '../../../core/supabase/live-diagnostics';
import { getActiveLiveSessions } from '../../../core/supabase/live-sessions';
import { DashboardHeader } from '../../layout/ResearchLayout';

function fmt(ms: number | null): string {
  if (ms === null) return '-';
  const diff = performance.now() - ms;
  if (diff < 1000) return `${diff.toFixed(0)}ms ago`;
  return `${(diff / 1000).toFixed(1)}s ago`;
}

function Row({ label, ok, value }: { readonly label: string; readonly ok: boolean; readonly value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.82rem' }}>
      <span style={{ color: '#999' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color: ok ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{ok ? '●' : '○'}</span>
        <span style={{ color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </span>
    </div>
  );
}

export function LiveDiagnosticsDashboard() {
  const [diag, setDiag] = useState<LiveDiagnostics>(() => getLiveDiagnostics(getActiveLiveSessions().length));

  useEffect(() => {
    const refresh = () => setDiag(getLiveDiagnostics(getActiveLiveSessions().length));
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, []);

  const contractOk = diag.runningCount === 0 || (diag.lastPatchAt !== null && diag.lastRenderAt !== null && diag.lastRenderAt >= diag.lastPatchAt);

  return (
    <>
      <DashboardHeader title="Runtime Diagnostics" subtitle="Live contract observability (FOCUS v2.0 RC1)" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Pipeline Status
          </div>
          <Row label="Realtime Connected" ok={diag.realtimeConnected} value={diag.realtimeConnected ? 'yes' : 'no'} />
          <Row label="Poll Active" ok={diag.pollActive} value={diag.pollActive ? 'yes' : 'no'} />
          <Row label="Heartbeat Active" ok={diag.heartbeatActive} value={diag.heartbeatActive ? 'yes' : 'no'} />
          <Row label="Contract ≤10s" ok={contractOk} value={contractOk ? 'satisfied' : 'check'} />
        </div>

        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Last Activity
          </div>
          <Row label="Last Poll" ok={diag.lastPollAt !== null} value={fmt(diag.lastPollAt)} />
          <Row label="Last Realtime" ok={diag.lastRealtimeAt !== null} value={fmt(diag.lastRealtimeAt)} />
          <Row label="Last PATCH" ok={diag.lastPatchAt !== null} value={fmt(diag.lastPatchAt)} />
          <Row label="Last Render" ok={diag.lastRenderAt !== null} value={fmt(diag.lastRenderAt)} />
          <Row label="Last Heartbeat" ok={diag.lastHeartbeatAt !== null} value={fmt(diag.lastHeartbeatAt)} />
          <Row label="Last Poll Duration" ok={diag.lastPollDurationMs !== null} value={diag.lastPollDurationMs !== null ? `${diag.lastPollDurationMs.toFixed(1)}ms` : '-'} />
        </div>

        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Counters
          </div>
          <Row label="Running Sessions" ok={true} value={String(diag.runningCount)} />
          <Row label="Completed Sessions" ok={true} value={String(diag.completedCount)} />
          <Row label="Listeners (Queue)" ok={diag.listenerCount > 0} value={String(diag.listenerCount)} />
        </div>
      </div>

      <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.72rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          ● Structured Log (request_id · service · action · duration_ms · status)
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['time', 'request_id', 'service', 'action', 'duration_ms', 'status', 'error_code'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.68rem', color: '#666', textTransform: 'uppercase', borderBottom: '1px solid #1e1e2e', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diag.events.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>No structured events yet</td></tr>
              ) : (
                [...diag.events].reverse().map((e) => (
                  <tr key={e.requestId}>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#555', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.at.toFixed(0)}ms</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#888', fontFamily: 'monospace' }}>{e.requestId}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#ccc' }}>{e.service}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#ccc' }}>{e.action}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#888', fontVariantNumeric: 'tabular-nums' }}>{e.durationMs !== undefined ? e.durationMs.toFixed(1) : '-'}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: e.status === 'ok' ? '#22c55e' : '#ef4444' }}>{e.status}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#ef4444', fontFamily: 'monospace' }}>{e.errorCode ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
