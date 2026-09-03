import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { track } from '../../core/telemetry';
import { getActiveChallengeId } from '../../challenge/challenge-context';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';

export const LoginScreen = memo(function LoginScreen() {
  const dispatch = useAppDispatch();
  const { state: authState, service } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('login.fieldsRequired'));
      return;
    }
    setIsLoading(true);
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
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, service, navigateAfterAuth, t, challengeConversionMode]);

  const handleMagicLink = useCallback(async () => {
    if (!email.trim()) {
      setError(t('login.emailRequiredMagic'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await service.signInWithMagicLink(email);
      setError(null);
      alert(t('login.magicLinkSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [email, service, t]);

  const handleGuest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await service.signInAsGuest();
      navigateAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [service, navigateAfterAuth, t]);

  return (
    <nav aria-label="Login" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
        {t('login.title')}
      </h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '2rem' }}>
        {t('login.subtitle')}
      </p>

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

          <Button onClick={handleLogin} loading={isLoading}>
            {challengeConversionMode ? 'Save Challenge Account' : t('login.signIn')}
          </Button>

          <Button variant="secondary" onClick={handleMagicLink} disabled={isLoading}>
            {t('login.magicLink')}
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {challengeConversionMode ? (
          <>
            <Button variant="secondary" onClick={handleGuest} disabled={isLoading} style={{ width: '100%' }}>
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
            <Button variant="secondary" onClick={handleGuest} disabled={isLoading} style={{ width: '100%' }}>
              {t('login.continueGuest')}
            </Button>
            <button
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'register' })}
              style={{
                background: 'none', border: 'none', color: colors.accent,
                fontSize: '0.9rem', cursor: 'pointer', textAlign: 'center',
              }}
            >
              {t('login.noAccount')}
            </button>
          </>
        )}
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
          style={{
            background: 'none', border: 'none', color: colors.textMuted,
            fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center',
          }}
        >
          {t('login.backToHome')}
        </button>
      </div>
    </nav>
  );
});
