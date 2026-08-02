import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { PersistenceProvider, resetPersistenceCache } from '../../core/supabase/PersistenceProvider';
import { createSupabaseClientForTest, getSupabaseClient, resetSupabaseClient } from '../../core/supabase/client';
import { subscribeToLiveSessions, resetLiveSessions, type LiveSession } from '../../core/supabase/live-sessions';
import { getGlobalSessionService, resetGlobalSessionService, type SessionResults } from '../../core/session/service';
import { LiveDashboard } from '../../research-console/pages/live/LiveDashboard';

const SESSION_ID = 'rt-contract-0001';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const DEVICE_ID = '22222222-2222-2222-2222-222222222222';
const CAL_ID = '33333333-3333-3333-3333-333333333333';
const PLAYER = 'RTLatencyPlayer';

interface FakeSupabase {
  readonly realtimeHandlers: Array<(payload?: unknown) => void>;
  readonly patchedAt: () => number | null;
  readonly setDbStatus: (s: 'running' | 'completed') => void;
  readonly dbStatus: () => string;
}

function installFakeSupabase(): FakeSupabase {
  resetSupabaseClient();
  createSupabaseClientForTest();
  const client = getSupabaseClient();

  const state = { status: 'idle' as string, exists: false, updatedAt: new Date().toISOString() };
  let patchMark: number | null = null;
  const realtimeHandlers: Array<(payload?: unknown) => void> = [];

  const sessionRow = () => ({
    id: SESSION_ID,
    user_id: USER_ID,
    campaign_id: null,
    plugin_id: 'focus-test',
    status: state.status,
    created_at: state.updatedAt,
    updated_at: state.updatedAt,
    measurements: { corrected_rts: [250, 260, 270, 280, 290, 300, 310], total_rounds: 7 },
    metadata: { source: 'web-app' },
    _devices: null,
    _campaigns: null,
    _users: { display_name: PLAYER, role: 'guest' },
  });

  vi.spyOn(client, 'from').mockImplementation(((table: string) => {
    const mods: { inVals?: unknown[]; lt?: { col: string; val: string }; limit?: number } = {};
    const f: Record<string, unknown> = {};

    Object.defineProperty(f, 'data', {
      get: () => {
        if (table === 'sessions') {
          if (!state.exists) return [];
          if (mods.lt) {
            const cutoff = new Date(mods.lt.val).getTime();
            if (new Date(state.updatedAt).getTime() >= cutoff) return [];
          }
          if (mods.inVals && !mods.inVals.includes(state.status)) return [];
          return [sessionRow()];
        }
        return [];
      },
    });
    Object.defineProperty(f, 'error', { get: () => null });
    Object.defineProperty(f, 'count', { get: () => undefined });

    (f as Record<string, unknown>).select = () => f;
    (f as Record<string, unknown>).eq = () => f;
    (f as Record<string, unknown>).in = (_col: string, vals: unknown[]) => { mods.inVals = vals; return f; };
    (f as Record<string, unknown>).gte = () => f;
    (f as Record<string, unknown>).lte = () => f;
    (f as Record<string, unknown>).lt = (col: string, val: string) => { mods.lt = { col, val }; return f; };
    (f as Record<string, unknown>).order = () => f;
    (f as Record<string, unknown>).limit = (n: number) => { mods.limit = n; return f; };
    (f as Record<string, unknown>).maybeSingle = async () => {
      if (table === 'devices' || table === 'calibrations') return { data: null, error: null };
      return { data: state.exists && state.status === 'running' ? sessionRow() : null, error: null };
    };
    (f as Record<string, unknown>).single = async () => {
      if (table === 'devices') return { data: { id: DEVICE_ID }, error: null };
      if (table === 'calibrations') return { data: { id: CAL_ID }, error: null };
      return { data: sessionRow(), error: null };
    };
    (f as Record<string, unknown>).insert = (row: { status?: string }) => {
      if (row?.status) { state.status = row.status; state.exists = true; }
      return f;
    };
    (f as Record<string, unknown>).upsert = (row: { status?: string }) => {
      patchMark = performance.now();
      if (row?.status) { state.status = row.status; state.exists = true; }
      return f;
    };
    (f as Record<string, unknown>).update = (patch: { status?: string; updated_at?: string }) => {
      if (patch?.status) state.status = patch.status;
      if (patch?.updated_at) state.updatedAt = patch.updated_at;
      return f;
    };
    (f as Record<string, unknown>).delete = () => f;
    return f as never;
  }) as never);

  vi.spyOn(client, 'channel').mockImplementation((() => {
    const ch: Record<string, unknown> = {
      on: (_e: string, _o: unknown, cb: (payload?: unknown) => void) => { realtimeHandlers.push(cb); return ch; },
      subscribe: () => ch,
      unsubscribe: () => undefined,
    };
    return ch as never;
  }) as never);

  vi.spyOn(client.auth, 'getUser').mockResolvedValue({ data: { user: { id: USER_ID } }, error: null } as never);
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null } as never);

  return {
    realtimeHandlers,
    patchedAt: () => patchMark,
    setDbStatus: (s) => { state.status = s; state.exists = true; },
    dbStatus: () => state.status,
  };
}

