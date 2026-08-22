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
  createGuestClaim,
  recoverMyChallengeState,
} from '../challenge/challenge-service';
import { getActiveChallengeId, setActiveChallengeId } from '../challenge/challenge-context';
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
const SUBMISSION_STORAGE_KEY = 'focus_challenge_submission_id';
const RESULT_STORAGE_KEY = 'focus_challenge_result';

interface StoredClaimData {
  submissionId: string;
  claimId: string;
  code: string;
  token: string;
  expiresAt: string;
  challengeId: string;
}

interface StoredSubmissionData {
  challengeId: string;
  submissionId: string;
  guestSessionId?: string;
}

interface StoredResultData {
  challengeId: string;
  submissionId: string;
  focusScore: number;
  grade: string;
  rank: number;
  isQualified: boolean;
  isCurrentLeader: boolean;
  timestamp: number;
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

function persistSubmission(data: StoredSubmissionData): void {
  try {
    localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full or unavailable — non-critical */ }
}

function persistResult(data: StoredResultData): void {
  try {
    localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full or unavailable — non-critical */ }
}

function loadStoredResult(challengeId: string): StoredResultData | null {
  try {
    const raw = localStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredResultData;
    if (parsed.challengeId !== challengeId) return null;
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
  const [restoreChecked, setRestoreChecked] = useState(false);

  const submittedRef = useRef(false);
  const activeChallengeId = getActiveChallengeId();

  // ── B. localStorage fallback: recover challengeId when module state lost ──
  let challengeId = activeChallengeId;

  if (!challengeId) {
    try {
      const raw = localStorage.getItem(RESULT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredResultData;
        if (parsed.challengeId) {
          challengeId = parsed.challengeId;
          setActiveChallengeId(parsed.challengeId);
        }
      }
    } catch { /* corrupt data — non-critical */ }
  }

  // ── Restore state: SERVER FIRST, localStorage as fallback/cache ─────────
  // Priority (Winner Persistence Fix): recover_my_challenge_state proves
  // ownership via auth.uid() alone — it survives deleted storage, closed
  // browsers and device switches for the same identity. localStorage is only
  // consulted when the server reports no submission (offline/error paths).
  useEffect(() => {
    if (!challengeId) return;
    let cancelled = false;
    setRestoreChecked(false);

    (async () => {
      // 1) SERVER TRUTH
      try {
        const rec = await recoverMyChallengeState(challengeId);
        if (cancelled) return;
        if (rec.hasSubmission && rec.submissionId) {
          setResult({
            submissionId: rec.submissionId,
            focusScore: rec.focusScore ?? 0,
            grade: (rec.grade ?? 'F') as ChallengeSubmitResult['grade'],
            rank: rec.personalRank ?? 0,
            isQualified: rec.isQualified ?? true,
            isCurrentLeader: false, // informational-only field; server truth has no live leadership post-hoc
          });
          submittedRef.current = true;
          if (rec.claim) {
            // Reuse existing server claim — never create a duplicate.
            // Status mapping stays server-authoritative: only a genuinely
            // 'claimed' claim surfaces the claimed view (and cached plaintext
            // when the ids match); pending/expired/revoked keep the plain
            // submitted result so the UI never fabricates claim state.
            if (rec.claim.status === 'claimed') {
              const cached = loadStoredClaim(challengeId);
              if (cached && cached.claimId === rec.claim.claimId) {
                setClaimResult({
                  claimId: cached.claimId,
                  code: cached.code,
                  token: cached.token,
                  expiresAt: cached.expiresAt,
                });
              } else {
                setClaimResult(null);
              }
              setStatus('claimed');
            } else {
              setClaimResult(null);
              setStatus('submitted');
            }
          } else {
            setStatus('submitted');
          }
          return;
        }
      } catch { /* offline/RPC error → localStorage fallback below */ }
      if (cancelled) return;

      // 2) LOCALSTORAGE FALLBACK (cache / offline UX)
      const storedClaim = loadStoredClaim(challengeId);
      const storedResult = loadStoredResult(challengeId);
      if (storedResult) {
        setResult({
          submissionId: storedResult.submissionId,
          focusScore: storedResult.focusScore,
          grade: storedResult.grade as ChallengeSubmitResult['grade'],
          rank: storedResult.rank,
          isQualified: storedResult.isQualified,
          isCurrentLeader: storedResult.isCurrentLeader,
        });
        submittedRef.current = true;
        if (storedClaim) {
          setClaimResult({
            claimId: storedClaim.claimId,
            code: storedClaim.code,
            token: storedClaim.token,
            expiresAt: storedClaim.expiresAt,
          });
          setStatus('claimed');
        } else {
          setStatus('submitted');
        }
      } else if (storedClaim) {
        setClaimResult({
          claimId: storedClaim.claimId,
          code: storedClaim.code,
          token: storedClaim.token,
          expiresAt: storedClaim.expiresAt,
        });
        setStatus('claimed');
        submittedRef.current = true;
      }
    })().finally(() => {
      // Gate auto-submit until restore resolution completes — prevents the
      // synchronous submit effect from racing the async server probe and
      // firing a duplicate submission for an identity that already has one.
      if (!cancelled) setRestoreChecked(true);
    });

    return () => { cancelled = true; };
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

      persistSubmission({ challengeId: cid, submissionId: res.submissionId, guestSessionId: gsId });
      persistResult({
        challengeId: cid,
        submissionId: res.submissionId,
        focusScore: res.focusScore,
        grade: res.grade,
        rank: res.rank,
        isQualified: res.isQualified,
        isCurrentLeader: res.isCurrentLeader,
        timestamp: Date.now(),
      });
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
    if (!restoreChecked) return; // wait for server-first restore resolution
    if (submittedRef.current) return;
    if (rawRts.length === 0) return;
    submittedRef.current = true;

    let cancelled = false;

    async function run() {
      if (cancelled) return;
      await doSubmit(rawRts, calibration, sessionId, challengeId!, guestSessionId);
    }

    void run();

    return () => { cancelled = true; };
  }, [challengeId, authStatus, rawRts, calibration, sessionId, status, doSubmit, guestSessionId, restoreChecked]);

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
      let res: ChallengeClaimResult;
      if (authStatus === 'anonymous' && guestSessionId) {
        try {
          res = await createChallengeClaim(result.submissionId);
        } catch (e) {
          const inner = e as ChallengeError;
          if (inner.code === 'NOT_YOUR_SUBMISSION') {
            res = await createGuestClaim(result.submissionId, guestSessionId);
          } else {
            throw e;
          }
        }
      } else {
        res = await createChallengeClaim(result.submissionId);
      }
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
      setStatus('error');
    }
  }, [result, status, challengeId, authStatus, guestSessionId]);

  return { challengeId, status, result, claimResult, error, claim, retry };
}
