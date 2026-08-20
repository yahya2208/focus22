/**
 * ChallengeResultCard — displays challenge submission result inside ResultsScreen.
 *
 * SECURITY INVARIANTS:
 *   - ALL score/grade/rank values come from ChallengeSubmitResult (server-authoritative).
 *   - The client NEVER computes or overrides these values.
 *   - Claim codes are shown ONCE but persisted in localStorage as backup
 *     (never as source of truth — server is authoritative).
 *
 * STATE MAP:
 *   disabled       → not in a challenge context — renders nothing
 *   auth-required  → sign-in CTA
 *   submitting     → loading spinner
 *   submitted      → score/grade/rank + claim button (if qualified)
 *   claiming       → loading spinner on claim button
 *   claimed        → claim code displayed once + persisted in localStorage
 *   error          → error message + retry button (when retryable)
 */

import { memo, useCallback } from 'react';
import { Card } from '../../design-system/components/Card';
import { Stack } from '../../design-system/components/Stack';
import { Flex } from '../../design-system/components/Flex';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useNavigate } from '../../store/navigation';
import type { SubmissionStatus } from '../../hooks/useChallengeSubmission';
import type { ChallengeSubmitResult, ChallengeClaimResult, ChallengeError } from '../../challenge/types';

interface ChallengeResultCardProps {
  readonly challengeId: string | null;
  readonly status: SubmissionStatus;
  readonly result: ChallengeSubmitResult | null;
  readonly claimResult: ChallengeClaimResult | null;
  readonly error: ChallengeError | null;
  readonly onClaim: () => void;
  readonly onRetry?: () => void;
  readonly isFinalWinner?: boolean | undefined;
}

const RETRYABLE_ERROR_CODES = new Set([
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
  'RATE_LIMIT_EXCEEDED',
]);

function gradeColor(grade: string, colors: ReturnType<typeof useThemeColors>): string {
  if (grade === 'A') return colors.success;
  if (grade === 'B') return colors.accent;
  if (grade === 'C') return colors.warning;
  return colors.textMuted;
}

