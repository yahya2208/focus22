import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useSmartWhatsApp, type SmartWhatsAppApi } from '../hooks/useSmartWhatsApp';
import { WhatsAppFallbackModal } from '../components/showroom/WhatsAppFallbackModal';

/**
 * V-2 (F-101) — Canonical WhatsApp handoff context.
 *
 * Mounts the single guarded same-tab `wa.me` pipeline (useSmartWhatsApp, §9.2)
 * ONCE at the app root and exposes it to every active CTA class
 * (ProductDetailsScreen action bar, AdContactBanner phone-ad click,
 * CustomerPhoneFlow send + model-not-found). The fallback modal (retry + copy)
 * is rendered by the provider itself, so no consumer duplicates handoff logic.
 *
 * Preserved: `wa.me`, `+213556254007`, existing message contracts, CTA
 * semantics, external-only boundary, fire-and-forget tracking (tracking is
 * never performed here and never blocks the handoff). No PII, no fingerprint.
 */
export type WhatsAppContextValue = SmartWhatsAppApi;

const WhatsAppContext = createContext<SmartWhatsAppApi | null>(null);

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const whatsapp = useSmartWhatsApp();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await whatsapp.copyMessage();
    if (ok) setCopied(true);
  }, [whatsapp]);

  const handleRetry = useCallback(() => {
    setCopied(false);
    whatsapp.retryOpen();
  }, [whatsapp]);

  const handleClose = useCallback(() => {
    setCopied(false);
    whatsapp.closeModal();
  }, [whatsapp]);

  return (
    <WhatsAppContext.Provider value={whatsapp}>
      {children}
      <WhatsAppFallbackModal
        open={whatsapp.modal?.open ?? false}
        message={whatsapp.modal?.message ?? ''}
        copied={copied}
        onCopy={handleCopy}
        onRetry={handleRetry}
        onClose={handleClose}
      />
    </WhatsAppContext.Provider>
  );
}

export function useWhatsApp(): SmartWhatsAppApi {
  const ctx = useContext(WhatsAppContext);
  if (!ctx) {
    throw new Error('useWhatsApp must be used within WhatsAppProvider');
  }
  return ctx;
}
