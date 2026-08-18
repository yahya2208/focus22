/**
 * useChallengeSubmission — manages the full challenge submission lifecycle.
 *
 * SECURITY INVARIANTS (mirrors P3 challenge-service.ts):
 *   - The client NEVER calculates, stores, or overrides focus_score, grade,
 *     RT score, consistency score, fatigue score, qualification, or rank.
 *   - All fields in ChallengeSubmitResult come exclusively from the server.
 *   - Nonces are generated internally by submitChallengeScore (Web Crypto API).
 *
 * Flow:
 *   1. On mount, if a challengeId is present and the user is authenticated,
 *      submission fires automatically.
 *   2. Auth-required errors pause submission and surface a sign-in CTA.
 *   3. Duplicate submissions are prevented via a ref guard.
 *   4. claim() is available only after a qualified submission.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  submitChallengeScore,
  createChallengeClaim,
} from '../challenge/challenge-service';
import { getActiveChallengeId } from '../challenge/challenge-context';
import type {
  ChallengeSubmitResult,
  ChallengeClaimResult,
  ChallengeError,
} from '../challenge/types';
import type { CalibrationProfile } from '../core/calibration';

// ── Types ────────────────────────────────────────────────────────────────────

export type SubmissionStatus =
  | 'disabled'
  | 'auth-required'
  | 'submitting'
  | 'submitted'
  | 'claiming'
  | 'claimed'
  | 'error';

export interface UseChallengeSubmissionResult {
  readonly challengeId: string | null;
  readonly status: SubmissionStatus;
  readonly result: ChallengeSubmitResult | null;
  readonly claimResult: ChallengeClaimResult | null;
  readonly error: ChallengeError | null;
  readonly claim: () => void;
}

export interface UseChallengeSubmissionParams {
  readonly authStatus: string;
  readonly userId: string | null;
  readonly rawRts: readonly number[];
  readonly calibration: CalibrationProfile;
  readonly sessionId: string | null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChallengeSubmission({
  authStatus,
  userId: _userId,
  rawRts,
  calibration,
  sessionId,
}: UseChallengeSubmissionParams): UseChallengeSubmissionResult {
  const [status, setStatus] = useState<SubmissionStatus>('disabled');
  const [result, setResult] = useState<ChallengeSubmitResult | null>(null);
  const [claimResult, setClaimResult] = useState<ChallengeClaimResult | null>(null);
  const [error, setError] = useState<ChallengeError | null>(null);

  const submittedRef = useRef(false);
  const challengeId = getActiveChallengeId();

  // ── Auto-submit on mount ────────────────────────────────────────────────

  useEffect(() => {
    if (!challengeId) {
      setStatus('disabled');
      return;
    }
    if (authStatus !== 'authenticated' && authStatus !== 'anonymous') {
      setStatus('auth-required');
      return;
    }
    if (submittedRef.current) return;
    submittedRef.current = true;

    let cancelled = false;

    async function run() {
      setStatus('submitting');
      try {
        const res = await submitChallengeScore({
          challengeId: challengeId!,
          rawRts,
          displayLagMs: calibration.displayLagMs,
          inputLagMs: calibration.inputLagMs,
          platform: calibration.platform,
          sessionId: sessionId ?? undefined,
        });
        if (cancelled) return;
        setResult(res);
        setStatus('submitted');
      } catch (e) {
        if (cancelled) return;
        const err = e as ChallengeError;
        setError(err);
        if (err.code === 'AUTH_REQUIRED') {
          setStatus('auth-required');
        } else {
          setStatus('error');
        }
      }
    }

    void run();

    return () => { cancelled = true; };
  }, [challengeId, authStatus, rawRts, calibration, sessionId]);

  // ── Claim ───────────────────────────────────────────────────────────────

  const claim = useCallback(async () => {
    if (!result || !result.isQualified) return;
    if (status === 'claiming' || status === 'claimed') return;

    setStatus('claiming');
    try {
      const res = await createChallengeClaim(result.submissionId);
      setClaimResult(res);
      setStatus('claimed');
    } catch (e) {
      const err = e as ChallengeError;
      setError(err);
      setStatus('submitted');
    }
  }, [result, status]);

  return { challengeId, status, result, claimResult, error, claim };
}
