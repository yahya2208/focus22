import { memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useSettingsContext } from '../../hooks/useSettings';
import { useAuth } from '../../core/auth/AuthProvider';
import { permissionGuard } from '../../core/research/permissions';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors, THEME_IDS, THEME_META } from '../../hooks/useThemeColors';
import { Card } from '../../components/shared/Card';
import { Button } from '../../components/shared/Button';
import type { TranslationKey } from '../../i18n';

function ThemeSwatch({ name, preview, active, onClick, colors }: {
  name: string; preview: string[]; active: boolean; onClick: () => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        width: '72px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.35rem',
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: preview[0],
        border: `2px solid ${active ? colors.accent : 'transparent'}`,
        boxShadow: active ? `0 0 0 2px ${colors.accent}44` : `0 2px 8px rgba(0,0,0,0.15)`,
        overflow: 'hidden',
        display: 'flex',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}>
        <div style={{ flex: 1, background: preview[2] }} />
        <div style={{ width: '3px', background: preview[1], opacity: 0.8 }} />
      </div>
      <span style={{
        color: active ? colors.accent : colors.textMuted,
        fontSize: '0.65rem',
        fontWeight: active ? 700 : 500,
        transition: 'color 0.2s ease',
      }}>
        {name}
      </span>
    </button>
  );
}

export const SettingsScreen = memo(function SettingsScreen() {
  const navDispatch = useAppDispatch();
  const { settings, update } = useSettingsContext();
  const { state, service, researchRole } = useAuth();
  const { t } = useTranslation();
  const colors = useThemeColors();

  const isAuthenticated = state.status === 'authenticated' || state.status === 'anonymous';
  const canManage = permissionGuard.can(researchRole, 'scientific', 'read');

  return (
    <nav aria-label="Settings" style={{ padding: '1.5rem 1.25rem', maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, marginBottom: '0.5rem' }}>
        {t('settings.title')}
      </h1>

      {/* Account */}
      <Card glass>
        <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>{t('settings.account')}</h2>
        {isAuthenticated ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ color: colors.textSecondary, fontSize: '0.9rem', margin: 0 }}>
              {state.user?.email || t('settings.guestUser')}
            </p>
            <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0 }}>
              {t('settings.role')}: {state.user?.role ?? 'guest'}
            </p>
            {!state.user?.isAnonymous && (
              <Button variant="secondary" size="sm" onClick={async () => { await service.signOut(); navDispatch({ type: 'NAVIGATE', screen: 'home' }); }} style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}>
                {t('settings.signOut')}
              </Button>
            )}
          </div>
        ) : (
          <Button variant="secondary" onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'login' })} style={{ width: '100%' }}>
            {t('settings.signIn')}
          </Button>
        )}
      </Card>

      {/* Theme */}
      <Card glass>
        <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>{t('settings.theme')}</h2>
        <div style={{
          display: 'flex', gap: '0.25rem', overflowX: 'auto',
          paddingBottom: '0.5rem', margin: '0 -0.25rem',
          scrollbarWidth: 'none',
        }}>
          {THEME_IDS.map((id) => {
            const meta = THEME_META[id];
            return (
              <ThemeSwatch
                key={id}
                name={t(`settings.${id}` as TranslationKey)}
                preview={meta!.preview}
                active={settings.theme === id}
                onClick={() => update({ theme: id })}
                colors={colors}
              />
            );
          })}
        </div>
      </Card>

      {/* Language */}
      <Card glass>
        <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>{t('settings.language')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['en', 'tr', 'ar'] as const).map((lang) => (
            <Button
              key={lang}
              variant={settings.language === lang ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => update({ language: lang })}
            >
              {lang.toUpperCase()}
            </Button>
          ))}
        </div>
      </Card>

      {/* Accessibility */}
      <Card glass>
        <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>{t('settings.accessibility')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: colors.textSecondary, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => update({ reducedMotion: e.target.checked })}
              aria-label={t('settings.reducedMotion')}
              style={{ accentColor: colors.accent, width: '18px', height: '18px' }}
            />
            <span style={{ fontSize: '0.9rem' }}>{t('settings.reducedMotion')}</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: colors.textSecondary, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.highContrast}
              onChange={(e) => update({ highContrast: e.target.checked })}
              aria-label={t('settings.highContrast')}
              style={{ accentColor: colors.accent, width: '18px', height: '18px' }}
            />
            <span style={{ fontSize: '0.9rem' }}>{t('settings.highContrast')}</span>
          </label>
        </div>
      </Card>

      {canManage && (
        <Card glass>
          <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>Business Intelligence</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Button variant="secondary" onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'business-intelligence' })} style={{ width: '100%' }}>
              🏴‍☠️ Treasure Mode — BI Center
            </Button>
            <Button variant="secondary" onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'research' })} style={{ width: '100%' }}>
              {t('settings.researchConsole')}
            </Button>
          </div>
        </Card>
      )}

      <Card glass>
        <h2 style={{ color: colors.text, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 700 }}>{t('settings.administration')}</h2>
        <Button variant="secondary" onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'admin-setup' })} style={{ width: '100%' }}>
          {t('settings.adminSetup')}
        </Button>
      </Card>

      <Button variant="secondary" onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ marginTop: '0.5rem' }}>
        {t('settings.back')}
      </Button>
    </nav>
  );
});
