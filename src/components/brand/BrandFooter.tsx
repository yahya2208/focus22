import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { WHATSAPP_PHONE } from '../../services/whatsapp-service';

interface SocialLink {
  id: string;
  label: string;
  href: string | null;
  icon: ReactNode;
}

const FACEBOOK_URL = 'https://www.facebook.com/yahya.hayyo';

const SOCIAL_LINKS: SocialLink[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    href: `https://wa.me/${WHATSAPP_PHONE.replace(/\D/g, '')}`,
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.54-3.7 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29z" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: FACEBOOK_URL,
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none" aria-hidden="true">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.026 1.792-4.697 4.533-4.697 1.313 0 2.686.235 2.686.235v2.971H15.83c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    href: null,
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const [tiktokOpen, setTiktokOpen] = useState(false);

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
    cursor: 'pointer',
    transition: 'transform 0.15s ease, color 0.15s ease',
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
        {SOCIAL_LINKS.map((s) => (
          s.href ? (
            <a
              key={s.id}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              title={s.label}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              style={chipStyle}
            >
              {s.icon}
            </a>
          ) : (
            <button
              key={s.id}
              type="button"
              aria-label={s.label}
              title={s.label}
              onClick={() => setTiktokOpen((open) => !open)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              style={{ ...chipStyle, fontFamily: 'inherit', padding: 0 }}
            >
              {s.icon}
            </button>
          )
        ))}
      </div>
      {tiktokOpen && (
        <p
          role="status"
          style={{
            color: colors.textSecondary,
            fontSize: '0.78rem',
            margin: '0.8rem 0 0',
            padding: '0.5rem 0.9rem',
            display: 'inline-block',
            borderRadius: '10px',
            background: colors.glass,
            border: `1px solid ${colors.glassBorder}`,
          }}
        >
          {t('brand.social.tiktokReview')}
        </p>
      )}
      <p style={{ color: colors.textFaint, fontSize: '0.7rem', letterSpacing: '0.04em', margin: '1rem 0 0' }}>
        {t('brand.developedBy')}
      </p>
    </footer>
  );
});
