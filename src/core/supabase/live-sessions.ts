import { getSupabaseClient } from './client';
import {
  markNotify,
  markPollEnd,
  markPollInactive,
  markPollStart,
  markRealtime,
  setListenerCount,
  emitDiagnosticLog,
} from './live-diagnostics';

export interface DeviceDetails {
  readonly browser: string;
  readonly browserVersion: string;
  readonly os: string;
  readonly osVersion: string;
  readonly platform: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly pixelRatio: number;
  readonly refreshRate: number;
  readonly touchSupport: boolean;
  readonly pointerType: string;
  readonly cpuCores: number;
  readonly memoryGb: number | null;
  readonly language: string;
  readonly timezone: string;
  readonly userAgent: string;
  readonly collectedAt: string;
}

export interface LiveSession {
  readonly sessionId: string;
  readonly userId: string | null;
  readonly userName: string;
  readonly userType: 'guest' | 'registered';
  readonly campaignId: string | null;
  readonly campaignName: string | null;
  readonly status: 'running' | 'paused';
  readonly startedAt: number;
  readonly elapsed: number;
  readonly device: string;
  readonly platform: string;
  readonly os: string;
  readonly browser: string;
  readonly deviceDetails: DeviceDetails | null;
  readonly country: string | null;
  readonly city: string | null;
  readonly currentRound: number;
  readonly totalRounds: number;
  readonly pluginId: string;
  readonly lastActivityAt: number | null;
  readonly endedReason: string | null;
  readonly source: string;
}

type LiveSessionsListener = (sessions: readonly LiveSession[]) => void;

type FetchTrigger = 'initial' | 'poll' | 'realtime_event' | 'coalesced';

// P0-1 contract guards (defense-in-depth). The live map only shows rows that
// are genuinely live. Anything else is logged once with the exact reason and
// full row context so the debug report can name why a session remained visible.
const ZERO_ROUND_STALE_MS = 30_000;
const HEARTBEAT_STALE_MS = 90_000;
// Teardown is debounced so React 18 StrictMode's mount->unmount->remount cycle
// reuses the single realtime channel instead of emitting a second
// realtime_subscribe (P0-4) and spawning a second poll loop (P0-5).
const TEARDOWN_DEBOUNCE_MS = 1000;

let channel: ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | null = null;
let requestSeq = 0;
const activeSessions: Map<string, LiveSession> = new Map();
const listeners: Set<LiveSessionsListener> = new Set();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let teardownTimer: ReturnType<typeof setTimeout> | null = null;
let fetchInFlight = false;
let fetchPending = false;
const excludedReported: Set<string> = new Set();

function notifyListeners() {
  markNotify();
  const sessions = Array.from(activeSessions.values())
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const listener of listeners) {
    try { listener(sessions); } catch { /* ignore */ }
  }
}

function reportExclusion(row: Record<string, unknown>, detail: string): void {
  const id = row.id as string;
  if (excludedReported.has(id)) return;
  excludedReported.add(id);
  emitDiagnosticLog({
    service: 'live-sessions',
    action: 'session_excluded',
    status: 'skipped',
    caller: 'live-sessions',
    trigger: 'mapRowToLiveSession',
    sessionId: id,
    detail,
  });
}

function rowContext(row: Record<string, unknown>, reason: string): string {
  const now = Date.now();
  const created = row.created_at ? new Date(row.created_at as string).getTime() : null;
  const elapsedMs = created ? now - created : null;
  const campaign = (row.campaign_id as string) ?? null;
  const measurements = row.measurements as { corrected_rts?: number[] } | null;
  const currentRound = measurements?.corrected_rts?.length ?? 0;
  return [
    `reason=${reason}`,
    `status=${String(row.status)}`,
    `created_at=${String(row.created_at)}`,
    `updated_at=${String(row.updated_at)}`,
    `finished_at=${String(row.finished_at ?? 'null')}`,
    `elapsed=${elapsedMs !== null ? `${(elapsedMs / 1000).toFixed(1)}s` : 'null'}`,
    `current_round=${currentRound}`,
    `campaign=${campaign ?? 'null'}`,
  ].join(' ');
}

