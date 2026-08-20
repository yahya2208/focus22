import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppState, useNavigate } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { getActiveChallengeId } from '../../challenge/challenge-context';
import {
  getChallengePublicInfo,
  createChallengeClaim,
  createGuestClaim,
  claimGuestSubmission,
} from '../../challenge/challenge-service';
import { WinnerCertificate } from '../../components/challenge/WinnerCertificate';
import type {
  ChallengePublicInfo,
  GuestClaimResult,
  ChallengeError,
} from '../../challenge/types';

const GRADE_COLORS: Record<string, string> = {
  A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
};

const SUBMISSION_STORAGE_KEY = 'focus_challenge_submission_id';

function loadSubmissionId(challengeId: string): string | null {
  try {
    const raw = localStorage.getItem(SUBMISSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { challengeId: string; submissionId: string };
    if (parsed.challengeId !== challengeId) return null;
    return parsed.submissionId;
  } catch { return null; }
}

export function ChallengeWinnerScreen() {
  const colors = useThemeColors();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const { routeParams } = useAppState();
  const challengeId = getActiveChallengeId();

  const [info, setInfo] = useState<ChallengePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [claimStatus, setClaimStatus] = useState<'idle' | 'claiming' | 'claimed' | 'error'>('idle');
  const [claimResult, setClaimResult] = useState<GuestClaimResult | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<'idle' | 'transferring' | 'done' | 'error'>('idle');

  const isAuthenticated = authState.status === 'authenticated';
  const isAnonymous = authState.status === 'anonymous';
  const submissionId = routeParams.submissionId ?? loadSubmissionId(challengeId ?? '');

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

  const isWinner = info != null
    && info.challenge.isFinalized
    && info.challenge.winnerSubmissionId != null
    && submissionId != null
    && info.challenge.winnerSubmissionId === submissionId;

  const handleClaim = useCallback(async () => {
    if (!submissionId || !challengeId) return;
    setClaimStatus('claiming');
    setClaimError(null);
    try {
      if (isAuthenticated) {
        if (isWinner) {
          await claimGuestSubmission(submissionId);
        }
        const res = await createChallengeClaim(submissionId);
        setClaimResult(res);
        setClaimStatus('claimed');
      } else if (isAnonymous && authState.user) {
        const res = await createGuestClaim(submissionId, authState.user.id);
        setClaimResult(res);
        setClaimStatus('claimed');
      }
    } catch (err) {
      setClaimError((err as ChallengeError).message ?? 'Failed to claim prize');
      setClaimStatus('error');
    }
  }, [submissionId, challengeId, isAuthenticated, isAnonymous, isWinner, authState]);

  const handleConvertGuest = useCallback(async () => {
    if (!submissionId) return;
    setTransferStatus('transferring');
    try {
      await claimGuestSubmission(submissionId);
      setTransferStatus('done');
      navigate.replace('login');
    } catch {
      setTransferStatus('error');
    }
  }, [submissionId, navigate]);

  const handleBack = useCallback(() => {
    navigate.replace('challenge-page');
  }, [navigate]);

  if (!challengeId) {
    return (
      <div style={{ padding: '2rem 1.25rem', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: colors.text, background: colors.bg }}>
        <p style={{ fontSize: '0.95rem', color: colors.textSecondary, textAlign: 'center' }}>No challenge selected.</p>
        <button type="button" onClick={() => navigate.replace('home')} style={{ padding: '0.6rem 1.4rem', borderRadius: '10px', border: `1px solid ${colors.border}`, background: colors.bgCard, color: colors.textSecondary, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>Back to Home</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem 1.25rem', maxWidth: '500px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, fontSize: '0.9rem' }}>
        Loading winner information…
      </div>
    );
  }

  if (error || !info) {
    return (
      <div style={{ padding: '2rem 1.25rem', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: colors.text, background: colors.bg }}>
        <p style={{ fontSize: '0.95rem', color: colors.danger, textAlign: 'center' }}>{error ?? 'Challenge not found.'}</p>
        <button type="button" onClick={handleBack} style={{ padding: '0.6rem 1.4rem', borderRadius: '10px', border: `1px solid ${colors.border}`, background: colors.bgCard, color: colors.textSecondary, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>Back to Challenge</button>
      </div>
    );
  }

  const { challenge } = info;

  if (!challenge.isFinalized) {
    return (
      <div style={{ padding: '2rem 1.25rem', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: colors.text, background: colors.bg }}>
        <p style={{ fontSize: '0.95rem', color: colors.textSecondary, textAlign: 'center' }}>This challenge has not been finalized yet. Winner information will be available once an admin finalizes the challenge.</p>
        <button type="button" onClick={handleBack} style={{ padding: '0.6rem 1.4rem', borderRadius: '10px', border: `1px solid ${colors.border}`, background: colors.bgCard, color: colors.textSecondary, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}>Back to Challenge</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem 1.25rem', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', color: colors.text, background: colors.bg }}>

      {/* ── Winner Banner ──────────────────────────────────────────────── */}
      {isWinner ? (
        <div style={{ padding: '2rem 1.25rem', borderRadius: '16px', border: `2px solid ${colors.accent}44`, background: `linear-gradient(135deg, ${colors.accent}12 0%, ${colors.success}12 100%)`, textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: colors.accent }}>
            Congratulations
          </p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: colors.text }}>
            You Won!
          </p>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.85rem', color: colors.textSecondary }}>
            {challenge.name}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.8rem' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.6rem', textTransform: 'uppercase', color: colors.textMuted }}>Score</p>
              <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>
                {info.user?.bestScore ?? '—'}
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.6rem', textTransform: 'uppercase', color: colors.textMuted }}>Grade</p>
              <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: GRADE_COLORS[info.user?.bestGrade ?? ''] ?? colors.text }}>
                {info.user?.bestGrade ?? '—'}
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.6rem', textTransform: 'uppercase', color: colors.textMuted }}>Rank</p>
              <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums' }}>
                #1
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '1.5rem 1.25rem', borderRadius: '16px', border: `1px solid ${colors.border}`, background: colors.bgCard, textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: colors.textMuted }}>
            Challenge Finalized
          </p>
          <p style={{ margin: '0 0 0.3rem', fontSize: '1.1rem', fontWeight: 700, color: colors.text }}>
            {challenge.name}
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: colors.textSecondary }}>
            Winner: <strong style={{ color: colors.accent }}>{challenge.finalWinnerName}</strong>
          </p>
        </div>
      )}

      {/* ── Claim Section (winner only) ────────────────────────────────── */}
      {isWinner && claimStatus !== 'claimed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {isAnonymous && (
            <button
              type="button"
              onClick={handleConvertGuest}
              disabled={transferStatus === 'transferring'}
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
                border: `1px solid ${colors.accent}`, background: `${colors.accent}18`,
                color: colors.accent, fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
                cursor: transferStatus === 'transferring' ? 'not-allowed' : 'pointer',
                opacity: transferStatus === 'transferring' ? 0.6 : 1,
              }}
            >
              {transferStatus === 'transferring' ? 'Signing in…' : 'Sign In to Claim as Registered User'}
            </button>
          )}

          <button
            type="button"
            onClick={handleClaim}
            disabled={claimStatus === 'claiming'}
            style={{
              width: '100%', padding: '0.75rem 1rem', borderRadius: '12px',
              border: 'none',
              background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.accent} 100%)`,
              color: '#fff', fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
              cursor: claimStatus === 'claiming' ? 'not-allowed' : 'pointer',
              opacity: claimStatus === 'claiming' ? 0.6 : 1,
            }}
          >
            {claimStatus === 'claiming' ? 'Generating claim code…' : isAnonymous ? 'Claim as Guest' : 'Claim Prize'}
          </button>

          {claimError && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: colors.danger, textAlign: 'center' }}>{claimError}</p>
          )}
        </div>
      )}

      {/* ── Claim Code Display ──────────────────────────────────────────── */}
      {claimStatus === 'claimed' && claimResult && (
        <div style={{ padding: '1.25rem', borderRadius: '12px', border: `2px solid ${colors.success}44`, background: `${colors.success}12`, textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: colors.success }}>
            Prize Claimed
          </p>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: colors.textSecondary }}>
            Show this code at the shop to collect your prize.
          </p>
          <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: `1px solid ${colors.border}`, background: colors.bgCard, maxWidth: '280px', margin: '0 auto' }}>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textMuted }}>Claim Code</p>
            <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.12em', wordBreak: 'break-all' }}>
              {claimResult.code}
            </p>
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: colors.textMuted }}>
            Expires: {new Date(claimResult.expiresAt).toLocaleString()}
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.65rem', color: colors.textFaint, fontStyle: 'italic' }}>
            Save this code — it won't be shown again.
          </p>
        </div>
      )}

      {claimStatus === 'error' && claimError && (
        <div style={{ padding: '1rem', borderRadius: '12px', border: `1px solid ${colors.danger}44`, background: `${colors.danger}12`, textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: colors.danger, fontWeight: 600 }}>{claimError}</p>
          <button
            type="button" onClick={handleClaim}
            style={{ padding: '0.5rem 1.2rem', borderRadius: '10px', border: `1px solid ${colors.accent}`, background: `${colors.accent}18`, color: colors.accent, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Winner Certificate ──────────────────────────────────────────── */}
      {isWinner && info.user && (
        <div style={{ padding: '1rem', borderRadius: '12px', border: `1px solid ${colors.border}`, background: colors.bgCard }}>
          <WinnerCertificate
            challengeName={challenge.name}
            displayName={authState.user?.displayName ?? 'Winner'}
            focusScore={info.user.bestScore ?? 0}
            grade={info.user.bestGrade ?? 'A'}
          />
        </div>
      )}

      {/* ── Top 5 ──────────────────────────────────────────────────────── */}
      {info.top5.length > 0 && (
        <div style={{ padding: '1rem 1.25rem', borderRadius: '12px', border: `1px solid ${colors.border}`, background: colors.bgCard }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', fontWeight: 700, color: colors.text }}>Final Standings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {info.top5.map((entry) => (
              <div key={entry.rank} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.4rem 0.5rem', borderRadius: '6px',
                background: entry.rank === 1 ? `${colors.accent}12` : 'transparent',
                border: entry.rank === 1 ? `1px solid ${colors.accent}33` : 'none',
              }}>
                <span style={{ minWidth: '20px', textAlign: 'center', fontSize: '0.75rem', fontWeight: entry.rank <= 3 ? 800 : 500, color: entry.rank <= 3 ? colors.accent : colors.textMuted }}>
                  {entry.rank}
                </span>
                <span style={{ flex: 1, fontSize: '0.8rem', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.displayName}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: GRADE_COLORS[entry.grade] ?? colors.text }}>
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
        </div>
      )}

      {/* ── Back Button ─────────────────────────────────────────────────── */}
      <button
        type="button" onClick={handleBack}
        style={{
          width: '100%', padding: '0.65rem 1rem', borderRadius: '10px',
          border: `1px solid ${colors.border}`, background: 'transparent',
          color: colors.textSecondary, fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        Back to Challenge
      </button>
    </div>
  );
}
