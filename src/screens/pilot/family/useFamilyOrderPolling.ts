import { useEffect } from 'react';
import { fetchMyOrders, type CustomerOrderSummary } from '../../../services/order-tracking-service';

// ============================================================================
// useFamilyOrderPolling — 5s data-only refresh while a family order is live.
// Starts only with an active order id; stops at delivered/cancelled, on
// unmount/navigation, and never overlaps (alive-guard + cleanup). Read-only:
// no writes, no checkout/order-creation contact, StrictMode-safe.
// ============================================================================

const POLL_MS = 5000;
const TERMINAL = new Set(['delivered', 'cancelled']);

export function useFamilyOrderPolling(
  activeOrderId: string | null,
  activeStatus: string | null,
  onOrders: (orders: CustomerOrderSummary[]) => void,
): void {
  useEffect(() => {
    if (activeOrderId == null) return;
    if (activeStatus != null && TERMINAL.has(activeStatus)) return;
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      void fetchMyOrders()
        .then((list) => {
          if (alive) onOrders(list);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrderId, activeStatus]);
}

export const FAMILY_POLL_MS = POLL_MS;
