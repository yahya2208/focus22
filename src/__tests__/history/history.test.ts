import { describe, it, expect, beforeEach } from 'vitest';
import { createMemorySessionRepository } from '../../core/repository/memory';
import { createHistoryService } from '../../core/history';
import { createSession, transitionSession, updateSessionMeasurements } from '../../core/session';

function makeCompletedSession(pluginId = 'reaction-light', focusScore = 80) {
  let session = createSession({ calibrationId: 'cal-1', pluginId, deviceId: 'dev-1' });
  session = transitionSession(session, 'running');
  session = transitionSession(session, 'completed');
  session = updateSessionMeasurements(
    session,
    { rawRts: [200, 220], correctedRts: [180, 200], totalRounds: 2, validRounds: 2, outlierCount: 0 },
    { meanCorrectedMs: 190, medianCorrectedMs: 190, consistencyScore: 85, consistencyRating: 'good', fatigueIndex: 0.1, fatigueScore: 90, focusScore, grade: 'B' },
  );
  return session;
}

describe('History Service', () => {
  let repo: ReturnType<typeof createMemorySessionRepository>;
  let history: ReturnType<typeof createHistoryService>;

  beforeEach(async () => {
    repo = createMemorySessionRepository();
    history = createHistoryService(repo);
    await repo.clear();
  });

  it('should calculate stats for empty repository', async () => {
    const stats = await history.getStats();
    expect(stats.totalSessions).toBe(0);
    expect(stats.avgFocusScore).toBe(0);
  });

  it('should calculate correct stats', async () => {
    await repo.save(makeCompletedSession('reaction-light', 90));
    await repo.save(makeCompletedSession('reaction-light', 70));
    const stats = await history.getStats();
    expect(stats.totalSessions).toBe(2);
    expect(stats.avgFocusScore).toBe(80);
    expect(stats.bestFocusScore).toBe(90);
    expect(stats.worstFocusScore).toBe(70);
    expect(stats.totalGameModes).toBe(1);
  });

  it('should calculate trend', async () => {
    await repo.save(makeCompletedSession('reaction-light', 80));
    await repo.save(makeCompletedSession('reaction-light', 90));
    const trend = await history.getTrend('daily');
    expect(trend.points.length).toBeGreaterThanOrEqual(1);
    const firstPoint = trend.points[0];
    expect(firstPoint).toBeDefined();
    if (firstPoint) {
      expect(firstPoint.avgScore).toBe(85);
      expect(firstPoint.sessionCount).toBe(2);
    }
  });

  it('should search sessions', async () => {
    await repo.save(makeCompletedSession('reaction-light', 80));
    const results = await history.search('reaction');
    expect(results.sessions).toHaveLength(1);
    expect(results.total).toBe(1);
  });

  it('should export sessions as JSON', async () => {
    await repo.save(makeCompletedSession('reaction-light', 80));
    const json = await history.exportSessions();
    const parsed = JSON.parse(json) as unknown[];
    expect(parsed).toHaveLength(1);
  });

  it('should calculate median reaction time', async () => {
    await repo.save(makeCompletedSession());
    const stats = await history.getStats();
    expect(stats.medianReactionTime).toBeGreaterThan(0);
  });
});
