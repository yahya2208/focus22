import { describe, it, expect, beforeEach } from 'vitest';
import { createMemorySessionRepository } from '../../core/repository/memory';
import { createSession, transitionSession, updateSessionMeasurements } from '../../core/session';

function makeSession(overrides: Record<string, unknown> = {}) {
  let session = createSession({
    calibrationId: 'cal-1',
    pluginId: 'reaction-light',
    deviceId: 'dev-1',
  });
  session = transitionSession(session, 'running');
  session = transitionSession(session, 'completed');
  session = updateSessionMeasurements(
    session,
    { rawRts: [200], correctedRts: [180], totalRounds: 1, validRounds: 1, outlierCount: 0 },
    { meanCorrectedMs: 180, medianCorrectedMs: 180, consistencyScore: 90, consistencyRating: 'excellent', fatigueIndex: 0, fatigueScore: 100, focusScore: 95, grade: 'A', ...overrides },
  );
  return session;
}

describe('Memory Session Repository', () => {
  let repo: ReturnType<typeof createMemorySessionRepository>;

  beforeEach(() => {
    repo = createMemorySessionRepository();
  });

  it('should save and retrieve a session', async () => {
    const session = makeSession();
    await repo.save(session);
    const found = await repo.getById(session.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(session.id);
  });

  it('should return null for non-existent session', async () => {
    const found = await repo.getById('non-existent');
    expect(found).toBeNull();
  });

  it('should list all sessions', async () => {
    await repo.save(makeSession());
    await repo.save(makeSession());
    const page = await repo.getAll();
    expect(page.total).toBe(2);
    expect(page.sessions).toHaveLength(2);
  });

  it('should filter by status', async () => {
    const s1 = makeSession();
    await repo.save(s1);
    const draft = createSession({ calibrationId: 'cal-1', pluginId: 'reaction-light', deviceId: 'dev-1' });
    await repo.save(draft);
    const page = await repo.getAll({ status: 'completed' });
    expect(page.total).toBe(1);
    expect(page.sessions[0]?.id).toBe(s1.id);
  });

  it('should sort by createdAt', async () => {
    await repo.save(makeSession());
    await new Promise((r) => setTimeout(r, 10));
    await repo.save(makeSession());
    const page = await repo.getAll(undefined, { field: 'createdAt', direction: 'desc' });
    expect(page.sessions[0]?.createdAt).toBeGreaterThanOrEqual(page.sessions[1]?.createdAt ?? 0);
  });

  it('should paginate', async () => {
    for (let i = 0; i < 5; i++) await repo.save(makeSession());
    const page1 = await repo.getAll(undefined, undefined, 0, 2);
    expect(page1.sessions).toHaveLength(2);
    expect(page1.total).toBe(5);
    const page2 = await repo.getAll(undefined, undefined, 2, 2);
    expect(page2.sessions).toHaveLength(2);
  });

  it('should count sessions', async () => {
    await repo.save(makeSession());
    await repo.save(makeSession());
    expect(await repo.count()).toBe(2);
  });

  it('should delete a session', async () => {
    const session = makeSession();
    await repo.save(session);
    await repo.delete(session.id);
    expect(await repo.getById(session.id)).toBeNull();
  });

  it('should clear all sessions', async () => {
    await repo.save(makeSession());
    await repo.save(makeSession());
    await repo.clear();
    expect(await repo.count()).toBe(0);
  });

  it('should update an existing session', async () => {
    const session = makeSession();
    await repo.save(session);
    const updated = { ...session, status: 'archived' as const };
    await repo.update(updated);
    const found = await repo.getById(session.id);
    expect(found!.status).toBe('archived');
  });
});
