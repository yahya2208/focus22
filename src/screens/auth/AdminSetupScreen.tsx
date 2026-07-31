import { memo, useState, useCallback, useEffect } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { getSupabaseClient } from '../../core/supabase/client';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Button } from '../../components/shared/Button';
import { Card } from '../../components/shared/Card';

export const AdminSetupScreen = memo(function AdminSetupScreen() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [superAdminExists, setSuperAdminExists] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkSuperAdmin() {
      try {
        const supa = getSupabaseClient();
        const { data, error } = await supa.rpc('has_super_admin');
        if (cancelled) return;
        if (error) {
          setSuperAdminExists(false);
        } else {
          setSuperAdminExists(data === true);
        }
      } catch {
        if (!cancelled) setSuperAdminExists(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    checkSuperAdmin();
    return () => { cancelled = true; };
  }, []);

  const handleSetup = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('adminSetup.fieldsRequired'));
      return;
    }
    if (password.length < 8) {
      setError(t('adminSetup.passwordTooShort'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supa = getSupabaseClient();

      const { data, error: signUpError } = await supa.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || 'Admin',
            role: 'super_admin',
          },
        },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Signup failed: no user returned');

      dispatch({ type: 'NAVIGATE', screen: 'home' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminSetup.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, displayName, dispatch, t]);

  if (checking) {
    return (
      <nav aria-label="Admin Setup" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: colors.textMuted }}>{t('adminSetup.checking')}</p>
      </nav>
    );
  }

  if (superAdminExists) {
    return (
      <nav aria-label="Admin Setup" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
        <Card>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.danger, marginBottom: '0.5rem' }}>
            {t('adminSetup.alreadyExists')}
          </h1>
          <p style={{ color: colors.textMuted, marginBottom: '1.5rem' }}>
            {t('adminSetup.alreadyExistsMessage')}
          </p>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}>
            {t('adminSetup.goToLogin')}
          </Button>
        </Card>
      </nav>
    );
  }

  return (
    <nav aria-label="Admin Setup" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: '0.5rem' }}>
        {t('adminSetup.title')}
      </h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginBottom: '2rem' }}>
        {t('adminSetup.subtitle')}
      </p>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="setup-email" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('login.email')}
            </label>
            <input
              id="setup-email"
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
            <label htmlFor="setup-name" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('register.displayName')}
            </label>
            <input
              id="setup-name"
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
            <label htmlFor="setup-password" style={{ display: 'block', color: colors.textSecondary, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
              {t('login.password')}
            </label>
            <input
              id="setup-password"
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

          <Button onClick={handleSetup} loading={isLoading}>
            {t('adminSetup.createSuperAdmin')}
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <button
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
          style={{
            background: 'none', border: 'none', color: colors.textMuted,
            fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          {t('login.backToHome')}
        </button>
      </div>
    </nav>
  );
});
