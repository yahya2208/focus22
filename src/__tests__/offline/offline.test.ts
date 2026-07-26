import { describe, it, expect, vi } from 'vitest';
import { createOfflineQueue, resolveConflict, calculateRetryDelay, shouldRetry, createSyncManager } from '../../core/offline';

describe('Offline Queue', () => {
  it('should enqueue items', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    expect(queue.size()).toBe(1);
  });

  it('should dequeue items in order', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    queue.enqueue({ operation: 'update', table: 'sessions', payload: { id: '2' } });
    const item = queue.dequeue();
    expect(item).not.toBeNull();
    expect(item?.status).toBe('syncing');
  });

  it('should return null when empty', () => {
    const queue = createOfflineQueue();
    expect(queue.dequeue()).toBeNull();
  });

  it('should mark items completed', () => {
    const queue = createOfflineQueue();
    const item = queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    queue.dequeue();
    queue.markCompleted(item.id);
    expect(queue.size()).toBe(0);
  });

  it('should mark items as retrying after failure (below max retries)', () => {
    const queue = createOfflineQueue();
    const item = queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    queue.dequeue();
    queue.markFailed(item.id, 'Network error');
    const all = queue.getAll();
    const failed = all.find((i) => i.id === item.id);
    expect(failed?.status).toBe('retrying');
    expect(failed?.retryCount).toBe(1);
    expect(failed?.nextRetryAt).toBeGreaterThan(Date.now());
  });

  it('should mark items as failed after max retries exceeded', () => {
    const queue = createOfflineQueue();
    const item = queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    for (let i = 0; i < 5; i++) {
      queue.dequeue();
      queue.markFailed(item.id, 'Network error');
    }
    const failed = queue.getFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0]?.retryCount).toBe(5);
  });

  it('should clear completed items', () => {
    const queue = createOfflineQueue();
    const item = queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    queue.dequeue();
    queue.markCompleted(item.id);
    queue.clearCompleted();
    expect(queue.getAll()).toHaveLength(0);
  });

  it('should get all items', () => {
    const queue = createOfflineQueue();
    queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    queue.enqueue({ operation: 'update', table: 'sessions', payload: { id: '2' } });
    expect(queue.getAll()).toHaveLength(2);
  });
});

describe('Conflict Resolution', () => {
  it('should resolve with client_wins', () => {
    const result = resolveConflict({ value: 'local' }, { value: 'remote' }, 'client_wins');
    expect(result.winner).toEqual({ value: 'local' });
    expect(result.merged).toBe(false);
  });

  it('should resolve with server_wins', () => {
    const result = resolveConflict({ value: 'local' }, { value: 'remote' }, 'server_wins');
    expect(result.winner).toEqual({ value: 'remote' });
    expect(result.merged).toBe(false);
  });

  it('should resolve with last_write_wins using updatedAt', () => {
    const local = { value: 'local', updatedAt: 200 };
    const remote = { value: 'remote', updatedAt: 100 };
    const result = resolveConflict(local, remote, 'last_write_wins');
    expect(result.winner).toEqual(local);
  });

  it('should resolve with merge strategy', () => {
    const local = { a: 1, b: 2 };
    const remote = { b: 99, c: 3 };
    const result = resolveConflict(local, remote, 'merge');
    expect(result.merged).toBe(true);
    expect(result.winner).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('Retry Logic', () => {
  it('should calculate exponential backoff', () => {
    expect(calculateRetryDelay(0)).toBe(1000);
    expect(calculateRetryDelay(1)).toBe(2000);
    expect(calculateRetryDelay(2)).toBe(4000);
    expect(calculateRetryDelay(3)).toBe(8000);
  });

  it('should cap at max delay', () => {
    expect(calculateRetryDelay(10)).toBe(60000);
  });

  it('should allow retry within limit', () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(4)).toBe(true);
    expect(shouldRetry(5)).toBe(false);
  });
});

describe('Sync Manager', () => {
  it('should start in online/offline based on navigator', () => {
    const queue = createOfflineQueue();
    const manager = createSyncManager(async () => true, queue);
    const status = manager.getStatus();
    expect(['online', 'offline']).toContain(status);
  });

  it('should sync pending items', async () => {
    const queue = createOfflineQueue();
    let processed = 0;
    const manager = createSyncManager(async () => { processed++; return true; }, queue);
    queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    queue.enqueue({ operation: 'update', table: 'sessions', payload: { id: '2' } });
    const result = await manager.startSync();
    expect(result.uploaded).toBe(2);
    expect(processed).toBe(2);
  });

  it('should handle sync failures', async () => {
    const queue = createOfflineQueue();
    const manager = createSyncManager(async () => { throw new Error('Network error'); }, queue);
    queue.enqueue({ operation: 'create', table: 'sessions', payload: { id: '1' } });
    const result = await manager.startSync();
    expect(result.failed).toBe(1);
  });

  it('should subscribe to status changes', () => {
    const queue = createOfflineQueue();
    const manager = createSyncManager(async () => true, queue);
    const handler = vi.fn();
    const unsub = manager.onStatusChange(handler);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
