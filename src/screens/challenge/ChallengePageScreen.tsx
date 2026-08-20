import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { getActiveChallengeId } from '../../challenge/challenge-context';
import {
  getChallengePublicInfo,
  recoverCurrentLeaderState,
} from '../../challenge/challenge-service';
import type {
  ChallengePublicInfo,
  CurrentLeaderRecoveryState,
  ChallengeError,
} from '../../challenge/types';

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  ended: 'Ended',
  draft: 'Draft',
};

export function ChallengePageScreen() {
  const colors = useThemeColors();
  const dispatch = useAppDispatch();
  const { state: authState } = useAuth();
  const challengeId = getActiveChallengeId();

  const [info, setInfo] = useState<ChallengePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recovery, setRecovery] = useState<CurrentLeaderRecoveryState | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const isAuthenticated = authState.status === 'authenticated' || authState.status === 'anonymous';

  const loadInfo = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getChallengePublicInfo(challengeId);
      setInfo(data);
    } catch (err) {
      setError((err as ChallengeError).message ?? (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const loadRecovery = useCallback(async () => {
    if (!challengeId || !isAuthenticated) return;
    setRecoveryError(null);
    try {
      const state = await recoverCurrentLeaderState(challengeId);
      setRecovery(state);
    } catch {
      setRecoveryError(null);
    }
  }, [challengeId, isAuthenticated]);

  useEffect(() => { loadRecovery(); }, [loadRecovery]);

  const handlePlay = useCallback(() => {
    dispatch({ type: 'REPLACE', screen: 'game-intro' });
  }, [dispatch]);

  if (!challengeId) {
    return (
      <div style={{
        padding: '2rem 1.25rem', maxWidth: '500px', margin: '0 auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
        color: colors.text, background: colors.bg,
      }}>
        <p style={{ fontSize: '0.95rem', color: colors.textSecondary, textAlign: 'center' }}>
          No challenge selected. Please scan a challenge QR code to participate.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'REPLACE', screen: 'home' })}
          style={{
            padding: '0.6rem 1.4rem', borderRadius: '10px',
            border: `1px solid ${colors.border}`, background: colors.bgCard,
            color: colors.textSecondary, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit',
          }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        padding: '3rem 1.25rem', maxWidth: '500px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: colors.textMuted, fontSize: '0.9rem',
      }}>
        Loading challenge…
      </div>
    );
  }

  if (error || !info) {
    return (
      <div style={{
        padding: '2rem 1.25rem', maxWidth: '500px', margin: '0 auto',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
        color: colors.text, background: colors.bg,
      }}>
        <p style={{ fontSize: '0.95rem', color: colors.danger, textAlign: 'center' }}>
          {error ?? 'Challenge not found.'}
        </p>
        <button
          type="button"
          onClick={loadInfo}
          style={{
            padding: '0.6rem 1.4rem', borderRadius: '10px',
            border: `1px solid ${colors.accent}`, background: `${colors.accent}22`,
            color: colors.accent, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'REPLACE', screen: 'home' })}
          style={{
            padding: '0.5rem 1rem', borderRadius: '8px',
            border: `1px solid ${colors.border}`, background: 'transparent',
            color: colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit',
          }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const { challenge, top5, user } = info;
  const isEnded = challenge.status === 'ended';
  const isLeader = recovery?.isCurrentLeader === true;
  const isFinalized = challenge.isFinalized;

  return (
    <div style={{
      padding: '1.5rem 1.25rem', maxWidth: '500px', margin: '0 auto',
      display: 'flex', flexDirection: 'column', gap: '1rem',
      color: colors.text, background: colors.bg,
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem', borderRadius: '12px',
        border: `1px solid ${colors.border}`, background: colors.bgCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: colors.text }}>
            {challenge.name}
          </h1>
          <span style={{
            padding: '0.2rem 0.6rem', borderRadius: '6px',
            fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
            background: isEnded ? `${colors.textMuted}18` : `${colors.success}18`,
            color: isEnded ? colors.textMuted : colors.success,
          }}>
            {STATUS_LABELS[challenge.status] ?? challenge.status}
          </span>
        </div>
        {challenge.description && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: colors.textSecondary, lineHeight: 1.5 }}>
            {challenge.description}
          </p>
        )}
        {challenge.prizeDescription && (
          <p style={{
            margin: '0.6rem 0 0', padding: '0.5rem 0.75rem', borderRadius: '8px',
            background: `${colors.accent}12`, border: `1px solid ${colors.accent}22`,
            fontSize: '0.8rem', color: colors.accent, fontWeight: 600,
          }}>
            Prize: {challenge.prizeDescription}
          </p>
        )}
        {challenge.startsAt && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: colors.textMuted }}>
            Starts: {new Date(challenge.startsAt).toLocaleString()}
          </p>
        )}
        {challenge.endsAt && (
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: colors.textMuted }}>
            Ends: {new Date(challenge.endsAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Current Leader banner (from recovery) */}
      {isAuthenticated && isLeader && recovery && (
        <div style={{
          padding: '1rem 1.25rem', borderRadius: '12px',
          border: `2px solid ${colors.accent}44`, background: `${colors.accent}12`,
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: colors.accent }}>
            You're the Current Leader
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: colors.textSecondary }}>
            Score: <strong>{recovery.focusScore}</strong> — Grade: <strong>{recovery.grade}</strong> — Rank: <strong>#{recovery.rank}</strong>
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: colors.textMuted, fontStyle: 'italic' }}>
            This position is subject to change until the challenge ends.
          </p>
        </div>
      )}

      {/* Top 5 */}
      <div style={{
        padding: '1rem 1.25rem', borderRadius: '12px',
        border: `1px solid ${colors.border}`, background: colors.bgCard,
      }}>
        <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', fontWeight: 700, color: colors.text }}>
          Top 5
        </h3>
        {top5.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted, textAlign: 'center', padding: '0.75rem 0' }}>
            No submissions yet. Be the first!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {top5.map((entry) => (
              <div
                key={entry.rank}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.5rem', borderRadius: '6px',
                  background: entry.rank <= 3 ? `${colors.accent}08` : 'transparent',
                }}
              >
                <span style={{
                  minWidth: '20px', textAlign: 'center',
                  fontSize: '0.75rem', fontWeight: entry.rank <= 3 ? 800 : 500,
                  color: entry.rank <= 3 ? colors.accent : colors.textMuted,
                }}>
                  {entry.rank}
                </span>
                <span style={{ flex: 1, fontSize: '0.8rem', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.displayName}
                </span>
                <span style={{
                  fontSize: '0.8rem', fontWeight: 700,
                  color: GRADE_COLORS[entry.grade] ?? colors.text,
                }}>
                  {entry.focusScore}
                </span>
                <span style={{
                  width: 22, height: 22, borderRadius: '5px',
                  background: `${GRADE_COLORS[entry.grade] ?? colors.textMuted}18`,
                  color: GRADE_COLORS[entry.grade] ?? colors.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700,
                }}>
                  {entry.grade}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User's own stats (authenticated only) */}
      {isAuthenticated && user && (
        <div style={{
          padding: '1rem 1.25rem', borderRadius: '12px',
          border: `1px solid ${colors.border}`, background: colors.bgCard,
        }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', fontWeight: 700, color: colors.text }}>
            Your Stats
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Best Score
              </p>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
                {user.bestScore ?? '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Best Grade
              </p>
              {user.bestGrade ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '6px',
                  background: `${GRADE_COLORS[user.bestGrade] ?? colors.textMuted}18`,
                  color: GRADE_COLORS[user.bestGrade] ?? colors.textMuted,
                  fontSize: '0.85rem', fontWeight: 800,
                }}>
                  {user.bestGrade}
                </span>
              ) : (
                <span style={{ fontSize: '1rem', color: colors.textMuted }}>—</span>
              )}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Rank
              </p>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: user.personalRank > 0 ? colors.accent : colors.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                {user.personalRank > 0 ? `#${user.personalRank}` : '—'}
              </p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Submissions
              </p>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
                {user.totalSubmissions}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Finalized winner banner */}
      {isFinalized && (
        <div style={{
          padding: '1rem 1.25rem', borderRadius: '12px',
          border: `2px solid ${colors.accent}44`, background: `${colors.accent}12`,
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: colors.accent }}>
            Challenge Finalized
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary }}>
            Winner: <strong style={{ color: colors.accent }}>{challenge.finalWinnerName ?? 'N/A'}</strong>
          </p>
          <button
            type="button"
            onClick={() => {
              const stored = (() => {
                try {
                  const raw = localStorage.getItem('focus_challenge_submission_id');
                  if (!raw) return null;
                  const parsed = JSON.parse(raw) as { challengeId: string; submissionId: string };
                  return parsed.challengeId === challengeId ? parsed.submissionId : null;
                } catch { return null; }
              })();
              dispatch({
                type: 'NAVIGATE',
                screen: 'challenge-winner',
                params: {
                  challenge_id: challengeId,
                  ...(stored ? { submissionId: stored } : {}),
                },
              });
            }}
            style={{
              marginTop: '0.6rem', padding: '0.5rem 1.2rem', borderRadius: '10px',
              border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.accent} 100%)`,
              color: '#fff', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            View Winner Results
          </button>
        </div>
      )}

      {/* Play button */}
      <button
        type="button"
        onClick={handlePlay}
        disabled={isEnded}
        style={{
          width: '100%', padding: '0.75rem 1rem', borderRadius: '10px',
          border: 'none', cursor: isEnded ? 'not-allowed' : 'pointer',
          background: isEnded ? `${colors.textMuted}22` : colors.accent,
          color: isEnded ? colors.textMuted : '#fff',
          fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
        }}
      >
        {isEnded ? 'Challenge Ended' : 'Play Challenge'}
      </button>

      {!isAuthenticated && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted, textAlign: 'center' }}>
          Sign in to submit your score and track your rank.
        </p>
      )}

      {/* Error during recovery */}
      {recoveryError && (
        <p style={{ margin: 0, fontSize: '0.7rem', color: colors.textMuted, textAlign: 'center', fontStyle: 'italic' }}>
          Could not recover previous submission state.
        </p>
      )}
    </div>
  );
}
