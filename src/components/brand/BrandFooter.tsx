import { memo, type CSSProperties } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';

const SOCIAL_ICONS: { id: string; label: string; icon: React.ReactNode }[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'x',
    label: 'X',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 4l16 16M20 4L4 20" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" />
        <path d="M7 10.5v6M7 7.5v.01M11 16.5v-4a2.8 2.8 0 0 1 5.6 0v4" />
      </svg>
    ),
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="5" width="20" height="14" rx="4.5" />
        <path d="M10.2 9.2l4.8 2.8-4.8 2.8z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 18.2V6.2l10-2.1v11.9" />
        <circle cx="6.8" cy="18" r="2.7" />
        <circle cx="16.8" cy="16" r="2.7" />
      </svg>
    ),
  },
];

export const BrandFooter = memo(function BrandFooter() {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const chipStyle: CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.glass,
    border: `1px solid ${colors.glassBorder}`,
    color: colors.textSecondary,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: `0 4px 18px ${colors.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.14)`,
    cursor: 'default',
  };

  return (
    <footer style={{ textAlign: 'center', padding: '1.5rem 0 0.5rem' }}>
      <p style={{
        color: colors.textMuted,
        fontSize: '0.72rem',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.18em',
        margin: '0 0 0.8rem',
      }}>
        {t('brand.social.follow')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.7rem' }}>
        {SOCIAL_ICONS.map((s) => (
          <span key={s.id} role="img" aria-label={s.label} title={s.label} style={chipStyle}>
            {s.icon}
          </span>
        ))}
      </div>
      <p style={{ color: colors.textFaint, fontSize: '0.7rem', letterSpacing: '0.04em', margin: '1rem 0 0' }}>
        {t('brand.developedBy')}
      </p>
    </footer>
  );
});