export const ChallengeResultCard = memo(function ChallengeResultCard({
  challengeId,
  status,
  result,
  claimResult,
  error,
  onClaim,
  onRetry,
  isFinalWinner = true,
}: ChallengeResultCardProps) {
  const colors = useThemeColors();
  const navigate = useNavigate();

  const handleSignIn = useCallback(() => {
    navigate.push('login');
  }, [navigate]);

  if (!challengeId) return null;

  return (
    <Card variant="glass" padding="lg" data-testid="challenge-result-card">
      <Stack gap="md">
        {/* ── Auth Required ─────────────────────────────────────────── */}
        {status === 'auth-required' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, margin: '0 0 0.4rem' }}>
              Challenge
            </p>
            <p style={{ color: colors.text, fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.3rem' }}>
              Sign in to participate
            </p>
            <p style={{ color: colors.textSecondary, fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
              An account is required to submit your score to the challenge.
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              data-testid="challenge-sign-in"
              style={{
                cursor: 'pointer', fontFamily: 'inherit',
                padding: '0.6rem 1.4rem', borderRadius: '12px', border: 'none',
                background: colors.accent, color: '#fff',
                fontSize: '0.85rem', fontWeight: 700,
              }}
            >
              Sign In
            </button>
          </div>
        )}

        {/* ── Submitting ────────────────────────────────────────────── */}
        {status === 'submitting' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, margin: '0 0 0.4rem' }}>
              Challenge
            </p>
            <p style={{ color: colors.textSecondary, fontSize: '0.85rem', margin: 0 }}>
              Submitting your score…
            </p>
          </div>
        )}

        {/* ── Submitted (qualified or not) ──────────────────────────── */}
        {status === 'submitted' && result && (
          <div style={{ textAlign: 'center' }}>
            {result.isQualified ? (
              <>
                <p style={{ color: colors.success, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, margin: '0 0 0.3rem' }}>
                  Qualified
                </p>
                <p style={{ color: colors.text, fontSize: '1.1rem', fontWeight: 800, margin: '0 0 0.2rem' }}>
                  You qualified for the prize!
                </p>
              </>
            ) : (
              <>
                <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, margin: '0 0 0.4rem' }}>
                  Challenge
                </p>
                <p style={{ color: colors.textSecondary, fontSize: '0.85rem', margin: '0 0 0.3rem' }}>
                  Score submitted to the challenge.
                </p>
              </>
            )}

            {/* Server-authoritative score */}
            <Flex gap="md" justify="center" style={{ margin: '0.6rem 0' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.15rem' }}>
                  Score
                </p>
                <p style={{ color: colors.text, fontSize: '1.6rem', fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {result.focusScore}
                </p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.15rem' }}>
                  Grade
                </p>
                <p style={{ color: gradeColor(result.grade, colors), fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                  {result.grade}
                </p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.15rem' }}>
                  Rank
                </p>
                <p style={{ color: colors.text, fontSize: '1.6rem', fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  #{result.rank}
                </p>
              </div>
            </Flex>

            {/* Claim button — only for final winners (or when winner status unknown) */}
            {result.isQualified && isFinalWinner !== false && (
              <button
                type="button"
                onClick={onClaim}
                data-testid="challenge-claim"
                style={{
                  cursor: 'pointer', fontFamily: 'inherit',
                  padding: '0.6rem 1.4rem', borderRadius: '12px', border: 'none',
                  background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.accent} 100%)`,
                  color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                  marginTop: '0.5rem',
                }}
              >
                Claim Prize
              </button>
            )}
          </div>
        )}

        {/* ── Claiming ──────────────────────────────────────────────── */}
        {status === 'claiming' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.textSecondary, fontSize: '0.85rem', margin: 0 }}>
              Generating your claim code…
            </p>
          </div>
        )}

        {/* ── Claimed — show code + persist to localStorage ─────────── */}
        {status === 'claimed' && claimResult && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.success, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, margin: '0 0 0.3rem' }}>
              Prize Claimed
            </p>
            <p style={{ color: colors.textSecondary, fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
              Show this code at the shop to collect your prize.
            </p>

            <Card variant="outlined" padding="md" style={{ margin: '0 auto', maxWidth: '280px' }}>
              <p style={{ color: colors.textMuted, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.2rem' }}>
                Claim Code
              </p>
              <p
                data-testid="claim-code"
                style={{
                  color: colors.accent, fontSize: '1.3rem', fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '0.12em', margin: 0,
                  wordBreak: 'break-all',
                }}
              >
                {claimResult.code}
              </p>
            </Card>

            <p style={{ color: colors.textMuted, fontSize: '0.7rem', margin: '0.5rem 0 0' }}>
              Expires: {new Date(claimResult.expiresAt).toLocaleString()}
            </p>

            <p style={{ color: colors.textFaint, fontSize: '0.65rem', margin: '0.3rem 0 0', fontStyle: 'italic' }}>
              Save this code — it won't be shown again.
            </p>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────── */}
        {status === 'error' && error && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: colors.textMuted, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, margin: '0 0 0.4rem' }}>
              Challenge
            </p>
            <p style={{ color: colors.warning, fontSize: '0.85rem', margin: '0 0 0.3rem', fontWeight: 600 }}>
              {friendlyErrorMessage(error.code)}
            </p>

            {/* Retry button for retryable errors */}
            {onRetry && RETRYABLE_ERROR_CODES.has(error.code) && (
              <button
                type="button"
                onClick={onRetry}
                data-testid="challenge-retry"
                style={{
                  cursor: 'pointer', fontFamily: 'inherit',
                  padding: '0.5rem 1.2rem', borderRadius: '10px',
                  border: `1px solid ${colors.accent}`, background: `${colors.accent}18`,
                  color: colors.accent, fontSize: '0.8rem', fontWeight: 600,
                  marginTop: '0.4rem',
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </Stack>
    </Card>
  );
});

function friendlyErrorMessage(code: string): string {
  switch (code) {
    case 'CHALLENGE_NOT_FOUND': return 'This challenge is no longer available.';
    case 'CHALLENGE_NOT_ACTIVE': return 'This challenge is not currently active.';
    case 'CHALLENGE_NOT_STARTED': return 'This challenge has not started yet.';
    case 'CHALLENGE_ENDED': return 'This challenge has ended.';
    case 'CHALLENGE_NOT_FINALIZED': return 'This challenge has not been finalized yet.';
    case 'DUPLICATE_SUBMISSION': return 'You have already submitted to this challenge.';
    case 'RATE_LIMIT_EXCEEDED': return 'Too many submissions. Please try again in a moment.';
    case 'INVALID_RT_COUNT': return 'Invalid number of reaction times.';
    case 'INVALID_RT_RANGE': return 'Reaction times out of valid range.';
    case 'INVALID_CALIBRATION': return 'Invalid calibration data.';
    case 'AUTH_REQUIRED': return 'Please sign in to submit your score.';
    case 'NETWORK_ERROR': return 'Network error — please check your connection.';
    default: return 'Could not submit your score. Please try again.';
  }
}
