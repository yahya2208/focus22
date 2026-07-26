import { describe, it, expect } from 'vitest';
import {
  createSession,
  transitionSession,
  updateSessionMeasurements,
  canTransition,
  isSessionComplete,
  getSessionDuration,
  createSessionId,
} from '../../core/session';

describe('Session Lifecycle', () => {
  it('should create a session with draft status', () => {
    const session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    expect(session.status).toBe('draft');
    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(session.measurements).toBeNull();
    expect(session.scientificResults).toBeNull();
  });

  it('should generate unique session IDs', () => {
    const id1 = createSessionId();
    const id2 = createSessionId();
    expect(id1).not.toBe(id2);
  });

  it('should transition from draft to running', () => {
    const session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    const running = transitionSession(session, 'running');
    expect(running.status).toBe('running');
    expect(running.updatedAt).toBeGreaterThanOrEqual(session.createdAt);
  });

  it('should transition from running to completed', () => {
    const session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    const running = transitionSession(session, 'running');
    const completed = transitionSession(running, 'completed');
    expect(completed.status).toBe('completed');
    expect(completed.finishedAt).toBeGreaterThan(0);
  });

  it('should reject invalid transitions', () => {
    const session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    expect(() => transitionSession(session, 'completed')).toThrow('Invalid session transition');
  });

  it('should allow draft → running → paused → running → completed', () => {
    let session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    session = transitionSession(session, 'running');
    session = transitionSession(session, 'paused');
    session = transitionSession(session, 'running');
    session = transitionSession(session, 'completed');
    expect(session.status).toBe('completed');
  });

  it('should update measurements and results', () => {
    let session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    session = transitionSession(session, 'running');
    session = updateSessionMeasurements(
      session,
      { rawRts: [200], correctedRts: [180], totalRounds: 1, validRounds: 1, outlierCount: 0 },
      { meanCorrectedMs: 180, medianCorrectedMs: 180, consistencyScore: 90, consistencyRating: 'excellent', fatigueIndex: 0, fatigueScore: 100, focusScore: 95, grade: 'A' },
    );
    expect(session.measurements).not.toBeNull();
    expect(session.scientificResults?.grade).toBe('A');
  });

  it('should detect completed sessions', () => {
    let session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    expect(isSessionComplete(session)).toBe(false);
    session = transitionSession(session, 'running');
    session = transitionSession(session, 'completed');
    expect(isSessionComplete(session)).toBe(true);
  });

  it('should calculate session duration', () => {
    const session = createSession({
      calibrationId: 'cal-1',
      pluginId: 'reaction-light',
      deviceId: 'dev-1',
    });
    const duration = getSessionDuration(session);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should validate canTransition for all status pairs', () => {
    expect(canTransition('draft', 'running')).toBe(true);
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('running', 'paused')).toBe(true);
    expect(canTransition('running', 'completed')).toBe(true);
    expect(canTransition('paused', 'running')).toBe(true);
    expect(canTransition('completed', 'archived')).toBe(true);
    expect(canTransition('completed', 'synced')).toBe(true);
    expect(canTransition('archived', 'running')).toBe(false);
    expect(canTransition('synced', 'archived')).toBe(true);
    expect(canTransition('failed', 'draft')).toBe(true);
  });
});
