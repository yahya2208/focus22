import type { Session, SessionStatus } from '../session';
import type {
  SessionRepository,
  SessionFilter,
  SessionSort,
  SessionPage,
} from './types';

const STORAGE_KEY = 'focus_sessions_v2';

function readStore(): Session[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

function writeStore(sessions: Session[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

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

export function createLocalStorageSessionRepository(): SessionRepository {
  return {
    async save(session: Session): Promise<void> {
      const sessions = readStore();
      const existing = sessions.findIndex((s) => s.id === session.id);
      if (existing >= 0) {
        sessions[existing] = session;
      } else {
        sessions.push(session);
      }
      writeStore(sessions);
    },

    async getById(id: string): Promise<Session | null> {
      const sessions = readStore();
      return sessions.find((s) => s.id === id) ?? null;
    },

    async getAll(
      filter?: SessionFilter,
      sort?: SessionSort,
      offset = 0,
      limit = 50,
    ): Promise<SessionPage> {
      let sessions = readStore();

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
      return readStore()
        .filter((s) => s.status === status)
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async update(session: Session): Promise<void> {
      const sessions = readStore();
      const idx = sessions.findIndex((s) => s.id === session.id);
      if (idx < 0) throw new Error(`Session ${session.id} not found`);
      sessions[idx] = session;
      writeStore(sessions);
    },

    async delete(id: string): Promise<void> {
      const sessions = readStore().filter((s) => s.id !== id);
      writeStore(sessions);
    },

    async count(filter?: SessionFilter): Promise<number> {
      const sessions = readStore();
      if (!filter) return sessions.length;
      return sessions.filter((s) => matchesFilter(s, filter)).length;
    },

    async clear(): Promise<void> {
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
