import { useCallback, useEffect, useRef, useState } from 'react';
import { WHATSAPP_PHONE, buildWhatsAppUrl } from '../services/whatsapp-service';

export const WHATSAPP_GUARD_TIMEOUT_MS = 1500;

export interface WhatsAppModalState {
  open: boolean;
  message: string;
}

export interface WhatsAppSendContext {
  action?: 'buy' | 'exchange' | 'inquiry';
  deviceId?: string;
}

export interface SmartWhatsAppApi {
  /** Same-tab wa.me navigation + ~1.5s beforeunload guard (v5.1 §9.2). */
  send: (message: string, context?: WhatsAppSendContext) => void;
  /** Fallback modal state (null = closed). */
  modal: WhatsAppModalState | null;
  /** "فتح واتساب" retry from the fallback modal — same-tab again. */
  retryOpen: () => void;
  /** "نسخ الرسالة" from the fallback modal — clipboard. */
  copyMessage: () => Promise<boolean>;
  closeModal: () => void;
}

/**
 * v5.1 §9.2 WhatsApp pipeline for the Product Details action bar.
 * Same-tab `wa.me` navigation (allowed native exit — NOT an internal SPA
 * navigation) guarded by a beforeunload/pagehide listener (~1.5s):
 *  - page actually leaves → nothing further needed
 *  - still on the page after the guard → fallback modal
 * No `window.open`, no new tabs. The nav stack is never touched by the handoff.
 */
export function useSmartWhatsApp(): SmartWhatsAppApi {
  const [modal, setModal] = useState<WhatsAppModalState | null>(null);
  const guardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leavingRef = useRef(false);
  const contextRef = useRef<WhatsAppSendContext>({});
  const messageRef = useRef('');

  const clearGuard = useCallback(() => {
    if (guardRef.current != null) {
      clearTimeout(guardRef.current);
      guardRef.current = null;
    }
  }, []);

  const onPageLeaving = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    clearGuard();
  }, [clearGuard]);

  useEffect(() => {
    window.addEventListener('beforeunload', onPageLeaving);
    window.addEventListener('pagehide', onPageLeaving);
    return () => {
      window.removeEventListener('beforeunload', onPageLeaving);
      window.removeEventListener('pagehide', onPageLeaving);
      clearGuard();
    };
  }, [onPageLeaving, clearGuard]);

  const openSameTab = useCallback(
    (message: string, context: WhatsAppSendContext) => {
      messageRef.current = message;
      contextRef.current = context;
      leavingRef.current = false;
      clearGuard();
      guardRef.current = setTimeout(() => {
        if (!leavingRef.current) {
          setModal({ open: true, message: messageRef.current });
        }
      }, WHATSAPP_GUARD_TIMEOUT_MS);
      const url = buildWhatsAppUrl(WHATSAPP_PHONE, message);
      window.location.href = url;
    },
    [clearGuard],
  );

  const send = useCallback(
    (message: string, context: WhatsAppSendContext = {}) => {
      openSameTab(message, context);
    },
    [openSameTab],
  );

  const retryOpen = useCallback(() => {
    if (!modal) return;
    setModal(null);
    openSameTab(modal.message, contextRef.current);
  }, [modal, openSameTab]);

  const copyMessage = useCallback(async () => {
    if (!modal) return false;
    try {
      await navigator.clipboard.writeText(modal.message);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = modal.message;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        /* clipboard unavailable — non-fatal */
      }
      document.body.removeChild(textarea);
    }
    return true;
  }, [modal]);

  const closeModal = useCallback(() => setModal(null), []);

  return { send, modal, retryOpen, copyMessage, closeModal };
}
