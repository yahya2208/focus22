import { memo, type CSSProperties } from 'react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * Custom PWA install banner. Rendered only when the browser fires
 * `beforeinstallprompt` and the deferred prompt is available.
 */
export const InstallPrompt = memo(function InstallPrompt() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { canInstall, isInstalled, install, dismiss } = useInstallPrompt();

  if (!canInstall || isInstalled) return null;

  const bannerStyle: CSSProperties = {
    position: 'fixed',
    left: '16px',
    right: '16px',
    bottom: '16px',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 16px',
    background: colors.bgCard,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: '14px',
    boxShadow: `0 8px 32px ${colors.shadow}`,
    backdropFilter: 'blur(12px)',
  };

  const textStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  };

  const titleStyle: CSSProperties = {
    color: colors.text,
    fontSize: '0.85rem',
    fontWeight: 700,
  };

  const subtitleStyle: CSSProperties = {
    color: colors.textMuted,
    fontSize: '0.72rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  const actionsStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  };

  const buttonStyle = (primary: boolean): CSSProperties => ({
    padding: '8px 14px',
    borderRadius: '10px',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    background: primary ? colors.accent : 'transparent',
    color: primary ? '#06121a' : colors.textSecondary,
  });

  return (
    <div style={bannerStyle} role="dialog" aria-label={t('pwa.installTitle')}>
      <div style={textStyle}>
        <span style={titleStyle}>{t('pwa.installTitle')}</span>
        <span style={subtitleStyle}>{t('pwa.installBody')}</span>
      </div>
      <div style={actionsStyle}>
        <button type="button" style={buttonStyle(false)} onClick={() => dismiss()}>
          {t('pwa.dismiss')}
        </button>
        <button type="button" style={buttonStyle(true)} onClick={() => void install()}>
          {t('pwa.installAction')}
        </button>
      </div>
    </div>
  );
});
