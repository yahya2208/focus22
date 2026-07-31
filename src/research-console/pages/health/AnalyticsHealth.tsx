import { useState, useEffect, useMemo } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';

/* ─── Event type definitions ─── */

const SCREEN_EVENTS: Record<string, string[]> = {
  Landing: ['app_opened', 'landing_loaded', 'campaign_detected'],
  QR: ['qr_scanned'],
  Consent: ['consent_granted', 'consent_withdrawn'],
  Calibration: ['calibration_started', 'calibration_completed'],
  Game: ['game_started', 'game_completed', 'game_abandoned', 'round_started', 'lamp_appeared', 'lamp_clicked', 'miss_click'],
  Results: ['results_viewed', 'share_clicked'],
  Register: ['register_cta_clicked', 'auth_registered', 'registration_completed', 'guest_converted'],
  'Phone Services': ['phone_service_opened', 'buy_flow_started', 'sell_flow_started', 'exchange_flow_started', 'trade_requested', 'whatsapp_clicked'],
  Campaign: ['campaign_opened', 'qr_generated'],
  Journey: ['game_intro_shown'],
};

const SESSION_CHAIN = [
  'calibration_started',
  'calibration_completed',
  'game_started',
  'game_completed',
] as const;

const FUNNEL_ORDER = ['qr_scanned', 'landing_loaded', 'consent_granted', 'calibration_completed', 'game_completed', 'results_viewed'] as const;

/* ─── Color helpers ─── */

function statusColor(ok: boolean): string {
  return ok ? '#22c55e' : '#ef4444';
}

/* ─── Section component ─── */

