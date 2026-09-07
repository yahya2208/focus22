/**
 * PilotMyOrdersScreen — customer-facing My Orders list + timeline drill-down.
 * Server-authoritative: the list comes from pilot_my_orders (00082), timeline
 * from pilot_order_timeline (00079), detail from pilot_order_detail (00082).
 * Realtime is NOTIFICATION: orders feed via scoped postgres_changes (user_id
 * filter); stale indicator tracks the last successful sync; bounded fallback
 * polling keeps the list fresh when the channel is degraded.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useAuth } from '../../core/auth/AuthProvider';
import {
  fetchMyOrders,
  fetchOrderTimeline,
  mergeRealtimeOrderPayload,
  type CustomerOrderSummary,
  type OrderTimelineEvent,
} from '../../services/order-tracking-service';
import {
  createPilotOrderRealtime,
  type PilotRealtimeFeedStatus,
} from '../../services/pilot-realtime-service';
import type { TranslationKey } from '../../i18n';

const STATUS_LABELS: Record<string, string> = {
  pending: 'pilot.status.pending',
  confirmed: 'pilot.status.confirmed',
  preparing: 'pilot.status.preparing',
  out_for_delivery: 'pilot.status.outForDelivery',
  delivered: 'pilot.status.delivered',
  cancelled: 'pilot.status.cancelled',
};

export const PilotMyOrdersScreen = memo(function PilotMyOrdersScreen() {
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Record<string, OrderTimelineEvent[]>>({});
  const [feedStatus, setFeedStatus] = useState<PilotRealtimeFeedStatus>('idle');
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const feedRef = useRef<ReturnType<typeof createPilotOrderRealtime> | null>(null);

  const loadOrders = useCallback(async () => {
    const list = await fetchMyOrders();
    setOrders(list);
    setStale(false);
  }, []);

  // Initial fetch + realtime subscription
  useEffect(() => {
    let alive = true;
    if (authState.status !== 'authenticated' && authState.status !== 'anonymous') return;
    if (!authState.user?.id) return;

    const feed = createPilotOrderRealtime({
      table: 'orders',
      filter: `user_id=eq.${authState.user.id}`,
      channelPrefix: 'pilot-my-orders',
      onPayload: (payload) => {
        if (!alive) return;
        setOrders((prev) => mergeRealtimeOrderPayload(prev, payload));
      },
      onStatus: (next) => {
        if (!alive) return;
        setFeedStatus(next);
      },
      staleAfterMs: 45_000,
      onPollFetch: async () => {
        if (!alive) return;
        await loadOrders();
      },
    });
    feedRef.current = feed;

    loadOrders()
      .catch(() => alive && setError('ORDER_LOAD_FAILED'))
      .finally(() => alive && setLoading(false));

    feed.start();

    return () => {
      alive = false;
      feed.stop();
      feedRef.current = null;
    };
  }, [authState.status, authState.user?.id, loadOrders]);

  // Poll stale indicator (every 10s check feed health)
  useEffect(() => {
    if (feedStatus !== 'fallback' && feedStatus !== 'connecting') {
      setStale(false);
      return;
    }
    const id = setInterval(() => {
      setStale(feedRef.current?.isStale() ?? false);
    }, 10_000);
    return () => clearInterval(id);
  }, [feedStatus]);

  const toggleTimeline = useCallback(async (orderId: string) => {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(orderId);
    if (timeline[orderId]) return; // already loaded
    try {
      const result = await fetchOrderTimeline(orderId);
      setTimeline((prev) => ({ ...prev, [orderId]: [...result.events] }));
    } catch {
      setMessage(t('pilot.error.TIMELINE_FAILED' as TranslationKey));
    }
  }, [expandedId, timeline, t]);

  const isRtl = locale === 'ar';

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString(isRtl ? 'ar-SA' : undefined); }
    catch { return s; }
  };

  if (authState.status !== 'authenticated' && authState.status !== 'anonymous') {
    return (
      <Screen>
        <Flex justify="center" align="center" style={{ minHeight: '60vh' }}>
          <p>{t('pilot.error.NEEDS_AUTHENTICATION' as TranslationKey)}</p>
        </Flex>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack gap="md" style={{ padding: 16 }}>
        <h2>{t('pilot.myOrdersTitle' as TranslationKey)}</h2>

        {stale && (
          <div style={{ color: colors.warning, fontSize: '0.85em' }}>
            {t('pilot.staleIndicator' as TranslationKey)}
          </div>
        )}

        {error && <p style={{ color: colors.danger }}>{t(error as TranslationKey)}</p>}
        {message && <p style={{ color: colors.info }}>{message}</p>}

        {loading && <p>{t('pilot.loading' as TranslationKey)}</p>}

        {!loading && orders.length === 0 && (
          <p>{t('pilot.myOrdersEmpty' as TranslationKey)}</p>
        )}

        {orders.map((order) => (
          <div key={order.order_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <Flex justify="space-between" align="center">
              <div>
                <strong>{order.order_number}</strong>
                <span style={{ marginInlineStart: 8, color: colors.textSecondary, fontSize: '0.85em' }}>
                  {formatDate(order.created_at)}
                </span>
              </div>
              <span style={{ color: colors.accent, fontWeight: 600, fontSize: '0.9em' }}>
                {t((STATUS_LABELS[order.status] ?? 'pilot.status.' + order.status) as TranslationKey)}
              </span>
            </Flex>
            <Flex justify="space-between" align="center" style={{ marginTop: 4 }}>
              <span>{order.store_name ?? '—'}</span>
              <span>{order.total.toLocaleString()} {t('pilot.currency' as TranslationKey)}</span>
            </Flex>
            {order.item_count > 0 && (
              <span style={{ fontSize: '0.8em', color: colors.textSecondary }}>
                {order.item_count} {t('pilot.itemsLabel' as TranslationKey)}
              </span>
            )}

            <Button
              variant="ghost"
              size="sm"
              style={{ marginTop: 6 }}
              onClick={() => void toggleTimeline(order.order_id)}
            >
              {expandedId === order.order_id
                ? t('pilot.hideDetails' as TranslationKey)
                : t('pilot.showDetails' as TranslationKey)}
            </Button>

            {expandedId === order.order_id && (
              <div style={{ marginTop: 8, padding: 8, background: colors.bgCard, borderRadius: 6 }}>
                {timeline[order.order_id] ? (
                  timeline[order.order_id]!.length === 0
                    ? <p>{t('pilot.noTimeline' as TranslationKey)}</p>
                    : (
                      <ol style={{ margin: 0, paddingInlineStart: 16 }}>
                        {timeline[order.order_id]!.map((ev) => (
                          <li key={ev.id} style={{ marginBottom: 4 }}>
                            <strong>{t((STATUS_LABELS[ev.new_status] ?? ev.new_status) as TranslationKey)}</strong>
                            {ev.actor_role ? <span style={{ marginInlineStart: 4, fontSize: '0.8em', color: colors.textSecondary }}>({ev.actor_role})</span> : null}
                            <span style={{ marginInlineStart: 4, fontSize: '0.8em' }}>{formatDate(ev.created_at)}</span>
                          </li>
                        ))}
                      </ol>
                    )
                ) : (
                  <p>{t('pilot.tracking' as TranslationKey)}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </Stack>
    </Screen>
  );
});
