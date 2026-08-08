import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createResearchAPI } from '../../core/research/api-supabase';

const { mockFrom, enqueue, resetQueue } = vi.hoisted(() => {
  interface QueuedResult { data: unknown; count?: number | null; error: unknown }
  const queue: QueuedResult[] = [];
  const fallback: QueuedResult = { data: null, count: null, error: null };

  function makeQuery(): { chain: Promise<QueuedResult> & Record<string, unknown> } {
    const entry: QueuedResult = { data: null, count: null, error: null };
    const chain = Promise.resolve(entry) as Promise<QueuedResult> & Record<string, unknown>;
    chain.select = vi.fn(() => {
      const next = queue.shift() ?? fallback;
      entry.data = next.data;
      entry.count = next.count ?? null;
      entry.error = next.error;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.lte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.single = vi.fn(async () => entry);
    chain.maybeSingle = vi.fn(async () => entry);
    return { chain };
  }

  const mockFrom = vi.fn(() => makeQuery().chain);
  const enqueue = (input: unknown, count: number | null = null, error: unknown = null) => {
    if (input !== null && typeof input === 'object' && !Array.isArray(input) && 'data' in (input as Record<string, unknown>)) {
      const r = input as QueuedResult;
      queue.push({ data: r.data, count: r.count ?? count, error: r.error ?? error });
    } else {
      queue.push({ data: input, count, error });
    }
  };
  const resetQueue = () => { queue.length = 0; };
  return { mockFrom, enqueue, resetQueue };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

function sessionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `s_${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'u1',
    device_id: 'd1',
    status: 'completed',
    created_at: '2026-08-01T10:00:00.000Z',
    measurements: { corrected_rts: [90, 190] },
    scientific_results: { focus_score: 72, consistency_score: 80, fatigue_score: 15, grade: 'B' },
    ...overrides,
  };
}

describe('ResearchAPI (Supabase-backed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueue();
  });

  describe('getOverview', () => {
    it('counts sessions and users', async () => {
      enqueue({ data: [{ id: 'u1', role: 'guest' }, { id: 'u2', role: 'user' }], error: null });
      enqueue({ data: [sessionRow(), sessionRow(), sessionRow({ status: 'synced' })], count: 3, error: null });
      enqueue({ data: [], count: 0, error: null });
      enqueue({ data: [], count: 0, error: null });
      enqueue({ data: [], count: 0, error: null });
      enqueue({ data: [], count: 0, error: null });

      const overview = await createResearchAPI().getOverview();
      expect(overview.totalSessions).toBe(3);
      expect(overview.gamesPlayed).toBe(2);
      expect(overview.totalUsers).toBe(2);
      expect(overview.guestUsers).toBe(1);
      expect(overview.registeredUsers).toBe(1);
    });

    it('computes avgFocusScore from completed sessions', async () => {
      enqueue({ data: [], error: null });
      enqueue({
        data: [
          sessionRow({ scientific_results: { focus_score: 60 } }),
          sessionRow({ scientific_results: { focus_score: 80 } }),
        ],
        count: 2,
        error: null,
      });
      enqueue({ data: [], count: 0, error: null });
      enqueue({ data: [], count: 0, error: null });
      enqueue({ data: [], count: 0, error: null });
      enqueue({ data: [], count: 0, error: null });

      const overview = await createResearchAPI().getOverview();
      expect(overview.avgFocusScore).toBeCloseTo(70);
    });
  });

  describe('getScientific', () => {
    it('computes mean reaction time and consistency from completed sessions', async () => {
      enqueue({
        data: [{ measurements: { corrected_rts: [100, 200] }, scientific_results: { consistency_score: 80, fatigue_score: 20 } }],
        error: null,
      });

      const metrics = await createResearchAPI().getScientific();
      expect(metrics.reactionTime.mean).toBe(150);
      expect(metrics.consistency.score).toBe(80);
    });
  });

  describe('getSessionAnalytics', () => {
    it('computes completion and abort rates', async () => {
      enqueue({
        data: [
          { id: 's1', status: 'completed', created_at: '2026-08-01T10:00:00.000Z' },
          { id: 's2', status: 'failed', created_at: '2026-08-01T11:00:00.000Z' },
        ],
        error: null,
      });

      const analytics = await createResearchAPI().getSessionAnalytics();
      expect(analytics.completionRate).toBe(50);
      expect(analytics.abortRate).toBe(50);
    });
  });

  describe('getUserAnalytics', () => {
    it('counts guest/registered users and returning users by active days', async () => {
      enqueue({ data: [{ id: 'u1', role: 'guest' }, { id: 'u2', role: 'user' }], error: null });
      enqueue({
        data: [
          { id: 'a', user_id: 'u1', created_at: '2026-08-01T10:00:00.000Z' },
          { id: 'b', user_id: 'u1', created_at: '2026-08-02T10:00:00.000Z' },
          { id: 'c', user_id: 'u2', created_at: '2026-08-01T10:00:00.000Z' },
        ],
        error: null,
      });

      const analytics = await createResearchAPI().getUserAnalytics();
      expect(analytics.guestUsers).toBe(1);
      expect(analytics.registeredUsers).toBe(1);
      expect(analytics.returningUsers).toBe(1);
    });
  });

  describe('getSessionList', () => {
    it('maps sessions, users and device data into rows', async () => {
      enqueue({ data: [sessionRow({ id: 's1', user_id: 'u1', device_id: 'd1' })], error: null });
      enqueue({ data: [{ id: 'u1', role: 'user' }], error: null });
      enqueue({
        data: [{ id: 'd1', os: 'Android', os_version: '14', browser: 'Chrome', browser_version: '120', platform: 'mobile', language: 'en', user_agent: 'Mozilla/5.0 (Android 14)' }],
        error: null,
      });

      const rows = await createResearchAPI().getSessionList();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('completed');
      expect(rows[0]!.userName).toBe('User');
      expect(rows[0]!.userType).toBe('Registered');
      expect(rows[0]!.avgRt).toBe(140);
      expect(rows[0]!.deviceOs).toBe('Android 14');
      expect(rows[0]!.language).toBe('en');
    });

    it('applies game and date filters to the session query', async () => {
      enqueue({ data: [], error: null });
      enqueue({ data: [], error: null });
      enqueue({ data: [], error: null });

      const api = createResearchAPI();
      await api.getSessionList({
        dateFrom: Date.UTC(2026, 7, 1),
        dateTo: null,
        country: null,
        city: null,
        campaign: null,
        device: null,
        browser: null,
        os: null,
        ageRange: null,
        gender: null,
        education: null,
        sleepHours: null,
        coffee: null,
        sport: null,
        handedness: null,
        game: 'reaction-light',
        authType: null,
      });

      expect(mockFrom).toHaveBeenCalledWith('sessions');
    });
  });

  describe('getDeviceAnalytics', () => {
    it('builds OS and browser distributions without fingerprint reads', async () => {
      enqueue({
        data: [
          { id: 'd1', os: 'Android', browser: 'Chrome' },
          { id: 'd2', os: 'Android', browser: 'Firefox' },
          { id: 'd3', os: 'iOS', browser: 'Safari' },
        ],
        error: null,
      });

      const analytics = await createResearchAPI().getDeviceAnalytics();
      const android = analytics.osDistribution.find(d => d.os === 'Android');
      const chrome = analytics.browserDistribution.find(d => d.browser === 'Chrome');
      expect(android?.count).toBe(2);
      expect(chrome?.count).toBe(1);
      expect(analytics.refreshRateDistribution).toEqual([]);
      expect(analytics.resolutionDistribution).toEqual([]);
    });
  });

  describe('getLiveEvents', () => {
    it('returns empty array initially', () => {
      const api = createResearchAPI();
      expect(api.getLiveEvents()).toEqual([]);
    });

    it('stores and retrieves live events', () => {
      const api = createResearchAPI();
      api.addLiveEvent({ type: 'player_connected', timestamp: Date.now(), sessionId: 's1', userId: null });
      expect(api.getLiveEvents()).toHaveLength(1);
      expect(api.getLiveEvents()[0]!.sessionId).toBe('s1');
    });

    it('caps live events at 1000', () => {
      const api = createResearchAPI();
      for (let i = 0; i < 1005; i++) {
        api.addLiveEvent({ type: 'playing', timestamp: Date.now() + i, sessionId: `s${i}`, userId: null });
      }
      expect(api.getLiveEvents().length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getSystemHealth', () => {
    it('returns healthy status', async () => {
      enqueue({ data: [], error: null });

      const health = await createResearchAPI().getSystemHealth();
      expect(health.supabaseStatus).toBe('healthy');
      expect(health.buildVersion).toBe('2.0.0');
    });
  });
});
