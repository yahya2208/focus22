import { memo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Modal } from '../../design-system/components/Modal';

interface WhatsAppFallbackModalProps {
  open: boolean;
  message: string;
  copied: boolean;
  onCopy: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/**
 * WhatsApp fallback modal (§9.2): shown when the same-tab `wa.me` navigation
 * did not actually leave the page (blocked/uninstalled). Shows the full
 * message + copy + retry open. Copy fires `whatsapp_message_copied`.
 */
export const WhatsAppFallbackModal = memo(function WhatsAppFallbackModal({
  open,
  message,
  copied,
  onCopy,
  onRetry,
  onClose,
}: WhatsAppFallbackModalProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={t('whatsapp.fallbackTitle')}>
      <p style={{ margin: '0 0 0.75rem', color: colors.textSecondary, fontSize: '0.85rem', lineHeight: 1.6 }}>
        {t('whatsapp.fallbackMessage')}
      </p>
      <div
        data-role="whatsapp-fallback-message"
        style={{
          background: colors.bgInput,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '0.75rem',
          marginBottom: '0.9rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: '0.78rem',
          lineHeight: 1.7,
          color: colors.text,
          direction: 'rtl',
          textAlign: 'right',
          maxHeight: 220,
          overflowY: 'auto',
        }}
      >
        {message}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-action="copy-message"
          onClick={onCopy}
          style={{
            flex: 1,
            padding: '0.7rem',
            borderRadius: '12px',
            border: `1px solid ${colors.borderLight}`,
            background: colors.bgCard,
            color: colors.text,
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {copied ? `✓ ${t('whatsapp.copied')}` : `📋 ${t('whatsapp.copyMessage')}`}
        </button>
        <button
          type="button"
          data-action="retry-open"
          onClick={onRetry}
          style={{
            flex: 1,
            padding: '0.7rem',
            borderRadius: '12px',
            border: 'none',
            background: colors.success,
            color: '#000',
            fontWeight: 800,
            fontSize: '0.8rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t('whatsapp.open')}
        </button>
      </div>
    </Modal>
  );
});
