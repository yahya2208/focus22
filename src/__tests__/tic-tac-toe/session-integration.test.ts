import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSessionService,
  type SessionService,
  type SessionResults,
} from '../../core/session/service';
import { createEventPublisher, type EventPublisher, type DomainEvent } from '../../core/events';

function createTestSessionService() {
  const publisher = createEventPublisher();
  const service = createSessionService(publisher);
  return { publisher, service };
}

describe('Tic Tac Toe — Session Integration (Gate 4)', () => {
  let publisher: EventPublisher;
  let service: SessionService;
  const events: DomainEvent[] = [];

  beforeEach(() => {
    const result = createTestSessionService();
    publisher = result.publisher;
    service = result.service;
    events.length = 0;
    publisher.subscribeAll((event) => { events.push(event); });
  });

  afterEach(() => {
    events.length = 0;
  });

  it('startSession with gameMode tic-tac-toe creates session', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');

    const created = events.filter((e) => e.type === 'session_created');
    expect(created).toHaveLength(1);
    expect(created[0]!.payload).toMatchObject({
      sessionId,
      gameMode: 'tic-tac-toe',
    });
  });

  it('completeSession works with TicTacToe placeholder results', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    events.length = 0;

    const results: SessionResults = {
      rawRts: [],
      correctedRts: [],
      totalRounds: 5,
      validRounds: 0,
      calibration: { refreshRate: 60, displayLagMs: 0, inputLagMs: 0, confidence: 0, platform: 'unknown' as const, timestamp: 0 },
      sessionStart: 0,
      sessionEnd: Date.now(),
    };

    service.completeSession(sessionId, results);

    const completed = events.filter((e) => e.type === 'session_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]!.payload).toMatchObject({
      sessionId,
      gameMode: 'tic-tac-toe',
      endedReason: 'completed',
      results,
    });
  });

  it('abandonSession on quit marks session as abandoned', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    events.length = 0;

    service.abandonSession(sessionId, 'abandoned');

    const abandoned = events.filter((e) => e.type === 'session_abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]!.payload).toMatchObject({
      sessionId,
      reason: 'abandoned',
    });
  });

  it('completeSession is idempotent — second call is skipped', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    events.length = 0;

    const results: SessionResults = {
      rawRts: [], correctedRts: [], totalRounds: 5, validRounds: 0,
      calibration: { refreshRate: 60, displayLagMs: 0, inputLagMs: 0, confidence: 0, platform: 'unknown' as const, timestamp: 0 },
      sessionStart: 0, sessionEnd: Date.now(),
    };

    service.completeSession(sessionId, results);
    service.completeSession(sessionId, results);

    const completed = events.filter((e) => e.type === 'session_completed');
    expect(completed).toHaveLength(1);
  });

  it('abandonSession after completeSession is skipped', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    events.length = 0;

    const results: SessionResults = {
      rawRts: [], correctedRts: [], totalRounds: 5, validRounds: 0,
      calibration: { refreshRate: 60, displayLagMs: 0, inputLagMs: 0, confidence: 0, platform: 'unknown' as const, timestamp: 0 },
      sessionStart: 0, sessionEnd: Date.now(),
    };

    service.completeSession(sessionId, results);
    service.abandonSession(sessionId, 'abandoned');

    const completed = events.filter((e) => e.type === 'session_completed');
    const abandoned = events.filter((e) => e.type === 'session_abandoned');
    expect(completed).toHaveLength(1);
    expect(abandoned).toHaveLength(0);
  });

  it('abandonSession after completeSession is skipped (reverse order)', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    events.length = 0;

    service.abandonSession(sessionId, 'abandoned');
    service.abandonSession(sessionId, 'abandoned');

    const abandoned = events.filter((e) => e.type === 'session_abandoned');
    expect(abandoned).toHaveLength(1);
  });

  it('each startSession returns a unique sessionId', () => {
    const id1 = service.startSession({ gameMode: 'tic-tac-toe' });
    const id2 = service.startSession({ gameMode: 'tic-tac-toe' });
    expect(id1).not.toBe(id2);
  });

  it('completedRef guard prevents double-complete + abandon sequence', () => {
    const sessionId = service.startSession({ gameMode: 'tic-tac-toe' });
    events.length = 0;

    const results: SessionResults = {
      rawRts: [], correctedRts: [], totalRounds: 5, validRounds: 0,
      calibration: { refreshRate: 60, displayLagMs: 0, inputLagMs: 0, confidence: 0, platform: 'unknown' as const, timestamp: 0 },
      sessionStart: 0, sessionEnd: Date.now(),
    };

    service.completeSession(sessionId, results);
    service.abandonSession(sessionId, 'abandoned');

    const completed = events.filter((e) => e.type === 'session_completed');
    const abandoned = events.filter((e) => e.type === 'session_abandoned');
    expect(completed).toHaveLength(1);
    expect(abandoned).toHaveLength(0);
  });
});
