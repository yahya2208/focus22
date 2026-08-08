import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { LiveSessionSimulator } from './LiveSessionSimulator';
import { createSupabaseClientForTest, getSupabaseClient, resetSupabaseClient } from '../../core/supabase/client';
import { subscribeToLiveSessions, getActiveLiveSessions, resetLiveSessions } from '../../core/supabase/live-sessions';
import { getLiveDiagnostics, resetRuntimeDiagnostics } from '../../core/supabase/live-diagnostics';
import { getGlobalSessionService, resetGlobalSessionService, type SessionResults } from '../../core/session/service';
import { LiveDashboard } from '../../research-console/pages/live/LiveDashboard';

const SESSION_ID = 'fallback-0001';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const PLAYER = 'FallbackPlayer';

function installFakeSupabase(): void {
  resetSupabaseClient();
  createSupabaseClientForTest();
  const client = getSupabaseClient();

  const state = { status: 'idle' as string, exists: false };

  const sessionRow = () => ({
    id: SESSION_ID,
    user_id: USER_ID,
    campaign_id: null,
    plugin_id: 'focus-test',
    status: state.status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    measurements: { corrected_rts: [250, 260, 270, 280, 290, 300, 310], total_rounds: 7 },
    metadata: { source: 'web-app' },
    _devices: null,
    _campaigns: null,
    _users: { display_name: PLAYER, role: 'guest' },
  });

  vi.spyOn(client, 'from').mockImplementation(((table: string) => {
    const mods: { inVals?: unknown[]; lt?: { col: string; val: string } } = {};
    const f: Record<string, unknown> = {};

    Object.defineProperty(f, 'data', {
      get: () => {
        if (table === 'sessions') {
          if (!state.exists) return [];
          if (mods.lt) {
            const cutoff = new Date(mods.lt.val).getTime();
            if (new Date().getTime() >= cutoff) return [];
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
    (f as Record<string, unknown>).limit = () => f;
    (f as Record<string, unknown>).gte = () => f;
    (f as Record<string, unknown>).lte = () => f;
    (f as Record<string, unknown>).neq = () => f;
    (f as Record<string, unknown>).or = () => f;
    (f as Record<string, unknown>).maybeSingle = async () => ({ data: null, error: null });
    (f as Record<string, unknown>).single = async () => ({ data: sessionRow(), error: null });
    (f as Record<string, unknown>).insert = (row: { status?: string }) => {
      if (row?.status) { state.status = row.status; state.exists = true; }
      return f;
    };
    (f as Record<string, unknown>).upsert = (row: { status?: string }) => {
      if (row?.status) { state.status = row.status; state.exists = true; }
      return f;
    };
    (f as Record<string, unknown>).update = (patch: { status?: string }) => {
      if (patch?.status) state.status = patch.status;
      return f;
    };
    return f as never;
  }) as never);

  vi.spyOn(client, 'channel').mockImplementation((() => {
    throw new Error('realtime unavailable (simulated)');
  }) as never);

  vi.spyOn(client.auth, 'getUser').mockResolvedValue({ data: { user: { id: USER_ID } }, error: null } as never);
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null } as never);
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

afterEach(() => {
  cleanup();
  resetLiveSessions();
  resetGlobalSessionService();
  resetSupabaseClient();
  resetRuntimeDiagnostics();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Live ≤10s contract — poll fallback (realtime disabled)', () => {
  it('removes the session via the 5s poll when realtime is unavailable', async () => {
    vi.useFakeTimers();
    installFakeSupabase();
    const service = getGlobalSessionService();

    render(
      <LiveSessionSimulator>
        <LiveDashboard />
      </LiveSessionSimulator>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    const diagAfterMount = getLiveDiagnostics(getActiveLiveSessions().length);
    expect(diagAfterMount.realtimeConnected).toBe(false);
    expect(diagAfterMount.pollActive).toBe(true);

    let observed: readonly { sessionId: string }[] = [];
    const unsub = subscribeToLiveSessions((s) => { observed = s; });

    const sessionId = service.startSession({ gameMode: 'focus', campaignId: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText(PLAYER)).not.toBeNull();

    const t0 = performance.now();
    service.completeSession(sessionId, makeResults());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const tAfter = performance.now();

    const removalLatency = tAfter - t0;
    const removed = !observed.some((s) => s.sessionId === sessionId);
    const uiGone = screen.queryByText(PLAYER) === null;
    const diag = getLiveDiagnostics(getActiveLiveSessions().length);

    console.log(`=== POLL FALLBACK: removal latency = ${removalLatency.toFixed(1)}ms (contract bound 5000ms) ===`);
    console.log(`realtimeConnected=${diag.realtimeConnected} pollActive=${diag.pollActive} lastPollAt=${diag.lastPollAt} lastPatchAt=${diag.lastPatchAt}`);

    expect(removalLatency).toBeLessThanOrEqual(5000);
    expect(removed).toBe(true);
    expect(uiGone).toBe(true);
    expect(getActiveLiveSessions().some((s) => s.sessionId === sessionId)).toBe(false);
    expect(diag.pollActive).toBe(true);
    expect(diag.lastPollAt ?? 0).toBeGreaterThanOrEqual(diag.lastPatchAt ?? 0);

    unsub();
  });
});