function mapRowToLiveSession(row: Record<string, unknown>): LiveSession | null {
  if (row.status !== 'running' && row.status !== 'paused') return null;

  // P0-1: a row with finished_at set is NOT live, even if status still says running.
  if (row.finished_at) {
    reportExclusion(row, rowContext(row, 'finished_at_set'));
    return null;
  }

  const updatedAt = row.updated_at
    ? new Date(row.updated_at as string).getTime()
    : new Date(row.created_at as string).getTime();
  const now = Date.now();

  // P0-1: zero rounds + no heartbeat for >30s -> abandoned, never started a game.
  const measurements = row.measurements as { corrected_rts?: number[] } | null;
  const currentRound = measurements?.corrected_rts?.length ?? 0;
  if (currentRound === 0 && now - updatedAt > ZERO_ROUND_STALE_MS) {
    reportExclusion(row, rowContext(row, 'zero_round_stale'));
    return null;
  }

  // P0-1: heartbeat dead entirely (updated_at older than 90s) -> crashed tab.
  if (now - updatedAt > HEARTBEAT_STALE_MS) {
    reportExclusion(row, rowContext(row, 'heartbeat_stale'));
    return null;
  }

  const metadata = row.metadata as { source?: string } | null;
  const device = row._devices as Record<string, unknown> | null;
  const campaign = row._campaigns as { name?: string } | null;
  const user = row._users as { display_name?: string; role?: string } | null;

  const deviceSummary = device
    ? `${device.os ?? 'Unknown'} / ${device.browser ?? 'Unknown'}`
    : 'Unknown';

  const deviceDetails: DeviceDetails | null = device
    ? {
        browser: (device.browser as string) ?? '',
        browserVersion: (device.browser_version as string) ?? '',
        os: (device.os as string) ?? '',
        osVersion: (device.os_version as string) ?? '',
        platform: (device.platform as string) ?? '',
        screenWidth: (device.screen_width as number) ?? 0,
        screenHeight: (device.screen_height as number) ?? 0,
        pixelRatio: (device.pixel_ratio as number) ?? 1,
        refreshRate: (device.refresh_rate as number) ?? 60,
        touchSupport: (device.touch_support as boolean) ?? false,
        pointerType: (device.pointer_type as string) ?? 'unknown',
        cpuCores: (device.cpu_cores as number) ?? 0,
        memoryGb: (device.memory_gb as number | null) ?? null,
        language: (device.language as string) ?? '',
        timezone: (device.timezone as string) ?? '',
        userAgent: (device.user_agent as string) ?? '',
        collectedAt: (device.collected_at as string) ?? '',
      }
    : null;

  return {
    sessionId: row.id as string,
    userId: row.user_id as string | null,
    userName: user?.display_name ?? 'Anonymous',
    userType: user?.role === 'guest' || !user?.role ? 'guest' : 'registered',
    campaignId: row.campaign_id as string | null,
    campaignName: campaign?.name ?? null,
    status: row.status as 'running' | 'paused',
    startedAt: new Date(row.created_at as string).getTime(),
    elapsed: Date.now() - new Date(row.created_at as string).getTime(),
    device: deviceSummary,
    platform: device?.platform as string ?? 'unknown',
    os: device?.os as string ?? 'Unknown',
    browser: device?.browser as string ?? 'Unknown',
    deviceDetails,
    country: null,
    city: null,
    currentRound,
    totalRounds: (row.measurements as { total_rounds?: number })?.total_rounds ?? 7,
    pluginId: row.plugin_id as string,
    source: metadata?.source ?? 'web-app',
    lastActivityAt: null,
    endedReason: null,
  } as LiveSession;
}

