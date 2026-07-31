import { useState, useEffect, useMemo } from 'react';
import { getDataService, type AnalyticsEvent } from '../../../core/supabase/data-service';
import { Card } from '../../../components/shared/Card';
import { DashboardHeader } from '../../../research-console/layout/ResearchLayout';

/* ─── Helpers ─── */

function os(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

function browser(ua?: string): string {
  if (!ua) return 'Unknown';
  if (/edg/i.test(ua)) return 'Edge';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function pct(a: number, b: number): string {
  if (b === 0) return '—';
  return ((a / b) * 100).toFixed(0) + '%';
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/* ─── Insight Card ─── */

function Insight({ type, title, detail, source }: { type: 'positive' | 'negative' | 'info' | 'warning'; title: string; detail: string; source?: string }) {
  const colors = { positive: '#22c55e', negative: '#ef4444', info: '#6366f1', warning: '#f59e0b' };
  const icons = { positive: '▲', negative: '▼', info: 'ℹ', warning: '⚠' };
  return (
    <div style={{
      padding: '0.75rem', borderRadius: '8px',
      background: type === 'positive' ? '#0d1f0d' : type === 'negative' ? '#1f0d0d' : type === 'warning' ? '#1f1a0d' : '#0d0d1f',
      border: `1px solid ${colors[type]}44`,
      marginBottom: '0.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span style={{ color: colors[type], fontSize: '1rem', flexShrink: 0 }}>{icons[type]}</span>
        <div>
          <p style={{ color: colors[type], fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.2rem' }}>{title}</p>
          <p style={{ color: '#ccc', fontSize: '0.8rem', lineHeight: 1.4 }}>{detail}</p>
          {source && <p style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.2rem', fontFamily: 'monospace' }}>Source: {source}</p>}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export function BusinessInsights() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funnelEvents, setFunnelEvents] = useState<AnalyticsEvent[]>([]);
  const [calibrationEvents, setCalibrationEvents] = useState<AnalyticsEvent[]>([]);
  const [gameEvents, setGameEvents] = useState<AnalyticsEvent[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const ds = getDataService();
        const [funnel, cal, game, camps] = await Promise.all([
          ds.getFunnelEvents(),
          ds.getCalibrationEvents(),
          ds.getGameEvents(),
          ds.getCampaigns({ limit: 200 }),
        ]);
        if (cancelled) return;
        setFunnelEvents(funnel);
        setCalibrationEvents(cal);
        setGameEvents(game);
        const names: Record<string, string> = {};
        for (const c of camps.data) if (c.id) names[c.id] = c.name;
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

  /* ─── All insights ─── */

  const insights = useMemo(() => {
    const result: { type: 'positive' | 'negative' | 'info' | 'warning'; title: string; detail: string; source?: string; category: string }[] = [];

    /* --- Campaign Analysis --- */
    const campaignStarted: Record<string, number> = {};
    const campaignCompleted: Record<string, number> = {};
    const campaignRegistered: Record<string, number> = {};
    const campaignTrade: Record<string, number> = {};
    for (const ev of funnelEvents) {
      const cid = ev.campaign_id ?? 'no-campaign';
      if (ev.event_type === 'game_started') campaignStarted[cid] = (campaignStarted[cid] ?? 0) + 1;
      if (ev.event_type === 'game_completed') campaignCompleted[cid] = (campaignCompleted[cid] ?? 0) + 1;
      if (ev.event_type === 'auth_registered') campaignRegistered[cid] = (campaignRegistered[cid] ?? 0) + 1;
      if (ev.event_type === 'trade_requested') campaignTrade[cid] = (campaignTrade[cid] ?? 0) + 1;
    }
    const overallStarted = Object.values(campaignStarted).reduce((s, v) => s + v, 0);
    const overallCompleted = Object.values(campaignCompleted).reduce((s, v) => s + v, 0);
    const overallRegistered = Object.values(campaignRegistered).reduce((s, v) => s + v, 0);
    const overallTrade = Object.values(campaignTrade).reduce((s, v) => s + v, 0);
    const avgCompletion = overallStarted > 0 ? overallCompleted / overallStarted : 0;
    const avgRegistration = overallStarted > 0 ? overallRegistered / overallStarted : 0;
    const avgTrade = overallCompleted > 0 ? overallTrade / overallCompleted : 0;

    for (const [cid, started] of Object.entries(campaignStarted)) {
      if (started < 10) continue;
      const completed = campaignCompleted[cid] ?? 0;
      const registered = campaignRegistered[cid] ?? 0;
      const trade = campaignTrade[cid] ?? 0;
      const compRate = completed / started;
      const regRate = registered / started;
      const tradeRate = trade / Math.max(completed, 1);
      const name = campaignNames[cid] ?? cid.slice(0, 8);

      if (avgCompletion > 0 && compRate / avgCompletion > 1.25) {
        result.push({ type: 'positive', category: 'campaign', title: `${name}: Completion ${pct(completed, started)}`, detail: `This campaign achieves ${((compRate / avgCompletion - 1) * 100).toFixed(0)}% higher completion than the campaign average (${pct(overallCompleted, overallStarted)}).`, source: `${fmtNum(started)} sessions` });
      }
      if (avgCompletion > 0 && compRate / avgCompletion < 0.6) {
        result.push({ type: 'negative', category: 'campaign', title: `${name}: Low completion ${pct(completed, started)}`, detail: `This campaign underperforms by ${((1 - compRate / avgCompletion) * 100).toFixed(0)}% vs campaign average (${pct(overallCompleted, overallStarted)}). Review QR placement and targeting.`, source: `${fmtNum(started)} sessions` });
      }
      if (avgRegistration > 0 && regRate / avgRegistration > 1.4) {
        result.push({ type: 'positive', category: 'campaign', title: `${name}: Registration ${pct(registered, started)}`, detail: `Registration rate is ${((regRate / avgRegistration - 1) * 100).toFixed(0)}% above average (${pct(overallRegistered, overallStarted)}). Strong call-to-action performance.`, source: `${fmtNum(started)} sessions` });
      }
      if (avgTrade > 0 && tradeRate / avgTrade > 1.5) {
        result.push({ type: 'positive', category: 'campaign', title: `${name}: Trade conversion ${pct(trade, completed)}`, detail: `Trade requests are ${((tradeRate / avgTrade - 1) * 100).toFixed(0)}% above average. This campaign's audience is highly engaged in phone exchange.`, source: `${fmtNum(completed)} completions` });
      }
    }

    /* --- OS Analysis --- */
    const osStarted: Record<string, number> = {};
    const osCompleted: Record<string, number> = {};
    const osAbandoned: Record<string, number> = {};
    for (const ev of funnelEvents) {
      const o = os(ev.user_agent);
      if (ev.event_type === 'game_started') osStarted[o] = (osStarted[o] ?? 0) + 1;
      if (ev.event_type === 'game_completed') osCompleted[o] = (osCompleted[o] ?? 0) + 1;
      if (ev.event_type === 'game_abandoned') osAbandoned[o] = (osAbandoned[o] ?? 0) + 1;
    }
    for (const [o, started] of Object.entries(osStarted)) {
      if (started < 10) continue;
      const completed = osCompleted[o] ?? 0;
      const abandoned = osAbandoned[o] ?? 0;
      const rate = completed / started;
      if (rate > 0.85) {
        result.push({ type: 'positive', category: 'os', title: `${o}: ${pct(completed, started)} completion`, detail: `${o} users show strong engagement with ${pct(completed, started)} completing the game. This platform is well-optimized.`, source: `${fmtNum(started)} sessions` });
      }
      if (rate < 0.55) {
        result.push({ type: 'negative', category: 'os', title: `${o}: ${pct(completed, started)} completion`, detail: `${o} users complete the game at only ${pct(completed, started)}. This is significantly below other platforms. Investigate calibration or rendering performance.`, source: `${fmtNum(started)} sessions, ${fmtNum(abandoned)} abandoned` });
      }
    }

    /* --- OS × Calibration timing --- */
    const calPairs: Record<string, { startedAt: string; completedAt?: string }> = {};
    for (const ev of calibrationEvents) {
      const sid = ev.session_id;
      if (!sid) continue;
      if (ev.event_type === 'calibration_started') {
        if (!calPairs[sid]) calPairs[sid] = { startedAt: ev.created_at! };
      } else if (ev.event_type === 'calibration_completed') {
        if (calPairs[sid]) calPairs[sid]!.completedAt = ev.created_at!;
        else calPairs[sid] = { startedAt: '', completedAt: ev.created_at! };
      }
    }
    const calByOS: Record<string, number[]> = {};
    for (const [sid, pair] of Object.entries(calPairs)) {
      if (!pair.startedAt || !pair.completedAt) continue;
      const duration = new Date(pair.completedAt).getTime() - new Date(pair.startedAt).getTime();
      if (duration <= 0 || duration > 120000) continue;
      const ua = calibrationEvents.find((e) => e.session_id === sid)?.user_agent ?? '';
      const o = os(ua);
      if (!calByOS[o]) calByOS[o] = [];
      calByOS[o]!.push(duration);
    }
    const allCalDurations = Object.values(calByOS).flat();
    const avgCalAll = avg(allCalDurations);
    for (const [o, durations] of Object.entries(calByOS)) {
      if (durations.length < 5) continue;
      if (avgCalAll === 0) continue;
      const avgO = avg(durations);
      if (avgO > avgCalAll * 1.3) {
        result.push({ type: 'warning', category: 'calibration', title: `${o}: Calibration takes ${fmtMs(Math.round(avgO))}`, detail: `${o} users take ${((avgO / avgCalAll - 1) * 100).toFixed(0)}% longer to calibrate than average (${fmtMs(Math.round(avgCalAll))}). This may be caused by hardware limitations.`, source: `${durations.length} calibration sessions` });
      }
      if (avgO < avgCalAll * 0.7) {
        result.push({ type: 'positive', category: 'calibration', title: `${o}: Fast calibration ${fmtMs(Math.round(avgO))}`, detail: `${o} users calibrate ${((1 - avgO / avgCalAll) * 100).toFixed(0)}% faster than average. This platform performs well.`, source: `${durations.length} calibration sessions` });
      }
    }

    /* --- Time analysis --- */
    const byHour: Record<number, { started: number; completed: number }> = {};
    for (const ev of funnelEvents) {
      if (!ev.created_at) continue;
      const h = new Date(ev.created_at).getHours();
      if (!byHour[h]) byHour[h] = { started: 0, completed: 0 };
      if (ev.event_type === 'game_started') byHour[h]!.started++;
      if (ev.event_type === 'game_completed') byHour[h]!.completed++;
    }
    let bestHour = { hour: 0, rate: 0, started: 0 };
    for (const [hStr, data] of Object.entries(byHour)) {
      const hNum = Number(hStr);
      const rate = data.started > 0 ? data.completed / data.started : 0;
      if (rate > bestHour.rate && data.started >= 5) {
        bestHour = { hour: hNum, rate, started: data.started };
      }
    }
    if (bestHour.started >= 5) {
      result.push({ type: 'info', category: 'time', title: `Best hour: ${String(bestHour.hour).padStart(2, '0')}:00`, detail: `The hour ${String(bestHour.hour).padStart(2, '0')}:00 achieves the highest completion rate at ${pct(Math.round(bestHour.rate * bestHour.started), bestHour.started)} (${fmtNum(bestHour.started)} sessions). Optimal time for QR campaigns.`, source: 'analytics_events' });
    }

    /* --- Day analysis --- */
    const byDay: Record<string, { started: number; completed: number }> = {};
    for (const ev of funnelEvents) {
      if (!ev.created_at) continue;
      const day = new Date(ev.created_at).toLocaleDateString('en-US', { weekday: 'long' });
      if (!byDay[day]) byDay[day] = { started: 0, completed: 0 };
      if (ev.event_type === 'game_started') byDay[day]!.started++;
      if (ev.event_type === 'game_completed') byDay[day]!.completed++;
    }
    const dayRates = Object.entries(byDay).map(([day, d]) => ({ day, rate: d.started > 0 ? d.completed / d.started : 0, started: d.started }));
    const bestDay = dayRates.length > 0 ? dayRates.reduce((a, b) => a.rate > b.rate ? a : b, { day: '', rate: 0, started: 0 }) : { day: '', rate: 0, started: 0 };
    const worstDay = dayRates.length > 0 ? dayRates.reduce((a, b) => a.rate < b.rate ? a : b, { day: '', rate: Infinity, started: 0 }) : { day: '', rate: 0, started: 0 };
    if (bestDay.started >= 5) {
      result.push({ type: 'info', category: 'time', title: `Best day: ${bestDay.day}`, detail: `${bestDay.day} has the highest completion rate at ${pct(Math.round(bestDay.rate * bestDay.started), bestDay.started)} (${fmtNum(bestDay.started)} sessions).`, source: 'analytics_events' });
    }
    if (worstDay.started >= 5 && worstDay.rate < bestDay.rate * 0.7) {
      result.push({ type: 'warning', category: 'time', title: `Worst day: ${worstDay.day}`, detail: `${worstDay.day} underperforms by ${((1 - worstDay.rate / bestDay.rate) * 100).toFixed(0)}% vs the best day. Consider adjusting campaign schedules.`, source: `${fmtNum(worstDay.started)} sessions` });
    }

    /* --- Device × Completion correlation --- */
    const deviceCompletion: Record<string, { started: number; completed: number }> = {};
    for (const ev of funnelEvents) {
      const b = browser(ev.user_agent);
      if (!deviceCompletion[b]) deviceCompletion[b] = { started: 0, completed: 0 };
      if (ev.event_type === 'game_started') deviceCompletion[b]!.started++;
      if (ev.event_type === 'game_completed') deviceCompletion[b]!.completed++;
    }
    for (const [b, stats] of Object.entries(deviceCompletion)) {
      if (stats.started < 10) continue;
      const rate = stats.completed / stats.started;
      if (rate < 0.5) {
        result.push({ type: 'negative', category: 'device', title: `${b}: Low completion ${pct(stats.completed, stats.started)}`, detail: `${b} users have a completion rate of only ${pct(stats.completed, stats.started)}. This may indicate compatibility issues.`, source: `${fmtNum(stats.started)} sessions` });
      }
    }

    /* --- Returning player analysis --- */
    const sessionUserMap: Record<string, Set<string>> = {};
    for (const ev of funnelEvents) {
      if (!ev.session_id || !ev.user_agent) continue;
      const key = os(ev.user_agent);
      if (!sessionUserMap[key]) sessionUserMap[key] = new Set();
      sessionUserMap[key]!.add(ev.session_id);
    }
    const repeatSessionMap: Record<string, Set<string>> = {};
    for (const ev of funnelEvents) {
      if (!ev.session_id || !ev.user_agent) continue;
      const key = os(ev.user_agent);
      if (!repeatSessionMap[key]) repeatSessionMap[key] = new Set();
      // Check if this session appears more than once across different days
    }
    // Simple: sessions that started after they already had a session
    const userSessionCounts: Record<string, number> = {};
    for (const ev of funnelEvents) {
      if (!ev.session_id) continue;
      const uid = ev.session_id.slice(0, 12);
      userSessionCounts[uid] = (userSessionCounts[uid] ?? 0) + 1;
    }
    const returningCount = Object.values(userSessionCounts).filter((c) => c > 5).length;
    const totalSessions = new Set(funnelEvents.filter((e) => e.session_id).map((e) => e.session_id)).size;
    if (returningCount > 0 && totalSessions > 0) {
      const returnRate = returningCount / totalSessions;
      result.push({ type: 'info', category: 'retention', title: `Returning players: ${pct(returningCount, totalSessions)}`, detail: `${fmtNum(returningCount)} returning players detected out of ${fmtNum(totalSessions)} total sessions. ${returnRate > 0.1 ? 'Healthy retention rate.' : 'Room for improvement in user retention.'}`, source: 'analytics_events' });
    }

    /* --- Event flow correlation --- */
    const phoneServiceUsers = new Set<string>();
    const tradeUsers = new Set<string>();
    for (const ev of funnelEvents) {
      if (!ev.session_id) continue;
      if (ev.event_type === 'phone_service_opened') phoneServiceUsers.add(ev.session_id);
      if (ev.event_type === 'trade_requested') tradeUsers.add(ev.session_id);
    }
    if (phoneServiceUsers.size > 0) {
      const phoneToTrade = [...phoneServiceUsers].filter((s) => tradeUsers.has(s)).length;
      const convRate = phoneToTrade / phoneServiceUsers.size;
      if (convRate > 0.3) {
        result.push({ type: 'positive', category: 'flow', title: `Phone service → Trade: ${pct(phoneToTrade, phoneServiceUsers.size)}`, detail: `${pct(phoneToTrade, phoneServiceUsers.size)} of users who open phone services proceed to request a trade. The trade flow is effectively converting interest.`, source: `${fmtNum(phoneServiceUsers.size)} phone service opens` });
      } else if (convRate < 0.1 && phoneServiceUsers.size >= 20) {
        result.push({ type: 'warning', category: 'flow', title: `Low phone-to-trade conversion: ${pct(phoneToTrade, phoneServiceUsers.size)}`, detail: `Only ${pct(phoneToTrade, phoneServiceUsers.size)} of phone service users request a trade. Simplify the trade flow or add incentives.`, source: `${fmtNum(phoneServiceUsers.size)} opens` });
      }
    }

    /* --- Completion speed --- */
    const sessionGameTime: Record<string, { startedAt: string; completedAt?: string }> = {};
    for (const ev of gameEvents) {
      if (!ev.session_id) continue;
      if (ev.event_type === 'game_started') {
        if (!sessionGameTime[ev.session_id]) sessionGameTime[ev.session_id] = { startedAt: ev.created_at! };
      } else if (ev.event_type === 'game_completed') {
        if (sessionGameTime[ev.session_id]) sessionGameTime[ev.session_id]!.completedAt = ev.created_at!;
        else sessionGameTime[ev.session_id] = { startedAt: '', completedAt: ev.created_at! };
      }
    }
    const gameDurations = Object.values(sessionGameTime)
      .filter((p) => p.startedAt && p.completedAt)
      .map((p) => new Date(p.completedAt!).getTime() - new Date(p.startedAt!).getTime())
      .filter((d) => d > 0 && d < 600000);
    if (gameDurations.length >= 10) {
      const avgGame = Math.round(avg(gameDurations));
      const medGame = Math.round(median(gameDurations));
      result.push({ type: 'info', category: 'speed', title: `Average game duration: ${fmtMs(avgGame)}`, detail: `Players complete the game in ${fmtMs(avgGame)} on average (median: ${fmtMs(medGame)}). ${avgGame > 120000 ? 'Game duration is on the longer side.' : 'Game duration is reasonable.'}`, source: `${fmtNum(gameDurations.length)} games` });

      // Game duration by OS
      const durByOS: Record<string, number[]> = {};
      for (const ev of gameEvents) {
        if (!ev.session_id) continue;
        const pair = sessionGameTime[ev.session_id];
        if (!pair || !pair.startedAt || !pair.completedAt) continue;
        const dur = new Date(pair.completedAt).getTime() - new Date(pair.startedAt).getTime();
        if (dur <= 0 || dur > 600000) continue;
        const o = os(ev.user_agent);
        if (!durByOS[o]) durByOS[o] = [];
        durByOS[o]!.push(dur);
      }
      for (const [o, durs] of Object.entries(durByOS)) {
        if (durs.length < 5) continue;
        const avgO = Math.round(avg(durs));
        if (avgO > avgGame * 1.4) {
          result.push({ type: 'warning', category: 'speed', title: `${o}: Game takes ${fmtMs(avgO)}`, detail: `${o} users take ${((avgO / avgGame - 1) * 100).toFixed(0)}% longer than average (${fmtMs(avgGame)}). May indicate performance issues.`, source: `${fmtNum(durs.length)} games` });
        }
      }
    }

    /* --- Registration flow --- */
    const completedUsers = new Set<string>();
    const registeredUsers = new Set<string>();
    for (const ev of funnelEvents) {
      if (!ev.session_id) continue;
      if (ev.event_type === 'game_completed') completedUsers.add(ev.session_id);
      if (ev.event_type === 'auth_registered') registeredUsers.add(ev.session_id);
    }
    const completedOnly = [...completedUsers].filter((s) => !registeredUsers.has(s));
    if (completedOnly.length > 0 && completedUsers.size > 0) {
      const missRate = completedOnly.length / completedUsers.size;
      if (missRate > 0.7) {
        result.push({ type: 'negative', category: 'flow', title: `${pct(completedOnly.length, completedUsers.size)} of players don't register`, detail: `${fmtNum(completedOnly.length)} out of ${fmtNum(completedUsers.size)} players who completed the game did not register. The registration CTA may be hard to find or appears too late.`, source: 'analytics_events' });
      }
    }

    /* --- Registration speed --- */
    const regTimings: number[] = [];
    for (const ev of funnelEvents) {
      if (ev.event_type === 'auth_registered' && ev.created_at) {
        const prevEvents = funnelEvents.filter(
          (e) => e.session_id === ev.session_id && e.created_at && new Date(e.created_at).getTime() < new Date(ev.created_at!).getTime()
        );
        if (prevEvents.length > 0) {
          const last = prevEvents.reduce((a, b) => new Date(a.created_at!).getTime() > new Date(b.created_at!).getTime() ? a : b, prevEvents[0]!);
          regTimings.push(new Date(ev.created_at).getTime() - new Date(last.created_at!).getTime());
        }
      }
    }
    if (regTimings.length >= 5) {
      const avgRegTime = Math.round(avg(regTimings));
      result.push({ type: 'info', category: 'flow', title: `Registration occurs ${fmtMs(avgRegTime)} after last event`, detail: `On average, users register ${fmtMs(avgRegTime)} after their previous action. ${avgRegTime < 30000 ? 'Most register within 30 seconds — the CTA is well-placed.' : 'The gap is significant — consider moving the CTA earlier.'}`, source: `${fmtNum(regTimings.length)} registrations` });
    }

    /* --- Trade request entry point --- */
    const tradeSessions = new Set<string>();
    for (const ev of funnelEvents) {
      if (ev.event_type === 'trade_requested' && ev.session_id) tradeSessions.add(ev.session_id);
    }
    if (tradeSessions.size >= 5) {
      const tradePrecedents: Record<string, number> = {};
      for (const sid of tradeSessions) {
        const sessionEvs = funnelEvents.filter((e) => e.session_id === sid);
        const tradeIdx = sessionEvs.findIndex((e) => e.event_type === 'trade_requested');
        if (tradeIdx > 0) {
          const prevType = sessionEvs[tradeIdx - 1]?.event_type ?? 'unknown';
          tradePrecedents[prevType] = (tradePrecedents[prevType] ?? 0) + 1;
        }
      }
      const topPrecedent = Object.entries(tradePrecedents).sort(([, a], [, b]) => b - a)[0];
      if (topPrecedent) {
        result.push({ type: 'info', category: 'flow', title: `Top action before trade: ${topPrecedent[0]}`, detail: `${topPrecedent[0]} is the most common event immediately before a trade request (${pct(topPrecedent[1], tradeSessions.size)} of cases). Optimize this transition.`, source: `${fmtNum(tradeSessions.size)} trade requests` });
      }
    }

    return result;
  }, [funnelEvents, calibrationEvents, gameEvents, campaignNames]);

  /* ─── Group by category ─── */

  const byCategory = useMemo(() => {
    const groups: Record<string, typeof insights> = {};
    for (const ins of insights) {
      if (!groups[ins.category]) groups[ins.category] = [];
      groups[ins.category]!.push(ins);
    }
    return groups;
  }, [insights]);

  /* ─── Summary metrics ─── */

  const summary = useMemo(() => {
    const genStarted = new Set(funnelEvents.filter((e) => e.event_type === 'game_started').map((e) => e.session_id)).size;
    const genCompleted = new Set(funnelEvents.filter((e) => e.event_type === 'game_completed').map((e) => e.session_id)).size;
    const genRegistered = new Set(funnelEvents.filter((e) => e.event_type === 'auth_registered').map((e) => e.session_id)).size;
    const genTrade = new Set(funnelEvents.filter((e) => e.event_type === 'trade_requested').map((e) => e.session_id)).size;
    const genCampaigns = new Set(funnelEvents.filter((e) => e.campaign_id).map((e) => e.campaign_id)).size;
    const positive = insights.filter((i) => i.type === 'positive').length;
    const negative = insights.filter((i) => i.type === 'negative').length;
    const warnings = insights.filter((i) => i.type === 'warning').length;
    return { genStarted, genCompleted, genRegistered, genTrade, genCampaigns, positive, negative, warnings, total: insights.length };
  }, [funnelEvents, insights]);

  /* ─── Render ─── */

  if (loading) return (
    <div>
      <DashboardHeader title="AI Business Insights" subtitle="Cross-dimension analysis, correlations, and actionable intelligence" />
      <Card><p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Generating business insights…</p></Card>
    </div>
  );

  if (error) return (
    <div>
      <DashboardHeader title="AI Business Insights" />
      <Card><p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</p></Card>
    </div>
  );

  const categoryLabels: Record<string, string> = {
    campaign: 'Campaign Performance',
    os: 'Operating System',
    calibration: 'Calibration Analysis',
    time: 'Time Intelligence',
    device: 'Device & Browser',
    retention: 'Retention',
    flow: 'Flow & Conversion',
    speed: 'Game Speed',
  };

  return (
    <div>
      <DashboardHeader
        title="AI Business Insights"
        subtitle={`${summary.total} insights generated across ${Object.keys(byCategory).length} categories — ${summary.positive} positive, ${summary.negative} negative, ${summary.warnings} warnings`}
      />

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
        <Card padding="0.5rem">
          <p style={{ color: '#888', fontSize: '0.7rem' }}>Sessions</p>
          <p style={{ color: '#f0f0f0', fontSize: '1.1rem', fontWeight: 'bold' }}>{fmtNum(summary.genStarted)}</p>
        </Card>
        <Card padding="0.5rem">
          <p style={{ color: '#888', fontSize: '0.7rem' }}>Completed</p>
          <p style={{ color: '#22c55e', fontSize: '1.1rem', fontWeight: 'bold' }}>{fmtNum(summary.genCompleted)}</p>
        </Card>
        <Card padding="0.5rem">
          <p style={{ color: '#888', fontSize: '0.7rem' }}>Registered</p>
          <p style={{ color: '#f97316', fontSize: '1.1rem', fontWeight: 'bold' }}>{fmtNum(summary.genRegistered)}</p>
        </Card>
        <Card padding="0.5rem">
          <p style={{ color: '#888', fontSize: '0.7rem' }}>Trade Requests</p>
          <p style={{ color: '#ec4899', fontSize: '1.1rem', fontWeight: 'bold' }}>{fmtNum(summary.genTrade)}</p>
        </Card>
        <Card padding="0.5rem">
          <p style={{ color: '#888', fontSize: '0.7rem' }}>Campaigns</p>
          <p style={{ color: '#6366f1', fontSize: '1.1rem', fontWeight: 'bold' }}>{fmtNum(summary.genCampaigns)}</p>
        </Card>
      </div>

      {/* Insights by category */}
      {Object.entries(byCategory).map(([cat, items]) => (
        <Card key={cat} style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {categoryLabels[cat] ?? cat}
            <span style={{ color: '#666', fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem' }}>
              ({items.length} insight{items.length !== 1 ? 's' : ''})
            </span>
          </h2>
          {items.map((ins, i) => (
            <Insight key={i} type={ins.type} title={ins.title} detail={ins.detail} source={ins.source} />
          ))}
        </Card>
      ))}

      {insights.length === 0 && (
        <Card>
          <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Not enough data to generate insights. Continue collecting events.</p>
        </Card>
      )}
    </div>
  );
}
