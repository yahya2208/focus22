import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { PersistenceProvider, resetPersistenceCache } from '../../core/supabase/PersistenceProvider';
import { createSupabaseClientForTest, getSupabaseClient, resetSupabaseClient } from '../../core/supabase/client';
import { subscribeToLiveSessions, getActiveLiveSessions, resetLiveSessions } from '../../core/supabase/live-sessions';
import { getLiveDiagnostics, resetRuntimeDiagnostics } from '../../core/supabase/live-diagnostics';
import { getGlobalSessionService, resetGlobalSessionService, type SessionResults } from '../../core/session/service';
import { LiveDashboard } from '../../research-console/pages/live/LiveDashboard';

const SESSION_ID = 'timeline-0001';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const DEVICE_ID = '22222222-2222-2222-2222-222222222222';
const CAL_ID = '33333333-3333-3333-3333-333333333333';
const PLAYER = 'TimelinePlayer';

function installFakeSupabase(): { realtimeHandlers: Array<(payload?: unknown) => void>; patchedAt: () => number | null; dbStatus: () => string; setDbStatus: (s: 'running' | 'completed') => void } {
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
    (f as Record<string, unknown>).lt = (col: string, val: string) => { mods.lt = { col, val }; return f; };
    (f as Record<string, unknown>).order = () => f;
    (f as Record<string, unknown>).limit = (n: number) => { mods.limit = n; return f; };
    (f as Record<string, unknown>).gte = () => f;
    (f as Record<string, unknown>).lte = () => f;
    (f as Record<string, unknown>).neq = () => f;
    (f as Record<string, unknown>).or = () => f;
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
    dbStatus: () => state.status,
    setDbStatus: (s) => { state.status = s; state.exists = true; },
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

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<number> {
  const t0 = performance.now();
  for (;;) {
    if (cond()) return performance.now();
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
  resetRuntimeDiagnostics();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Live ≤10s contract — full pipeline timeline (performance.now)', () => {
  it('Game finished → PATCH → Realtime → fetch → notify → render, all <10s with monotonic ordering', async () => {
    const fake = installFakeSupabase();
    const service = getGlobalSessionService();

    render(
      <PersistenceProvider>
        <LiveDashboard />
      </PersistenceProvider>,
    );

    const sessionId = service.startSession({ gameMode: 'focus', campaignId: null });
    await waitUntil(() => fake.dbStatus() === 'running', 5000);
    await new Promise((r) => setTimeout(r, 5));
    act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); });

    await waitUntil(() => screen.queryByText(PLAYER) !== null, 5000);

    let observed: readonly { sessionId: string }[] = [];
    const unsub = subscribeToLiveSessions((s) => { observed = s; });

    const t0 = performance.now();
    service.completeSession(sessionId, makeResults());

    await waitUntil(() => fake.patchedAt() !== null, 5000);
    const tPatchIssued = fake.patchedAt()!;
    await new Promise((r) => setTimeout(r, 0));

    const tRealtime = performance.now();
    act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); });

    const tRemoved = await waitUntil(() => !observed.some((s) => s.sessionId === sessionId), 5000);
    const tUi = await waitUntil(() => screen.queryByText(PLAYER) === null, 5000);

    const diag = getLiveDiagnostics(getActiveLiveSessions().length);
    const tNotify = diag.lastNotifyAt ?? 0;

    await waitUntil(() => {
      const d = getLiveDiagnostics(getActiveLiveSessions().length);
      return (d.lastRenderAt ?? 0) >= tNotify;
    }, 5000);

    const finalDiag = getLiveDiagnostics(getActiveLiveSessions().length);

    const timeline = [
      { event: '1. Game finished (round7)', ms: 0 },
      { event: '2. PATCH issued (upsert)', ms: tPatchIssued - t0 },
      { event: '3. PATCH resolved (DB completed)', ms: (finalDiag.lastPatchAt ?? tPatchIssued) - t0 },
      { event: '4. Realtime received (postgres_changes)', ms: (finalDiag.lastRealtimeAt ?? tRealtime) - t0 },
      { event: '5. fetchActiveSessions (refetch)', ms: (finalDiag.lastPollAt ?? 0) - t0 },
      { event: '6. notifyListeners', ms: (finalDiag.lastNotifyAt ?? 0) - t0 },
      { event: '7. React render complete (effect)', ms: (finalDiag.lastRenderAt ?? 0) - t0 },
      { event: '8. DOM observed removed', ms: tUi - t0 },
    ];

    console.log('=== LIVE CONTRACT FULL PIPELINE TIMELINE (performance.now) ===');
    console.table(timeline);
    const removalLatency = tRemoved - t0;
    const uiLatency = tUi - t0;
    console.log(`Removal latency (live map)   = ${removalLatency.toFixed(1)}ms  (contract bound 10000ms)`);
    console.log(`Removal latency (UI/DOM)     = ${uiLatency.toFixed(1)}ms  (contract bound 10000ms)`);
    console.log(`Poll fallback bound          = 5000ms (fetch refetch above)`);

    const tPatchResolved = finalDiag.lastPatchAt ?? tPatchIssued;
    const tRealtimeGot = finalDiag.lastRealtimeAt ?? tRealtime;
    const tPoll = finalDiag.lastPollAt ?? 0;
    const tNotifyFinal = finalDiag.lastNotifyAt ?? 0;
    const tRender = finalDiag.lastRenderAt ?? 0;

    expect(removalLatency).toBeLessThan(10_000);
    expect(uiLatency).toBeLessThan(10_000);
    expect(uiLatency).toBeLessThan(5_000);
    expect(getActiveLiveSessions().some((s) => s.sessionId === sessionId)).toBe(false);

    expect(tPatchIssued).toBeGreaterThanOrEqual(t0);
    expect(tPatchResolved).toBeGreaterThanOrEqual(tPatchIssued);
    expect(tRealtimeGot).toBeGreaterThanOrEqual(tPatchResolved);
    expect(tPoll).toBeGreaterThanOrEqual(tRealtimeGot);
    expect(tNotifyFinal).toBeGreaterThanOrEqual(tPoll);
    expect(tRender).toBeGreaterThanOrEqual(tNotifyFinal);

    unsub();
  });
});
