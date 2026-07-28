import type { CalibrationProfile } from '../calibration';
import { getGlobalEventPublisher, type EventPublisher } from '../events';
import { createSessionId } from './index';

export interface SessionResults {
  readonly rawRts: readonly number[];
  readonly correctedRts: readonly number[];
  readonly totalRounds: number;
  readonly validRounds: number;
  readonly calibration: CalibrationProfile;
  readonly sessionStart: number;
  readonly sessionEnd: number;
}

export interface SessionStartParams {
  readonly gameMode: string;
  readonly campaignId: string | null;
}

export interface SessionCreatedPayload {
  readonly sessionId: string;
  readonly gameMode: string;
  readonly campaignId: string | null;
  readonly createdAt: number;
}

export interface SessionCompletedPayload {
  readonly sessionId: string;
  readonly gameMode: string;
  readonly campaignId: string | null;
  readonly results: SessionResults;
  readonly createdAt: number;
}

export interface SessionService {
  startSession(params: SessionStartParams): string;
  completeSession(sessionId: string, results: SessionResults): void;
}

export function createSessionService(
  publisher: EventPublisher = getGlobalEventPublisher(),
): SessionService {
  const activeSessions = new Map<string, { gameMode: string; campaignId: string | null; createdAt: number }>();

  return {
    startSession(params: SessionStartParams): string {
      const sessionId = createSessionId();
      const now = Date.now();
      activeSessions.set(sessionId, { gameMode: params.gameMode, campaignId: params.campaignId, createdAt: now });

      publisher.publish<SessionCreatedPayload>('session_created', {
        sessionId,
        gameMode: params.gameMode,
        campaignId: params.campaignId,
        createdAt: now,
      }, 'session-service');

      return sessionId;
    },

    completeSession(sessionId: string, results: SessionResults): void {
      const session = activeSessions.get(sessionId);
      if (!session) return;

      activeSessions.delete(sessionId);

      publisher.publish<SessionCompletedPayload>('session_completed', {
        sessionId,
        gameMode: session.gameMode,
        campaignId: session.campaignId,
        results,
        createdAt: session.createdAt,
      }, 'session-service');
    },
  };
}

let globalSessionService: SessionService | null = null;

export function getGlobalSessionService(): SessionService {
  if (!globalSessionService) {
    globalSessionService = createSessionService();
  }
  return globalSessionService;
}

export function resetGlobalSessionService(): void {
  globalSessionService = null;
}
