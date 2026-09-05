import { memo, useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Select } from '../../design-system/components/Select';
import { Flex } from '../../design-system/components/Flex';
import {
  adminListNeighborhoods,
  adminListStores,
  adminListFamilies,
  adminListOperators,
  adminSetOperatorStatus,
  type Neighborhood,
  type Store,
  type FamilyGroup,
  type OperatorMembership,
  type OperatorStatus,
} from '../../services/neighborhood-service';
import {
  adminListCouriers,
  adminSetCourierStatus,
  type CourierMembership,
  type CourierStatus,
} from '../../services/courier-service';
import {
  fetchStoreOrders,
  updateStoreOrderStatus,
  resetPilot,
  fetchPilotHealth,
  PILOT_ORDER_STATUSES,
  type PilotOrder,
  type PilotHealth,
} from '../../services/order-service';
import type { TranslationKey } from '../../i18n';

/**
 * PilotOpsAdminScreen — Phase 7 + 9 (Gate SO / Gate A).
 * Inspects neighborhoods / stores / families and runs store order operations
 * through the operator-or-admin RPCs (00065). Server re-authorizes every call
 * with `fn_admin_uid()` / operator check — this screen is surface only.
 */
export const PilotOpsAdminScreen = memo(function PilotOpsAdminScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [operators, setOperators] = useState<OperatorMembership[]>([]);
  const [couriers, setCouriers] = useState<CourierMembership[]>([]);
  const [storeId, setStoreId] = useState('');
  const [orders, setOrders] = useState<PilotOrder[]>([]);
  const [health, setHealth] = useState<PilotHealth | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ns, fs, h] = await Promise.all([
        adminListNeighborhoods(),
        adminListFamilies(),
        fetchPilotHealth(),
      ]);
      setNeighborhoods(ns);
      setFamilies(fs);
      setHealth(h);
      const myStores: Store[] = [];
      for (const n of ns) {
        const ss = await adminListStores(n.id);
        myStores.push(...ss);
      }
      setStores(myStores);
      setStoreId((prev) => prev || myStores[0]?.id || '');
      setError(null);
    } catch {
      setError('ADMIN_LOAD_FAILED');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!storeId) {
      setOrders([]);
      return;
    }
    void fetchStoreOrders(storeId)
      .then((os) => {
        setOrders(os);
        setError(null);
      })
      .catch(() => setError('ORDER_LOAD_FAILED'));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      setOperators([]);
      setCouriers([]);
      return;
    }
    void Promise.all([adminListOperators(storeId), adminListCouriers(storeId)])
      .then(([ops, cos]) => {
        setOperators(ops);
        setCouriers(cos);
      })
      .catch(() => {
        setError('ADMIN_LOAD_FAILED');
      });
  }, [storeId]);

  const setOperator = useCallback(
    async (userId: string, status: OperatorStatus) => {
      if (!storeId) return;
      try {
        await adminSetOperatorStatus(storeId, userId, status);
        setMessage('OPERATOR_STATUS_UPDATED');
        setError(null);
        setOperators(await adminListOperators(storeId));
      } catch {
        setError('OPERATORS_LOAD_FAILED');
      }
    },
    [storeId],
  );

  const setCourier = useCallback(
    async (userId: string, status: CourierStatus) => {
      if (!storeId) return;
      try {
        await adminSetCourierStatus(storeId, userId, status);
        setMessage('COURIER_STATUS_UPDATED');
        setError(null);
        setCouriers(await adminListCouriers(storeId));
      } catch {
        setError('COURIERS_LOAD_FAILED');
      }
    },
    [storeId],
  );

  const setStatus = useCallback(
    async (orderId: string, status: string) => {
      if (!(PILOT_ORDER_STATUSES as readonly string[]).includes(status)) return;
      try {
        await updateStoreOrderStatus(orderId, status as (typeof PILOT_ORDER_STATUSES)[number]);
        setMessage('STATUS_UPDATED');
        if (storeId) {
          setOrders(await fetchStoreOrders(storeId));
        }
      } catch {
        setError('STATUS_FAILED');
      }
    },
    [storeId],
  );

  const handleReset = useCallback(async () => {
    if (!window.confirm(t('pilot.resetConfirm'))) return;
    try {
      await resetPilot();
      setMessage('RESET_OK');
      setError(null);
      setOrders([]);
      setStores([]);
      setStoreId('');
      await load();
    } catch {
      setError('RESET_FAILED');
    }
  }, [t, load]);

  const labelStyle = { color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const mutedStyle = { color: colors.textMuted, fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', display: 'block' } as const;
  const name = (en: string, ar: string) => (locale === 'ar' && ar ? ar : en);
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const tMsg = (code: string) => t(`pilot.msg.${code}` as TranslationKey);

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.opsTitle')}</h1>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}>
            {t('pilot.backSettings')}
          </Button>
        </Flex>
        <Divider />

        {message && <span style={{ color: colors.successText, fontSize: '0.85rem' }}>{tMsg(message)}</span>}
        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(error)}</span>}

        <span style={labelStyle}>{t('pilot.neighborhoods')}</span>
        {neighborhoods.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.emptyNeighborhoods')}</span>
        ) : (
          neighborhoods.map((n) => (
            <div key={n.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
              <div style={{ color: colors.text, fontWeight: 700 }}>{name(n.name, n.name_ar)}</div>
              <span style={mutedStyle}>
                slug: {n.slug} · status: {n.status}
              </span>
            </div>
          ))
        )}

        {health && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.9rem' }}>{t('pilot.healthTitle')}</div>
            <span style={mutedStyle}>
              🏘️ {t('pilot.neighborhoodsCount')}: {String(health.neighborhoods)} · 🏪 {t('pilot.storesCount')}: {String(health.stores)} · 👨‍👩‍👧‍👦 {t('pilot.familiesCount')}: {String(health.families)} · 🛵 {t('pilot.couriersCount')}: {String(health.couriers)}
            </span>
            <span style={mutedStyle}>
              {t('pilot.ordersTotal')}: {String(health.orders.total)} · pending {String(health.orders.pending)} · confirmed {String(health.orders.confirmed)} · preparing {String(health.orders.preparing)} · 🛵 {String(health.orders.out_for_delivery)} · ✓ {String(health.orders.delivered)} · ✗ {String(health.orders.cancelled)}
            </span>
            <span style={mutedStyle}>
              📊 {t('pilot.telemetryCreated')}: {String(health.telemetry.order_created)} · {t('pilot.telemetryCompleted')}: {String(health.telemetry.order_completed)} · {t('pilot.telemetryFailed')}: {String(health.telemetry.order_failed)}
            </span>
          </div>
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.families')}</span>
        {families.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noFamilies')}</span>
        ) : (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
            {families.map((f) => (
              <span key={f.id} style={mutedStyle}>
                {name(f.name, f.name_ar)} · {f.status}
              </span>
            ))}
          </div>
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.operatorsTitle')}</span>
        <span style={mutedStyle}>{t('pilot.operatorsHint')}</span>
        {operators.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noOperators')}</span>
        ) : (
          operators.map((op) => (
            <div key={op.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
              <Flex justify="space-between" align="center">
                <span style={{ color: colors.text, fontWeight: 700 }}>{op.user_name ?? op.user_email ?? op.user_id}</span>
                <span style={mutedStyle}>{op.status}</span>
              </Flex>
              <Flex justify="flex-start" align="center" gap="sm">
                {op.status !== 'active' && (
                  <Button variant="primary" size="sm" onClick={() => void setOperator(op.user_id, 'active')}>
                    {t('pilot.approve')}
                  </Button>
                )}
                {op.status === 'active' && (
                  <Button variant="danger" size="sm" onClick={() => void setOperator(op.user_id, 'suspended')}>
                    {t('pilot.suspend')}
                  </Button>
                )}
              </Flex>
            </div>
          ))
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.couriersManagementTitle')}</span>
        <span style={mutedStyle}>{t('pilot.couriersManagementHint')}</span>
        {couriers.length === 0 ? (
          <span style={mutedStyle}>{t('pilot.noCouriers')}</span>
        ) : (
          couriers.map((c) => (
            <div key={c.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}>
              <Flex justify="space-between" align="center">
                <span style={{ color: colors.text, fontWeight: 700 }}>{c.user_name ?? c.user_email ?? c.user_id}</span>
                <span style={mutedStyle}>{c.status}</span>
              </Flex>
              <Flex justify="flex-start" align="center" gap="sm">
                {c.status !== 'active' && (
                  <Button variant="primary" size="sm" onClick={() => void setCourier(c.user_id, 'active')}>
                    {t('pilot.approve')}
                  </Button>
                )}
                {c.status === 'active' && (
                  <Button variant="danger" size="sm" onClick={() => void setCourier(c.user_id, 'suspended')}>
                    {t('pilot.suspend')}
                  </Button>
                )}
              </Flex>
            </div>
          ))
        )}

        <Divider />

        <span style={labelStyle}>{t('pilot.storeOrders')}</span>
        {stores.length > 0 ? (
          <>
            <Select
              options={stores.map((s) => ({ value: s.id, label: name(s.name, s.name_ar) }))}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label={t('pilot.store')}
            />
            {orders.length === 0 ? (
              <span style={mutedStyle}>{t('pilot.noStoreOrders')}</span>
            ) : (
              orders.map((o) => (
                <div
                  key={o.id}
                  style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, background: colors.bgCard }}
                >
                  <Flex justify="space-between" align="center">
                    <span style={{ color: colors.text, fontWeight: 700 }}>{o.order_number}</span>
                    <Select
                      options={PILOT_ORDER_STATUSES.map((s) => ({ value: s, label: s }))}
                      value={o.status}
                      onChange={(e) => void setStatus(o.id, e.target.value)}
                      aria-label="order status"
                    />
                  </Flex>
                  <span style={mutedStyle}>
                    {o.customer_name} · {o.total.toFixed(2)} · {o.created_at}
                  </span>
                </div>
              ))
            )}
          </>
        ) : (
          <span style={mutedStyle}>{t('pilot.noStores')}</span>
        )}

        <Divider />

        <Button variant="danger" onClick={() => void handleReset()} style={{ width: '100%' }}>
          {t('pilot.resetPilot')}
        </Button>
      </Stack>
    </Screen>
  );
});