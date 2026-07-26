import { describe, it, expect, vi } from 'vitest';
import {
  createEventPublisher,
} from '../../core/events';

describe('Event Publisher', () => {
  it('should publish and subscribe to events', () => {
    const pub = createEventPublisher();
    const handler = vi.fn();
    pub.subscribe('session_created', handler);
    pub.publish('session_created', { id: 's1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].type).toBe('session_created');
    expect(handler.mock.calls[0]?.[0].payload).toEqual({ id: 's1' });
  });

  it('should unsubscribe from events', () => {
    const pub = createEventPublisher();
    const handler = vi.fn();
    const unsub = pub.subscribe('session_created', handler);
    pub.publish('session_created', { id: 's1' });
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    pub.publish('session_created', { id: 's2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should subscribe to all events', () => {
    const pub = createEventPublisher();
    const handler = vi.fn();
    pub.subscribeAll(handler);
    pub.publish('session_created', { id: 's1' });
    pub.publish('session_completed', { id: 's1' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should maintain event history', () => {
    const pub = createEventPublisher();
    pub.publish('session_created', { id: 's1' });
    pub.publish('session_completed', { id: 's1' });
    const history = pub.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.type).toBe('session_completed');
    expect(history[1]?.type).toBe('session_created');
  });

  it('should filter history by event type', () => {
    const pub = createEventPublisher();
    pub.publish('session_created', { id: 's1' });
    pub.publish('session_completed', { id: 's1' });
    pub.publish('session_created', { id: 's2' });
    const history = pub.getHistory('session_created');
    expect(history).toHaveLength(2);
  });

  it('should clear history', () => {
    const pub = createEventPublisher();
    pub.publish('session_created', { id: 's1' });
    pub.clearHistory();
    expect(pub.getHistory()).toHaveLength(0);
  });

  it('should include source and timestamp', () => {
    const pub = createEventPublisher();
    pub.publish('settings_changed', { theme: 'dark' }, 'test');
    const event = pub.getHistory()[0];
    expect(event?.source).toBe('test');
    expect(event?.timestamp).toBeGreaterThan(0);
  });

  it('should not crash on handler errors', () => {
    const pub = createEventPublisher();
    pub.subscribe('session_created', () => {
      throw new Error('handler error');
    });
    expect(() => pub.publish('session_created', { id: 's1' })).not.toThrow();
  });

  it('should default source to system', () => {
    const pub = createEventPublisher();
    pub.publish('session_created', { id: 's1' });
    const event = pub.getHistory()[0];
    expect(event?.source).toBe('system');
  });

  it('should respect history limit', () => {
    const pub = createEventPublisher();
    for (let i = 0; i < 10; i++) {
      pub.publish('session_created', { id: `s${i}` });
    }
    const history = pub.getHistory(undefined, 5);
    expect(history).toHaveLength(5);
  });
});
