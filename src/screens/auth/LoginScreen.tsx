import { useState, useCallback } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';

export function LoginScreen() {
  const dispatch = useAppDispatch();
  const { service } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('login.fieldsRequired'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await service.signInWithEmail(email, password);
      dispatch({ type: 'NAVIGATE', screen: 'home' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, service, dispatch, t]);

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
      dispatch({ type: 'NAVIGATE', screen: 'home' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [service, dispatch, t]);

  return (
    <nav aria-label="Login" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
        {t('login.title')}
      </h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '2rem' }}>
        {t('login.subtitle')}
      </p>

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
            {t('login.signIn')}
          </Button>

          <Button variant="secondary" onClick={handleMagicLink} disabled={isLoading}>
            {t('login.magicLink')}
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
}