function Section({ title, children, color }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <Card style={{ marginBottom: '1rem' }}>
      <h2 style={{ color: color ?? '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/* ─── Subsection card ─── */

function MetricCard({ label, value, sub, ok }: { label: string; value: string | number; sub?: string; ok?: boolean }) {
  return (
    <div style={{ background: '#12121a', borderRadius: '8px', padding: '0.6rem 0.75rem', border: `1px solid ${ok !== undefined ? statusColor(ok) : '#1e1e2e'}` }}>
      <p style={{ color: '#888', fontSize: '0.7rem', marginBottom: '2px' }}>{label}</p>
      <p style={{ color: ok !== undefined ? statusColor(ok) : '#f0f0f0', fontSize: '1.1rem', fontWeight: 'bold' }}>{value}</p>
      {sub && <p style={{ color: '#666', fontSize: '0.7rem', marginTop: '2px' }}>{sub}</p>}
    </div>
  );
}

/* ─── Duplicate detection ─── */

function findDuplicates(events: AnalyticsEvent[]): { event_type: string; total: number; duplicates: number }[] {
  const groups: Record<string, { event_type: string; keys: Set<string> }> = {};
  for (const ev of events) {
    const et = ev.event_type;
    if (!groups[et]) groups[et] = { event_type: et, keys: new Set() };
    groups[et].keys.add(`${ev.session_id ?? ''}|${ev.created_at ?? ''}|${JSON.stringify(ev.event_data ?? {})}`);
  }
  return Object.values(groups).map((g) => {
    const total = events.filter((e) => e.event_type === g.event_type).length;
    return { event_type: g.event_type, total, duplicates: total - g.keys.size };
  });
}

/* ─── Timing validator ─── */

function checkTiming(events: AnalyticsEvent[]): { pair: string; ok: number; fail: number; samples: string[] }[] {
  const pairs: [string, string][] = [
    ['calibration_started', 'calibration_completed'],
    ['calibration_completed', 'game_started'],
    ['game_started', 'game_completed'],
  ];
  const bySession: Record<string, AnalyticsEvent[]> = {};
  for (const ev of events) {
    const sid = ev.session_id;
    if (!sid) continue;
    if (!bySession[sid]) bySession[sid] = [];
    bySession[sid].push(ev);
  }
  return pairs.map(([before, after]) => {
    let ok = 0; let fail = 0; const samples: string[] = [];
    for (const [, evs] of Object.entries(bySession)) {
      const b = evs.find((e) => e.event_type === before);
      const a = evs.find((e) => e.event_type === after);
      if (b && a) {
        const bT = new Date(b.created_at!).getTime();
        const aT = new Date(a.created_at!).getTime();
        if (aT >= bT) ok++;
        else { fail++; if (samples.length < 3) samples.push(`${evs[0]!.session_id!.slice(0, 8)}: ${before} ${bT} > ${after} ${aT}`); }
      }
    }
    return { pair: `${before} < ${after}`, ok, fail, samples };
  });
}

/* ─── Main component ─── */

export function AnalyticsHealth() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [orphans, setOrphans] = useState<{ no_session: number; no_device: number; no_session_or_device: number } | null>(null);
  const [volume, setVolume] = useState<{ average: number; max: number; min: number; suspicious: number } | null>(null);
  const [recentSessions, setRecentSessions] = useState<{ session_id: string; events: AnalyticsEvent[] }[]>([]);
  const [allEvents, setAllEvents] = useState<AnalyticsEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const ds = getDataService();
        const [countsRes, orphansRes, volumeRes, sequences] = await Promise.all([
          ds.getEventTypeCounts(),
          ds.getOrphanEventCounts(),
          ds.getEventVolumeStats(),
          ds.getRecentSessions(30),
        ]);
        if (cancelled) return;
        setEventCounts(countsRes);
        setOrphans(orphansRes);
        setVolume(volumeRes);
        setRecentSessions(sequences);
        const flat = sequences.flatMap((s) => s.events);
        setAllEvents(flat as AnalyticsEvent[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load health data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ── Computed metrics ── */

  const duplicates = useMemo(() => findDuplicates(allEvents), [allEvents]);
  const timing = useMemo(() => checkTiming(allEvents), [allEvents]);

  const coverage = useMemo(() => {
    return Object.entries(SCREEN_EVENTS).map(([screen, expected]) => {
      const received = expected.filter((et) => (eventCounts[et] ?? 0) > 0);
      const missing = expected.filter((et) => (eventCounts[et] ?? 0) === 0);
      const totalExpected = expected.length;
      const totalReceived = received.length;
      return { screen, expected: expected, received, missing, totalExpected, totalReceived, ok: missing.length === 0 };
    });
  }, [eventCounts]);

  const sessionIntegrity = useMemo(() => {
    return recentSessions.map((s) => {
      const eventTypes = s.events.map((e) => e.event_type);
      const chain = SESSION_CHAIN.map((step) => ({
        step,
        present: eventTypes.includes(step),
      }));
      const complete = chain.every((c) => c.present);
      return { ...s, chain, complete };
    });
  }, [recentSessions]);

  const funnelIntegrity = useMemo(() => {
    return FUNNEL_ORDER.map((et, i) => {
      const count = eventCounts[et] ?? 0;
      const prevCount = i === 0 ? count : (eventCounts[FUNNEL_ORDER[i - 1]!] ?? 0);
      const broken = i > 0 && count > prevCount;
      return { event: et, count, broken };
    });
  }, [eventCounts]);

  if (loading) {
    return (
      <div>
        <DashboardHeader title="Analytics Health" subtitle="Running integrity checks…" />
        <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading analytics data…</p></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <DashboardHeader title="Analytics Health" subtitle="Error loading data" />
        <Card><p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p></Card>
      </div>
    );
  }

  return (
    <div>
      <DashboardHeader title="Analytics Health" subtitle="Comprehensive data integrity audit for analytics_events" />

      {/* ── Section 1: Event Coverage ── */}
      <Section title="Event Coverage">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {coverage.map((c) => (
            <div key={c.screen} style={{
              background: '#12121a', borderRadius: '8px', padding: '0.75rem',
              border: `1px solid ${c.ok ? '#1e3a1e' : '#3a1e1e'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ color: '#f0f0f0', fontWeight: 600, fontSize: '0.85rem' }}>{c.screen}</span>
                <span style={{ color: c.ok ? '#22c55e' : '#ef4444', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  {c.totalReceived}/{c.totalExpected}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888' }}>
                <span>Expected: {c.expected.join(', ')}</span>
              </div>
              {c.missing.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                  Missing: {c.missing.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 2: Session Integrity ── */}
      <Section title="Session Integrity" color="#f59e0b">
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Checking session chain: calibration_started → calibration_completed → game_started → game_completed
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
          {sessionIntegrity.map((s) => {
            return (
              <div key={s.session_id} style={{
                padding: '0.5rem 0.75rem', borderRadius: '6px',
                background: s.complete ? '#0d1f0d' : '#1f0d0d',
                border: `1px solid ${s.complete ? '#1e3a1e' : '#3a1e1e'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {s.session_id.slice(0, 8)}…{s.session_id.slice(-4)}
                  </span>
                  <span style={{ color: s.complete ? '#22c55e' : '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
                    {s.complete ? 'COMPLETE' : 'INCOMPLETE'}
                  </span>
                </div>
                {!s.complete && (
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                    {s.chain.map((step) => (
                      <span key={step.step} style={{ color: step.present ? '#22c55e' : '#ef4444' }}>
                        {step.step.replace('_', ' ')} {step.present ? '✓' : '✗'}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.65rem', color: '#666', marginTop: '0.2rem' }}>
                  {s.events.length} events · {s.events[0] && new Date(s.events[0].created_at!).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Section 3: Duplicate Detector ── */}
      <Section title="Duplicate Detector">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
          {duplicates.filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, 20).map((d) => (
            <div key={d.event_type} style={{
              background: '#12121a', borderRadius: '6px', padding: '0.5rem 0.75rem',
              border: `1px solid ${d.duplicates > 0 ? '#3a1e1e' : '#1e1e2e'}`,
            }}>
              <p style={{ color: '#f0f0f0', fontSize: '0.8rem', fontWeight: 500 }}>{d.event_type}</p>
              <p style={{ color: '#888', fontSize: '0.75rem' }}>
                Total: <span style={{ color: '#f0f0f0' }}>{d.total}</span>
                {' · '}Duplicates: <span style={{ color: d.duplicates > 0 ? '#ef4444' : '#22c55e' }}>{d.duplicates}</span>
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 4: Orphan Events ── */}
      <Section title="Orphan Events">
        {orphans && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
            <MetricCard label="Missing session_id" value={orphans.no_session} ok={orphans.no_session === 0} />
            <MetricCard label="Missing device_id" value={orphans.no_device} ok={orphans.no_device === 0} />
            <MetricCard label="Missing session_id OR device_id" value={orphans.no_session_or_device} ok={orphans.no_session_or_device === 0} />
          </div>
        )}
      </Section>

      {/* ── Section 5: Timing Validator ── */}
      <Section title="Timing Validator">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
          {timing.map((t) => (
            <div key={t.pair} style={{
              background: '#12121a', borderRadius: '6px', padding: '0.75rem',
              border: `1px solid ${t.fail > 0 ? '#3a1e1e' : '#1e3a1e'}`,
            }}>
              <p style={{ color: '#f0f0f0', fontSize: '0.8rem', fontFamily: 'monospace', marginBottom: '0.3rem' }}>{t.pair}</p>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                <span>OK: <span style={{ color: '#22c55e' }}>{t.ok}</span></span>
                <span>FAIL: <span style={{ color: '#ef4444' }}>{t.fail}</span></span>
              </div>
              {t.fail > 0 && t.samples.length > 0 && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.65rem', color: '#ef4444', fontFamily: 'monospace' }}>
                  {t.samples.map((s, i) => <div key={i}>{s}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 6: Funnel Integrity ── */}
      <Section title="Funnel Integrity">
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Verifying monotonic sequence: QR ≥ Landing ≥ Consent ≥ Calibration ≥ Game ≥ Results
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {funnelIntegrity.map((fi, i) => (
            <div key={fi.event} style={{
              flex: '1', minWidth: '120px', padding: '0.75rem', borderRadius: '6px',
              background: fi.broken ? '#1f0d0d' : '#12121a',
              border: `1px solid ${fi.broken ? '#3a1e1e' : '#1e1e2e'}`,
            }}>
              <p style={{ color: '#888', fontSize: '0.7rem', marginBottom: '0.2rem' }}>{fi.event}</p>
              <p style={{ color: '#f0f0f0', fontSize: '1.2rem', fontWeight: 'bold' }}>{fi.count.toLocaleString()}</p>
              {i > 0 && (
                <p style={{ fontSize: '0.7rem', marginTop: '0.2rem', color: fi.broken ? '#ef4444' : '#22c55e' }}>
                  {fi.broken ? '❌ BROKEN' : '✓ OK'}
                </p>
              )}
              {fi.broken && (
                <p style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '0.2rem' }}>
                  {fi.count}{' > '}{funnelIntegrity[i - 1]?.count ?? 0}
                </p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 7: Event Volume ── */}
      <Section title="Event Volume (per session)">
        {volume && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
            <MetricCard label="Average per session" value={volume.average} />
            <MetricCard label="Maximum" value={volume.max} />
            <MetricCard label="Minimum" value={volume.min} ok={volume.min > 2} sub={volume.min <= 2 ? 'Suspiciously low' : undefined} />
            <MetricCard label="Suspicious sessions (≤5 events)" value={volume.suspicious} ok={volume.suspicious === 0} />
          </div>
        )}
      </Section>

      {/* ── Raw event type counts (footer) ── */}
      <Section title="Raw Event Type Counts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.3rem' }}>
          {Object.entries(eventCounts).sort(([, a], [, b]) => b - a).map(([et, count]) => (
            <div key={et} style={{
              padding: '0.3rem 0.5rem', borderRadius: '4px',
              background: '#12121a', fontSize: '0.75rem',
            }}>
              <span style={{ color: '#aaa' }}>{et}: </span>
              <span style={{ color: '#f0f0f0', fontWeight: 600 }}>{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
