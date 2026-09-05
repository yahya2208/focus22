import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useAuth } from '../../core/auth/AuthProvider';
import {
  fetchAvailableOrders,
  fetchMyDeliveries,
  acceptOrder,
  courierSetStatus,
  courierActionsFor,
  fetchOrderDetail,
  type CourierOrderSummary,
  type OrderDetailPayload,
  type CourierAction,
} from '../../services/courier-service';
import type { PilotOrderStatus } from '../../services/order-service';
import type { TranslationKey } from '../../i18n';

/**
 * PilotCourierScreen — courier experience (Phases 3, 10; Gate C Courier).
 * Available orders → accept → pickup (out_for_delivery) → delivered.
 * Server re-authorizes every RPC (active pilot_couriers membership, operator,
 * admin). Courier payloads never include the customer phone (least privilege).
 */
export const PilotCourierScreen = memo(function PilotCourierScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const [available, setAvailable] = useState<CourierOrderSummary[]>([]);
  const [mine, setMine] = useState<CourierOrderSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, OrderDetailPayload>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [a, m] = await Promise.all([fetchAvailableOrders(), fetchMyDeliveries()]);
    setAvailable(a);
    setMine(m);
  }, []);

  useEffect(() => {
    let alive = true;
    if (authState.status !== 'authenticated' && authState.status !== 'anonymous') return;
    load()
      .catch(() => alive && setError('COURIER_LOAD_FAILED'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [authState.status, load]);

  const toggleDetail = useCallback(async (orderId: string) => {
    if (expanded === orderId) {
      setExpanded(null);
      return;
    }
    try {
      if (!detail[orderId]) {
        const d = await fetchOrderDetail(orderId);
        setDetail((prev) => ({ ...prev, [orderId]: d }));
      }
      setExpanded(orderId);
    } catch {
      setError('DETAIL_FAILED');
    }
  }, [expanded, detail]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        setMessage('COURIER_OK');
        setError(null);
        setExpanded(null);
        await load();
      } catch {
        setError('COURIER_FAILED');
      }
    },
    [load],
  );

  const handleAccept = useCallback(
    (orderId: string) => act(() => acceptOrder(orderId)),
    [act],
  );

  const handleCourierStatus = useCallback(
    (orderId: string, status: PilotOrderStatus) =>
      act(async () => {
        await courierSetStatus(orderId, status);
      }),
    [act],
  );

  const labelStyle = { color: colors.textMuted, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const boldStyle = { color: colors.text, fontWeight: 700, fontSize: '0.9rem' } as const;
  const name = (en: string | null, ar: string | null) => (locale === 'ar' && ar ? ar : en);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);

  const renderActions = (summary: CourierOrderSummary, actions: CourierAction[]) => (
    <Flex gap="sm" style={{ marginTop: 8, flexWrap: 'wrap' }}>
      {actions.map((a) => (
        <Button
          key={a.status}
          variant="primary"
          size="sm"
          onClick={() => void handleCourierStatus(summary.order_id, a.status)}
        >
          {t(a.labelKey as TranslationKey)}
        </Button>
      ))}
    </Flex>
  );

  const renderOrder = (o: CourierOrderSummary, actions: CourierAction[], onAccept?: (id: string) => void) => (
    <div key={o.order_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
      <Flex justify="space-between" align="center" gap="md">
        <div>
          <div style={boldStyle}>{o.order_number}</div>
          <span style={mutedStyle}>
            {o.store_name ? name(o.store_name, o.store_name_ar) : ''} · {o.status}
          </span>
          <span style={mutedStyle}>
            {o.customer_name} · {o.zone_name ?? ''} · {o.total.toFixed(2)} {t('pilot.currency')} · {String(o.item_count)} {t('pilot.itemsLabel')}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void toggleDetail(o.order_id)}>
          {expanded === o.order_id ? t('pilot.hideDetails') : t('pilot.showDetails')}
        </Button>
      </Flex>

      {expanded === o.order_id && detail[o.order_id] && (
        <Stack gap="sm" style={{ marginTop: 8 }}>
          {detail[o.order_id]?.order.address && <span style={mutedStyle}>{t('pilot.address')}: {detail[o.order_id]?.order.address}</span>}
          {detail[o.order_id]?.order.notes && <span style={mutedStyle}>{t('pilot.notes')}: {detail[o.order_id]?.order.notes}</span>}
          {(detail[o.order_id]?.items ?? []).map((it) => (
            <Flex key={it.id} justify="space-between" align="center">
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>
                {it.name ?? it.catalog_ref} × {String(it.quantity)}
              </span>
              <span style={{ color: colors.text, fontSize: '0.82rem' }}>{Number(it.line_total).toFixed(2)} {t('pilot.currency')}</span>
            </Flex>
          ))}
        </Stack>
      )}

      {onAccept ? (
        <Button variant="primary" size="sm" onClick={() => onAccept(o.order_id)} style={{ marginTop: 8 }}>
          {t('pilot.acceptOrder')}
        </Button>
      ) : (
        renderActions(o, actions)
      )}
    </div>
  );

  if (authState.status !== 'authenticated' && authState.status !== 'anonymous') {
    return (
      <Screen>
        <Stack gap="lg">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.courierTitle')}</h1>
          <Divider />
          <span style={labelStyle}>{t('pilot.signInRequired')}</span>
          <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })} style={{ width: '100%' }}>
            {t('pilot.signIn')}
          </Button>
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.courierTitle')}</h1>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}>
            {t('pilot.backSettings')}
          </Button>
        </Flex>
        <Divider />

        {message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tMsg(message)}</span>}
        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(error)}</span>}

        {loading ? (
          <span style={labelStyle}>{t('pilot.loading')}</span>
        ) : (
          <>
            <span style={labelStyle}>{t('pilot.availableOrders')}</span>
            {available.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noAvailableOrders')}</span>
            ) : (
              available.map((o) => renderOrder(o, [], handleAccept))
            )}

            <Divider />

            <span style={labelStyle}>{t('pilot.myDeliveries')}</span>
            {mine.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noMyDeliveries')}</span>
            ) : (
              mine.map((o) => renderOrder(o, courierActionsFor(o.status)))
            )}
          </>
        )}

        <Divider />
        <span style={mutedStyle}>{t('pilot.courierHint')}</span>
      </Stack>
    </Screen>
  );
});