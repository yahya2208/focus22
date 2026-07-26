export type EventType =
  | 'session_created'
  | 'session_updated'
  | 'session_completed'
  | 'session_deleted'
  | 'session_synced'
  | 'calibration_updated'
  | 'settings_changed';

export interface DomainEvent<T = unknown> {
  readonly type: EventType;
  readonly payload: T;
  readonly timestamp: number;
  readonly source: string;
}

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => void;

export interface EventPublisher {
  publish<T>(type: EventType, payload: T, source?: string): void;
  subscribe<T>(type: EventType, handler: EventHandler<T>): () => void;
  subscribeAll(handler: EventHandler): () => void;
  getHistory(type?: EventType, limit?: number): readonly DomainEvent[];
  clearHistory(): void;
}

export function createEventPublisher(): EventPublisher {
  const handlers = new Map<EventType, Set<EventHandler>>();
  const allHandlers = new Set<EventHandler>();
  const history: DomainEvent[] = [];
  const MAX_HISTORY = 100;

  return {
    publish<T>(type: EventType, payload: T, source = 'system'): void {
      const event: DomainEvent<T> = {
        type,
        payload,
        timestamp: Date.now(),
        source,
      };

      history.unshift(event);
      if (history.length > MAX_HISTORY) {
        history.length = MAX_HISTORY;
      }

      const typedHandlers = handlers.get(type);
      if (typedHandlers) {
        for (const handler of typedHandlers) {
          try {
            handler(event);
          } catch {
            // handler errors should not break publishing
          }
        }
      }

      for (const handler of allHandlers) {
        try {
          handler(event);
        } catch {
          // handler errors should not break publishing
        }
      }
    },

    subscribe<T>(type: EventType, handler: EventHandler<T>): () => void {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler as EventHandler);
      return () => {
        handlers.get(type)?.delete(handler as EventHandler);
      };
    },

    subscribeAll(handler: EventHandler): () => void {
      allHandlers.add(handler);
      return () => {
        allHandlers.delete(handler);
      };
    },

    getHistory(type?: EventType, limit = 50): readonly DomainEvent[] {
      const filtered = type ? history.filter((e) => e.type === type) : history;
      return filtered.slice(0, limit);
    },

    clearHistory(): void {
      history.length = 0;
    },
  };
}

let globalPublisher: EventPublisher | null = null;

export function getGlobalEventPublisher(): EventPublisher {
  if (!globalPublisher) {
    globalPublisher = createEventPublisher();
  }
  return globalPublisher;
}

export function resetGlobalEventPublisher(): void {
  globalPublisher = null;
}
