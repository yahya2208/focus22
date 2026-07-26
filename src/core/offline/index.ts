export type QueueStatus = 'pending' | 'syncing' | 'completed' | 'failed' | 'retrying';

export interface QueueItem {
  readonly id: string;
  readonly operation: 'create' | 'update' | 'delete';
  readonly table: string;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly status: QueueStatus;
  readonly error: string | null;
  readonly nextRetryAt: number | null;
}

export interface OfflineQueue {
  enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retryCount' | 'maxRetries' | 'status' | 'error' | 'nextRetryAt'>): QueueItem;
  dequeue(): QueueItem | null;
  markCompleted(id: string): void;
  markFailed(id: string, error: string): void;
  getPending(): readonly QueueItem[];
  getFailed(): readonly QueueItem[];
  getAll(): readonly QueueItem[];
  size(): number;
  clear(): void;
  clearCompleted(): void;
}

export function createOfflineQueue(): OfflineQueue {
  const items: QueueItem[] = [];
  let counter = 0;

  return {
    enqueue(item): QueueItem {
      const queueItem: QueueItem = {
        ...item,
        id: `q_${Date.now().toString(36)}_${(counter++).toString(36)}`,
        createdAt: Date.now(),
        retryCount: 0,
        maxRetries: 5,
        status: 'pending',
        error: null,
        nextRetryAt: null,
      };
      items.push(queueItem);
      return queueItem;
    },

    dequeue(): QueueItem | null {
      const now = Date.now();
      const item = items.find(
        (i) => i.status === 'pending' || (i.status === 'retrying' && i.nextRetryAt != null && i.nextRetryAt <= now),
      );
      if (!item) return null;
      return { ...item, status: 'syncing' };
    },

    markCompleted(id: string): void {
      const item = items.find((i) => i.id === id);
      if (item) {
        items[items.indexOf(item)] = { ...item, status: 'completed' };
      }
    },

    markFailed(id: string, error: string): void {
      const item = items.find((i) => i.id === id);
      if (item) {
        const newRetryCount = item.retryCount + 1;
        const backoffMs = Math.min(1000 * Math.pow(2, newRetryCount), 60000);
        items[items.indexOf(item)] = {
          ...item,
          status: newRetryCount >= item.maxRetries ? 'failed' : 'retrying',
          error,
          retryCount: newRetryCount,
          nextRetryAt: Date.now() + backoffMs,
        };
      }
    },

    getPending(): readonly QueueItem[] {
      return items.filter((i) => i.status === 'pending');
    },

    getFailed(): readonly QueueItem[] {
      return items.filter((i) => i.status === 'failed');
    },

    getAll(): readonly QueueItem[] {
      return [...items];
    },

    size(): number {
      return items.filter((i) => i.status !== 'completed').length;
    },

    clear(): void {
      items.length = 0;
    },

    clearCompleted(): void {
      const pending = items.filter((i) => i.status !== 'completed');
      items.length = 0;
      items.push(...pending);
    },
  };
}

export interface ConflictResolution {
  readonly strategy: 'client_wins' | 'server_wins' | 'last_write_wins' | 'merge';
}

export interface SyncResult {
  readonly uploaded: number;
  readonly conflicts: number;
  readonly resolved: number;
  readonly failed: number;
}

export function resolveConflict(
  local: unknown,
  remote: unknown,
  strategy: ConflictResolution['strategy'],
): { winner: unknown; merged: boolean } {
  if (strategy === 'client_wins') return { winner: local, merged: false };
  if (strategy === 'server_wins') return { winner: remote, merged: false };

  if (strategy === 'last_write_wins') {
    const localTime = (local as { updatedAt?: number; updated_at?: string })?.updatedAt
      ?? new Date((local as { updated_at?: string })?.updated_at ?? 0).getTime();
    const remoteTime = (remote as { updatedAt?: number; updated_at?: string })?.updatedAt
      ?? new Date((remote as { updated_at?: string })?.updated_at ?? 0).getTime();
    return { winner: localTime >= remoteTime ? local : remote, merged: false };
  }

  if (strategy === 'merge') {
    return { winner: { ...(remote as object), ...(local as object) }, merged: true };
  }

  return { winner: local, merged: false };
}

export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

export function calculateRetryDelay(retryCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, retryCount);
  return Math.min(delay, config.maxDelayMs);
}

export function shouldRetry(retryCount: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  return retryCount < config.maxRetries;
}

export type SyncStatus = 'idle' | 'syncing' | 'online' | 'offline' | 'error';

export interface SyncManager {
  getStatus(): SyncStatus;
  startSync(): Promise<SyncResult>;
  onStatusChange(handler: (status: SyncStatus) => void): () => void;
}

export function createSyncManager(
  processItem: (item: QueueItem) => Promise<boolean>,
  queue: OfflineQueue,
): SyncManager {
  let status: SyncStatus = navigator.onLine ? 'online' : 'offline';
  const statusListeners = new Set<(s: SyncStatus) => void>();

  function setStatus(s: SyncStatus) {
    status = s;
    for (const handler of statusListeners) {
      try { handler(s); } catch { /* ignore */ }
    }
  }

  window.addEventListener('online', () => setStatus('online'));
  window.addEventListener('offline', () => setStatus('offline'));

  return {
    getStatus(): SyncStatus {
      return status;
    },

    async startSync(): Promise<SyncResult> {
      setStatus('syncing');
      let uploaded = 0;
      let conflicts = 0;
      let resolved = 0;
      let failed = 0;

      try {
        let item = queue.dequeue();
        while (item) {
          try {
            const success = await processItem(item);
            if (success) {
              queue.markCompleted(item.id);
              uploaded++;
            } else {
              conflicts++;
              queue.markFailed(item.id, 'Conflict detected');
              resolved++;
            }
          } catch (err) {
            queue.markFailed(item.id, err instanceof Error ? err.message : 'Unknown error');
            failed++;
          }
          item = queue.dequeue();
        }
      } finally {
        setStatus(navigator.onLine ? 'online' : 'offline');
      }

      return { uploaded, conflicts, resolved, failed };
    },

    onStatusChange(handler: (status: SyncStatus) => void): () => void {
      statusListeners.add(handler);
      return () => { statusListeners.delete(handler); };
    },
  };
}
