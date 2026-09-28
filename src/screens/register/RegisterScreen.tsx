import { useState, useCallback, memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';
import { recordFunnel, getActiveCampaignId } from '../../services/qr-measurement';
import { track } from '../../core/telemetry';
import { getActiveChallengeId } from '../../challenge/challenge-context';

export const RegisterScreen = memo(function RegisterScreen() {
  const dispatch = useAppDispatch();
  const { state: authState, service } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnonymous = authState.status === 'anonymous';
  const inChallenge = getActiveChallengeId() !== null;
  const canConvertGuest = isAnonymous && inChallenge;

  const handleContinueGuest = useCallback(() => {
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  }, [dispatch]);

  const handleRegister = useCallback(async () => {
    if (!email.trim()) {
      setError(t('register.emailRequired'));
      return;
    }
    if (!password.trim() || password.length < 8) {
      setError(t('register.passwordTooShort'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (canConvertGuest) {
        // Phase 8 — guest converting to a real account is the upgrade CTA outcome.
        void track({ event: 'auth_guest_upgrade_cta', entityType: 'user', entityId: undefined, properties: {} });
        await service.convertGuestToUser(email, password, displayName || undefined);
      } else {
        await service.signUpWithEmail(email, password, displayName || undefined);
      }
      void track({ event: 'auth_register_success', entityType: 'user', entityId: undefined, properties: {} });
      recordFunnel(getActiveCampaignId() ?? '', 'registration');
      dispatch({ type: 'NAVIGATE', screen: 'home' });
    } catch (err) {
      void track({ event: 'auth_register_failed', entityType: 'user', entityId: undefined, properties: { error_code: 'register_failed' } });
      setError(err instanceof Error ? err.message : t('register.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, displayName, service, dispatch, t, canConvertGuest]);

  const handleMagicLink = useCallback(async () => {
    if (!email.trim()) {
      setError(t('register.emailRequiredMagic'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await service.signInWithMagicLink(email);
      alert(t('login.magicLinkSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [email, service, t]);

  return (
    // Same root treatment as LoginScreen: paint the active theme background so
    // the glass card never floats on the browser-default white.
    <nav aria-label="Registration" style={{ background: colors.bg, minHeight: '100dvh', boxSizing: 'border-box' }}>
      <div style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Mini hero — brand identity caption above the form (no new CTA, no
          logic change; reuses the home identity strings for consistency). */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <p style={{ margin: 0, color: colors.text, fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.4 }}>
          {t('home.brandTagline')}
        </p>
        <p style={{ margin: '0.45rem 0 0', color: colors.textSecondary, fontSize: '0.9rem', fontWeight: 500, lineHeight: 1.5 }}>
          {t('home.brandDescription')}{' '}
          <span aria-hidden="true" style={{ color: colors.dangerText, fontSize: '0.85em' }}>♥</span>
        </p>
        <p style={{ margin: '0.6rem 0 0', color: colors.accentLight, fontSize: '0.92rem', fontWeight: 700 }}>
          {t('home.joinFamily')}
        </p>
      </div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
        {t('register.title')}
      </h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '2rem' }}>
        {t('register.subtitle')}
      </p>

      {canConvertGuest && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '10px', marginBottom: '1.5rem',
          background: `${colors.accent}12`, border: `1px solid ${colors.accent}33`,
          color: colors.accent, fontSize: '0.8rem', fontWeight: 600, textAlign: 'center',
        }}>
          Register to save your challenge progress. Your current session will be preserved.
        </div>
      )}

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="reg-email" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('register.email')}
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('register.emailPlaceholder')}
              autoComplete="email"
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '8px',
                border: `1px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.text,
                fontSize: '1rem', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="reg-name" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('register.displayName')}
            </label>
            <input
              id="reg-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('register.namePlaceholder')}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '8px',
                border: `1px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.text,
                fontSize: '1rem', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label htmlFor="reg-password" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('login.password')}
            </label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('adminSetup.passwordPlaceholder')}
              autoComplete="new-password"
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

          <Button onClick={handleRegister} loading={isLoading}>
            {canConvertGuest ? 'Save Challenge Account' : t('register.createAccount')}
          </Button>

          <Button variant="secondary" onClick={handleMagicLink} disabled={isLoading}>
            {t('register.magicLink')}
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Button variant="secondary" onClick={handleContinueGuest}>
          {t('register.continueGuest')}
        </Button>
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}
          style={{
            background: 'none', border: 'none', color: colors.accent,
            fontSize: '0.9rem', cursor: 'pointer', textAlign: 'center',
          }}
        >
          {t('register.hasAccount')}
        </button>
      </div>
      </div>
    </nav>
  );
});
