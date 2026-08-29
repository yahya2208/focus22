import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ContactListingActionProps {
  label: string;
  onContact: () => void;
}

/**
 * B1 — Single contact CTA for car/property listings (Marketplace Mediator
 * model, same as phones): FOCUS is a mediator only — no transaction happens in
 * the app. «تواصل مع صاحب الإعلان» → the shared smart-WhatsApp pipeline to the
 * business number. Part of the listing surface's hardcoded-Arabic convention
 * (P6 i18n cleanup is future scope).
 */
export const ContactListingAction = memo(function ContactListingAction({
  label,
  onContact,
}: ContactListingActionProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div role="group" aria-label={label}>
      <button
        type="button"
        data-action="contact-listing-owner"
        aria-label={`💬 ${t('listingDetails.actions.contact')} — ${label}`}
        onClick={onContact}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.85rem 1rem',
          background: colors.accent,
          color: '#fff',
          border: 'none',
          borderRadius: '14px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '0.95rem',
          fontWeight: 800,
        }}
      >
        <span aria-hidden>💬</span>
        <span>{t('listingDetails.actions.contact')}</span>
      </button>
      <p style={{ margin: '0.55rem 0 0', textAlign: 'center', color: colors.textSecondary, fontSize: '0.72rem', lineHeight: 1.6 }}>
        {t('listingDetails.actions.contactRedirectNote')}
      </p>
    </div>
  );
});
