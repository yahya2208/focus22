export interface SessionRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly gameMode: string;
  readonly calibrationProfile: {
    readonly refreshRate: number;
    readonly displayLagMs: number;
    readonly inputLagMs: number;
    readonly confidence: number;
    readonly platform: string;
  };
  readonly results: {
    readonly rawRtMs: readonly number[];
    readonly correctedRtMs: readonly number[];
    readonly meanCorrectedMs: number;
    readonly medianCorrectedMs: number;
    readonly consistencyScore: number;
    readonly consistencyRating: string;
    readonly fatigueIndex: number;
    readonly fatigueScore: number;
    readonly focusScore: number;
    readonly grade: string;
    readonly totalRounds: number;
    readonly validRounds: number;
    readonly outlierCount: number;
  };
}

export interface IRepository {
  saveSession(record: SessionRecord): Promise<void>;
  getSessions(): Promise<readonly SessionRecord[]>;
  getSession(id: string): Promise<SessionRecord | null>;
  clearSessions(): Promise<void>;
}

const STORAGE_KEY = 'focus_sessions';

export function createMemoryRepository(): IRepository {
  const store = new Map<string, SessionRecord>();

  return {
    async saveSession(record) {
      store.set(record.id, record);
    },
    async getSessions() {
      return Array.from(store.values()).sort((a, b) => b.timestamp - a.timestamp);
    },
    async getSession(id) {
      return store.get(id) ?? null;
    },
    async clearSessions() {
      store.clear();
    },
  };
}

export function createLocalStorageRepository(): IRepository {
  return {
    async saveSession(record) {
      const sessions = await this.getSessions();
      const updated = [record, ...sessions];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    },
    async getSessions() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      try {
        return JSON.parse(raw) as SessionRecord[];
      } catch {
        return [];
      }
    },
    async getSession(id) {
      const sessions = await this.getSessions();
      return sessions.find((s) => s.id === id) ?? null;
    },
    async clearSessions() {
      localStorage.removeItem(STORAGE_KEY);
    },
  };
}
