import { useState, useEffect, useMemo } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';
import { useThemeStyles } from '../../../hooks/useThemeStyles';

/* ─── Helpers ─── */

function pct(a: number, b: number): string {
  if (b === 0) return '—';
  return ((a / b) * 100).toFixed(0) + '%';
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function getDeviceLabel(ev: AnalyticsEvent): string {
  const d = ev.event_data as Record<string, unknown> | undefined;
  if (!d) return 'Unknown';
  return (d.device_type as string) ?? (d.deviceType as string) ?? (d.brand as string) ?? (d.model as string) ?? 'Unknown';
}

function getBrand(ev: AnalyticsEvent): string {
  const d = ev.event_data as Record<string, unknown> | undefined;
  if (!d) return '?';
  return (d.brand as string) ?? (d.device_brand as string) ?? (d.device_type as string) ?? '?';
}

function getModel(ev: AnalyticsEvent): string {
  const d = ev.event_data as Record<string, unknown> | undefined;
  if (!d) return '?';
  return (d.model as string) ?? (d.device_model as string) ?? (d.device_type as string) ?? '?';
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── StageCard ─── */

function StageCard({ label, count, pct: pctVal, color, sub }: { label: string; count: number; pct: string; color: string; sub?: string }) {
  return (
    <div style={{
      background: '#12121a', borderRadius: '8px', padding: '0.75rem', textAlign: 'center',
      border: `1px solid ${color}33`, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: color }} />
      <p style={{ color: '#888', fontSize: '0.7rem', marginBottom: '0.2rem' }}>{label}</p>
      <p style={{ color, fontSize: '1.3rem', fontWeight: 'bold' }}>{fmtNum(count)}</p>
      <p style={{ color: '#666', fontSize: '0.75rem' }}>{pctVal}</p>
      {sub && <p style={{ color: '#555', fontSize: '0.65rem', marginTop: '0.2rem' }}>{sub}</p>}
    </div>
  );
}

/* ─── Main Component ─── */

export function PhoneExchangeEngine() {
  const styles = useThemeStyles();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const ds = getDataService();
        const data = await ds.getPhoneExchangeEvents();
        if (!cancelled) setEvents(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ─── Pipeline counts ─── */

  const pipeline = useMemo(() => {
    const phoneOpen = events.filter((e) => e.event_type === 'phone_service_opened').length;
    const deviceSelected = events.filter((e) => e.event_type === 'device_selected').length;
    const tradeViewed = events.filter((e) => e.event_type === 'trade_offer_viewed').length;
    const tradeRequested = events.filter((e) => e.event_type === 'trade_requested').length;
    const whatsapp = events.filter((e) => e.event_type === 'whatsapp_clicked').length;
    return { phoneOpen, deviceSelected, tradeViewed, tradeRequested, whatsapp };
  }, [events]);

  const flowBreakdown = useMemo(() => {
    const buy = events.filter((e) => e.event_type === 'buy_flow_started').length;
    const sell = events.filter((e) => e.event_type === 'sell_flow_started').length;
    const exchange = events.filter((e) => e.event_type === 'exchange_flow_started').length;
    const total = buy + sell + exchange;
    return { buy, sell, exchange, total };
  }, [events]);

  /* ─── Device popularity ─── */

  const devicePopularity = useMemo(() => {
    const counts: Record<string, { selected: number; trade: number; whatsapp: number }> = {};
    for (const ev of events) {
      const label = getDeviceLabel(ev);
      if (label === 'Unknown') continue;
      if (!counts[label]) counts[label] = { selected: 0, trade: 0, whatsapp: 0 };
      if (ev.event_type === 'device_selected') counts[label]!.selected++;
      if (ev.event_type === 'trade_requested') counts[label]!.trade++;
      if (ev.event_type === 'whatsapp_clicked') counts[label]!.whatsapp++;
    }
    return Object.entries(counts)
      .map(([device, c]) => ({ device, ...c }))
      .sort((a, b) => b.selected - a.selected)
      .slice(0, 20);
  }, [events]);

  /* ─── Brand popularity ─── */

  const brandPop = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.event_type !== 'device_selected') continue;
      const b = getBrand(ev);
      if (b === '?') continue;
      counts[b] = (counts[b] ?? 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 15);
  }, [events]);

  const modelPop = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.event_type !== 'device_selected') continue;
      const m = getModel(ev);
      if (m === '?') continue;
      counts[m] = (counts[m] ?? 0) + 1;
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 15);
  }, [events]);

  /* ─── Trade pairs (what device → what flow) ─── */

  const tradePairs = useMemo(() => {
    const pairs: Record<string, { device: string; buy: number; sell: number; exchange: number }> = {};
    for (const ev of events) {
      const d = ev.event_data as Record<string, unknown> | undefined;
      if (!d) continue;
      const device = (d.device_type as string) ?? (d.brand as string) ?? (d.model as string) ?? '?';
      if (device === '?') continue;
      if (!pairs[device]) pairs[device] = { device, buy: 0, sell: 0, exchange: 0 };
      if (ev.event_type === 'buy_flow_started') pairs[device]!.buy++;
      if (ev.event_type === 'sell_flow_started') pairs[device]!.sell++;
      if (ev.event_type === 'exchange_flow_started') pairs[device]!.exchange++;
    }
    return Object.values(pairs).filter((p) => p.buy + p.sell + p.exchange > 0).sort((a, b) => (b.buy + b.sell + b.exchange) - (a.buy + a.sell + a.exchange)).slice(0, 15);
  }, [events]);

  /* ─── Daily trend ─── */

  const dailyTrend = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const ev of events) {
      if (ev.event_type !== 'trade_requested' || !ev.created_at) continue;
      const d = fmtDate(ev.created_at);
      byDate[d] = (byDate[d] ?? 0) + 1;
    }
    return Object.entries(byDate).sort(([a], [b]) => {
      const da = new Date(a);
      const db = new Date(b);
      return da.getTime() - db.getTime();
    }).slice(-14);
  }, [events]);

  /* ─── WhatsApp conversion ─── */

  const whatsappBySource = useMemo(() => {
    const sources: Record<string, number> = {};
    for (const ev of events) {
      if (ev.event_type !== 'whatsapp_clicked') continue;
      const d = ev.event_data as Record<string, unknown> | undefined;
      const source = (d?.source as string) ?? (d?.shareType as string) ?? 'unknown';
      sources[source] = (sources[source] ?? 0) + 1;
    }
    return Object.entries(sources).sort(([, a], [, b]) => b - a);
  }, [events]);

  /* ─── User journey stages (full pipeline) ─── */

  const stages = useMemo(() => [
    { label: 'Phone Service Opened', count: pipeline.phoneOpen, pct: '100%', color: '#6366f1' },
    { label: 'Device Selected', count: pipeline.deviceSelected, pct: pct(pipeline.deviceSelected, pipeline.phoneOpen), color: '#3b82f6' },
    { label: 'Trade Offer Viewed', count: pipeline.tradeViewed, pct: pct(pipeline.tradeViewed, pipeline.deviceSelected), color: '#f59e0b' },
    { label: 'Trade Requested', count: pipeline.tradeRequested, pct: pct(pipeline.tradeRequested, pipeline.tradeViewed), color: '#ec4899' },
    { label: 'WhatsApp Clicked', count: pipeline.whatsapp, pct: pct(pipeline.whatsapp, pipeline.tradeRequested), color: '#22c55e' },
  ], [pipeline]);

  /* ─── Render ─── */

  if (loading) return (
    <div>
      <DashboardHeader title="Phone Exchange Engine" subtitle="Trade pipeline, device popularity, and WhatsApp conversion analytics" />
      <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading exchange data…</p></Card>
    </div>
  );

  if (error) return (
    <div>
      <DashboardHeader title="Phone Exchange Engine" />
      <Card><p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p></Card>
    </div>
  );

  return (
    <div>
      <DashboardHeader
        title="Phone Exchange Engine"
        subtitle={`${fmtNum(events.length)} exchange events — trade pipeline, device popularity, and WhatsApp analytics`}
      />

      {/* Pipeline stages */}
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Trade Pipeline
          <span style={{ color: '#666', fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem' }}>
            Service Open → Device Select → Trade View → Trade Request → WhatsApp
          </span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {stages.map((s) => (
            <StageCard key={s.label} label={s.label} count={s.count} pct={s.pct} color={s.color}
              sub={s.label === 'WhatsApp Clicked' ? `${pct(s.count, pipeline.tradeRequested)} of trade requests` : undefined}
            />
          ))}
        </div>
      </Card>

      {/* Flow breakdown */}
      <div style={{ ...styles.grid2, gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Flow Type Breakdown</h2>
          {flowBreakdown.total > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <StageCard label="Buy" count={flowBreakdown.buy} pct={pct(flowBreakdown.buy, flowBreakdown.total)} color="#22c55e" />
              <StageCard label="Sell" count={flowBreakdown.sell} pct={pct(flowBreakdown.sell, flowBreakdown.total)} color="#f59e0b" />
              <StageCard label="Exchange" count={flowBreakdown.exchange} pct={pct(flowBreakdown.exchange, flowBreakdown.total)} color="#6366f1" />
            </div>
          ) : (
            <p style={{ color: '#888', fontSize: '0.8rem' }}>No flow data yet.</p>
          )}
        </Card>

        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>WhatsApp Click Sources</h2>
          {whatsappBySource.length > 0 ? (
            <div style={{ ...styles.flexCol, gap: '0.3rem' }}>
              {whatsappBySource.map(([source, count]) => (
                <div key={source} style={{ ...styles.flexBetween, padding: '0.3rem 0', borderBottom: '1px solid #1e1e2e' }}>
                  <span style={{ color: '#aaa', fontSize: '0.8rem' }}>{source}</span>
                  <span style={{ color: '#f0f0f0', fontFamily: 'monospace', fontSize: '0.8rem' }}>{fmtNum(count)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888', fontSize: '0.8rem' }}>No WhatsApp clicks yet.</p>
          )}
        </Card>
      </div>

      {/* Device popularity */}
      <div style={{ ...styles.grid2, gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Top Devices (Selected)</h2>
          <div style={{ ...styles.flexCol, gap: '0.3rem' }}>
            {devicePopularity.map((d) => {
              const max = devicePopularity[0]?.selected ?? 1;
              return (
                <div key={d.device}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '2px' }}>
                    <span style={{ color: '#aaa' }}>{d.device}</span>
                    <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>{d.selected} · Trade: {d.trade} · WA: {d.whatsapp}</span>
                  </div>
                  <div style={{ height: '6px', background: '#1e1e2e', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${(d.selected / max) * 100}%`, height: '100%', background: '#6366f1', borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
            {devicePopularity.length === 0 && <p style={{ color: '#888', fontSize: '0.8rem' }}>No device data yet.</p>}
          </div>
        </Card>

        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Brand & Model Rankings</h2>
          <div style={{ ...styles.grid2, gap: '0.75rem' }}>
            <div>
              <p style={{ color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Top Brands</p>
              {brandPop.map(([b, c], i) => (
                <div key={b} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', padding: '0.15rem 0' }}>
                  <span style={{ color: i < 3 ? '#f0f0f0' : '#888' }}>{b}</span>
                  <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>{c}</span>
                </div>
              ))}
              {brandPop.length === 0 && <p style={{ color: '#888', fontSize: '0.7rem' }}>No brand data</p>}
            </div>
            <div>
              <p style={{ color: '#888', fontSize: '0.7rem', marginBottom: '0.3rem' }}>Top Models</p>
              {modelPop.map(([m, c], i) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', padding: '0.15rem 0' }}>
                  <span style={{ color: i < 3 ? '#f0f0f0' : '#888' }}>{m}</span>
                  <span style={{ color: '#f0f0f0', fontFamily: 'monospace' }}>{c}</span>
                </div>
              ))}
              {modelPop.length === 0 && <p style={{ color: '#888', fontSize: '0.7rem' }}>No model data</p>}
            </div>
          </div>
        </Card>
      </div>

      {/* Trade pairs matrix */}
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Device × Flow Matrix
          <span style={{ color: '#666', fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem' }}>
            Which devices are bought, sold, or exchanged most
          </span>
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Device</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#22c55e', borderBottom: '1px solid #333', fontWeight: 500 }}>Buy</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#f59e0b', borderBottom: '1px solid #333', fontWeight: 500 }}>Sell</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#6366f1', borderBottom: '1px solid #333', fontWeight: 500 }}>Exchange</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {tradePairs.map((p) => (
                <tr key={p.device}>
                  <td style={{ padding: '0.4rem 0.6rem', color: '#f0f0f0', borderBottom: '1px solid #1e1e2e' }}>{p.device}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: p.buy > 0 ? '#22c55e' : '#555', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace' }}>{p.buy || '—'}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: p.sell > 0 ? '#f59e0b' : '#555', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace' }}>{p.sell || '—'}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: p.exchange > 0 ? '#6366f1' : '#555', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace' }}>{p.exchange || '—'}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#f0f0f0', borderBottom: '1px solid #1e1e2e', fontFamily: 'monospace', fontWeight: 600 }}>{p.buy + p.sell + p.exchange}</td>
                </tr>
              ))}
              {tradePairs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>No trade pair data yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent trade trend */}
      <Card>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Trade Requests (Last 14 Days)
        </h2>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', minHeight: '60px' }}>
          {dailyTrend.length > 0 ? (
            dailyTrend.map(([date, count]) => {
              const max = Math.max(...dailyTrend.map(([, c]) => c), 1);
              const h = (count / max) * 50;
              return (
                <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '100%', height: `${Math.max(h, 4)}px`, background: '#ec4899',
                    borderRadius: '3px 3px 0 0', minWidth: '20px',
                    opacity: 0.5 + (count / max) * 0.5,
                  }} />
                  <span style={{ color: '#666', fontSize: '0.55rem', marginTop: '2px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                    {date}
                  </span>
                </div>
              );
            })
          ) : (
            <p style={{ color: '#888', fontSize: '0.8rem' }}>No trade requests yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
