import { getSupabaseClient } from './client';

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

let channel: ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | null = null;
let lastFetchedJson: string | null = null;
const activeSessions: Map<string, LiveSession> = new Map();
const listeners: Set<LiveSessionsListener> = new Set();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function notifyListeners() {
  const sessions = Array.from(activeSessions.values())
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const listener of listeners) {
    try { listener(sessions); } catch { /* ignore */ }
  }
}

function mapRowToLiveSession(row: Record<string, unknown>): LiveSession | null {
  if (row.status !== 'running' && row.status !== 'paused') return null;

  const measurements = row.measurements as { corrected_rts?: number[] } | null;
  const currentRound = measurements?.corrected_rts?.length ?? 0;
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

async function fetchActiveSessions(): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('sessions')
      .select(`
        id, user_id, campaign_id, status, plugin_id, created_at, updated_at, measurements, metadata,
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
      if (error) console.error({ code: error.code, message: error.message, details: error.details, hint: error.hint });
      return;
    }

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

    const json = JSON.stringify(Array.from(activeSessions.values()), null, 2);
    if (json !== lastFetchedJson) {
      lastFetchedJson = json;
    }

    notifyListeners();
  } catch {
    // silently ignore
  }
}

export function subscribeToLiveSessions(listener: LiveSessionsListener): () => void {
  listeners.add(listener);

  if (listeners.size === 1) {
    fetchActiveSessions();

    pollTimer = setInterval(fetchActiveSessions, 5000);

    try {
      const client = getSupabaseClient();
      channel = client
        .channel('live-sessions')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'sessions',
        }, () => {
          fetchActiveSessions();
        })
        .subscribe();
    } catch {
      // Realtime not available, polling fallback is active
    }
  }

  listener(Array.from(activeSessions.values()));

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (channel) {
        channel.unsubscribe();
        channel = null;
      }
      activeSessions.clear();
      lastFetchedJson = null;
    }
  };
}

export function getActiveLiveSessions(): readonly LiveSession[] {
  return Array.from(activeSessions.values());
}
