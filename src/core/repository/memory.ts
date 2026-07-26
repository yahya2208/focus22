import type { Session, SessionStatus } from '../session';
import type {
  SessionRepository,
  SessionFilter,
  SessionSort,
  SessionPage,
} from './types';

function matchesFilter(session: Session, filter: SessionFilter): boolean {
  if (filter.status && session.status !== filter.status) return false;
  if (filter.pluginId && session.pluginId !== filter.pluginId) return false;
  if (filter.dateFrom && session.createdAt < filter.dateFrom) return false;
  if (filter.dateTo && session.createdAt > filter.dateTo) return false;
  if (filter.minScore != null && (session.scientificResults?.focusScore ?? 0) < filter.minScore) return false;
  if (filter.maxScore != null && (session.scientificResults?.focusScore ?? 0) > filter.maxScore) return false;
  return true;
}

function compareSessions(a: Session, b: Session, sort: SessionSort): number {
  let cmp = 0;
  switch (sort.field) {
    case 'createdAt':
      cmp = a.createdAt - b.createdAt;
      break;
    case 'finishedAt':
      cmp = (a.finishedAt ?? 0) - (b.finishedAt ?? 0);
      break;
    case 'focusScore':
      cmp = (a.scientificResults?.focusScore ?? 0) - (b.scientificResults?.focusScore ?? 0);
      break;
    case 'pluginId':
      cmp = a.pluginId.localeCompare(b.pluginId);
      break;
  }
  return sort.direction === 'desc' ? -cmp : cmp;
}

export function createMemorySessionRepository(): SessionRepository {
  const store = new Map<string, Session>();

  return {
    async save(session: Session): Promise<void> {
      store.set(session.id, session);
    },

    async getById(id: string): Promise<Session | null> {
      return store.get(id) ?? null;
    },

    async getAll(
      filter?: SessionFilter,
      sort?: SessionSort,
      offset = 0,
      limit = 50,
    ): Promise<SessionPage> {
      let sessions = Array.from(store.values());

      if (filter) {
        sessions = sessions.filter((s) => matchesFilter(s, filter));
      }

      if (sort) {
        sessions.sort((a, b) => compareSessions(a, b, sort));
      } else {
        sessions.sort((a, b) => b.createdAt - a.createdAt);
      }

      const total = sessions.length;
      const paged = sessions.slice(offset, offset + limit);

      return { sessions: paged, total, offset, limit };
    },

    async getByStatus(status: SessionStatus): Promise<readonly Session[]> {
      return Array.from(store.values())
        .filter((s) => s.status === status)
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async update(session: Session): Promise<void> {
      if (!store.has(session.id)) {
        throw new Error(`Session ${session.id} not found`);
      }
      store.set(session.id, session);
    },

    async delete(id: string): Promise<void> {
      store.delete(id);
    },

    async count(filter?: SessionFilter): Promise<number> {
      if (!filter) return store.size;
      return Array.from(store.values()).filter((s) => matchesFilter(s, filter)).length;
    },

    async clear(): Promise<void> {
      store.clear();
    },
  };
}
