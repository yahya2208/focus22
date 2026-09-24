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
 * Web Push subscription (G-N3). VAPID public key is injected by the caller
 * (deployment config — never hardcoded secrets here). The subscription is
 * POSTed to the sender backend; rows are owner-scoped server-side.
 * Returns null when push is unavailable (no SW / no PushManager / denied).
 */
export async function subscribePush(vapidPublicKey: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !vapidPublicKey) return false;
    if (window.Notification?.permission !== 'granted') return false;
    const reg = await window.navigator.serviceWorker.ready;
    const pushManager = (reg as ServiceWorkerRegistration & { pushManager?: PushManager }).pushManager;
    if (!pushManager) return false;
    const existing = await pushManager.getSubscription();
    if (existing) return true;
    const sub = await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey });
    const keys = sub.toJSON().keys ?? {};
    // Owner-scoped direct insert: RLS permits ONLY auth.uid()=user_id rows,
    // so no RPC and no privilege beyond the caller's own subscription.
    const { getSupabaseClient } = await import('../core/supabase/client');
    const { data: session } = await getSupabaseClient().auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) {
      await sub.unsubscribe().catch(() => undefined);
      return false;
    }
    const { error } = await getSupabaseClient().from('push_subscriptions').upsert(
      { user_id: uid, endpoint: sub.endpoint, p256dh: keys.p256dh ?? '', auth: keys.auth ?? '', last_seen: new Date().toISOString() },
      { onConflict: 'endpoint' },
    );
    if (error) {
      await sub.unsubscribe().catch(() => undefined);
      return false;
    }
    return true;
  } catch {
    return false;
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
