import { describe, it, expect } from 'vitest';
import { createMemoryRepository, type SessionRecord } from '../../core/storage/repository';

function createTestRecord(id: string): SessionRecord {
  return {
    id,
    timestamp: Date.now(),
    gameMode: 'reaction-light',
    calibrationProfile: {
      refreshRate: 60,
      displayLagMs: 16.667,
      inputLagMs: 8,
      confidence: 0.85,
      platform: 'desktop',
    },
    results: {
      rawRtMs: [300, 250, 350],
      correctedRtMs: [275.333, 225.333, 325.333],
      meanCorrectedMs: 275.333,
      medianCorrectedMs: 275.333,
      consistencyScore: 80,
      consistencyRating: 'good',
      fatigueIndex: 0.1,
      fatigueScore: 90,
      focusScore: 85,
      grade: 'B',
      totalRounds: 3,
      validRounds: 3,
      outlierCount: 0,
    },
  };
}

describe('Memory Repository', () => {
  it('should save and retrieve sessions', async () => {
    const repo = createMemoryRepository();
    const record = createTestRecord('test-1');
    await repo.saveSession(record);
    const sessions = await repo.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('test-1');
  });

  it('should return empty array when no sessions', async () => {
    const repo = createMemoryRepository();
    const sessions = await repo.getSessions();
    expect(sessions).toHaveLength(0);
  });

  it('should clear all sessions', async () => {
    const repo = createMemoryRepository();
    await repo.saveSession(createTestRecord('test-1'));
    await repo.saveSession(createTestRecord('test-2'));
    await repo.clearSessions();
    const sessions = await repo.getSessions();
    expect(sessions).toHaveLength(0);
  });

  it('should return sessions sorted by timestamp descending', async () => {
    const repo = createMemoryRepository();
    const old = createTestRecord('old');
    const fresh = createTestRecord('fresh');
    await repo.saveSession({ ...old, timestamp: 1000 });
    await repo.saveSession({ ...fresh, timestamp: 2000 });
    const sessions = await repo.getSessions();
    expect(sessions[0]?.id).toBe('fresh');
  });
});
