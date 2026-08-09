import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { InventoryRecord } from '../../services/inventory-service';

interface ContactOwnerActionProps {
  device: InventoryRecord;
  onContact: () => void;
}

/**
 * BATCH 3 — Single contact CTA (Marketplace Mediator model):
 * FOCUS is a mediator only — it never sells, buys, exchanges, finances, or
 * installments phones, and no transaction happens inside the app. Exactly ONE
 * primary action: «تواصل مع صاحب الإعلان» → WhatsApp to the ad owner from the
 * details page. Never a purchase/exchange/installment service.
 */
export const ContactOwnerAction = memo(function ContactOwnerAction({
  device,
  onContact,
}: ContactOwnerActionProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <div role="group" aria-label={t('phoneDetails.title')}>
      <button
        type="button"
        data-action="contact-owner"
        aria-label={`💬 ${t('phoneDetails.actions.contact')} — ${device.brand} ${device.model}`}
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
        <span>{t('phoneDetails.actions.contact')}</span>
      </button>
      <p style={{ margin: '0.55rem 0 0', textAlign: 'center', color: colors.textMuted, fontSize: '0.72rem', lineHeight: 1.6 }}>
        {t('phoneDetails.actions.contactRedirectNote')}
      </p>
      <p style={{ margin: '0.35rem 0 0', textAlign: 'center', color: colors.textFaint, fontSize: '0.66rem', lineHeight: 1.6 }}>
        {t('phoneDetails.actions.mediatorNote')}
      </p>
    </div>
  );
});
