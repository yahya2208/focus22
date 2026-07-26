import { describe, it, expect } from 'vitest';
import { createResearchAPI } from '../../core/research/api';
import type { Session } from '../../core/session';
import { createEmptyFilters } from '../../core/research/filters';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: `s_${Math.random().toString(36).slice(2, 8)}`,
    status: 'completed',
    calibrationId: 'cal1',
    pluginId: 'reaction-light',
    deviceId: 'd1',
    measurements: { rawRts: [100, 200], correctedRts: [90, 190], totalRounds: 2, validRounds: 2, outlierCount: 0 },
    scientificResults: {
      meanCorrectedMs: 140,
      medianCorrectedMs: 140,
      consistencyScore: 0.8,
      consistencyRating: 'good',
      fatigueIndex: 0.15,
      fatigueScore: 0.15,
      focusScore: 72,
      grade: 'B',
    },
    metadata: { version: '0.1.0-alpha', pluginVersion: '1.0.0', buildNumber: 1 },
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
    finishedAt: null,
    ...overrides,
  };
}

describe('ResearchAPI', () => {
  describe('getOverview', () => {
    it('returns empty overview with no sessions', async () => {
      const api = createResearchAPI();
      const overview = await api.getOverview();
      expect(overview.totalSessions).toBe(0);
      expect(overview.gamesPlayed).toBe(0);
    });

    it('counts sessions correctly', async () => {
      const s1 = makeSession({ status: 'completed' });
      const s2 = makeSession({ status: 'completed' });
      const s3 = makeSession({ status: 'synced' });
      const api = createResearchAPI([s1, s2, s3]);
      const overview = await api.getOverview();
      expect(overview.totalSessions).toBe(3);
      expect(overview.gamesPlayed).toBe(2);
    });

    it('computes avgFocusScore from completed sessions', async () => {
      const s1 = makeSession({ scientificResults: { meanCorrectedMs: 0, medianCorrectedMs: 0, consistencyScore: 0, consistencyRating: '', fatigueIndex: 0, fatigueScore: 0, focusScore: 60, grade: 'C' } });
      const s2 = makeSession({ scientificResults: { meanCorrectedMs: 0, medianCorrectedMs: 0, consistencyScore: 0, consistencyRating: '', fatigueIndex: 0, fatigueScore: 0, focusScore: 80, grade: 'A' } });
      const api = createResearchAPI([s1, s2]);
      const overview = await api.getOverview();
      expect(overview.avgFocusScore).toBeCloseTo(70);
    });

    it('counts unique devices', async () => {
      const s1 = makeSession({ deviceId: 'd1' });
      const s2 = makeSession({ deviceId: 'd2' });
      const s3 = makeSession({ deviceId: 'd1' });
      const api = createResearchAPI([s1, s2, s3]);
      const overview = await api.getOverview();
      expect(overview.devices).toBe(2);
    });
  });

  describe('getScientific', () => {
    it('computes scientific metrics from sessions', async () => {
      const s1 = makeSession();
      const api = createResearchAPI([s1]);
      const metrics = await api.getScientific();
      expect(metrics.reactionTime.mean).toBeGreaterThan(0);
      expect(metrics.percentiles.p50).toBeGreaterThanOrEqual(0);
      expect(metrics.consistency.score).toBeCloseTo(0.8);
    });

    it('returns zeros for no completed sessions', async () => {
      const api = createResearchAPI();
      const metrics = await api.getScientific();
      expect(metrics.reactionTime.mean).toBe(0);
    });
  });

  describe('getSessionAnalytics', () => {
    it('computes completion rate', async () => {
      const s1 = makeSession({ status: 'completed' });
      const s2 = makeSession({ status: 'failed' });
      const api = createResearchAPI([s1, s2]);
      const analytics = await api.getSessionAnalytics();
      expect(analytics.completionRate).toBeCloseTo(0.5);
    });
  });

  describe('getUserAnalytics', () => {
    it('returns placeholder data', async () => {
      const api = createResearchAPI();
      const analytics = await api.getUserAnalytics();
      expect(analytics.registrationFunnel).toEqual([]);
    });
  });

  describe('getDeviceAnalytics', () => {
    it('returns empty distributions', async () => {
      const api = createResearchAPI();
      const analytics = await api.getDeviceAnalytics();
      expect(analytics.osDistribution).toEqual([]);
    });
  });

  describe('getSurveyAnalytics', () => {
    it('returns empty distributions', async () => {
      const api = createResearchAPI();
      const analytics = await api.getSurveyAnalytics();
      expect(analytics.ageDistribution).toEqual([]);
    });
  });

  describe('getCampaignAnalytics', () => {
    it('returns empty campaigns', async () => {
      const api = createResearchAPI();
      const analytics = await api.getCampaignAnalytics();
      expect(analytics.campaigns).toEqual([]);
    });
  });

  describe('getLiveEvents', () => {
    it('returns empty array initially', () => {
      const api = createResearchAPI();
      expect(api.getLiveEvents()).toEqual([]);
    });

    it('stores and retrieves live events', () => {
      const api = createResearchAPI();
      const event = {
        type: 'player_connected' as const,
        timestamp: Date.now(),
        sessionId: 's1',
        userId: null,
      };
      api.addLiveEvent(event);
      expect(api.getLiveEvents()).toHaveLength(1);
      expect(api.getLiveEvents()[0]!.sessionId).toBe('s1');
    });

    it('caps live events at 1000', () => {
      const api = createResearchAPI();
      for (let i = 0; i < 1005; i++) {
        api.addLiveEvent({
          type: 'playing',
          timestamp: Date.now() + i,
          sessionId: `s${i}`,
          userId: null,
        });
      }
      expect(api.getLiveEvents().length).toBeLessThanOrEqual(1000);
    });
  });

  describe('getSystemHealth', () => {
    it('returns healthy status', async () => {
      const api = createResearchAPI();
      const health = await api.getSystemHealth();
      expect(health.supabaseStatus).toBe('healthy');
      expect(health.buildVersion).toBe('0.1.0-alpha');
    });
  });

  describe('filtering', () => {
    it('filters by dateFrom', async () => {
      const now = Date.now();
      const old = makeSession({ createdAt: now - 86400000 * 10 });
      const recent = makeSession({ createdAt: now });
      const api = createResearchAPI([old, recent]);
      const overview = await api.getOverview({ ...createEmptyFilters(), dateFrom: now - 86400000 });
      expect(overview.totalSessions).toBe(1);
    });

    it('filters by game', async () => {
      const s1 = makeSession({ pluginId: 'reaction-light' });
      const s2 = makeSession({ pluginId: 'other-game' });
      const api = createResearchAPI([s1, s2]);
      const overview = await api.getOverview({ ...createEmptyFilters(), game: 'reaction-light' });
      expect(overview.totalSessions).toBe(1);
    });
  });
});
