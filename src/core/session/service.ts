import type { CalibrationProfile } from '../calibration';
import { getGlobalEventPublisher, type EventPublisher } from '../events';
import { createSessionId } from './index';
import { emitDiagnosticLog } from '../supabase/live-diagnostics';

export type EndedReason =
  | 'completed'
  | 'abandoned'
  | 'browser_closed'
  | 'timeout'
  | 'crash'
  | 'admin_closed'
  | 'network_lost';

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
  readonly endedReason: EndedReason;
}

export interface SessionAbandonedPayload {
  readonly sessionId: string;
  readonly reason: EndedReason;
}

export interface SessionService {
  startSession(params: SessionStartParams): string;
  completeSession(sessionId: string, results: SessionResults): void;
  abandonSession(sessionId: string, reason: EndedReason): void;
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

      emitDiagnosticLog({
        service: 'session',
        action: 'session_created',
        caller: 'session-service',
        sessionId,
        status: 'ok',
      });

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
      if (!session) {
        emitDiagnosticLog({
          service: 'session',
          action: 'session_completed_skipped',
          caller: 'session-service',
          trigger: 'unknown_session',
          sessionId,
          status: 'skipped',
        });
        return;
      }

      activeSessions.delete(sessionId);

      emitDiagnosticLog({
        service: 'session',
        action: 'game_completed',
        caller: 'session-service',
        sessionId,
        status: 'ok',
      });
      emitDiagnosticLog({
        service: 'session',
        action: 'completeSession',
        caller: 'session-service',
        trigger: 'completeSession',
        sessionId,
        status: 'ok',
      });

      publisher.publish<SessionCompletedPayload>('session_completed', {
        sessionId,
        gameMode: session.gameMode,
        campaignId: session.campaignId,
        results,
        createdAt: session.createdAt,
        endedReason: 'completed',
      }, 'session-service');
    },

    abandonSession(sessionId: string, reason: EndedReason): void {
      const session = activeSessions.get(sessionId);
      if (!session) {
        emitDiagnosticLog({
          service: 'session',
          action: 'session_abandoned_skipped',
          caller: 'session-service',
          trigger: 'unknown_session',
          sessionId,
          status: 'skipped',
        });
        return;
      }

      activeSessions.delete(sessionId);

      emitDiagnosticLog({
        service: 'session',
        action: 'abandonSession',
        caller: 'session-service',
        trigger: reason,
        sessionId,
        status: 'ok',
      });

      publisher.publish<SessionAbandonedPayload>('session_abandoned', {
        sessionId,
        reason,
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