async function fetchActiveSessions(trigger: FetchTrigger = 'poll'): Promise<void> {
  if (fetchInFlight) {
    fetchPending = true;
    return;
  }
  fetchInFlight = true;
  const seq = ++requestSeq;
  markPollStart();
  const t0 = performance.now();
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('sessions')
      .select(`
        id, user_id, campaign_id, status, plugin_id, created_at, updated_at, finished_at, measurements, metadata,
        _devices:devices(
          browser, browser_version, os, os_version, platform,
          screen_width, screen_height, pixel_ratio, refresh_rate,
          touch_support, pointer_type, cpu_cores, memory_gb,
          language, timezone, user_agent, collected_at
        ),
        _campaigns:campaigns(name),
        _users:users(display_name, role)
      `)
      .in('status', ['running', 'paused'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) {
      markPollEnd(performance.now() - t0);
      emitDiagnosticLog({ service: 'live-sessions', action: 'fetch_active', durationMs: performance.now() - t0, status: 'error', errorCode: error?.code ?? 'EMPTY_RESULT', caller: 'live-sessions', trigger });
      return;
    }

    if (seq !== requestSeq) return;

    const newIds = new Set<string>();
    for (const row of data) {
      const session = mapRowToLiveSession(row as unknown as Record<string, unknown>);
      if (session) {
        newIds.add(session.sessionId);
        activeSessions.set(session.sessionId, session);
      }
    }

    for (const [id] of activeSessions) {
      if (!newIds.has(id)) {
        activeSessions.delete(id);
      }
    }

    const durationMs = performance.now() - t0;
    markPollEnd(durationMs);
    emitDiagnosticLog({ service: 'live-sessions', action: 'fetch_active', durationMs, status: 'ok', caller: 'live-sessions', trigger });
    notifyListeners();
  } catch {
    markPollEnd(performance.now() - t0);
    emitDiagnosticLog({ service: 'live-sessions', action: 'fetch_active', status: 'error', errorCode: 'THROWN', caller: 'live-sessions', trigger });
  } finally {
    fetchInFlight = false;
    if (fetchPending) {
      fetchPending = false;
      void fetchActiveSessions('coalesced');
    }
  }
}

export function subscribeToLiveSessions(listener: LiveSessionsListener): () => void {
  listeners.add(listener);
  setListenerCount(listeners.size);

  if (listeners.size === 1) {
    if (teardownTimer) {
      clearTimeout(teardownTimer);
      teardownTimer = null;
    }

    if (!channel) {
      fetchActiveSessions('initial');

      pollTimer = setInterval(() => fetchActiveSessions('poll'), 5000);

      try {
        const client = getSupabaseClient();
        channel = client
          .channel('live-sessions')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'sessions',
          }, () => {
            markRealtime(true);
            emitDiagnosticLog({ service: 'live-sessions', action: 'realtime_event', status: 'ok', caller: 'live-sessions', trigger: 'postgres_changes' });
            fetchActiveSessions('realtime_event');
          })
          .subscribe();
        markRealtime(true);
        emitDiagnosticLog({ service: 'live-sessions', action: 'realtime_subscribe', status: 'ok', caller: 'live-sessions', trigger: 'first_listener' });
      } catch {
        markRealtime(false);
        emitDiagnosticLog({ service: 'live-sessions', action: 'realtime_subscribe', status: 'error', errorCode: 'SUBSCRIBE_THREW', caller: 'live-sessions', trigger: 'first_listener' });
        // Realtime not available, polling fallback is active
      }
    }
  }

  listener(Array.from(activeSessions.values()));

  return () => {
    listeners.delete(listener);
    setListenerCount(listeners.size);
    if (listeners.size === 0) {
      if (teardownTimer) clearTimeout(teardownTimer);
      teardownTimer = setTimeout(() => {
        teardownTimer = null;
        if (listeners.size > 0) return;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
          markPollInactive();
        }
        if (channel) {
          channel.unsubscribe();
          markRealtime(false);
          channel = null;
        }
        activeSessions.clear();
        excludedReported.clear();
      }, TEARDOWN_DEBOUNCE_MS);
    }
  };
}

export function getActiveLiveSessions(): readonly LiveSession[] {
  return Array.from(activeSessions.values());
}

export function resetLiveSessions(): void {
  listeners.clear();
  setListenerCount(0);
  if (teardownTimer) {
    clearTimeout(teardownTimer);
    teardownTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    markPollInactive();
  }
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
  markRealtime(false);
  activeSessions.clear();
  excludedReported.clear();
  requestSeq = 0;
  fetchInFlight = false;
  fetchPending = false;
}
