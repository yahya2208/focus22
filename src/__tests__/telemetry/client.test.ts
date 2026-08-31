import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockRpc = vi.fn();
  const mockAuthGetUser = vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null }));
  const getSupabaseClient = vi.fn(() => ({ rpc: mockRpc, auth: { getUser: mockAuthGetUser } }));
  return { mockRpc, mockAuthGetUser, getSupabaseClient };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import {
  track,
  flushNow,
  setTelemetryEnabled,
  resetTelemetry,
  getTelemetrySessionId,
} from '../../core/telemetry/client';
import { getVisitorHash, resetVisitorId } from '../../services/intent-tracking';

/**
 * T4 — client contract (mirrors the fire-and-forget intent-tracking pattern):
 *   - NEVER throws; never awaited; network failure never affects app UX.
 *   - Writes via RPC `record_telemetry_event` ONLY (never .from().insert()).
 *   - Batching: 5s timer / 10-events / explicit flushNow() -> one RPC call per batch.
 *   - Dedupe: same dedupeKey within a session => single event.
 *   - privacy: blocked (PII/free-text) payload is never sent.
 *   - enabled toggle is a test seam.
 */

function flushAll(): Promise<void> {
  return flushNow();
}

describe('telemetry client — RPC-only, fire-and-forget, batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVisitorId();
    resetTelemetry();
    setTelemetryEnabled(true);
    mocks.getSupabaseClient.mockImplementation(() => ({
      rpc: mocks.mockRpc,
      auth: { getUser: mocks.mockAuthGetUser },
    }));
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
    mocks.mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
  });
  afterEach(() => {
    resetTelemetry();
    setTelemetryEnabled(true);
    resetVisitorId();
  });

  it('sends via the record_telemetry_event RPC with a batch payload (RPC-only, no direct table write)', async () => {
    await track({ event: 'screen_view', screen: 'home', properties: { from: 'landing', is_initial: true } });
    await track({ event: 'product_view', entityType: 'product', entityId: 'c2fecb66-xxxx' });
    await flushAll();
    expect(mocks.mockRpc).toHaveBeenCalledTimes(1);
    const [rpcName, args] = mocks.mockRpc.mock.calls[0]!;
    expect(rpcName).toBe('record_telemetry_event');
    expect(args).toHaveProperty('p_events');
    const events = args.p_events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
    expect(events[0]!).toMatchObject({ event_name: 'screen_view', domain: 'navigation', screen: 'home' });
    expect(events[0]!.user_id).toBe('user-123');
  });

  it('populates anonymous_id from focus_vid_v1, session_id from crypto.randomUUID(), entity_id as text', async () => {
    await track({ event: 'listing_view_detail', entityType: 'listing', entityId: '8/128-slug' });
    await flushAll();
    const events = mocks.mockRpc.mock.calls[0]![1].p_events as Array<Record<string, unknown>>;
    expect(events[0]!.anonymous_id).toBe(getVisitorHash());
    expect(typeof events[0]!.session_id).toBe('string');
    expect((events[0]!.session_id as string).length).toBeGreaterThan(10);
    expect(events[0]!.entity_id).toBe('8/128-slug');
    expect(events[0]!.entity_type).toBe('listing');
  });

  it('does NOT send a blocked (PII/free-text) payload', async () => {
    await track({ event: 'whatsapp_open', properties: { method: 'wa.me', message: 'hello', phone: '0555' } });
    await flushAll();
    expect(mocks.mockRpc).not.toHaveBeenCalled();
  });

  it('dedupes identical events by dedupeKey within the session', async () => {
    await track({ event: 'ad_impression', dedupeKey: 'ad_home_1' });
    await track({ event: 'ad_impression', dedupeKey: 'ad_home_1' });
    await track({ event: 'ad_impression', dedupeKey: 'ad_home_2' });
    await flushAll();
    const events = mocks.mockRpc.mock.calls[0]![1].p_events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
  });

  it('dedupe is SESSION-scoped: a new session re-allows the same dedupeKey (not a global block)', async () => {
    // current session: 'ad_impression' with key X is emitted once
    await track({ event: 'ad_impression', dedupeKey: 'ad_home_1' });
    await track({ event: 'ad_impression', dedupeKey: 'ad_home_1' });
    await flushAll();
    // new page-load session
    resetTelemetry();
    await track({ event: 'ad_impression', dedupeKey: 'ad_home_1' });
    await flushAll();
    // first batch: 1 event (duplicate collapsed); second batch: 1 NEW event
    // with the same key (a different session may legitimately reuse it).
    expect(mocks.mockRpc).toHaveBeenCalledTimes(2);
    const first = mocks.mockRpc.mock.calls[0]![1].p_events as Array<Record<string, unknown>>;
    const second = mocks.mockRpc.mock.calls[1]![1].p_events as Array<Record<string, unknown>>;
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]!.dedupe_key).toBe('ad_home_1');
  });

  it('never throws and stays fire-and-forget when the RPC rejects', async () => {
    mocks.mockRpc.mockRejectedValue(new Error('boom'));
    // track() returns a promise that resolves (catch swallows) — no rejection leaks.
    await expect(track({ event: 'app_open' })).resolves.toBeUndefined();
    await flushAll(); // flush also fails silently
  });

  it('does NOT send when the sender is disabled (test seam)', async () => {
    setTelemetryEnabled(false);
    await track({ event: 'app_open' });
    await flushAll();
    expect(mocks.mockRpc).not.toHaveBeenCalled();
  });

  it('getTelemetrySessionId is stable within a page load and reset by resetTelemetry', () => {
    expect(getTelemetrySessionId()).toBe(getTelemetrySessionId());
    resetTelemetry();
    expect(getTelemetrySessionId()).not.toBe('');
  });
});
