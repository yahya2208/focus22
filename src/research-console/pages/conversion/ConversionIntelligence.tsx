import { useState, useEffect, useMemo } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';
import { useThemeStyles } from '../../../hooks/useThemeStyles';

/* ─── Constants ─── */

const FUNNEL_STEPS = ['qr_scanned', 'landing_loaded', 'consent_granted', 'calibration_completed', 'game_started', 'game_completed', 'results_viewed', 'auth_registered', 'phone_service_opened', 'trade_requested', 'whatsapp_clicked'] as const;

const FUNNEL_LABELS: Record<string, string> = {
  qr_scanned: 'QR Scan', landing_loaded: 'Landing', consent_granted: 'Consent',
  calibration_completed: 'Calibration', game_started: 'Game Started', game_completed: 'Game Completed',
  results_viewed: 'Results', auth_registered: 'Registered', phone_service_opened: 'Phone Services',
  trade_requested: 'Trade Request', whatsapp_clicked: 'WhatsApp',
};

const FUNNEL_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#8b5cf6', '#3b82f6', '#14b8a6', '#f97316', '#ec4899', '#ef4444', '#a855f7', '#06b6d4'];

type DimensionKey = 'campaign' | 'os' | 'browser' | 'platform' | 'hour' | 'day' | 'deviceType';

const DIMENSIONS: { key: DimensionKey; label: string }[] = [
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
  if (/cros/i.test(ua)) return 'ChromeOS';
  return 'Other';
}

function parseBrowser(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/edg/i.test(ua) && !/edge\/1\d/i.test(ua)) return 'Edge';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/opera|opr/i.test(ua)) return 'Opera';
  if (/samsung/i.test(ua)) return 'Samsung Internet';
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
  if (/android/i.test(ua)) return 'Android (unknown)';
  return 'Desktop';
}

function getDimensionValue(event: AnalyticsEvent, dim: DimensionKey, campaignNames?: Record<string, string>): string {
  switch (dim) {
    case 'campaign':
      return event.campaign_id ? (campaignNames?.[event.campaign_id] ?? event.campaign_id.slice(0, 8)) : 'No Campaign';
    case 'os':
      return parseOS(event.user_agent);
    case 'browser':
      return parseBrowser(event.user_agent);
    case 'platform':
      return parsePlatform(event.user_agent);
    case 'deviceType':
      return getDeviceType(event.user_agent);
    case 'hour':
      return event.created_at ? String(new Date(event.created_at).getHours()).padStart(2, '0') + ':00' : '?';
    case 'day':
      return event.created_at ? new Date(event.created_at).toLocaleDateString('en-US', { weekday: 'long' }) : '?';
    default:
      return 'Other';
  }
}

function pct(a: number, b: number): string {
  if (b === 0) return '—';
  return ((a / b) * 100).toFixed(0) + '%';
}

/* ─── Sub-components ─── */

