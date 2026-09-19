import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Flex } from '../../design-system/components/Flex';
import { useCart } from '../../core/cart/CartContext';
import { useAuth } from '../../core/auth/AuthProvider';
import { produceUnitLabel } from '../../domains/listings';
import { allowsDecimalQuantity, formatQuantity, minQuantity, quantityStep } from '../../core/cart/quantity';
import { track } from '../../core/telemetry';
import {
  ensureDeliveryLoaded,
  getDeliveryZones,
  type DeliveryZone,
  type DeliveryEstimate,
} from '../../services/delivery-service';
import { submitPilotOrder, fetchEstimate, classifySubmissionError, fetchTrackedOrderStatus } from '../../services/order-service';
import { fetchMyAccount, type PilotAccount } from '../../services/pilot-account-service';
import type { TranslationKey } from '../../i18n';

/**
 * Editable quantity for decimal (kg) lines — mirrors the cart-provided
 * QuantityField so a produce shopper can choose a weight (e.g. 0.5 kg) in the
 * pilot flow, which goes storefront → checkout directly. Whole-unit lines keep
 * the static integer display.
 */
function QuantityField({
  value,
  unit,
  max,
  onCommit,
}: {
  value: number;
  unit: string | null | undefined;
  max: number;
  onCommit: (next: number) => void;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState(() => formatQuantity(value, unit));
  useEffect(() => {
    setDraft(formatQuantity(value, unit));
  }, [value, unit]);
  const commit = () => {
    const parsed = Number(draft);
    onCommit(Number.isFinite(parsed) ? parsed : value);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      step={quantityStep(unit)}
      min={minQuantity(unit)}
      max={max}
      value={draft}
      aria-label="quantity"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      style={{ width: '3.4rem', textAlign: 'center', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums', background: colors.bgInput, border: `1px solid ${colors.border}`, borderRadius: '9px', padding: '0.25rem', fontFamily: 'inherit' }}
    />
  );
}

/**
 * PilotCheckoutScreen — Phase 6 (Gate D) real checkout.
 * Legacy Request Screen (WhatsApp) is untouched; this is the new in-app order
 * path that creates a REAL DB order through the server-authoritative
 * `delivery_create_order`. Guests are created ONLY here, at submission (P3).
 */
export const PilotCheckoutScreen = memo(function PilotCheckoutScreen() {
  const dispatch = useAppDispatch();
  const routeParams = useAppState().routeParams;
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { lines, isEmpty, subtotal, clear, setQuantity } = useCart();
  const {
    state: authState,
    service: { signInAsGuest },
  } = useAuth();

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    orderId: string;
    orderNumber: string;
    total: number;
    etaMin: number;
    etaMax: number;
  } | null>(null);
  const [trackedStatus, setTrackedStatus] = useState<{ status: string; updated_at: string } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [gateVisible, setGateVisible] = useState(false);
  const [duplicateVisible, setDuplicateVisible] = useState(false);
  const [account, setAccount] = useState<PilotAccount | null>(null);
  const startTracked = useRef(false);

  const storeId = routeParams.storeId ?? undefined;

  useEffect(() => {
    if (startTracked.current) return;
    startTracked.current = true;
    void track({
      event: 'checkout_start',
      entityType: 'order',
      properties: { items_count: lines.length, with_delivery: true },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    void ensureDeliveryLoaded()
      .then(() => {
        if (!alive) return;
        const zs = getDeliveryZones();
        setZones(zs);
        if (zs.length === 1) setZoneId(zs[0]!.id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!zoneId || subtotal <= 0) {
      setEstimate(null);
      return;
    }
    let alive = true;
    void fetchEstimate(zoneId, subtotal)
      .then((e) => alive && setEstimate(e))
      .catch(() => alive && setEstimate(null));
    return () => {
      alive = false;
    };
  }, [zoneId, subtotal]);

  // Family account (Gate A): display-only balance/outstanding-debt card.
  // The balance is server-computed (SUM(ledger.amount)); never recomputed here.
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let alive = true;
    void fetchMyAccount()
      .then((a) => alive && setAccount(a))
      .catch(() => alive && setAccount(null));
    return () => {
      alive = false;
    };
  }, [authState.status]);

  const openDebtTotal = useMemo(
    () => account?.debts.filter((d) => d.status === 'open').reduce((sum, d) => sum + d.remaining, 0) ?? 0,
    [account],
  );

  const zoneOptions = useMemo(
    () => zones.map((z) => ({ value: z.id, label: locale === 'ar' && z.name_ar ? z.name_ar : z.name })),
    [zones, locale],
  );

  const items = useMemo(
    () =>
      lines.map((l) => ({
        catalogRef: l.catalogRef,
        quantity: l.quantity,
        name: [l.brand, l.model].filter(Boolean).join(' '),
        unitPrice: l.displayUnitPrice ?? 0,
      })),
    [lines],
  );

  const submit = useCallback(
    async (intentional = false) => {
      setError(null);
      if (isEmpty || items.length === 0) {
        setError('ITEMS_REQUIRED');
        return;
      }
      if (!name.trim() || !phone.trim() || !zoneId) {
        setError('INVALID_ARGUMENTS');
        return;
      }
      setSubmitting(true);
      try {
        const result = await submitPilotOrder({
          name,
          phone,
          zoneId,
          address,
          notes,
          items,
          storeId,
          intentional,
        });
        clear();
        setSuccess({
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          total: result.total,
          etaMin: result.etaMinutesMin,
          etaMax: result.etaMinutesMax,
        });
      } catch (err) {
        const code = classifySubmissionError(err);
        setError(code);
        if (code === 'NEEDS_AUTHENTICATION') {
          setGateVisible(true);
          void track({ event: 'auth_guest_gate_seen', entityType: 'user', entityId: undefined, properties: {} });
        } else if (code === 'DUPLICATE_ORDER') {
          // OQ4=B: the server refused an unintended retry. Ask the customer
          // explicitly before resubmitting with the intent marker.
          setDuplicateVisible(true);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [isEmpty, items, name, phone, zoneId, address, notes, storeId, clear],
  );

  const refreshStatus = useCallback(async () => {
    if (!success) return;
    setTracking(true);
    try {
      const s = await fetchTrackedOrderStatus(success.orderId);
      setTrackedStatus({ status: s.status, updated_at: s.updated_at });
    } catch {
      setTrackedStatus({ status: 'unknown', updated_at: '' });
    } finally {
      setTracking(false);
    }
  }, [success]);

  const handleSubmitClick = useCallback(() => {
    if (authState.status === 'authenticated' || authState.status === 'anonymous') {
      void submit(false);
    } else {
      setGateVisible(true);
      void track({ event: 'auth_guest_gate_seen', entityType: 'user', entityId: undefined, properties: {} });
    }
  }, [authState.status, submit]);

  const handleContinueAsGuest = useCallback(async () => {
    try {
      await signInAsGuest();
      setGateVisible(false);
      void track({ event: 'auth_guest_upgrade_cta', entityType: 'user', entityId: undefined, properties: {} });
      await submit();
    } catch {
      setError('NEEDS_AUTHENTICATION');
    }
  }, [signInAsGuest, submit]);

  const labelStyle = { color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const tError = (code: string) => t(`pilot.error.${code}` as TranslationKey);
  const money = (v: number) => v.toFixed(2);

  if (success) {
    return (
      <Screen>
        <Stack gap="lg">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.orderSuccess')}</h1>
          <div style={{ color: colors.text, fontSize: '0.9rem' }}>
            <div>
              {t('pilot.orderNumber')}: <strong>{success.orderNumber}</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              {t('pilot.orderTotal')}: <strong>{money(success.total)}</strong>
            </div>
            <div style={{ marginTop: 4 }}>
              {t('pilot.eta')}: {String(success.etaMin)}–{String(success.etaMax)} {t('pilot.minutes')}
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => void refreshStatus()} disabled={tracking}>
                {tracking ? t('pilot.tracking') : t('pilot.trackOrder')}
              </Button>
              {trackedStatus && (
                <span style={labelStyle}>
                  {t('pilot.status')}: {trackedStatus.status}
                </span>
              )}
            </div>
          </div>
          <Divider />
          <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} style={{ width: '100%' }}>
            {t('pilot.backHome')}
          </Button>
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <h1 style={{ margin: 0, color: colors.text, fontSize: '1.15rem' }}>{t('pilot.checkoutTitle')}</h1>
          <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-storefront' })}>
            {t('pilot.backToStore')}
          </Button>
        </Flex>
        <Divider />

        {gateVisible && (
          <div style={{ border: `1px solid ${colors.accent}`, borderRadius: 12, padding: 12, background: colors.bgCard }}>
            <div style={{ color: colors.text, fontWeight: 700, marginBottom: 8 }}>{t('pilot.signInRequired')}</div>
            <span style={labelStyle}>{t('pilot.gateHint')}</span>
            <Flex gap="sm" style={{ marginTop: 8 }}>
              <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}>
                {t('pilot.signIn')}
              </Button>
              <Button variant="secondary" onClick={() => void handleContinueAsGuest()} disabled={submitting}>
                {t('pilot.continueAsGuest')}
              </Button>
            </Flex>
          </div>
        )}

        {duplicateVisible && (
          <div style={{ border: `1px solid ${colors.warning}`, borderRadius: 12, padding: 12, background: colors.bgCard }}>
            <div style={{ color: colors.text, fontWeight: 700, marginBottom: 8 }}>{t('pilot.duplicateOrderTitle')}</div>
            <span style={labelStyle}>{t('pilot.duplicateOrderNote')}</span>
            <Flex gap="sm" style={{ marginTop: 8 }}>
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => {
                  setDuplicateVisible(false);
                  void submit(true);
                }}
              >
                {t('pilot.createNewOrder')}
              </Button>
              <Button variant="secondary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-my-orders' })}>
                {t('pilot.reviewMyOrders')}
              </Button>
            </Flex>
          </div>
        )}

        {error && <span style={{ color: colors.danger, fontSize: '0.85rem' }}>{tError(error)}</span>}

        {isEmpty ? (
          <span style={labelStyle}>{t('pilot.emptyCart')}</span>
        ) : (
          <>
            <span style={labelStyle}>
              {t('pilot.yourItems')} ({String(lines.length)})
            </span>
            <Stack gap="sm">
              {lines.map((l) => (
                <Flex key={l.key} justify="space-between" align="center">
                  <span style={{ color: colors.text, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    {[l.brand, l.model].filter(Boolean).join(' ')}
                    {allowsDecimalQuantity(l.unit) ? (
                      <>
                        <QuantityField
                          value={l.quantity}
                          unit={l.unit}
                          max={l.stock}
                          onCommit={(next) => setQuantity(l.catalogRef, next)}
                        />
                        {l.unit ? produceUnitLabel(l.unit) : ''}
                      </>
                    ) : (
                      <> × {String(l.quantity)}</>
                    )}
                  </span>
                  <span style={{ color: colors.text, fontSize: '0.85rem' }}>
                    {l.displayUnitPrice != null ? money(l.displayUnitPrice * l.quantity) : '—'}
                  </span>
                </Flex>
              ))}
              <Divider />
              <Flex justify="space-between">
                <span style={{ color: colors.text, fontWeight: 700 }}>{t('pilot.subtotal')}</span>
                <span style={{ color: colors.text, fontWeight: 700 }}>{money(subtotal)}</span>
              </Flex>
              {estimate?.available ? (
                <Flex justify="space-between">
                  <span style={labelStyle}>{t('pilot.deliveryFee')}</span>
                  <span style={labelStyle}>{money(estimate.fee)}</span>
                </Flex>
              ) : null}
            </Stack>
          </>
        )}

        {account?.linked ? (
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 12, background: colors.bgCard }}>
              <div style={{ color: colors.text, fontSize: '0.9rem' }}>
                {t('pilot.balanceLabel')}: <strong>{money(account.balance)}</strong> {t('pilot.currency')}
              </div>
              {openDebtTotal > 0 && (
                <span style={{ color: colors.warning, fontSize: '0.8rem' }}>
                  {t('pilot.outstandingDebts')}: <strong>{money(openDebtTotal)}</strong> {t('pilot.currency')}
                </span>
              )}
            </div>
          ) : account && authState.status === 'authenticated' ? (
            <span style={labelStyle}>{t('pilot.notLinkedToFamily')}</span>
          ) : null}

        <label style={labelStyle}>{t('pilot.zone')}</label>
        {zoneOptions.length === 0 ? (
          <span style={labelStyle}>{t('pilot.noZones')}</span>
        ) : (
          <Select options={zoneOptions} value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-label={t('pilot.zone')} />
        )}

        <label style={labelStyle}>{t('pilot.name')}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pilot.name')} />

        <label style={labelStyle}>{t('pilot.phone')}</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('pilot.phone')} inputMode="tel" />

        <label style={labelStyle}>{t('pilot.address')}</label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('pilot.address')} />

        <label style={labelStyle}>{t('pilot.notes')}</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('pilot.notes')} />

        <Button variant="primary" disabled={isEmpty || submitting} onClick={() => void handleSubmitClick()} style={{ width: '100%' }}>
          {submitting ? t('pilot.submitting') : t('pilot.placeOrder')}
        </Button>
      </Stack>
    </Screen>
  );
});