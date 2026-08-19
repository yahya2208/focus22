import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { verifyClaimToken } from '../../challenge/challenge-service';
import { adminProcessClaim } from '../../challenge/admin-service';
import type { ChallengeVerifyResult, ClaimVerifyStatus, ChallengeError } from '../../challenge/types';

// ─── Status Config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ClaimVerifyStatus, {
  icon: string;
  label: string;
  color: string;
  bg: string;
}> = {
  pending: { icon: '⏳', label: 'Pending — Ready to Redeem', color: '#f59e0b', bg: '#f59e0b18' },
  claimed: { icon: '✅', label: 'Already Redeemed', color: '#10b981', bg: '#10b98118' },
  expired: { icon: '⏰', label: 'Claim Expired', color: '#ef4444', bg: '#ef444418' },
  revoked: { icon: '🚫', label: 'Claim Revoked', color: '#6b7280', bg: '#6b728018' },
  invalid: { icon: '❌', label: 'Invalid Code', color: '#ef4444', bg: '#ef444418' },
};

// ─── Grade Badge ─────────────────────────────────────────────────────────────

function GradeBadge({ grade, colors }: { grade: string; colors: ReturnType<typeof useThemeColors> }) {
  const gradeColors: Record<string, string> = {
    A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444',
  };
  const c = gradeColors[grade] ?? colors.textMuted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 32, height: 32, borderRadius: '8px',
      background: `${c}18`, color: c, fontSize: '1rem', fontWeight: 800,
    }}>
      {grade}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ClaimVerifyScreen() {
  const colors = useThemeColors();
  const navDispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { state: authState } = useAuth();

  const token = routeParams.token ?? '';

  const [result, setResult] = useState<ChallengeVerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const isAdmin = authState.status === 'authenticated' &&
    (authState.user?.role === 'admin' || authState.user?.role === 'super_admin');

  const handleVerify = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await verifyClaimToken(code.trim());
      setResult(res);
    } catch (err) {
      const ce = err as ChallengeError;
      setError(ce.code ? friendlyVerifyError(ce.code, ce.message) : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) handleVerify(token);
  }, [token, handleVerify]);

  const handleRedeem = useCallback(async () => {
    if (!result || !isAdmin) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const res = await adminProcessClaim(result.claimId ?? '', 'redeem');
      if (res.status === 'claimed') {
        setRedeemSuccess(true);
        setResult({ ...result, status: 'claimed', claimedAt: new Date().toISOString() });
      } else {
        setRedeemError(`Unexpected status: ${res.status}`);
      }
    } catch (err) {
      const ce = err as ChallengeError;
      setRedeemError(ce.code ? friendlyVerifyError(ce.code, ce.message) : (err as Error).message);
    } finally {
      setRedeeming(false);
    }
  }, [result, isAdmin]);

  const [manualCode, setManualCode] = useState(token);

  return (
    <nav
      aria-label="Claim Verification"
      style={{
        padding: '1.5rem 1.25rem',
        maxWidth: '500px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'home' })}
          style={{
            padding: '0.35rem 0.75rem', borderRadius: '8px',
            border: `1px solid ${colors.border}`, background: colors.bgCard,
            color: colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit',
          }}
        >
          {'\u2190'} Home
        </button>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, margin: 0 }}>
          Verify Claim
        </h1>
      </div>

      {/* Manual Code Entry */}
      {!token && (
        <div style={{
          padding: '1rem', borderRadius: '10px',
          border: `1px solid ${colors.border}`, background: colors.bgCard,
        }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: colors.textSecondary }}>
            Enter the claim code to verify:
          </p>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Claim code (e.g. ABC123)"
              style={{
                flex: 1, padding: '0.5rem 0.65rem', borderRadius: '6px',
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: '0.9rem', fontFamily: 'monospace',
              }}
            />
            <button
              onClick={() => handleVerify(manualCode)}
              disabled={loading || !manualCode.trim()}
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px',
                border: `1px solid ${colors.accent}`, background: `${colors.accent}22`,
                color: colors.accent, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                fontFamily: 'inherit', opacity: loading || !manualCode.trim() ? 0.5 : 1,
              }}
            >
              {loading ? '...' : 'Verify'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px',
          background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
          color: colors.dangerText, fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (() => {
        const cfg = STATUS_CONFIG[result.status];
        return (
          <div style={{
            padding: '1.25rem', borderRadius: '12px',
            border: `2px solid ${cfg.color}33`, background: cfg.bg,
          }}>
            {/* Status Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>{cfg.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: cfg.color }}>
                  {cfg.label}
                </p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: colors.textMuted, fontFamily: 'monospace' }}>
                  {result.challengeName}
                </p>
              </div>
            </div>

            {/* Claim Details */}
            {result.status !== 'invalid' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Player</p>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>{result.displayName}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Score</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: colors.text }}>{result.focusScore}</span>
                    <GradeBadge grade={result.grade} colors={colors} />
                  </div>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Expires</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: new Date(result.expiresAt) < new Date() ? colors.danger : colors.text }}>
                    {new Date(result.expiresAt).toLocaleString()}
                  </p>
                </div>
                {result.claimedAt && (
                  <div>
                    <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Redeemed</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: colors.text }}>
                      {new Date(result.claimedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Redeem Button — only for admin + pending status */}
            {result.status === 'pending' && isAdmin && (
              <div>
                {redeemError && (
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: colors.danger }}>{redeemError}</p>
                )}
                <button
                  onClick={handleRedeem}
                  disabled={redeeming || redeemSuccess}
                  style={{
                    width: '100%', padding: '0.6rem 1rem', borderRadius: '8px',
                    border: `1px solid ${colors.accent}`,
                    background: redeemSuccess ? '#10b98122' : `${colors.accent}22`,
                    color: redeemSuccess ? '#10b981' : colors.accent,
                    cursor: redeemSuccess ? 'default' : 'pointer',
                    fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
                    opacity: redeeming ? 0.5 : 1,
                  }}
                >
                  {redeemSuccess ? '✅ Redeemed' : redeeming ? 'Redeeming...' : 'Redeem Prize'}
                </button>
              </div>
            )}

            {/* Non-admin pending */}
            {result.status === 'pending' && !isAdmin && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted, fontStyle: 'italic' }}>
                Admin login required to redeem this prize.
              </p>
            )}
          </div>
        );
      })()}
    </nav>
  );
}

function friendlyVerifyError(code: string, fallback: string): string {
  switch (code) {
    case 'NETWORK_ERROR': return 'Network error — please check your connection and try again.';
    case 'ADMIN_REQUIRED': return 'Admin access required to perform this action.';
    case 'CLAIM_EXPIRED': return 'This claim has expired and can no longer be redeemed.';
    case 'CLAIM_NOT_PENDING': return 'This claim has already been processed.';
    case 'CHALLENGE_NOT_FOUND': return 'Claim or challenge not found.';
    case 'INVALID_ACTION': return 'This action is not allowed on this claim.';
    default: return fallback || 'An unexpected error occurred.';
  }
}
