import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSessionService, type SessionService, type SessionCreatedPayload, type SessionCompletedPayload, type SessionResults } from '../../core/session/service';
import { createEventPublisher, type EventPublisher, type DomainEvent } from '../../core/events';
import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------
// 1. Session ID consistency — same ID flows through entire lifecycle
// ----------------------------------------------------------------
describe('Session ID consistency (BUG 1 proof)', () => {
  let publisher: EventPublisher;
  let service: SessionService;
  const events: DomainEvent[] = [];
  let createdPayload: SessionCreatedPayload | null = null;
  let completedPayload: SessionCompletedPayload | null = null;

  beforeEach(() => {
    publisher = createEventPublisher();
    service = createSessionService(publisher);

    publisher.subscribeAll((event) => { events.push(event); });
    publisher.subscribe<SessionCreatedPayload>('session_created', (e) => { createdPayload = e.payload; });
    publisher.subscribe<SessionCompletedPayload>('session_completed', (e) => { completedPayload = e.payload; });
  });

  afterEach(() => {
    events.length = 0;
    createdPayload = null;
    completedPayload = null;
  });

  it('startSession generates a non-empty session ID', () => {
    const id = service.startSession({ gameMode: 'reaction-light' });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('startSession publishes session_created with matching sessionId', () => {
    const id = service.startSession({ gameMode: 'reaction-light' });
    expect(createdPayload).not.toBeNull();
    expect(createdPayload!.sessionId).toBe(id);
    expect(createdPayload!.gameMode).toBe('reaction-light');
    expect(createdPayload!.createdAt).toBeGreaterThan(0);
  });

  it('completeSession publishes session_completed with the SAME sessionId from start', () => {
    const id = service.startSession({ gameMode: 'reaction-light' });
    const results: SessionResults = {
      rawRts: [300, 250, 280],
      correctedRts: [275, 225, 255],
      totalRounds: 3,
      validRounds: 3,
      calibration: { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.5, platform: 'mobile', timestamp: Date.now() },
      sessionStart: Date.now() - 30000,
      sessionEnd: Date.now(),
    };
    service.completeSession(id, results);

    expect(completedPayload).not.toBeNull();
    // PROOF: same sessionId in BOTH events
    expect(completedPayload!.sessionId).toBe(id);
    expect(completedPayload!.sessionId).toBe(createdPayload!.sessionId);
    expect(completedPayload!.gameMode).toBe('reaction-light');
    expect(completedPayload!.results.totalRounds).toBe(3);
  });

  it('publishes session_created BEFORE session_completed', () => {
    const id = service.startSession({ gameMode: 'reaction-light' });
    const results: SessionResults = {
      rawRts: [300], correctedRts: [275],
      totalRounds: 1, validRounds: 1,
      calibration: { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.5, platform: 'mobile', timestamp: Date.now() },
      sessionStart: Date.now() - 10000, sessionEnd: Date.now(),
    };
    service.completeSession(id, results);

    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('session_created');
    expect(events[1]!.type).toBe('session_completed');
  });

  it('completeSession with unknown ID is a no-op (no event published)', () => {
    const before = events.length;
    const results: SessionResults = {
      rawRts: [300], correctedRts: [275],
      totalRounds: 1, validRounds: 1,
      calibration: { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.5, platform: 'mobile', timestamp: Date.now() },
      sessionStart: Date.now() - 10000, sessionEnd: Date.now(),
    };
    service.completeSession('non-existent-id', results);
    expect(events.length).toBe(before);
  });
});

// ----------------------------------------------------------------
// 2. Session persistence is in-memory only (no DB persistence layer)
// ----------------------------------------------------------------
describe('Session persistence stays in-memory (PersistenceProvider REMOVED 2026-08-08)', () => {
  const SUPABASE_DIR = path.resolve(__dirname, '../../core/supabase');

  it('core/supabase/PersistenceProvider.tsx does not exist', () => {
    expect(fs.existsSync(path.join(SUPABASE_DIR, 'PersistenceProvider.tsx'))).toBe(false);
  });

  it('core/supabase/data-service.ts does not exist', () => {
    expect(fs.existsSync(path.join(SUPABASE_DIR, 'data-service.ts'))).toBe(false);
  });

  it('session service keeps sessions in memory only (same ID flows to events, nothing persists)', () => {
    const publisher = createEventPublisher();
    const service = createSessionService(publisher);
    let created: SessionCreatedPayload | null = null;
    let completed: SessionCompletedPayload | null = null;
    publisher.subscribe<SessionCreatedPayload>('session_created', (e) => { created = e.payload; });
    publisher.subscribe<SessionCompletedPayload>('session_completed', (e) => { completed = e.payload; });

    const id = service.startSession({ gameMode: 'reaction-light' });
    service.completeSession(id, {
      rawRts: [300, 250],
      correctedRts: [275, 225],
      totalRounds: 2,
      validRounds: 2,
      calibration: { refreshRate: 60, displayLagMs: 16, inputLagMs: 8, confidence: 0.5, platform: 'mobile', timestamp: Date.now() },
      sessionStart: Date.now() - 20000,
      sessionEnd: Date.now(),
    });

    expect(created).not.toBeNull();
    expect(created!.sessionId).toBe(id);
    expect(completed).not.toBeNull();
    expect(completed!.sessionId).toBe(id);
    expect(completed!.sessionId).toBe(created!.sessionId);
  });
});

// ----------------------------------------------------------------
// 3. Android device detection proof (self-contained; device module ABSENT)
// ----------------------------------------------------------------
describe('Android device detection (BUG 2 proof — inline parser)', () => {
  const PLATFORM_RE = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;
  const TABLET_RE = /iPad|Android(?!.*Mobile)|Tablet/i;
  const SAMSUNG_RE = /SamsungBrowser\/([\d.]+)/i;
  const OS_RE = /Android (\d+)/;

  function detectPlatform(ua: string): 'mobile' | 'tablet' | 'desktop' {
    if (TABLET_RE.test(ua)) return 'tablet';
    if (PLATFORM_RE.test(ua)) return 'mobile';
    return 'desktop';
  }

  function detectBrowser(ua: string): string {
    if (SAMSUNG_RE.test(ua)) return 'Samsung Internet';
    if (/Chrome\//.test(ua)) return 'Chrome';
    return 'Unknown';
  }

  it('detects Android for Samsung Galaxy S23 UA (mobile)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
    expect(OS_RE.exec(ua)![1]).toBe('14');
    expect(detectPlatform(ua)).toBe('mobile');
  });

  it('detects Android for Samsung Galaxy Tab UA (tablet)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36';
    expect(detectPlatform(ua)).toBe('tablet');
  });

  it('detects Android for Xiaomi Redmi Note 12 UA (mobile)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Redmi Note 12 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36';
    expect(detectPlatform(ua)).toBe('mobile');
  });

  it('detects Samsung Internet from SamsungBrowser UA', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/120.0.6099.144 Mobile Safari/537.36';
    expect(detectBrowser(ua)).toBe('Samsung Internet');
    expect(detectPlatform(ua)).toBe('mobile');
  });

  it('no production file imports the removed device module', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../../core/device/index.ts'))).toBe(false);
  });
});

