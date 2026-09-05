import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useAuth } from '../../core/auth/AuthProvider';
import { fetchMyStores, type Store } from '../../services/neighborhood-service';
import {
  fetchStoreOrders,
  updateStoreOrderStatus,
  storeActionsFor,
  type PilotOrder,
  type PilotOrderStatus,
} from '../../services/order-service';
import { fetchOrderDetail, type OrderDetailPayload } from '../../services/courier-service';
import type { TranslationKey } from '../../i18n';

/**
 * PilotStoreOpsScreen — store-operator experience (Phases 2, 6; Gate C Store).
 * Orders + full item detail + canonical status transitions. Server re-authorizes
 * every RPC (operator_user_id / admin); this screen is surface only.
 */
export const PilotStoreOpsScreen = memo(function PilotStoreOpsScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, OrderDetailPayload>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStores = useCallback(async () => {
    const ss = await fetchMyStores();
    setStores(ss);
    setStoreId((prev) => prev || ss[0]?.id || '');
  }, []);

  useEffect(() => {
    let alive = true;
    if (authState.status !== 'authenticated' && authState.status !== 'anonymous') return;
    loadStores()
      .catch(() => alive && setError('STORE_LOAD_FAILED'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [authState.status, loadStores]);

  useEffect(() => {
    if (!storeId) {
      setOrders([]);
      return;
    }
    void fetchStoreOrders(storeId)
      .then(setOrders)
      .catch(() => setError('ORDER_LOAD_FAILED'));
  }, [storeId]);

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
    async (orderId: string, status: PilotOrderStatus) => {
      try {
        await updateStoreOrderStatus(orderId, status);
        setMessage('STATUS_UPDATED');
        setError(null);
        setExpanded(null);
        if (storeId) setOrders(await fetchStoreOrders(storeId));
      } catch {
        setError('STATUS_FAILED');
      }
    },
    [storeId],
  );

  const labelStyle = { color: colors.textMuted, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const name = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);

  if (authState.status !== 'authenticated' && authState.status !== 'anonymous') {
    return (
      <Screen>
        <Stack gap="lg">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.storeOpsTitle')}</h1>
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
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.storeOpsTitle')}</h1>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}>
            {t('pilot.backSettings')}
          </Button>
        </Flex>
        <Divider />

        {message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tMsg(message)}</span>}
        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(error)}</span>}

        {loading ? (
          <span style={labelStyle}>{t('pilot.loading')}</span>
        ) : stores.length === 0 ? (
          <span style={labelStyle}>{t('pilot.noStores')}</span>
        ) : (
          <>
            <label style={labelStyle}>{t('pilot.store')}</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label={t('pilot.store')}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${colors.border}`,
                background: colors.bgCard, color: colors.text, fontSize: '0.9rem',
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {name(s.name, s.name_ar)}
                </option>
              ))}
            </select>

            <Divider />

            {orders.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noStoreOrders')}</span>
            ) : (
              orders.map((o) => {
                const oDetail = expanded === o.id ? detail[o.id] : undefined;
                return (
                <div key={o.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
                  <Flex justify="space-between" align="center" gap="md">
                    <div>
                      <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{o.order_number}</div>
                      <span style={mutedStyle}>
                        {o.customer_name} · {o.total.toFixed(2)} {t('pilot.currency')}
                      </span>
                      <span style={mutedStyle}>
                        {t('pilot.status')}: {o.status}
                      </span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => void toggleDetail(o.id)}>
                      {expanded === o.id ? t('pilot.hideDetails') : t('pilot.showDetails')}
                    </Button>
                  </Flex>

                  {expanded === o.id && oDetail && (
                    <Stack gap="sm" style={{ marginTop: 8 }}>
                      <span style={mutedStyle}>
                        {oDetail.order.customer_name}
                        {oDetail.order.customer_phone ? ` · ${oDetail.order.customer_phone}` : ''}
                        {oDetail.order.zone_name ? ` · ${oDetail.order.zone_name}` : ''}
                      </span>
                      {oDetail.order.address && <span style={mutedStyle}>{t('pilot.address')}: {oDetail.order.address}</span>}
                      {oDetail.items.map((it) => (
                        <Flex key={it.id} justify="space-between" align="center">
                          <span style={{ color: colors.text, fontSize: '0.82rem' }}>
                            {it.name ?? it.catalog_ref} × {String(it.quantity)}
                          </span>
                          <span style={{ color: colors.text, fontSize: '0.82rem' }}>{Number(it.line_total).toFixed(2)} {t('pilot.currency')}</span>
                        </Flex>
                      ))}
                      <Divider />
                      <Flex justify="space-between" align="center">
                        <span style={labelStyle}>{t('pilot.subtotal')}</span>
                        <span style={{ color: colors.text, fontWeight: 700 }}>{Number(oDetail.order.subtotal).toFixed(2)} {t('pilot.currency')}</span>
                      </Flex>
                      <Flex justify="space-between" align="center">
                        <span style={labelStyle}>{t('pilot.deliveryFee')}</span>
                        <span style={labelStyle}>{Number(oDetail.order.delivery_fee).toFixed(2)} {t('pilot.currency')}</span>
                      </Flex>
                      <Flex justify="space-between" align="center">
                        <span style={{ color: colors.text, fontWeight: 700 }}>{t('pilot.orderTotal')}</span>
                        <span style={{ color: colors.text, fontWeight: 700 }}>{Number(oDetail.order.total).toFixed(2)} {t('pilot.currency')}</span>
                      </Flex>
                      <Flex gap="sm" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                        {storeActionsFor(o.status).map((a) => (
                          <Button key={a.status} variant="primary" size="sm" onClick={() => void act(o.id, a.status)}>
                            {t(a.labelKey as TranslationKey)}
                          </Button>
                        ))}
                      </Flex>
                    </Stack>
                  )}
                </div>
              );
            })
            )}
          </>
        )}
      </Stack>
    </Screen>
  );
});