const makeResults = (): SessionResults => ({
  rawRts: [251, 262, 273, 284, 295, 306, 317],
  correctedRts: [250, 260, 270, 280, 290, 300, 310],
  totalRounds: 7,
  validRounds: 7,
  calibration: { refreshRate: 60, displayLagMs: 16.667, inputLagMs: 8, confidence: 0.5, platform: 'test', timestamp: Date.now() },
  sessionStart: Date.now() - 60_000,
  sessionEnd: Date.now(),
});

async function waitUntil(cond: () => boolean, timeoutMs: number, onTick?: () => void): Promise<number> {
  const t0 = performance.now();
  for (;;) {
    if (cond()) return performance.now();
    onTick?.();
    if (performance.now() - t0 > timeoutMs) throw new Error(`waitUntil timeout (${timeoutMs}ms)`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

afterEach(() => {
  cleanup();
  resetLiveSessions();
  resetPersistenceCache();
  resetGlobalSessionService();
  resetSupabaseClient();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Live ≤10s contract — Runtime Evidence', () => {
  it('round7→completeSession→PATCH→realtime→dashboard removal', async () => {
    const fake = installFakeSupabase();
    const service = getGlobalSessionService();

    render(
      <PersistenceProvider>
        <LiveDashboard />
      </PersistenceProvider>,
    );

    // 1) Start the game (GameScreen: startSession)
    const sessionId = service.startSession({ gameMode: 'focus', campaignId: null });
    // wait until handleSessionCreated's insert committed (status running)
    await waitUntil(() => fake.dbStatus() === 'running', 5000);
    act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); }); // realtime: running row inserted

    // Player appears on the Live Dashboard
    await waitUntil(() => screen.queryByText(PLAYER) !== null, 5000);
    expect(screen.getByText(PLAYER)).toBeTruthy();
    expect(screen.getByText('running')).toBeTruthy();

    // Direct observer for precise removal timing
    let observed: readonly LiveSession[] = [];
    const unsub = subscribeToLiveSessions((s) => { observed = s; });

    const tRound7 = performance.now();
    // 2) Round 7 finished -> GameScreen calls completeSession
    service.completeSession(sessionId, makeResults());

    // Wait until the PATCH (upsert) was issued, then resolved
    await waitUntil(() => fake.patchedAt() !== null, 5000);
    const tPatchIssued = fake.patchedAt() ?? performance.now();
    await new Promise((r) => setTimeout(r, 0)); // let the upsert await resolve
    const tPatchDone = performance.now();

    const tRealtime = performance.now();
    act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); }); // server realtime -> postgres_changes -> refetch

    const tRemoved = await waitUntil(() => !observed.some((s) => s.sessionId === sessionId), 5000);
    const tUi = await waitUntil(() => screen.queryByText(PLAYER) === null, 5000);

    const row: Array<{ event: string; ms: number }> = [
      { event: 'round7 finished', ms: 0 },
      { event: 'completeSession() fired', ms: 0 },
      { event: 'PATCH issued (upsert)', ms: tPatchIssued - tRound7 },
      { event: 'PATCH resolved (DB completed)', ms: tPatchDone - tRound7 },
      { event: 'realtime handler invoked', ms: tRealtime - tRound7 },
      { event: 'session removed from live map', ms: tRemoved - tRound7 },
      { event: 'dashboard re-rendered (player gone)', ms: tUi - tRound7 },
    ];
    console.log('=== LIVE CONTRACT TIMESTAMPS (client pipeline) ===');
    console.table(row);
    const removalLatency = tRemoved - tRound7;
    const uiLatency = tUi - tRound7;
    console.log(`Removal latency (map)     = ${removalLatency.toFixed(1)}ms  (contract bound 10000ms)`);
    console.log(`Removal latency (UI)      = ${uiLatency.toFixed(1)}ms  (contract bound 10000ms)`);
    console.log(`PATCH->removed (network+realtime delta) = ${(tRemoved - tPatchDone).toFixed(1)}ms`);

    expect(removalLatency).toBeLessThan(10_000);
    expect(uiLatency).toBeLessThan(10_000);
    expect(removalLatency).toBeLessThan(5_000);
    expect(uiLatency).toBeLessThan(5_000);

    unsub();
  });

  it('poll fallback: with realtime disabled, 5s poll still removes within bound', async () => {
    vi.useFakeTimers();
    const fake = installFakeSupabase();
    const service = getGlobalSessionService();

    render(
      <PersistenceProvider>
        <LiveDashboard />
      </PersistenceProvider>,
    );

    const flush = async () => { for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(0); };
    await flush();

    const sessionId = service.startSession({ gameMode: 'focus', campaignId: null });
    await flush(); // insert committed
    act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); });
    await flush();

    expect(screen.queryByText(PLAYER)).toBeTruthy();

    // Round 7 finished, but realtime is NEVER delivered (handler never invoked again).
    service.completeSession(sessionId, makeResults());
    await flush();
    expect(fake.dbStatus()).toBe('completed');

    // Session still visible before the 5s poll fires
    await act(async () => { await vi.advanceTimersByTimeAsync(4_900); });
    expect(screen.queryByText(PLAYER)).toBeTruthy();

    // The 5s poll fires -> refetch -> removal
    const tPollFire = performance.now();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.queryByText(PLAYER)).toBeNull();
    console.log(`=== POLL FALLBACK === removed via 5s poll at +${(performance.now() - tPollFire).toFixed(1)}ms after poll window`);

    vi.useRealTimers();
  });
});
