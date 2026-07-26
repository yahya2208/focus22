import type { Session, SessionStatus } from '../session';

export interface SessionFilter {
  readonly status?: SessionStatus;
  readonly pluginId?: string;
  readonly dateFrom?: number;
  readonly dateTo?: number;
  readonly minScore?: number;
  readonly maxScore?: number;
}

export type SessionSortField = 'createdAt' | 'finishedAt' | 'focusScore' | 'pluginId';
export type SortDirection = 'asc' | 'desc';

export interface SessionSort {
  readonly field: SessionSortField;
  readonly direction: SortDirection;
}

export interface SessionPage {
  readonly sessions: readonly Session[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

export interface SessionRepository {
  save(session: Session): Promise<void>;
  getById(id: string): Promise<Session | null>;
  getAll(filter?: SessionFilter, sort?: SessionSort, offset?: number, limit?: number): Promise<SessionPage>;
  getByStatus(status: SessionStatus): Promise<readonly Session[]>;
  update(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  count(filter?: SessionFilter): Promise<number>;
  clear(): Promise<void>;
}
