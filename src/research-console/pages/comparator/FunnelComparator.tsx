import { useState, useEffect, useMemo } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';

/* ─── Constants ─── */

const FUNNEL_STEPS = ['qr_scanned', 'landing_loaded', 'consent_granted', 'calibration_completed', 'game_started', 'game_completed', 'results_viewed', 'auth_registered', 'phone_service_opened', 'trade_requested', 'whatsapp_clicked'] as const;

const FUNNEL_LABELS: Record<string, string> = {
  qr_scanned: 'QR Scan', landing_loaded: 'Landing', consent_granted: 'Consent',
  calibration_completed: 'Calibration', game_started: 'Game', game_completed: 'Complete',
  results_viewed: 'Results', auth_registered: 'Register', phone_service_opened: 'Phone',
  trade_requested: 'Trade', whatsapp_clicked: 'WhatsApp',
};

const COMPARE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#a855f7'];

type DimKey = 'campaign' | 'os' | 'browser' | 'platform' | 'deviceType' | 'hour' | 'day';

const DIM_OPTIONS: { key: DimKey; label: string }[] = [
  { key: 'campaign', label: 'Campaign' },
  { key: 'os', label: 'OS' },
  { key: 'browser', label: 'Browser' },
  { key: 'platform', label: 'Platform' },
  { key: 'deviceType', label: 'Device Type' },
  { key: 'hour', label: 'Hour' },
  { key: 'day', label: 'Day' },
];

/* ─── Helpers ─── */

function parseOS(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}
function parseBrowser(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/edg/i.test(ua)) return 'Edge';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}
function parsePlatform(ua?: string): string {
  if (!ua) return 'Unknown';
  return /mobile|tablet|android|iphone|ipad/i.test(ua) ? 'Mobile' : 'Desktop';
}
function getDeviceType(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  if (/mobile|iphone|android.*mobile/i.test(ua)) return 'Phone';
  return 'Desktop';
}
function dimVal(ev: AnalyticsEvent, dim: DimKey, names?: Record<string, string>): string {
  switch (dim) {
    case 'campaign': return ev.campaign_id ? (names?.[ev.campaign_id] ?? ev.campaign_id.slice(0, 8)) : 'No Campaign';
    case 'os': return parseOS(ev.user_agent);
    case 'browser': return parseBrowser(ev.user_agent);
    case 'platform': return parsePlatform(ev.user_agent);
    case 'deviceType': return getDeviceType(ev.user_agent);
    case 'hour': return ev.created_at ? String(new Date(ev.created_at).getHours()).padStart(2, '0') : '?';
    case 'day': return ev.created_at ? new Date(ev.created_at).toLocaleDateString('en-US', { weekday: 'long' }) : '?';
  }
}
function pct(a: number, b: number): string {
  if (b === 0) return '—';
  return ((a / b) * 100).toFixed(0) + '%';
}
function delta(a: number, b: number): string {
  if (b === 0) return '—';
  const d = ((a - b) / b) * 100;
  return (d > 0 ? '+' : '') + d.toFixed(1) + '%';
}

/* ─── Component ─── */

