import { memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors, THEME_IDS } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { permissionGuard } from '../../core/research/permissions';
import { useSettings } from '../../hooks/useSettings';
import type { TranslationKey } from '../../i18n';

interface HomeMenuProps {
  open: boolean;
  onClose: () => void;
}

const LANGS = ['en', 'ar', 'tr'] as const;

export const HomeMenu = memo(function HomeMenu({ open, onClose }: HomeMenuProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state, service, researchRole } = useAuth();
  const { settings, update: updateSettings } = useSettings();

  if (!open) return null;

  const isAuthenticated = state.status === 'authenticated';
  const isLoading = state.status === 'loading';
  const isGuest = !isAuthenticated && !isLoading;
  const canManage = permissionGuard.can(researchRole, 'scientific', 'read');

  const navigate = (screen: 'login' | 'settings' | 'research' | 'about' | 'showroom') => {
    onClose();
    dispatch({ type: 'NAVIGATE', screen });
  };

  const signOut = async () => {
    onClose();
    try {
      await service.signOut();
      dispatch({ type: 'NAVIGATE', screen: 'home' });
    } catch {
      // silent
    }
  };

  const cycleLanguage = () => {
    const idx = LANGS.indexOf(settings.language as typeof LANGS[number]);
    const next = LANGS[(idx === -1 ? 0 : idx + 1) % LANGS.length];
    updateSettings({ language: next });
  };

  const cycleTheme = () => {
    const allThemes = ['system', ...THEME_IDS] as const;
    const idx = allThemes.indexOf(settings.theme as typeof allThemes[number]);
    const next = allThemes[(idx === -1 ? 0 : idx + 1) % allThemes.length];
    updateSettings({ theme: next });
  };

  const btn = (style?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', textAlign: 'left', background: 'none', border: 'none',
    padding: '0.65rem 0.75rem', borderRadius: '10px', cursor: 'pointer',
    color: colors.text, fontSize: '0.85rem', display: 'block',
    fontFamily: 'inherit',
    ...style,
  });

  const hover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = colors.bgHover;
  };
  const leave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'none';
  };

  return (
    <div style={{
      background: colors.glass,
      border: `1px solid ${colors.glassBorder}`,
      borderRadius: '16px',
      padding: '0.5rem',
      marginBottom: '1rem',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    }}>
      {isGuest && (
        <button onClick={() => navigate('login')} style={btn()} onMouseEnter={hover} onMouseLeave={leave}>
          {t('home.login')}
        </button>
      )}

      {isAuthenticated && (
        <button onClick={signOut} style={btn({ color: colors.danger })} onMouseEnter={hover} onMouseLeave={leave}>
          {t('settings.signOut')}
        </button>
      )}

      {canManage && (
      <button onClick={() => navigate('settings')} style={btn()} onMouseEnter={hover} onMouseLeave={leave}>
        {t('home.settings')}
      </button>
    )}

      {canManage && (
        <button onClick={() => navigate('research')} style={btn()} onMouseEnter={hover} onMouseLeave={leave}>
          {t('home.researchConsole')}
        </button>
      )}

      <button onClick={() => navigate('about')} style={btn()} onMouseEnter={hover} onMouseLeave={leave}>
        {t('home.about')}
      </button>

      <button onClick={() => navigate('showroom')} style={btn()} onMouseEnter={hover} onMouseLeave={leave}>
        {t('home.showroom')}
      </button>


      <button onClick={cycleLanguage} style={btn({ display: 'flex', justifyContent: 'space-between' })} onMouseEnter={hover} onMouseLeave={leave}>
        <span>{t('settings.language')}</span>
        <span style={{ color: colors.textMuted, textTransform: 'uppercase' }}>{settings.language}</span>
      </button>

      <button onClick={cycleTheme} style={btn({ display: 'flex', justifyContent: 'space-between' })} onMouseEnter={hover} onMouseLeave={leave}>
        <span>{t('settings.theme')}</span>
        <span style={{ color: colors.textMuted }}>{t(`settings.${settings.theme}` as TranslationKey)}</span>
      </button>
    </div>
  );
});
