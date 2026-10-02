import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PILOT_ORDER_STATUSES,
  fetchStoreOrders,
  type PilotOrder,
  type PilotOrderStatus,
} from '../../../../services/order-service';
import {
  createPilotOrderRealtime,
  type PilotRealtimeFeedStatus,
} from '../../../../services/pilot-realtime-service';

export type OrderStatusFilter = 'ALL' | PilotOrderStatus;

export interface OrdersWorkspaceOptions {
  /** Globally selected store. The workspace never changes it. */
  storeId: string;
  /** Host auth state. The feed stays off until the caller is authenticated. */
  authStatus: string;
}

export interface OrdersWorkspace {
  readonly orders: readonly PilotOrder[];
  readonly ordersLoading: boolean;
  /** Failure of the store list read. A detail failure is owned separately. */
  readonly ordersError: string | null;
  readonly feedStatus: PilotRealtimeFeedStatus;
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly statusFilter: OrderStatusFilter;
  readonly setStatusFilter: (value: OrderStatusFilter) => void;
  readonly visibleOrders: readonly PilotOrder[];
  readonly orderCount: number;
  /** Explicit retry only. Selection, search, filters, detail and navigation never call it. */
  readonly refreshOrders: () => Promise<void>;
}

/**
 * Orders domain workspace (G2.3).
 *
 * This is the ONE owner of the admin order list and its existing realtime feed.
 * The list/realtime implementation was moved from PilotOpsAdminScreen without
 * adding a second fetch path, a second subscription, a catalog read, or a
 * mutation. Status mutation, preparation, delivery, delivered actuals,
 * settlement, and inventory remain in Store Ops.
 *
 * Money rule: subtotal, delivery fee, and total are server facts carried on
 * each order row. This hook never recomputes them, never sums them, and never
 * relabels them as revenue, sales, profit, balance, or debt.
 */
export function useOrdersWorkspace({ storeId, authStatus }: OrdersWorkspaceOptions): OrdersWorkspace {
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<PilotRealtimeFeedStatus>('idle');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('ALL');
  const requestRef = useRef(0);

  const refreshOrders = useCallback(async () => {
    if (!storeId) {
      requestRef.current += 1;
      setOrders([]);
      setOrdersError(null);
      setOrdersLoading(false);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setOrdersLoading(true);
    try {
      const rows = await fetchStoreOrders(storeId);
      if (requestRef.current !== request) return;
      setOrders(rows);
      setOrdersError(null);
    } catch {
      if (requestRef.current !== request) return;
      // Keep the last known list: a failed read is reported, not hidden.
      setOrdersError('ORDER_LOAD_FAILED');
    } finally {
      if (requestRef.current === request) setOrdersLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  // Existing admin realtime behavior, moved unchanged: one unfiltered orders
  // subscription plus the same store-scoped refetch on payload or fallback poll.
  useEffect(() => {
    if (authStatus === 'unauthenticated') return;
    const feed = createPilotOrderRealtime({
      table: 'orders',
      channelPrefix: 'pilot-admin-ops',
      onPayload: () => {
        if (!storeId) return;
        void fetchStoreOrders(storeId)
          .then(setOrders)
          .catch(() => {});
      },
      onStatus: setFeedStatus,
      onPollFetch: async () => {
        if (!storeId) return;
        const next = await fetchStoreOrders(storeId);
        setOrders(next);
      },
    });
    feed.start();
    return () => {
      feed.stop();
    };
  }, [authStatus, storeId]);

  // Search and status filtering are pure presentation over rows already in
  // memory: changing them must never issue a request.
  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
      if (!q) return true;
      return [order.order_number, order.customer_name, order.status].some((value) =>
        String(value ?? '').toLowerCase().includes(q),
      );
    });
  }, [orders, query, statusFilter]);

  return {
    orders,
    ordersLoading,
    ordersError,
    feedStatus,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    visibleOrders,
    orderCount: orders.length,
    refreshOrders,
  };
}

export { PILOT_ORDER_STATUSES };