function FunnelBar({ label, value, max, color, index }: { label: string; value: number; max: number; color: string; index: number }) {
  const styles = useThemeStyles();
  const p = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ ...styles.flexRow, marginBottom: '0.3rem' }}>
      <span style={{ width: '110px', fontSize: '0.75rem', color: '#aaa', textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '22px', background: '#1e1e2e', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(p, 2)}%`, height: '100%', background: color,
          borderRadius: '4px', transition: 'width 0.3s',
          opacity: index === 0 ? 1 : 0.5 + (p / 100) * 0.5,
        }} />
      </div>
      <span style={{ width: '60px', fontSize: '0.75rem', color: '#f0f0f0', fontFamily: 'monospace', textAlign: 'right', flexShrink: 0 }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function ConversionCell({ value, ok }: { value: string; ok?: boolean }) {
  return (
    <td style={{
      padding: '0.4rem 0.6rem', textAlign: 'center',
      color: ok !== undefined ? (ok ? '#22c55e' : '#ef4444') : '#f0f0f0',
      fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: ok !== undefined ? 600 : 400,
      borderBottom: '1px solid #1e1e2e',
    }}>
      {value}
    </td>
  );
}

function InsightCard({ type, text }: { type: 'positive' | 'negative' | 'info'; text: string }) {
  const colors = { positive: '#22c55e', negative: '#ef4444', info: '#6366f1' };
  return (
    <div style={{
      padding: '0.6rem 0.75rem', borderRadius: '6px',
      background: type === 'positive' ? '#0d1f0d' : type === 'negative' ? '#1f0d0d' : '#0d0d1f',
      border: `1px solid ${colors[type]}33`,
      color: colors[type], fontSize: '0.8rem', marginBottom: '0.4rem',
    }}>
      {type === 'positive' ? '▲ ' : type === 'negative' ? '▼ ' : 'ℹ '}{text}
    </div>
  );
}

/* ─── Main Component ─── */

export function ConversionIntelligence() {
  const styles = useThemeStyles();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [dimension, setDimension] = useState<DimensionKey>('campaign');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const ds = getDataService();
        const [funnelEvents, campaignsData] = await Promise.all([
          ds.getFunnelEvents(),
          ds.getCampaigns({ limit: 200 }),
        ]);
        if (cancelled) return;
        setEvents(funnelEvents);
        const nameMap: Record<string, string> = {};
        for (const c of campaignsData.data) {
          if (c.id) nameMap[c.id] = c.name;
        }
        setCampaignNames(nameMap);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load conversion data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* ─── Computed: funnel per dimension ─── */

  const funnelByDimension = useMemo(() => {
    const groups: Record<string, Partial<Record<string, number>>> = {};
    for (const ev of events) {
      const dimVal = getDimensionValue(ev, dimension, campaignNames);
      if (!groups[dimVal]) groups[dimVal] = {};
      const et = ev.event_type as string;
      const ct = FUNNEL_STEPS.includes(et as typeof FUNNEL_STEPS[number]) ? 1 : 0;
      if (ct) groups[dimVal]![et] = (groups[dimVal]![et] ?? 0) + 1;
    }
    // Sort by QR scan count descending
    const sorted = Object.entries(groups)
      .map(([key, counts]) => ({ key, counts: counts as Record<string, number> }))
      .sort((a, b) => (b.counts.qr_scanned ?? 0) - (a.counts.qr_scanned ?? 0));
    return sorted.slice(0, 15);
  }, [events, dimension, campaignNames]);

  /* ─── Computed: conversion matrix (by device) ─── */

  const deviceMatrix = useMemo(() => {
    const byDevice: Record<string, { total: number; completed: number; registered: number; trade: number; whatsapp: number }> = {};
    const deviceNames: Record<string, string> = {};
    for (const ev of events) {
      const os = parseOS(ev.user_agent);
      const browser = parseBrowser(ev.user_agent);
      const devKey = `${os} / ${browser}`;
      if (!byDevice[devKey]) byDevice[devKey] = { total: 0, completed: 0, registered: 0, trade: 0, whatsapp: 0 };
      deviceNames[devKey] = devKey;
      if (ev.event_type === 'game_started') byDevice[devKey]!.total++;
      if (ev.event_type === 'game_completed') byDevice[devKey]!.completed++;
      if (ev.event_type === 'auth_registered') byDevice[devKey]!.registered++;
      if (ev.event_type === 'trade_requested') byDevice[devKey]!.trade++;
      if (ev.event_type === 'whatsapp_clicked') byDevice[devKey]!.whatsapp++;
    }
    return Object.entries(byDevice)
      .map(([key, d]) => ({ key, ...d }))
      .filter((d) => d.total >= 5)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [events]);

  /* ─── Computed: campaign comparison ─── */

  const campaignCompare = useMemo(() => {
    const byCamp: Record<string, { sessions: number; completed: number; registered: number; trade: number; whatsapp: number; returning: Set<string> }> = {};
    const seenUsers: Record<string, Set<string>> = {};
    for (const ev of events) {
      const cid = ev.campaign_id ?? 'no-campaign';
      if (!byCamp[cid]) {
        byCamp[cid] = { sessions: 0, completed: 0, registered: 0, trade: 0, whatsapp: 0, returning: new Set() };
        seenUsers[cid] = new Set();
      }
      const camp = byCamp[cid]!;
      if (ev.event_type === 'game_started') {
        camp.sessions++;
        if (ev.session_id && seenUsers[cid]!.has(ev.session_id)) camp.returning.add(ev.session_id);
        if (ev.session_id) seenUsers[cid]!.add(ev.session_id);
      }
      if (ev.event_type === 'game_completed') camp.completed++;
      if (ev.event_type === 'auth_registered') camp.registered++;
      if (ev.event_type === 'trade_requested') camp.trade++;
      if (ev.event_type === 'whatsapp_clicked') camp.whatsapp++;
    }
    return Object.entries(byCamp)
      .map(([cid, d]) => ({
        campaignId: cid,
        name: campaignNames[cid] ?? cid.slice(0, 8),
        sessions: d.sessions,
        completion: pct(d.completed, d.sessions),
        registration: pct(d.registered, d.sessions),
        trade: pct(d.trade, d.sessions),
        whatsapp: pct(d.whatsapp, d.sessions),
        returning: d.returning.size,
        completionRaw: d.sessions > 0 ? d.completed / d.sessions : 0,
        registrationRaw: d.sessions > 0 ? d.registered / d.sessions : 0,
      }))
      .filter((c) => c.sessions >= 3)
      .sort((a, b) => b.sessions - a.sessions);
  }, [events, campaignNames]);

  /* ─── Computed: time intelligence ─── */

  const timeIntelligence = useMemo(() => {
    const byHour: Record<number, number> = {};
    const byDay: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    for (const ev of events) {
      if (ev.event_type !== 'game_completed') continue;
      if (!ev.created_at) continue;
      const d = new Date(ev.created_at);
      const h = d.getHours();
      byHour[h] = (byHour[h] ?? 0) + 1;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      byDay[dayName] = (byDay[dayName] ?? 0) + 1;
      const monthKey = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      byMonth[monthKey] = (byMonth[monthKey] ?? 0) + 1;
    }
    const bestHour = Object.entries(byHour).sort(([, a], [, b]) => b - a)[0];
    const bestDay = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];
    return { byHour, byDay, byMonth, bestHour: bestHour ? { hour: Number(bestHour[0]), count: bestHour[1] } : null, bestDay: bestDay ? { day: bestDay[0], count: bestDay[1] } : null };
  }, [events]);

  /* ─── Computed: heat map (campaign × hour) ─── */

  const heatMap = useMemo(() => {
    const grid: Record<string, Record<number, number>> = {};
    for (const ev of events) {
      if (ev.event_type !== 'game_completed') continue;
      const cid = ev.campaign_id ?? 'no-campaign';
      if (!grid[cid]) grid[cid] = {};
      const h = ev.created_at ? new Date(ev.created_at).getHours() : 0;
      grid[cid]![h] = (grid[cid]![h] ?? 0) + 1;
    }
    const maxVal = Math.max(1, ...Object.values(grid).flatMap((h) => Object.values(h)));
    const topCampaigns = Object.entries(grid)
      .sort(([, a], [, b]) => Object.values(b).reduce((s, v) => s + v, 0) - Object.values(a).reduce((s, v) => s + v, 0))
      .slice(0, 10);
    return { grid: topCampaigns, maxVal };
  }, [events]);

  /* ─── Computed: AI insights ─── */

  const insights = useMemo(() => {
    const result: { type: 'positive' | 'negative' | 'info'; text: string }[] = [];

    // Best campaign
    if (campaignCompare.length > 0) {
      const best = campaignCompare.reduce((a, b) => a.completionRaw > b.completionRaw ? a : b);
      if (best.completionRaw > 0.5) {
        result.push({ type: 'positive', text: `Campaign "${best.name}" achieves the highest completion rate (${best.completion}).` });
      }
      const worst = campaignCompare.reduce((a, b) => a.completionRaw < b.completionRaw ? a : b);
      if (worst.completionRaw < 0.3 && worst.sessions >= 10) {
        result.push({ type: 'negative', text: `Campaign "${worst.name}" has the lowest completion rate (${worst.completion}) with ${worst.sessions} sessions.` });
      }
    }

    // Best hour
    if (timeIntelligence.bestHour) {
      result.push({ type: 'info', text: `Best time for completions: ${String(timeIntelligence.bestHour.hour).padStart(2, '0')}:00 (${timeIntelligence.bestHour.count} completions).` });
    }
    if (timeIntelligence.bestDay) {
      result.push({ type: 'info', text: `Best day: ${timeIntelligence.bestDay.day} (${timeIntelligence.bestDay.count} completions).` });
    }

    // Device drop-off
    const osCompletions: Record<string, { started: number; completed: number }> = {};
    for (const ev of events) {
      const os = parseOS(ev.user_agent);
      if (!osCompletions[os]) osCompletions[os] = { started: 0, completed: 0 };
      if (ev.event_type === 'game_started') osCompletions[os]!.started++;
      if (ev.event_type === 'game_completed') osCompletions[os]!.completed++;
    }
    for (const [os, stats] of Object.entries(osCompletions)) {
      if (stats.started >= 10) {
        const rate = stats.completed / stats.started;
        if (rate < 0.5) {
          result.push({ type: 'negative', text: `${os} users drop off significantly: only ${pct(stats.completed, stats.started)} complete the game (${stats.started} started).` });
        } else if (rate > 0.85) {
          result.push({ type: 'positive', text: `${os} users show strong engagement: ${pct(stats.completed, stats.started)} completion rate.` });
        }
      }
    }

    // Registration insight
    const totalStarted = events.filter((e) => e.event_type === 'game_started').length;
    const totalRegistered = events.filter((e) => e.event_type === 'auth_registered').length;
    if (totalStarted > 0) {
      const regRate = totalRegistered / totalStarted;
      if (regRate < 0.15) {
        result.push({ type: 'negative', text: `Registration rate is low (${pct(totalRegistered, totalStarted)}). Most users leave before the registration screen. Consider moving CTA to results page.` });
      } else if (regRate > 0.4) {
        result.push({ type: 'positive', text: `Strong registration conversion at ${pct(totalRegistered, totalStarted)}.` });
      }
    }

    // Trade conversion
    const totalCompleted = events.filter((e) => e.event_type === 'game_completed').length;
    const totalTrade = events.filter((e) => e.event_type === 'trade_requested').length;
    if (totalCompleted > 0 && totalTrade > 0) {
      const tradeRate = totalTrade / totalCompleted;
      if (tradeRate > 0.1) {
        result.push({ type: 'positive', text: `${pct(totalTrade, totalCompleted)} of players who completed requested a trade — phone exchange is driving engagement.` });
      }
    }

    // Returning players
    const uniqueSessions = new Set(events.filter((e) => e.session_id).map((e) => e.session_id));
    const multiSessionUsers = new Set<string>();
    for (const ev of events) {
      if (ev.session_id && ev.user_agent) {
        const key = ev.session_id.slice(0, 8);
        if (multiSessionUsers.has(key)) continue;
        const count = events.filter((e) => e.session_id?.startsWith(ev.session_id!.slice(0, 8))).length;
        if (count > 1) multiSessionUsers.add(key);
      }
    }
    if (multiSessionUsers.size > 0 && uniqueSessions.size > 0) {
      result.push({ type: 'info', text: `${multiSessionUsers.size} returning players detected (${pct(multiSessionUsers.size, uniqueSessions.size)} of total sessions).` });
    }

    return result;
  }, [events, campaignCompare, timeIntelligence]);

  /* ─── Computed: recommendations ─── */

  const recommendations = useMemo(() => {
    const items: { icon: string; text: string }[] = [];

    const worstCamp = campaignCompare.length > 0 ? campaignCompare.reduce((a, b) => a.completionRaw < b.completionRaw ? a : b) : null;
    if (worstCamp && worstCamp.completionRaw < 0.3 && worstCamp.sessions >= 10) {
      items.push({ icon: '🔴', text: `Campaign "${worstCamp.name}" has ${worstCamp.completion} completion. Review targeting and QR placement.` });
    }

    const totalStarted = events.filter((e) => e.event_type === 'game_started').length;
    const totalRegistered = events.filter((e) => e.event_type === 'auth_registered').length;
    if (totalStarted > 0 && totalRegistered / totalStarted < 0.15) {
      items.push({ icon: '🟠', text: 'Registration is low. Move CTA to the results screen immediately after game completion.' });
    }

    const osCompletions: Record<string, { started: number; completed: number }> = {};
    for (const ev of events) {
      const os = parseOS(ev.user_agent);
      if (!osCompletions[os]) osCompletions[os] = { started: 0, completed: 0 };
      if (ev.event_type === 'game_started') osCompletions[os]!.started++;
      if (ev.event_type === 'game_completed') osCompletions[os]!.completed++;
    }
    for (const [os, stats] of Object.entries(osCompletions)) {
      if (stats.started >= 10 && stats.completed / stats.started < 0.4) {
        items.push({ icon: '🟠', text: `${os} users have <40% completion. Investigate calibration or game performance on this platform.` });
      }
    }

    if (timeIntelligence.bestHour) {
      items.push({ icon: '🟢', text: `Launch QR campaigns around ${String(timeIntelligence.bestHour.hour).padStart(2, '0')}:00 for maximum engagement.` });
    }

    const phoneServiceCount = events.filter((e) => e.event_type === 'phone_service_opened').length;
    const tradeCount = events.filter((e) => e.event_type === 'trade_requested').length;
    if (phoneServiceCount > 0 && tradeCount / phoneServiceCount < 0.2) {
      items.push({ icon: '🟠', text: 'Phone service is opened but few request trades. Simplify the trade flow or add incentives.' });
    }

    if (insights.filter((i) => i.type === 'negative').length > 2) {
      items.push({ icon: '🔴', text: 'Multiple issues detected. Run an Analytics Health check before making changes.' });
    }

    return items;
  }, [events, campaignCompare, timeIntelligence, insights]);

  /* ─── Render ─── */

  if (loading) {
    return (
      <div>
        <DashboardHeader title="Conversion Intelligence Center" subtitle="Analyzing conversion patterns across dimensions…" />
        <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading conversion data…</p></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <DashboardHeader title="Conversion Intelligence Center" />
        <Card><p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p></Card>
      </div>
    );
  }

  return (
    <div>
      <DashboardHeader
        title="Conversion Intelligence Center"
        subtitle="Multi-dimensional funnel analysis, conversion matrices, campaign comparison, and AI-driven insights"
      />

      {/* Dimension Selector */}
      <Card style={{ marginBottom: '1rem' }} padding="0.75rem">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#888', fontSize: '0.8rem' }}>Dimension:</span>
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDimension(d.key)}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none',
                background: dimension === d.key ? '#6366f1' : 'transparent',
                color: dimension === d.key ? '#fff' : '#888',
                cursor: 'pointer', fontSize: '0.8rem', fontWeight: dimension === d.key ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Section 1: Multi-Dimensional Funnel */}
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Funnel by {DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension}
        </h2>
        <div style={styles.flexCol}>
          {funnelByDimension.map(({ key, counts }) => (
            <div key={key}>
              <p style={{ color: '#aaa', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem' }}>{key}</p>
              {FUNNEL_STEPS.map((step, i) => {
                const count = counts[step] ?? 0;
                if (i === 0) {
                  return <FunnelBar key={step} label={FUNNEL_LABELS[step] ?? step} value={count} max={counts.qr_scanned ?? 1} color={FUNNEL_COLORS[i]!} index={i} />;
                }
                const prev = counts[FUNNEL_STEPS[i - 1]!] ?? 0;
                return <FunnelBar key={step} label={`${FUNNEL_LABELS[step] ?? step} (${prev > 0 ? pct(count, prev) : '—'})`} value={count} max={counts.qr_scanned ?? 1} color={FUNNEL_COLORS[i]!} index={i} />;
              })}
            </div>
          ))}
          {funnelByDimension.length === 0 && (
            <p style={{ color: '#888', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No funnel data for this dimension.</p>
          )}
        </div>
      </Card>

      {/* Section 2: Conversion Matrix */}
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Conversion Matrix (by OS / Browser)</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Device</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Sessions</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#22c55e', borderBottom: '1px solid #333', fontWeight: 500 }}>Complete</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#f97316', borderBottom: '1px solid #333', fontWeight: 500 }}>Register</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#ec4899', borderBottom: '1px solid #333', fontWeight: 500 }}>Trade</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#06b6d4', borderBottom: '1px solid #333', fontWeight: 500 }}>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {deviceMatrix.map((d) => (
                <tr key={d.key}>
                  <td style={{ padding: '0.4rem 0.6rem', color: '#f0f0f0', borderBottom: '1px solid #1e1e2e' }}>{d.key}</td>
                  <ConversionCell value={String(d.total)} />
                  <ConversionCell value={pct(d.completed, d.total)} ok={d.completed / d.total >= 0.6} />
                  <ConversionCell value={pct(d.registered, d.total)} ok={d.registered / d.total >= 0.15} />
                  <ConversionCell value={pct(d.trade, d.total)} ok={d.trade / d.total >= 0.08} />
                  <ConversionCell value={pct(d.whatsapp, d.total)} ok={d.whatsapp / d.total >= 0.05} />
                </tr>
              ))}
              {deviceMatrix.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>No device data (min 5 sessions per group).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 3: Campaign Comparison */}
      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Campaign Comparison</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Campaign</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Sessions</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#22c55e', borderBottom: '1px solid #333', fontWeight: 500 }}>Completion</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#f97316', borderBottom: '1px solid #333', fontWeight: 500 }}>Registration</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#ec4899', borderBottom: '1px solid #333', fontWeight: 500 }}>Trade</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#06b6d4', borderBottom: '1px solid #333', fontWeight: 500 }}>WhatsApp</th>
                <th style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: '#888', borderBottom: '1px solid #333', fontWeight: 500 }}>Returning</th>
              </tr>
            </thead>
            <tbody>
              {campaignCompare.map((c) => (
                <tr key={c.campaignId}>
                  <td style={{ padding: '0.4rem 0.6rem', color: '#f0f0f0', borderBottom: '1px solid #1e1e2e' }}>{c.name}</td>
                  <ConversionCell value={String(c.sessions)} />
                  <ConversionCell value={c.completion} ok={c.completionRaw >= 0.6} />
                  <ConversionCell value={c.registration} ok={c.registrationRaw >= 0.15} />
                  <ConversionCell value={c.trade} />
                  <ConversionCell value={c.whatsapp} />
                  <ConversionCell value={String(c.returning)} />
                </tr>
              ))}
              {campaignCompare.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>No campaign data (min 3 sessions per campaign).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Section 4: Time Intelligence + Heat Map */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Completions by Hour</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {Array.from({ length: 24 }, (_, h) => {
              const count = timeIntelligence.byHour[h] ?? 0;
              const max = Math.max(1, ...Object.values(timeIntelligence.byHour));
              const p = (count / max) * 100;
              return (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: '28px', fontSize: '0.65rem', color: '#666', fontFamily: 'monospace', textAlign: 'right' }}>
                    {String(h).padStart(2, '0')}
                  </span>
                  <div style={{ flex: 1, height: '10px', background: '#1e1e2e', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(p, 1)}%`, height: '100%', background: count > 0 ? '#6366f1' : '#1e1e2e', borderRadius: '3px' }} />
                  </div>
                  <span style={{ width: '30px', fontSize: '0.65rem', color: '#888', fontFamily: 'monospace' }}>{count || ''}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Campaign × Hour Heat Map</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.65rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.2rem 0.4rem', color: '#666', textAlign: 'left', fontWeight: 400 }}>Campaign</th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} style={{ padding: '0.2rem 0.2rem', color: '#666', fontWeight: 400, textAlign: 'center', minWidth: '18px' }}>
                      {String(h).padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatMap.grid.map(([cid, hours]) => (
                  <tr key={cid}>
                    <td style={{ padding: '0.2rem 0.4rem', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>
                      {campaignNames[cid] ?? cid.slice(0, 6)}
                    </td>
                    {Array.from({ length: 24 }, (_, h) => {
                      const val = hours[h] ?? 0;
                      const intensity = heatMap.maxVal > 0 ? val / heatMap.maxVal : 0;
                      const hex = val > 0 ? `rgb(${Math.round(99 - intensity * 60)}, ${Math.round(102 - intensity * 40)}, ${Math.round(241 - intensity * 100)})` : '#1e1e2e';
                      return (
                        <td key={h} style={{
                          padding: '0.2rem', textAlign: 'center', background: hex,
                          color: val > 0 ? '#fff' : 'transparent',
                          borderRadius: '2px', fontSize: '0.6rem',
                        }}>
                          {val > 0 ? val : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Section 5: Day / Month */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Completions by Day</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
              const count = timeIntelligence.byDay[day] ?? 0;
              const max = Math.max(1, ...Object.values(timeIntelligence.byDay));
              const p = (count / max) * 100;
              return (
                <div key={day} style={styles.flexRow}>
                  <span style={{ width: '80px', fontSize: '0.75rem', color: '#aaa' }}>{day}</span>
                  <div style={{ flex: 1, height: '16px', background: '#1e1e2e', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(p, 2)}%`, height: '100%', background: '#14b8a6', borderRadius: '4px' }} />
                  </div>
                  <span style={{ width: '30px', fontSize: '0.75rem', color: '#f0f0f0', fontFamily: 'monospace', textAlign: 'right' }}>{count || ''}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Completions by Month</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {Object.entries(timeIntelligence.byMonth)
              .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
              .map(([month, count]) => {
                const max = Math.max(1, ...Object.values(timeIntelligence.byMonth));
                const p = (count / max) * 100;
                return (
                <div key={month} style={styles.flexRow}>
                  <span style={{ width: '80px', fontSize: '0.75rem', color: '#aaa' }}>{month}</span>
                    <div style={{ flex: 1, height: '16px', background: '#1e1e2e', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(p, 2)}%`, height: '100%', background: '#f59e0b', borderRadius: '4px' }} />
                    </div>
                    <span style={{ width: '30px', fontSize: '0.75rem', color: '#f0f0f0', fontFamily: 'monospace', textAlign: 'right' }}>{count}</span>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>

      {/* Section 6: Insights + Recommendations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>AI Insights</h2>
          {insights.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {insights.map((insight, i) => (
                <InsightCard key={i} type={insight.type} text={insight.text} />
              ))}
            </div>
          ) : (
            <p style={{ color: '#888', fontSize: '0.8rem' }}>No insights available yet. More data needed.</p>
          )}
        </Card>

        <Card>
          <h2 style={{ color: '#f0f0f0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Recommendations</h2>
          {recommendations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recommendations.map((rec, i) => (
                <div key={i} style={{
                  padding: '0.6rem 0.75rem', borderRadius: '6px',
                  background: '#12121a', border: '1px solid #1e1e2e',
                  color: '#f0f0f0', fontSize: '0.8rem', marginBottom: '0.4rem',
                }}>
                  {rec.icon} {rec.text}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888', fontSize: '0.8rem' }}>No recommendations yet. More data needed.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
