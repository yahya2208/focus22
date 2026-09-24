import { useEffect, useRef } from 'react';
import type { OrderAlert } from '../hooks/useOrderAlerts';

// ============================================================================
// Background notification layer (G-N2). Fires a system Notification ONLY when
// the page is hidden (background tab / minimized) — foreground alerts stay
// in-app to avoid banner+notification duplication. Denied permission is
// respected permanently; no order/settlement path is touched.
// ============================================================================

const ASKED_KEY = 'focus-notify-asked-v1';

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function getNotifyPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifyPermission;
}

export function wasNotifyAsked(): boolean {
  try {
    return window.localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markNotifyAsked(): void {
  try {
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Storage unavailable — treat as asked to avoid nagging.
  }
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  markNotifyAsked();
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    return result as NotifyPermission;
  } catch {
    return getNotifyPermission();
  }
}

/**
 * Mirror new-order alerts to system notifications while hidden. Tracks shown
 * ids so reconnect redelivery never double-notifies. Silent no-op unless
 * permission is granted and the document is hidden.
 */
export function useBackgroundNotify(alerts: readonly OrderAlert[], format: (a: OrderAlert) => { title: string; body: string }): void {
  const shownRef = useRef<Set<string>>(new Set());
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;
    if (window.document.visibilityState !== 'hidden') return;
    for (const a of alerts) {
      if (shownRef.current.has(a.orderId)) continue;
      shownRef.current.add(a.orderId);
      try {
        const { title, body } = formatRef.current(a);
        new window.Notification(title, { body, tag: `new-order:${a.orderId}` });
      } catch {
        // Notification failure must never affect the app.
      }
    }
  }, [alerts]);
}
