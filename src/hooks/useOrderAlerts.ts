import { useCallback, useEffect, useRef, useState } from 'react';
import { createPilotOrderRealtime } from '../services/pilot-realtime-service';
import { fetchMyStores } from '../services/neighborhood-service';
import { useAuth } from '../core/auth/AuthProvider';

// ============================================================================
// useOrderAlerts — single global NEW_ORDER listener (G-N1).
// Mounted once (AppShell). Subscribes to `orders` INSERTs with NO client
// filter — row visibility is enforced server-side by RLS; this hook only
// decides DISPLAY eligibility: admins see all, operators see their stores,
// everyone else (family, courier, guest, anonymous) sees nothing.
// Dedup by order_id: one logical alert no matter how many times the event
// re-arrives (reconnect redelivery, multi-tab is per-tab by design).
// Failure-isolated: subscription errors never touch order/settlement flows.
// ============================================================================

export interface OrderAlert {
  readonly orderId: string;
  readonly storeId: string | null;
  readonly total: number | null;
  readonly createdAt: string;
}

const MAX_ALERTS = 5;

export function useOrderAlerts(): {
  alerts: readonly OrderAlert[];
  dismiss: (orderId: string) => void;
} {
  const { state: authState } = useAuth();
  const [alerts, setAlerts] = useState<readonly OrderAlert[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const storesRef = useRef<{ loaded: boolean; ids: Set<string> }>({ loaded: false, ids: new Set() });

  const dismiss = useCallback((orderId: string) => {
    setAlerts((prev) => prev.filter((a) => a.orderId !== orderId));
  }, []);

  useEffect(() => {
    const role = authState.user?.role;
    const userId = authState.user?.id;
    if (authState.status !== 'authenticated' || !userId) return;
    if (role !== 'admin' && role !== 'super_admin') {
      // Non-admins are eligible only as store operators; family/courier/
      // guest roles fall through to no display (checked per event below).
    }

    let cancelled = false;
    const feed = createPilotOrderRealtime({
      table: 'orders',
      onPayload: (payload) => {
        if (cancelled) return;
        if (payload.eventType !== 'INSERT') return;
        const row = payload.newRecord;
        if (row == null || typeof row.id !== 'string') return;
        const orderId = row.id as string;
        if (seenRef.current.has(orderId)) return;
        void (async () => {
          try {
            const r = authState.user?.role;
            let eligible = r === 'admin' || r === 'super_admin';
            if (!eligible) {
              if (!storesRef.current.loaded) {
                const stores = await fetchMyStores().catch(() => []);
                if (cancelled) return;
                storesRef.current = { loaded: true, ids: new Set(stores.map((s) => s.id)) };
              }
              const sid = typeof row.store_id === 'string' ? (row.store_id as string) : null;
              eligible = sid != null && storesRef.current.ids.has(sid);
            }
            if (!eligible || cancelled) return;
            seenRef.current.add(orderId);
            const total = typeof row.total === 'number' ? (row.total as number) : null;
            const createdAt = typeof row.created_at === 'string' ? (row.created_at as string) : '';
            setAlerts((prev) =>
              [{ orderId, storeId: typeof row.store_id === 'string' ? (row.store_id as string) : null, total, createdAt }, ...prev].slice(0, MAX_ALERTS),
            );
          } catch {
            // Alert path only: never fail the order flow.
          }
        })();
      },
    });
    feed.start();
    return () => {
      cancelled = true;
      feed.stop();
    };
  }, [authState.status, authState.user?.id, authState.user?.role]);

  return { alerts, dismiss };
}
