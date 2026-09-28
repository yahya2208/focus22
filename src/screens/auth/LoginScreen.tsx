import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { track } from '../../core/telemetry';
import { getActiveChallengeId } from '../../challenge/challenge-context';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';
import { BrandLogo } from '../../components/brand/BrandLogo';

export const LoginScreen = memo(function LoginScreen() {
  const dispatch = useAppDispatch();
  const { state: authState, service } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnonymous = authState.status === 'anonymous';
  const inChallenge = getActiveChallengeId() !== null;
  const challengeConversionMode = isAnonymous && inChallenge;

  // Phase 8 — guest gate seen: the login surface is shown to an anonymous user.
  // Tracked once per screen mount; identity link is the auth gate, not a login.
  const gateSeenRef = useRef(false);
  useEffect(() => {
    if (!isAnonymous) return;
    if (gateSeenRef.current) return;
    gateSeenRef.current = true;
    void track({ event: 'auth_guest_gate_seen', entityType: 'user', entityId: undefined, properties: {} });
  }, [isAnonymous]);

  const navigateAfterAuth = useCallback(() => {
    const cid = getActiveChallengeId();
    dispatch({ type: cid ? 'REPLACE' : 'NAVIGATE', screen: cid ? 'results' : 'home', params: cid ? { challenge_id: cid } : undefined });
  }, [dispatch]);

  const toFriendlyError = useCallback((err: unknown): string => {
    const raw = err instanceof Error ? err.message : '';
    // Never surface raw Supabase/Postgres/internal text — map known shapes,
    // fall back to the generic failure string. Telemetry keeps its own code.
    if (/invalid.{0,12}credential|wrong.{0,12}(email|password)|email.*password.*(incorrect|mismatch)/i.test(raw)) {
      return t('login.invalidCredentials');
    }
    return t('login.failed');
  }, [t]);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('login.fieldsRequired'));
      return;
    }
    setLoginLoading(true);
    setError(null);
    try {
      if (challengeConversionMode) {
        // Phase 8 — guest converting to a real account is the upgrade CTA outcome.
        void track({ event: 'auth_guest_upgrade_cta', entityType: 'user', entityId: undefined, properties: {} });
        await service.convertGuestToUser(email, password);
      } else {
        await service.signInWithEmail(email, password);
      }
      void track({ event: 'auth_login_success', entityType: 'user', entityId: undefined, properties: {} });
      navigateAfterAuth();
    } catch (err) {
      void track({ event: 'auth_login_failed', entityType: 'user', entityId: undefined, properties: { error_code: 'login_failed' } });
      setError(toFriendlyError(err));
    } finally {
      setLoginLoading(false);
    }
  }, [email, password, service, navigateAfterAuth, t, challengeConversionMode, toFriendlyError]);

  const handleGuest = useCallback(async () => {
    setGuestLoading(true);
    setError(null);
    try {
      await service.signInAsGuest();
      navigateAfterAuth();
    } catch {
      setError(t('login.failed'));
    } finally {
      setGuestLoading(false);
    }
  }, [service, navigateAfterAuth, t]);

  return (
    // Full-width painted root (fixes desktop body gutters): the theme token
    // covers the viewport edge-to-edge while content stays in a 480px
    // centered inner container — same decomposition as the Screen wrapper.
    <nav aria-label="Login" style={{ background: colors.bg, minHeight: '100dvh', boxSizing: 'border-box' }}>
      <div style={{ padding: '2rem 1.5rem 3rem', maxWidth: '480px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Hero panel — one composed identity surface (portal-card language from
          Home: opaque dark base, single verdant glow, 22px radius). The card
          below shares the same base so hero and form read as one unit. */}
      <div style={{
        textAlign: 'center', padding: '1.75rem 1.5rem 1.5rem', borderRadius: '22px',
        border: `1px solid ${colors.border}`,
        background: `linear-gradient(150deg, ${colors.accent}17 0%, ${colors.bgCard} 55%, #0a0a12 100%)`,
        boxShadow: `0 8px 28px rgba(0,0,0,0.28), 0 0 34px ${colors.accentGlow}`,
        marginBottom: '1.25rem',
      }}>
        <BrandLogo size={64} showText align="center" style={{ justifyContent: 'center' }} />
        <p style={{ margin: '1rem 0 0', color: colors.text, fontSize: '1.22rem', fontWeight: 800, lineHeight: 1.35 }}>
          {t('login.promise')}
        </p>
        <p style={{ margin: '0.55rem 0 0', color: colors.textSecondary, fontSize: '0.92rem', fontWeight: 500, lineHeight: 1.5 }}>
          {t('login.promiseDescription')}{' '}
          <span aria-hidden="true" style={{ color: colors.dangerText, fontSize: '0.85em' }}>♥</span>
        </p>
      </div>

      {challengeConversionMode && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.5rem',
          background: `${colors.accent}12`, border: `1px solid ${colors.accent}33`,
          color: colors.accent, fontSize: '0.8rem', fontWeight: 600, textAlign: 'center',
        }}>
          You have an active challenge session. Register to save your progress with a new account.
        </div>
      )}

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="login-email" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('login.email')}
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              autoComplete="email"
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '8px',
                border: `1px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.text,
                fontSize: '1rem', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="login-password" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('login.password')}
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              autoComplete="current-password"
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '8px',
                border: `1px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.text,
                fontSize: '1rem', boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ color: colors.danger, fontSize: '0.85rem' }}>{error}</p>
          )}

          <Button onClick={handleLogin} loading={loginLoading} style={{ width: '100%', minHeight: '52px', fontSize: '1.02rem' }}>
            {challengeConversionMode ? 'Save Challenge Account' : t('login.signIn')}
          </Button>

          {/* Invite entry — quiet divider row, same invite-setup route as before. */}
          <button
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'invite-setup' })}
            style={{
              background: 'none', border: 'none', color: colors.textMuted,
              fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center',
              borderTop: `1px solid ${colors.borderLight}`, paddingTop: '1rem', marginTop: '0.25rem',
            }}
          >
            {t('login.invitedSetup')}
          </button>
        </div>
      </Card>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {challengeConversionMode ? (
          <>
            <Button variant="secondary" onClick={handleGuest} loading={guestLoading} disabled={loginLoading} style={{ width: '100%' }}>
              {t('login.continueGuest')}
            </Button>
            <button
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'register' })}
              style={{
                background: 'none', border: 'none', color: colors.accent,
                fontSize: '0.9rem', cursor: 'pointer', textAlign: 'center', fontWeight: 600,
              }}
            >
              Register a new account to save your progress
            </button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={handleGuest} loading={guestLoading} disabled={loginLoading} style={{ width: '100%' }}>
              {t('login.continueGuest')}
            </Button>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.8rem', textAlign: 'center' }}>
              <button
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'register' })}
                style={{
                  background: 'none', border: 'none', color: colors.accent,
                  fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                }}
              >
                {t('login.noAccount')}
              </button>
              <span style={{ margin: '0 0.5rem' }}>·</span>
              <button
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
                style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                {t('login.backToHome')}
              </button>
            </p>
          </>
        )}
      </div>
      </div>
    </nav>
  );
});