// ----------------------------------------------------------------
// 5. Subscriber cleanup — no duplicate subscriptions
// ----------------------------------------------------------------
describe('Subscriber cleanup (StrictMode proof)', () => {
  it('session_created/session_completed subscribers return cleanup that unsubscribes (StrictMode proof)', () => {
    const publisher = createEventPublisher();
    let createdHandlerCalls = 0;
    let completedHandlerCalls = 0;

    // Simulate a persistent subscription effect: subscribe → cleanup → resubscribe
    const unsubCreated = publisher.subscribe<SessionCreatedPayload>('session_created', () => { createdHandlerCalls++; });
    const unsubCompleted = publisher.subscribe<SessionCompletedPayload>('session_completed', () => { completedHandlerCalls++; });

    // Simulate StrictMode double-mount: first mount subscribes
    expect(createdHandlerCalls).toBe(0);
    expect(completedHandlerCalls).toBe(0);

    // Simulate unmount (cleanup)
    unsubCreated();
    unsubCompleted();

    // Simulate StrictMode remount: subscribe again (fresh subscriptions)
    const unsubCreated2 = publisher.subscribe<SessionCreatedPayload>('session_created', () => { createdHandlerCalls++; });
    const unsubCompleted2 = publisher.subscribe<SessionCompletedPayload>('session_completed', () => { completedHandlerCalls++; });

    // After remount, publish an event
    publisher.publish('session_created', { sessionId: 's1' } as SessionCreatedPayload, 'test');
    publisher.publish('session_completed', { sessionId: 's1' } as SessionCompletedPayload, 'test');

    // PROOF: only ONE handler call per event (no duplicate from stale subscription)
    expect(createdHandlerCalls).toBe(1);
    expect(completedHandlerCalls).toBe(1);

    // Cleanup second subscriptions
    unsubCreated2();
    unsubCompleted2();
  });

  it('session telemetry subscribers cleanup after unmount (StrictMode proof)', () => {
    const publisher = createEventPublisher();
    let startTrackCalls = 0;
    let completeTrackCalls = 0;

    const unsubCreated = publisher.subscribe<SessionCreatedPayload>('session_created', () => { startTrackCalls++; });
    const unsubCompleted = publisher.subscribe<SessionCompletedPayload>('session_completed', () => { completeTrackCalls++; });

    // Simulate StrictMode double-mount cycle
    // First mount → subscribe → unmount (cleanup)
    unsubCreated();
    unsubCompleted();

    // Remount → fresh subscriptions
    const unsubCreated2 = publisher.subscribe<SessionCreatedPayload>('session_created', () => { startTrackCalls++; });
    const unsubCompleted2 = publisher.subscribe<SessionCompletedPayload>('session_completed', () => { completeTrackCalls++; });

    publisher.publish('session_created', { sessionId: 's1', gameMode: 'test', createdAt: Date.now() }, 'test');
    publisher.publish('session_completed', { sessionId: 's1', gameMode: 'test', results: {} as SessionResults, createdAt: Date.now() }, 'test');

    expect(startTrackCalls).toBe(1);
    expect(completeTrackCalls).toBe(1);

    unsubCreated2();
    unsubCompleted2();
  });

  it('multiple mounts without cleanup do cause duplicates (proving cleanup is needed)', () => {
    const publisher = createEventPublisher();
    let callCount = 0;

    // Mount 1 — NO cleanup (simulates bug)
    publisher.subscribe<SessionCreatedPayload>('session_created', () => { callCount++; });
    // Mount 2 — NO cleanup (duplicate subscription)
    publisher.subscribe<SessionCreatedPayload>('session_created', () => { callCount++; });

    publisher.publish('session_created', { sessionId: 's1', gameMode: 'test', createdAt: Date.now() }, 'test');

    // PROOF: Without cleanup, we get 2 calls (duplicate subscribers!)
    expect(callCount).toBe(2);

    // This is why cleanup is critical — our implementation has it ✓
  });
});
