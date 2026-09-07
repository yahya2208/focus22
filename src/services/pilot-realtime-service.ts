/**
 * Neighborhood Pilot — order realtime feed (GATE 6, reliability layer).
 *
 * Realtime is NOTIFICATION, never authority: the authoritative state is the
 * DB row (orders.status) and the timeline lives in order_status_history
 * (00079). This module attaches a postgres_changes subscription scoped by
 * RLS (the subscriber only receives rows they can SELECT), and provides a
 * bounded fallback: after a degraded window the feed switches to interval
 * polling, restores to live when the channel reports SUBSCRIBED again, and
 * exposes a stale flag derived from the last successful sync. Payload
 * deduplication drops repeated deliveries of the same row version.
 */
import { getSupabaseClient } from '../core/supabase/client';

/** Type of the subscription object returned by supabase.client.channel(...). */
export type PilotRealtimeChannel = ReturnType<ReturnType<typeof getSupabaseClient>['channel']>;

export type PilotRealtimeTable = 'orders' | 'order_status_history';

export type PilotRealtimeFeedStatus = 'idle' | 'connecting' | 'live' | 'fallback' | 'stopped';

export interface PilotRealtimePayload {
  readonly eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  readonly schema: string;
  readonly table: string;
  readonly newRecord: Record<string, unknown> | null;
  readonly oldRecord: Record<string, unknown> | null;
}

export interface PilotOrderRealtimeOptions {
  readonly table: PilotRealtimeTable;
  /** Realtime filter, e.g. 'user_id=eq.<uid>' or 'store_id=eq.<storeId>'. Empty = all rows the role may SELECT. */
  readonly filter?: string;
  readonly onPayload?: (payload: PilotRealtimePayload) => void;
  readonly onStatus?: (status: PilotRealtimeFeedStatus) => void;
  /** Fallback poll interval (default 30s). */
  readonly pollIntervalMs?: number;
  /** Max degraded (non-SUBSCRIBED) observations before entering fallback (default 3). */
  readonly maxDegradedBeforeFallback?: number;
  /** A row version is considered stale when no successful sync happened in this window (default 45s). */
  readonly staleAfterMs?: number;
  readonly channelPrefix?: string;
  /** Optional fetcher invoked by the bounded fallback poller; resolves on success. */
  readonly onPollFetch?: () => Promise<void>;
}

const DEFAULT_POLL_MS = 30_000;
const DEFAULT_STALE_MS = 45_000;
const DEFAULT_MAX_DEGRADED = 3;

export interface PilotOrderRealtime {
  start(): void;
  stop(): void;
  getStatus(): PilotRealtimeFeedStatus;
  isStale(): boolean;
  /** Manually trigger the fallback refresh cycle (used by screens on retry / mount). */
  refreshNow(): void;
  readonly lastSyncAt: number | null;
}

export function createPilotOrderRealtime(options: PilotOrderRealtimeOptions): PilotOrderRealtime {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS;
  const maxDegraded = options.maxDegradedBeforeFallback ?? DEFAULT_MAX_DEGRADED;
  const channelName = `${options.channelPrefix ?? 'pilot-order-feed'}-${options.table}${
    options.filter ? `-${encodeURIComponent(options.filter)}` : ''
  }`;

  let status: PilotRealtimeFeedStatus = 'idle';
  let channel: PilotRealtimeChannel | null = null;
  let degraded = 0;
  let lastSyncAt: number | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let started = false;

  const seen = new Map<string, string>();

  function setStatus(next: PilotRealtimeFeedStatus): void {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  }

  function markSync(): void {
    lastSyncAt = Date.now();
  }

  function recordPayload(payload: PilotRealtimePayload): void {
    const id = String(payload.newRecord?.id ?? payload.oldRecord?.id ?? '');
    const version = String(payload.newRecord?.updated_at ?? payload.newRecord?.created_at ?? '');
    if (payload.eventType === 'DELETE') {
      if (id) seen.delete(`${payload.table}:${id}`);
    } else {
      const key = `${payload.table}:${id}`;
      if (version !== '' && seen.get(key) === version) {
        // Duplicate delivery of the same row version — drop it.
        return;
      }
      if (version !== '') seen.set(key, version);
    }
    markSync();
    options.onPayload?.(payload);
  }

  function startPolling(): void {
    if (pollTimer || !options.onPollFetch) return;
    pollTimer = setInterval(() => {
      void options
        .onPollFetch?.()
        .then(markSync)
        .catch(() => undefined);
    }, pollIntervalMs);
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function observeDegraded(): void {
    degraded += 1;
    if (degraded >= maxDegraded) {
      setStatus('fallback');
      startPolling();
    }
  }

  function onChannelStatus(next: string): void {
    if (next === 'SUBSCRIBED') {
      degraded = 0;
      stopPolling();
      markSync();
      if (started && status !== 'live') setStatus('live');
      return;
    }
    // CHANNEL_ERROR / TIMED_OUT / CLOSED — the client keeps rejoining; we
    // bound the user-facing fallback without taking over the socket.
    if (started && status !== 'stopped' && status !== 'fallback') {
      observeDegraded();
    }
  }

  function onPayload(payload: Record<string, unknown>): void {
    recordPayload({
      eventType: (payload.eventType as PilotRealtimePayload['eventType']) ?? 'UPDATE',
      schema: String(payload.schema ?? 'public'),
      table: String(payload.table ?? options.table),
      newRecord: (payload.new as Record<string, unknown> | null) ?? null,
      oldRecord: (payload.old as Record<string, unknown> | null) ?? null,
    });
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      lastSyncAt = null;
      seen.clear();
      degraded = 0;
      setStatus('connecting');
      channel = getSupabaseClient()
        .channel(channelName)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: options.table,
          filter: options.filter || undefined,
        }, (payload: Record<string, unknown>) => onPayload(payload))
        .subscribe((chanStatus) => onChannelStatus(chanStatus));
    },

    stop(): void {
      started = false;
      stopPolling();
      if (channel) {
        try {
          channel.unsubscribe();
        } catch {
          // never throw from stop
        }
        channel = null;
      }
      setStatus('stopped');
    },

    getStatus: () => status,

    isStale(): boolean {
      if (status === 'live') return false;
      if (status === 'stopped' || status === 'idle') return false;
      return lastSyncAt !== null && Date.now() - lastSyncAt > staleAfterMs;
    },

    refreshNow(): void {
      markSync();
      void options.onPollFetch?.().then(markSync).catch(() => undefined);
    },

    get lastSyncAt() {
      return lastSyncAt;
    },
  };
}