import { useCallback, useRef, useState } from 'react';
import { fetchOrderDetail, type OrderDetailPayload } from '../../../../services/courier-service';
import { fetchOrderTimeline, type OrderTimeline } from '../../../../services/order-tracking-service';

export interface OrderDetailWorkspace {
  readonly selectedOrderId: string | null;
  readonly detail: OrderDetailPayload | null;
  readonly detailLoading: boolean;
  readonly detailError: string | null;
  readonly timeline: OrderTimeline | null;
  readonly timelineLoading: boolean;
  readonly timelineError: string | null;
  readonly openOrder: (orderId: string) => void;
  readonly closeDetail: () => void;
  readonly retryDetail: () => void;
}

/**
 * On-demand order detail workspace (G2.3).
 *
 * Detail and timeline are read only when an order is opened. Successfully read
 * payloads are cached independently, so reopening an order never repeats a
 * completed read, while a failed side can be retried without rereading the
 * successful side. This hook never touches the order list.
 *
 * Data rule: `OrderDetailPayload.items[].quantity` is the ORDERED quantity and
 * `line_total` is the server-computed ordered line value. No read path returns
 * delivered actuals, so the UI must not display, infer, or derive them.
 */
export function useOrderDetail(): OrderDetailWorkspace {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<OrderTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const requestRef = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const detailCache = useRef(new Map<string, OrderDetailPayload>());
  const timelineCache = useRef(new Map<string, OrderTimeline>());

  const loadDetail = useCallback((orderId: string) => {
    if (!orderId) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    selectedRef.current = orderId;
    setSelectedOrderId(orderId);

    const cachedDetail = detailCache.current.get(orderId) ?? null;
    const cachedTimeline = timelineCache.current.get(orderId) ?? null;
    setDetail(cachedDetail);
    setDetailError(null);
    setDetailLoading(!cachedDetail);
    setTimeline(cachedTimeline);
    setTimelineError(null);
    setTimelineLoading(!cachedTimeline);
    if (cachedDetail && cachedTimeline) return;

    const tasks: Array<Promise<void>> = [];
    if (!cachedDetail) {
      tasks.push(
        fetchOrderDetail(orderId)
          .then((payload) => {
            if (requestRef.current !== request || selectedRef.current !== orderId) return;
            detailCache.current.set(orderId, payload);
            setDetail(payload);
            setDetailError(null);
          })
          .catch(() => {
            if (requestRef.current !== request || selectedRef.current !== orderId) return;
            setDetail(null);
            setDetailError('DETAIL_FAILED');
          })
          .finally(() => {
            if (requestRef.current === request && selectedRef.current === orderId) setDetailLoading(false);
          }),
      );
    }
    if (!cachedTimeline) {
      tasks.push(
        fetchOrderTimeline(orderId)
          .then((payload) => {
            if (requestRef.current !== request || selectedRef.current !== orderId) return;
            timelineCache.current.set(orderId, payload);
            setTimeline(payload);
            setTimelineError(null);
          })
          .catch(() => {
            if (requestRef.current !== request || selectedRef.current !== orderId) return;
            setTimeline(null);
            setTimelineError('TIMELINE_FAILED');
          })
          .finally(() => {
            if (requestRef.current === request && selectedRef.current === orderId) setTimelineLoading(false);
          }),
      );
    }
    void Promise.all(tasks);
  }, []);

  const openOrder = useCallback(
    (orderId: string) => {
      loadDetail(orderId);
    },
    [loadDetail],
  );

  const closeDetail = useCallback(() => {
    requestRef.current += 1;
    selectedRef.current = null;
    setSelectedOrderId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
  }, []);

  const retryDetail = useCallback(() => {
    const orderId = selectedRef.current;
    if (orderId) loadDetail(orderId);
  }, [loadDetail]);

  return {
    selectedOrderId,
    detail,
    detailLoading,
    detailError,
    timeline,
    timelineLoading,
    timelineError,
    openOrder,
    closeDetail,
    retryDetail,
  };
}
