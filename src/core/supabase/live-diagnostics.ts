import { emitLog, recentEvents, resetStructuredLog, type StructuredEvent } from '../obs/structured-log';

export interface LiveDiagnostics {
  readonly realtimeConnected: boolean;
  readonly pollActive: boolean;
  readonly heartbeatActive: boolean;
  readonly lastPollAt: number | null;
  readonly lastPollDurationMs: number | null;
  readonly lastRealtimeAt: number | null;
  readonly lastNotifyAt: number | null;
  readonly lastPatchAt: number | null;
  readonly lastRenderAt: number | null;
  readonly lastHeartbeatAt: number | null;
  readonly listenerCount: number;
  readonly runningCount: number;
  readonly completedCount: number;
  readonly events: readonly StructuredEvent[];
}

const state = {
  realtimeConnected: false,
  pollActive: false,
  heartbeatActive: false,
  lastPollAt: null as number | null,
  lastPollDurationMs: null as number | null,
  lastRealtimeAt: null as number | null,
  lastNotifyAt: null as number | null,
  lastPatchAt: null as number | null,
  lastRenderAt: null as number | null,
  lastHeartbeatAt: null as number | null,
  listenerCount: 0,
  completedCount: 0,
};

export function markPollStart(): void {
  state.pollActive = true;
  state.lastPollAt = performance.now();
}

export function markPollEnd(durationMs: number): void {
  state.lastPollDurationMs = durationMs;
}

export function markPollInactive(): void {
  state.pollActive = false;
}

export function markRealtime(connected: boolean): void {
  state.realtimeConnected = connected;
  state.lastRealtimeAt = performance.now();
}

export function markNotify(): void {
  state.lastNotifyAt = performance.now();
}

export function markPatch(): void {
  state.lastPatchAt = performance.now();
}

export function markRender(): void {
  state.lastRenderAt = performance.now();
}

export function markHeartbeat(active: boolean): void {
  state.heartbeatActive = active;
  if (active) state.lastHeartbeatAt = performance.now();
}

export function markCompleted(): void {
  state.completedCount += 1;
}

export function setListenerCount(count: number): void {
  state.listenerCount = count;
}

export function getLiveDiagnostics(runningCount: number): LiveDiagnostics {
  return {
    realtimeConnected: state.realtimeConnected,
    pollActive: state.pollActive,
    heartbeatActive: state.heartbeatActive,
    lastPollAt: state.lastPollAt,
    lastPollDurationMs: state.lastPollDurationMs,
    lastRealtimeAt: state.lastRealtimeAt,
    lastNotifyAt: state.lastNotifyAt,
    lastPatchAt: state.lastPatchAt,
    lastRenderAt: state.lastRenderAt,
    lastHeartbeatAt: state.lastHeartbeatAt,
    listenerCount: state.listenerCount,
    runningCount,
    completedCount: state.completedCount,
    events: recentEvents(),
  };
}

export function resetRuntimeDiagnostics(): void {
  state.realtimeConnected = false;
  state.pollActive = false;
  state.heartbeatActive = false;
  state.lastPollAt = null;
  state.lastPollDurationMs = null;
  state.lastRealtimeAt = null;
  state.lastNotifyAt = null;
  state.lastPatchAt = null;
  state.lastRenderAt = null;
  state.lastHeartbeatAt = null;
  state.listenerCount = 0;
  state.completedCount = 0;
  resetStructuredLog();
}

export function emitDiagnosticLog(input: {
  readonly service: string;
  readonly action: string;
  readonly durationMs?: number;
  readonly status?: 'ok' | 'error' | 'skipped';
  readonly errorCode?: string;
  readonly caller?: string;
  readonly trigger?: string;
  readonly sessionId?: string;
  readonly detail?: string;
}): StructuredEvent {
  return emitLog(input);
}