export function FunnelComparator() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [dimension, setDimension] = useState<DimKey>('os');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const ds = getDataService();
        const [funnelEvents, campaignsData] = await Promise.all([
          ds.getFunnelEvents(),
          ds.getCampaigns({ limit: 200 }),
        ]);
        if (cancelled) return;
        setEvents(funnelEvents);
        const names: Record<string, string> = {};
        for (const c of campaignsData.data) if (c.id) names[c.id] = c.name;
        setCampaignNames(names);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ─── Available segment values ─── */

  const segmentValues = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) set.add(dimVal(ev, dimension, campaignNames));
    const sorted = Array.from(set).sort();
    // For hour, sort numerically
    if (dimension === 'hour') sorted.sort((a, b) => parseInt(a) - parseInt(b));
    return sorted;
  }, [events, dimension, campaignNames]);

  /* ─── Auto-select top segments ─── */

  useEffect(() => {
    const top = segmentValues
      .map((v) => ({
        v,
        count: events.filter((e) => dimVal(e, dimension, campaignNames) === v && e.event_type === 'qr_scanned').length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((s) => s.v);
    setSelected(top);
  }, [segmentValues, dimension]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Funnels for selected segments ─── */

  const funnels = useMemo(() => {
    return selected.map((seg) => {
      const segEvents = events.filter((e) => dimVal(e, dimension, campaignNames) === seg);
      const counts: Record<string, number> = {};
      for (const ev of segEvents) {
        const et = ev.event_type;
        if (FUNNEL_STEPS.includes(et as typeof FUNNEL_STEPS[number])) {
          counts[et] = (counts[et] ?? 0) + 1;
        }
      }
      const max = counts.qr_scanned ?? 1;
      return { segment: seg, counts, max, total: segEvents.length };
    });
  }, [selected, events, dimension, campaignNames]);

  /* ─── Toggle selection ─── */

  function toggleSegment(v: string) {
    setSelected((prev) => prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v].slice(0, 4));
  }

  /* ─── Render ─── */

  if (loading) return (
    <div>
      <DashboardHeader title="Funnel Comparator" subtitle="Compare funnels side by side across segments" />
      <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading…</p></Card>
    </div>
  );

  if (error) return (
    <div>
      <DashboardHeader title="Funnel Comparator" />
      <Card><p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p></Card>
    </div>
  );

  return (
    <div>
      <DashboardHeader
        title="Funnel Comparator"
        subtitle="Select a dimension and compare conversion funnels side by side"
      />

      {/* Dimension and segment selector */}
      <Card style={{ marginBottom: '1rem' }} padding="0.75rem">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <span style={{ color: '#888', fontSize: '0.8rem' }}>Dimension:</span>
          {DIM_OPTIONS.map((d) => (
            <button key={d.key} onClick={() => setDimension(d.key)} style={{
              padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none',
              background: dimension === d.key ? '#6366f1' : 'transparent',
              color: dimension === d.key ? '#fff' : '#888',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: dimension === d.key ? 600 : 400,
            }}>{d.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {segmentValues.slice(0, 30).map((v) => {
            const count = events.filter((e) => dimVal(e, dimension, campaignNames) === v && e.event_type === 'qr_scanned').length;
            const isOn = selected.includes(v);
            return (
              <button key={v} onClick={() => toggleSegment(v)} style={{
                padding: '0.3rem 0.6rem', borderRadius: '4px', border: 'none',
                background: isOn ? '#6366f1' : '#12121a',
                color: isOn ? '#fff' : '#888',
                cursor: 'pointer', fontSize: '0.75rem',
                outline: isOn ? 'none' : '1px solid #1e1e2e',
              }}>
                {v} ({count})
              </button>
            );
          })}
        </div>
      </Card>

      {/* Side-by-side funnels */}
      {funnels.length > 0 && (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(funnels.length, 4)}, 1fr)`, gap: '1rem' }}>
            {funnels.map((f, fi) => {
              const color = COMPARE_COLORS[fi % COMPARE_COLORS.length]!;
              const baseline = funnels[0]!.counts;
              return (
                <div key={f.segment}>
                  <h3 style={{ color, fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', textAlign: 'center' }}>
                    {f.segment}
                  </h3>
                  {FUNNEL_STEPS.map((step, si) => {
                    const count = f.counts[step] ?? 0;
                    const prevCount = si > 0 ? (f.counts[FUNNEL_STEPS[si - 1]!] ?? 0) : count;
                    const stepPct = prevCount > 0 ? pct(count, prevCount) : '—';
                    const baseCount = baseline[step] ?? 1;
                    const d = baseCount > 0 ? delta(count, baseCount) : null;
                    const barPct = f.max > 0 ? (count / f.max) * 100 : 0;
                    return (
                      <div key={step} style={{ marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '2px' }}>
                          <span style={{ color: '#aaa' }}>{FUNNEL_LABELS[step] ?? step}</span>
                          <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>
                            {count.toLocaleString()}
                            <span style={{ color: '#666', marginLeft: '0.25rem' }}>({stepPct})</span>
                          </span>
                        </div>
                        <div style={{ height: '6px', background: '#1e1e2e', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.max(barPct, 1)}%`, height: '100%',
                            background: color, borderRadius: '3px',
                            opacity: 0.4 + (count / Math.max(f.max, 1)) * 0.6,
                          }} />
                        </div>
                        {fi > 0 && d && (
                          <div style={{ fontSize: '0.6rem', color: d.startsWith('+') ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
                            vs {funnels[0]!.segment}: {d}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Summary: which segment wins at each step */}
      {funnels.length >= 2 && (
        <Card style={{ marginTop: '1rem' }}>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Conversion Leaderboard</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Step</th>
                  {funnels.map((f, fi) => (
                    <th key={f.segment} style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: COMPARE_COLORS[fi % COMPARE_COLORS.length]!, borderBottom: '1px solid #333', fontWeight: 500 }}>
                      {f.segment}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#f59e0b', borderBottom: '1px solid #333', fontWeight: 500 }}>Best</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_STEPS.filter((s) => s !== 'qr_scanned').map((step) => {
                  const vals = funnels.map((f, i) => {
                    const prev = funnels[i]!.counts[FUNNEL_STEPS[FUNNEL_STEPS.indexOf(step) - 1]!] ?? 0;
                    const cur = f.counts[step] ?? 0;
                    return { segment: f.segment, rate: prev > 0 ? cur / prev : 0, pct: pct(cur, prev), cur };
                  });
                  const best = vals.reduce((a, b) => a.rate > b.rate ? a : b);
                  return (
                    <tr key={step}>
                      <td style={{ padding: '0.4rem 0.6rem', color: '#f0f0f0', borderBottom: '1px solid #1e1e2e' }}>
                        {FUNNEL_LABELS[step] ?? step}
                      </td>
                      {vals.map((v, vi) => (
                        <td key={vi} style={{
                          padding: '0.4rem 0.6rem', textAlign: 'center',
                          color: v.segment === best.segment ? '#22c55e' : '#aaa',
                          borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace', fontWeight: v.segment === best.segment ? 600 : 400,
                        }}>
                          {v.pct}
                        </td>
                      ))}
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#f59e0b', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace', fontWeight: 600 }}>
                        {best.segment}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {funnels.length === 0 && (
        <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Select segments to compare.</p></Card>
      )}
    </div>
  );
}
