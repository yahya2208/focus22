export type SessionStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'archived'
  | 'synced'
  | 'failed';

export interface SessionMeasurements {
  readonly rawRts: readonly number[];
  readonly correctedRts: readonly number[];
  readonly totalRounds: number;
  readonly validRounds: number;
  readonly outlierCount: number;
}

export interface SessionScientificResults {
  readonly meanCorrectedMs: number;
  readonly medianCorrectedMs: number;
  readonly consistencyScore: number;
  readonly consistencyRating: string;
  readonly fatigueIndex: number;
  readonly fatigueScore: number;
  readonly focusScore: number;
  readonly grade: string;
}

export interface SessionMetadata {
  readonly version: string;
  readonly pluginVersion: string;
  readonly buildNumber: number;
}

export interface Session {
  readonly id: string;
  readonly status: SessionStatus;
  readonly calibrationId: string;
  readonly pluginId: string;
  readonly deviceId: string;
  readonly measurements: SessionMeasurements | null;
  readonly scientificResults: SessionScientificResults | null;
  readonly metadata: SessionMetadata;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt: number | null;
}

export interface SessionDraft {
  readonly calibrationId: string;
  readonly pluginId: string;
  readonly deviceId: string;
}

const VALID_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  draft: ['running', 'failed'],
  running: ['paused', 'completed', 'failed'],
  paused: ['running', 'failed'],
  completed: ['archived', 'synced'],
  archived: [],
  synced: ['archived'],
  failed: ['draft'],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createSessionId(): string {
  return crypto.randomUUID();
}

export function createSession(draft: SessionDraft): Session {
  const now = Date.now();
  return {
    id: createSessionId(),
    status: 'draft',
    calibrationId: draft.calibrationId,
    pluginId: draft.pluginId,
    deviceId: draft.deviceId,
    measurements: null,
    scientificResults: null,
    metadata: {
      version: '0.1.0-alpha',
      pluginVersion: '1.0.0',
      buildNumber: 1,
    },
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
}

export function transitionSession(
  session: Session,
  to: SessionStatus,
): Session {
  if (!canTransition(session.status, to)) {
    throw new Error(
      `Invalid session transition: ${session.status} → ${to}`,
    );
  }
  const now = Date.now();
  return {
    ...session,
    status: to,
    updatedAt: now,
    finishedAt: to === 'completed' || to === 'failed' ? now : session.finishedAt,
  };
}

export function updateSessionMeasurements(
  session: Session,
  measurements: SessionMeasurements,
  results: SessionScientificResults,
): Session {
  return {
    ...session,
    measurements,
    scientificResults: results,
    updatedAt: Date.now(),
  };
}

export function isSessionComplete(session: Session): boolean {
  return session.status === 'completed' || session.status === 'synced' || session.status === 'archived';
}

export function getSessionDuration(session: Session): number {
  const end = session.finishedAt ?? Date.now();
  return end - session.createdAt;
}
