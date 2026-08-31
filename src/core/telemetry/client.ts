/**
 * FOCUS Telemetry — client (Phase T1).
 *
 * Contract (owner-approved 2026-08-31):
 *   - RPC-ONLY writes to `telemetry_events` via `record_telemetry_event`
 *     (server validation in 00057). The client NEVER writes the table directly.
 *   - FIRE-AND-FORGET & non-throwing: `track()` never rejects; a network
 *     failure can never affect app UX.
 *   - BATCHING: events flush on a 5s timer (or when the batch reaches 10, or on
 *     `pagehide`) to bound request volume. A bounded in-memory buffer caps
 *     memory; overflow is silently dropped (never blocking).
 *   - DEDUPE: an optional `dedupeKey` collapses repeated identical events
 *     within the current session (keyed in-memory); the server additionally
 *     enforces a partial-unique enforce via `dedupe_key`.
 *   - IDENTITY: `sessionId` = `crypto.randomUUID()` per page load; `anonymousId`
 *     = the non-PII `focus_vid_v1` visitor hash; `userId` = `auth.uid()` when a
 *     session exists. No raw route tokens/codes ever reach this layer.
 *   - PRIVACY: every event runs through `sanitizeEvent` (allowlist + forbidden
 *     keys) before enqueue; blocked content is dropped and never persisted.
 */
import { getSupabaseClient } from '../supabase/client';
import { getVisitorHash } from '../../services/intent-tracking';
import { sanitizeEvent } from './privacy';
import {
  getEventSchema,
  isTelemetryEventName,
} from './events';
import {
  TELEMETRY_MAX_BATCH,
  TELEMETRY_FLUSH_MS,
  TELEMETRY_MAX_BUFFER,
  TELEMETRY_RPC_NAME,
} from './types';import type {
  TelemetryEventInput,
  TelemetryWireRow,
  TelemetryProperties,
} from './types';

let enabled = true;

/** Test seam: true by default; tests may disable the network path. */
export function setTelemetryEnabled(value: boolean): void {
  enabled = value;
}

interface PendingEvent {
  readonly row: TelemetryWireRow;
  readonly dedupeKey: string | null;
}

let buffer: PendingEvent[] = [];
let dedupeKeys = new Set<string>();
let currentSessionId: string | null = null;
let timerHandle: ReturnType<typeof setTimeout> | null = null;

function randomEventId(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `te_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

/** Per-page-load session id (different concern from a scientific Session). */
export function getTelemetrySessionId(): string {
  if (!currentSessionId) currentSessionId = crypto.randomUUID();
  return currentSessionId;
}

/** Reset session id + buffer + dedupe set (test seam / manual privacy reset). */
export function resetTelemetry(): void {
  buffer = [];
  dedupeKeys = new Set();
  currentSessionId = null;
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
}

async function currentUserId(): Promise<string | null> {
  try {
    const client = getSupabaseClient();
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Public API — enqueue a telemetry event. Fire-and-forget: never throws.
 * Any privacy violation is dropped at the boundary and never sent.
 */
export async function track(input: TelemetryEventInput): Promise<void> {
  if (!enabled) return;
  try {
    if (!isTelemetryEventName(input.event)) return;

    // 1) privacy gate (closed allowlist + forbidden keys)
    const clean = sanitizeEvent(input);
    if (clean.blocked) return; // blocked content is NOT persisted

    // 2) dedupe within session
    if (input.dedupeKey) {
      if (dedupeKeys.has(input.dedupeKey)) return;
      dedupeKeys.add(input.dedupeKey);
    }

    const schema = getEventSchema(input.event);
    const now = new Date();
    const row: TelemetryWireRow = {
      event_id: randomEventId(),
      event_name: input.event,
      event_version: schema.version,
      domain: schema.domain,
      occurred_at: now.toISOString(),
      session_id: getTelemetrySessionId(),
      anonymous_id: getVisitorHash(),
      user_id: await currentUserId(),
      screen: input.screen ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      properties: clean.properties as TelemetryProperties,
      context: input.context ?? null,
      dedupe_key: input.dedupeKey ?? null,
    };

    buffer.push({ row, dedupeKey: input.dedupeKey ?? null });
    ensureScheduled();
    enforceBufferCap();

    if (buffer.length >= TELEMETRY_MAX_BATCH) {
      void flushNow();
    }
  } catch {
    // fire-and-forget — a telemetry failure can never break app UX
  }
}

/** Bounded in-memory buffering: if the queue ever exceeds the cap (e.g. the
 *  flush RPC is unavailable for a long stretch), drop the OLDEST events so
 *  memory stays bounded and the app is never blocked. Fresh events win. */
function enforceBufferCap(): void {
  const overflow = buffer.length - TELEMETRY_MAX_BUFFER;
  if (overflow > 0) {
    buffer.splice(0, overflow);
  }
}

function ensureScheduled(): void {
  if (timerHandle) return;
  timerHandle = setTimeout(() => {
    timerHandle = null;
    void flushNow();
  }, TELEMETRY_FLUSH_MS);
}

/** Flush the buffer to the RPC (RPC-only). Never throws to the caller. */
export async function flushNow(): Promise<void> {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  if (!enabled || buffer.length === 0) return;
  if (!navigator.onLine) {
    // Offline: drop to bound memory (telemetry is non-critical). Keeps the
    // contract non-blocking; domain-facing data already has its own sync path.
    buffer = [];
    return;
  }
  const batch = buffer;
  buffer = [];
  try {
    const client = getSupabaseClient();
    const payload = batch.map((b) => b.row);
    const { error } = await client.rpc(TELEMETRY_RPC_NAME, {
      p_events: payload,
    });
    if (error) {
      // Fire-and-forget: a rejected batch is dropped, never retried blocking.
    }
  } catch {
    // Fire-and-forget
  }
}

// Flush remaining buffered events when the page is being hidden/navigated.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushNow();
  });
}

export type { TelemetryEventInput } from './types';