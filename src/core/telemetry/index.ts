import type { AnalyticsEventType } from '../analytics/events';

export type TelemetryEventType = AnalyticsEventType;

export interface TelemetryEvent {
  readonly type: TelemetryEventType;
  readonly properties: Record<string, unknown>;
  readonly timestamp: number;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly deviceId: string | null;
  readonly campaignId: string | null;
  readonly placementId: string | null;
}

export interface TelemetryConfig {
  readonly enabled: boolean;
  readonly flushIntervalMs: number;
  readonly batchSize: number;
}

const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  flushIntervalMs: 30000,
  batchSize: 20,
};

export interface TelemetryService {
  track(type: TelemetryEventType, properties?: Record<string, unknown>): void;
  flush(): Promise<void>;
  getQueue(): readonly TelemetryEvent[];
  setConfig(config: Partial<TelemetryConfig>): void;
  getConfig(): TelemetryConfig;
  setContext(userId: string | null, sessionId: string | null, deviceId: string | null, campaignId?: string | null, placementId?: string | null): void;
  setUserId(userId: string | null): void;
  setDeviceId(deviceId: string | null): void;
  setCampaignId(campaignId: string | null): void;
  setPlacementId(placementId: string | null): void;
}

export function createTelemetryService(
  sendFn?: (events: readonly TelemetryEvent[]) => Promise<void>,
  config: Partial<TelemetryConfig> = {},
): TelemetryService {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let queue: TelemetryEvent[] = [];
  let context = { userId: null as string | null, sessionId: null as string | null, deviceId: null as string | null, campaignId: null as string | null, placementId: null as string | null };

  async function flushInternal(): Promise<void> {
    if (queue.length === 0) return;
    const batch = [...queue];
    queue = [];
    if (sendFn) {
      try {
        await sendFn(batch);
      } catch {
        queue = [...batch, ...queue];
      }
    }
  }

  return {
    track(type: TelemetryEventType, properties: Record<string, unknown> = {}): void {
      if (!mergedConfig.enabled) return;
      const event: TelemetryEvent = {
        type,
        properties,
        timestamp: Date.now(),
        userId: context.userId,
        sessionId: context.sessionId,
        deviceId: context.deviceId,
        campaignId: context.campaignId,
        placementId: context.placementId,
      };
      queue.push(event);
      if (queue.length >= mergedConfig.batchSize) {
        flushInternal();
      }
    },

    async flush(): Promise<void> {
      await flushInternal();
    },

    getQueue(): readonly TelemetryEvent[] {
      return [...queue];
    },

    setConfig(config: Partial<TelemetryConfig>): void {
      Object.assign(mergedConfig, config);
    },

    getConfig(): TelemetryConfig {
      return { ...mergedConfig };
    },

    setContext(userId: string | null, sessionId: string | null, deviceId: string | null, campaignId: string | null = null, placementId: string | null = null): void {
      context = { userId, sessionId, deviceId, campaignId, placementId };
    },
    setUserId(userId: string | null): void {
      context = { ...context, userId };
    },
    setDeviceId(deviceId: string | null): void {
      context = { ...context, deviceId };
    },
    setCampaignId(campaignId: string | null): void {
      context = { ...context, campaignId };
    },
    setPlacementId(placementId: string | null): void {
      context = { ...context, placementId };
    },
  };
}

let globalTelemetry: TelemetryService | null = null;

/**
 * P3 Stop-Write (مسار الخصوصية، 2026-08-07):
 * telemetry معطّل افتراضياً وبلا أي مُرسِل إلى Supabase — حتى لو بقي أي
 * استدعاء track() في أي component/hook/service، فلن يُكتب analytics_events.
 */
function createDisabledTelemetry(): TelemetryService {
  return createTelemetryService(undefined, { enabled: false, flushIntervalMs: 30000, batchSize: 20 });
}

export async function initGlobalTelemetry(): Promise<void> {
  globalTelemetry = createDisabledTelemetry();
}

export function getGlobalTelemetry(): TelemetryService {
  if (!globalTelemetry) {
    globalTelemetry = createDisabledTelemetry();
  }
  return globalTelemetry;
}

export function resetGlobalTelemetry(): void {
  if (globalTelemetry) {
    globalTelemetry.flush();
  }
  globalTelemetry = null;
}
