export type TelemetryEventType =
  | 'app_opened'
  | 'calibration_started'
  | 'calibration_completed'
  | 'game_started'
  | 'game_completed'
  | 'game_abandoned'
  | 'results_viewed'
  | 'session_saved'
  | 'session_synced'
  | 'auth_guest_created'
  | 'auth_registered'
  | 'auth_converted'
  | 'settings_changed'
  | 'qr_scanned'
  | 'error_occurred'
  | 'landing_loaded'
  | 'registration_prompt'
  | 'registration_completed'
  | 'guest_converted'
  | 'share_clicked'
  | 'qr_generated'
  | 'campaign_detected'
  | 'referral_clicked'
  | 'consent_granted'
  | 'consent_withdrawn'
  | 'game_intro_shown'
  | 'register_cta_clicked'
  | 'qr_game_completed';

export interface TelemetryEvent {
  readonly type: TelemetryEventType;
  readonly properties: Record<string, unknown>;
  readonly timestamp: number;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly deviceId: string | null;
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
  setContext(userId: string | null, sessionId: string | null, deviceId: string | null): void;
}

export function createTelemetryService(
  sendFn?: (events: readonly TelemetryEvent[]) => Promise<void>,
  config: Partial<TelemetryConfig> = {},
): TelemetryService {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let queue: TelemetryEvent[] = [];
  let context = { userId: null as string | null, sessionId: null as string | null, deviceId: null as string | null };

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

    setContext(userId: string | null, sessionId: string | null, deviceId: string | null): void {
      context = { userId, sessionId, deviceId };
    },
  };
}

let globalTelemetry: TelemetryService | null = null;
let supabaseSendFn: ((events: readonly TelemetryEvent[]) => Promise<void>) | null = null;

async function createSupabaseSendFn(): Promise<(events: readonly TelemetryEvent[]) => Promise<void>> {
  if (supabaseSendFn) return supabaseSendFn;
  
  try {
    const { getDataService } = await import('../supabase/data-service');
    const dataService = getDataService();
    
    supabaseSendFn = async (events: readonly TelemetryEvent[]) => {
      for (const event of events) {
        await dataService.trackEvent({
          user_id: event.userId ?? undefined,
          session_id: event.sessionId ?? undefined,
          event_type: event.type,
          event_data: event.properties,
          device_id: event.deviceId ?? undefined,
          user_agent: navigator.userAgent,
        });
      }
    };
  } catch {
    supabaseSendFn = async () => {};
  }
  
  return supabaseSendFn;
}

export async function initGlobalTelemetry(): Promise<void> {
  const sendFn = await createSupabaseSendFn();
  globalTelemetry = createTelemetryService(sendFn, { flushIntervalMs: 5000, batchSize: 5 });
}

export function getGlobalTelemetry(): TelemetryService {
  if (!globalTelemetry) {
    globalTelemetry = createTelemetryService();
    // Async init - will start sending to Supabase once ready
    initGlobalTelemetry().catch(() => {});
  }
  return globalTelemetry;
}

export function resetGlobalTelemetry(): void {
  if (globalTelemetry) {
    globalTelemetry.flush();
  }
  globalTelemetry = null;
}
