import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { LiveSessionSimulator } from './LiveSessionSimulator';
import { createSupabaseClientForTest, getSupabaseClient, resetSupabaseClient } from '../../core/supabase/client';
import { getGlobalSessionService, resetGlobalSessionService, type SessionResults } from '../../core/session/service';
import { LiveDashboard } from '../../research-console/pages/live/LiveDashboard';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const DEVICE_ID = '22222222-2222-2222-2222-222222222222';
const CAL_ID = '33333333-3333-3333-3333-333333333333';
const TOTAL_GAMES = 10;

interface FakeSupabase {
  readonly realtimeHandlers: Array<(payload?: unknown) => void>;
  readonly dbStatus: (id: string) => string | undefined;
  readonly dbHas: (id: string, status: string) => boolean;
  readonly dbRunningCount: () => number;
}

function installFakeSupabase(): FakeSupabase {
  resetSupabaseClient();
  createSupabaseClientForTest();
  const client = getSupabaseClient();

  interface Row { status: string; created: string; updated: string; }
  const db = new Map<string, Row>();
  const realtimeHandlers: Array<(payload?: unknown) => void> = [];

  const rowFor = (id: string, r: Row) => ({
    id,
    user_id: USER_ID,
    campaign_id: null,
    plugin_id: 'focus-test',
    status: r.status,
    created_at: r.created,
    updated_at: r.updated,
    measurements: { corrected_rts: [250, 260, 270, 280, 290, 300, 310], total_rounds: 7 },
    metadata: { source: 'web-app' },
    _devices: null,
    _campaigns: null,
    _users: { display_name: `P${id.slice(-4)}`, role: 'guest' },
  });

  vi.spyOn(client, 'from').mockImplementation(((table: string) => {
    const mods: { inVals?: unknown[]; eqStatus?: string; ltVal?: string } = {};
    const f: Record<string, unknown> = {};

    Object.defineProperty(f, 'data', {
      get: () => {
        if (table === 'sessions') {
          const all = Array.from(db.entries());
          if (mods.inVals) {
            return all.filter(([, r]) => mods.inVals!.includes(r.status)).map(([id, r]) => rowFor(id, r));
          }
          if (mods.eqStatus === 'running' && mods.ltVal) {
            const cutoff = new Date(mods.ltVal).getTime();
            return all.filter(([, r]) => r.status === 'running' && new Date(r.updated).getTime() < cutoff)
              .map(([id, r]) => rowFor(id, r));
          }
          if (mods.eqStatus) {
            return all.filter(([, r]) => r.status === mods.eqStatus).map(([id, r]) => rowFor(id, r));
          }
          return [];
        }
        return [];
      },
    });
    Object.defineProperty(f, 'error', { get: () => null });
    Object.defineProperty(f, 'count', { get: () => undefined });

    (f as Record<string, unknown>).select = () => f;
    (f as Record<string, unknown>).eq = (col: string, val: string) => { if (col === 'status') mods.eqStatus = val; return f; };
    (f as Record<string, unknown>).in = (_col: string, vals: unknown[]) => { mods.inVals = vals; return f; };
    (f as Record<string, unknown>).gte = () => f;
    (f as Record<string, unknown>).lte = () => f;
    (f as Record<string, unknown>).lt = (col: string, val: string) => { if (col === 'updated_at') mods.ltVal = val; return f; };
    (f as Record<string, unknown>).order = () => f;
    (f as Record<string, unknown>).limit = () => f;
    (f as Record<string, unknown>).maybeSingle = async () => {
      if (table === 'devices' || table === 'calibrations') return { data: null, error: null };
      return { data: null, error: null };
    };
    (f as Record<string, unknown>).single = async () => {
      if (table === 'devices') return { data: { id: DEVICE_ID }, error: null };
      if (table === 'calibrations') return { data: { id: CAL_ID }, error: null };
      return { data: null, error: null };
    };
    (f as Record<string, unknown>).insert = (row: { id?: string; status?: string; created_at?: string }) => {
      if (row?.id) db.set(row.id, { status: row.status ?? 'running', created: row.created_at ?? new Date().toISOString(), updated: new Date().toISOString() });
      return f;
    };
    (f as Record<string, unknown>).upsert = (row: { id?: string; status?: string }) => {
      if (!row?.id) return f;
      const existing = db.get(row.id) ?? { status: 'running', created: new Date().toISOString(), updated: new Date().toISOString() };
      if (row.status) existing.status = row.status;
      existing.updated = new Date().toISOString();
      db.set(row.id, existing);
      return f;
    };
    (f as Record<string, unknown>).update = (_patch: { status?: string; updated_at?: string }) => {
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
    dbStatus: (id) => db.get(id)?.status,
    dbHas: (id, status) => db.get(id)?.status === status,
    dbRunningCount: () => Array.from(db.values()).filter((r) => r.status === 'running').length,
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
  resetGlobalSessionService();
  resetSupabaseClient();
  vi.restoreAllMocks();
});

describe('Live Dashboard — 10 consecutive games, end-to-end (game→DB→realtime→dashboard)', () => {
  it('every game appears as running and disappears after completion, all ≤10s, none stuck', async () => {
    const fake = installFakeSupabase();
    const service = getGlobalSessionService();

    render(
      <LiveSessionSimulator>
        <LiveDashboard />
      </LiveSessionSimulator>,
    );

    const records: Array<{ game: number; appearedRunning: boolean; disappearLatencyMs: number; dbStatusAfter: string }> = [];

    for (let i = 1; i <= TOTAL_GAMES; i++) {
      // GAME START (GameScreen: startSession)
      const sessionId = service.startSession({ gameMode: 'focus', campaignId: null });
      await waitUntil(() => fake.dbHas(sessionId, 'running'), 5000);
      act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); });

      const name = `P${sessionId.slice(-4)}`;
      await waitUntil(() => screen.queryByText(name) !== null, 5000);
      const tRound7 = performance.now();

      // ROUND 7 FINISHED (GameScreen: completeSession)
      service.completeSession(sessionId, makeResults());
      await waitUntil(() => fake.dbHas(sessionId, 'completed'), 5000);
      act(() => { fake.realtimeHandlers.forEach((cb) => cb({})); });

      const tDisappear = await waitUntil(() => screen.queryByText(name) === null, 5000);

      records.push({
        game: i,
        appearedRunning: true,
        disappearLatencyMs: Math.round((tDisappear - tRound7) * 10) / 10,
        dbStatusAfter: fake.dbStatus(sessionId) ?? 'missing',
      });
    }

    console.log('=== 10-GAME END-TO-END (game finish -> gone from dashboard) ===');
    console.table(records);

    const maxLatency = Math.max(...records.map((r) => r.disappearLatencyMs));
    const stuck = records.filter((r) => !r.appearedRunning || r.dbStatusAfter !== 'completed');
    console.log(`max disappear latency: ${maxLatency.toFixed(1)}ms (contract bound 10000ms)`);
    console.log(`stuck sessions (never removed / not completed): ${stuck.length}`);
    console.log(`running rows remaining in DB: ${fake.dbRunningCount()}`);

    for (const r of records) {
      expect(r.appearedRunning).toBe(true);
      expect(r.dbStatusAfter).toBe('completed');
      expect(r.disappearLatencyMs).toBeLessThan(10_000);
    }
    expect(stuck).toHaveLength(0);
    expect(fake.dbRunningCount()).toBe(0);
    expect(screen.queryByText(/^P[0-9a-f]{4}$/)).toBeNull(); // no player still listed
  });
});
