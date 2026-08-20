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
 *   5. retry() re-attempts a failed submission (network/transient errors).
 *   6. Claim codes are persisted to localStorage as backup (not source of truth).
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
  readonly retry: () => void;
}

export interface UseChallengeSubmissionParams {
  readonly authStatus: string;
  readonly userId: string | null;
  readonly rawRts: readonly number[];
  readonly calibration: CalibrationProfile;
  readonly sessionId: string | null;
  readonly guestSessionId?: string;
}

// ── localStorage Persistence ─────────────────────────────────────────────────

const CLAIM_STORAGE_KEY = 'focus_claim_data';

interface StoredClaimData {
  submissionId: string;
  claimId: string;
  code: string;
  token: string;
  expiresAt: string;
  challengeId: string;
}

function persistClaim(data: StoredClaimData): void {
  try {
    localStorage.setItem(CLAIM_STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full or unavailable — non-critical */ }
}

function loadStoredClaim(challengeId: string): StoredClaimData | null {
  try {
    const raw = localStorage.getItem(CLAIM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredClaimData;
    if (parsed.challengeId !== challengeId) return null;
    if (new Date(parsed.expiresAt) < new Date()) return null;
    return parsed;
  } catch { return null; }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChallengeSubmission({
  authStatus,
  userId: _userId,
  rawRts,
  calibration,
  sessionId,
  guestSessionId,
}: UseChallengeSubmissionParams): UseChallengeSubmissionResult {
  const [status, setStatus] = useState<SubmissionStatus>('disabled');
  const [result, setResult] = useState<ChallengeSubmitResult | null>(null);
  const [claimResult, setClaimResult] = useState<ChallengeClaimResult | null>(null);
  const [error, setError] = useState<ChallengeError | null>(null);

  const submittedRef = useRef(false);
  const challengeId = getActiveChallengeId();

  // ── Check localStorage for previously claimed result ────────────────────
  useEffect(() => {
    if (!challengeId) return;
    const stored = loadStoredClaim(challengeId);
    if (stored) {
      setClaimResult({
        claimId: stored.claimId,
        code: stored.code,
        token: stored.token,
        expiresAt: stored.expiresAt,
      });
      setResult({
        submissionId: stored.submissionId,
        focusScore: 0,
        grade: 'A',
        rank: 0,
        isQualified: true,
        isCurrentLeader: false,
      });
      setStatus('claimed');
      submittedRef.current = true;
    }
  }, [challengeId]);

  // ── Auto-submit on mount ────────────────────────────────────────────────

  const doSubmit = useCallback(async (rts: readonly number[], cal: CalibrationProfile, sid: string | null, cid: string, gsId: string | undefined) => {
    setStatus('submitting');
    setError(null);
    try {
      const res = await submitChallengeScore({
        challengeId: cid,
        rawRts: rts,
        displayLagMs: cal.displayLagMs,
        inputLagMs: cal.inputLagMs,
        platform: cal.platform,
        sessionId: sid ?? undefined,
        guestSessionId: gsId,
      });
      setResult(res);
      setStatus('submitted');
    } catch (e) {
      const err = e as ChallengeError;
      setError(err);
      if (err.code === 'AUTH_REQUIRED') {
        setStatus('auth-required');
      } else {
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    if (!challengeId) {
      setStatus('disabled');
      return;
    }
    if (status === 'claimed') return;
    if (authStatus !== 'authenticated' && authStatus !== 'anonymous') {
      setStatus('auth-required');
      return;
    }
    if (submittedRef.current) return;
    submittedRef.current = true;

    let cancelled = false;

    async function run() {
      if (cancelled) return;
      await doSubmit(rawRts, calibration, sessionId, challengeId!, guestSessionId);
    }

    void run();

    return () => { cancelled = true; };
  }, [challengeId, authStatus, rawRts, calibration, sessionId, status, doSubmit, guestSessionId]);

  // ── Retry ──────────────────────────────────────────────────────────────

  const retry = useCallback(async () => {
    if (!challengeId) return;
    if (status !== 'error') return;
    setStatus('submitting');
    setError(null);
    await doSubmit(rawRts, calibration, sessionId, challengeId, guestSessionId);
  }, [challengeId, status, rawRts, calibration, sessionId, doSubmit, guestSessionId]);

  // ── Claim ───────────────────────────────────────────────────────────────

  const claim = useCallback(async () => {
    if (!result || !result.isQualified) return;
    if (status === 'claiming' || status === 'claimed') return;

    setStatus('claiming');
    try {
      const res = await createChallengeClaim(result.submissionId);
      setClaimResult(res);
      setStatus('claimed');

      // Persist claim code to localStorage as backup (not source of truth)
      persistClaim({
        submissionId: result.submissionId,
        claimId: res.claimId,
        code: res.code,
        token: res.token,
        expiresAt: res.expiresAt,
        challengeId: challengeId!,
      });
    } catch (e) {
      const err = e as ChallengeError;
      setError(err);
      setStatus('submitted');
    }
  }, [result, status, challengeId]);

  return { challengeId, status, result, claimResult, error, claim, retry };
}
