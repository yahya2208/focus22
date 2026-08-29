import { memo, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Flex } from '../../design-system/components/Flex';
import { useCart } from '../../core/cart/CartContext';
import { setPendingOrder } from '../../core/order/confirmation-state';
import {
  ensureDeliveryLoaded,
  getDeliveryZones,
  estimateDelivery,
  createDeliveryOrder,
  type DeliveryEstimate,
  type DeliveryOrderItem,
  type DeliveryZone,
} from '../../services/delivery-service';

type Phase = 'guest-gate' | 'submitting';

/**
 * Checkout — collects delivery customer data, gets the estimate from
 * `delivery_estimate`, and creates ONE order from ALL cart lines via
 * `delivery_create_order`. Every line carries `catalog_ref = inventory_items.id`;
 * the server (00052) is authoritative over price / identity / quantity.
 */
export const CheckoutScreen = memo(function CheckoutScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale, dir } = useTranslation();
  const colors = useThemeColors();
  const { state: authState, service } = useAuth();
  const { lines, subtotal, isEmpty } = useCart();

  const returnTo = (routeParams.returnTo as string | undefined) ?? 'home';

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlight = phase === 'submitting';

  useEffect(() => {
    ensureDeliveryLoaded().catch(() => {});
    setZones(getDeliveryZones());
  }, []);

  // Estimate is ALWAYS the RPC result for the cart subtotal — never client math.
  useEffect(() => {
    let cancelled = false;
    setEstimate(null);
    if (!zoneId) return;
    estimateDelivery(zoneId, subtotal).then((value) => {
      if (!cancelled) setEstimate(value);
    });
    return () => { cancelled = true; };
  }, [zoneId, subtotal]);

  const options = useMemo<Array<{ value: string; label: string }>>(
    () => zones.map((z) => ({ value: z.id, label: locale === 'ar' && z.name_ar ? z.name_ar : z.name })),
    [zones, locale],
  );

  if (isEmpty) {
    return (
      <Screen ariaLabel={t('checkout.title')} maxWidth="700px">
        <Stack gap="lg" align="center" style={{ paddingTop: '3rem' }}>
          <span role="img" aria-hidden="true" style={{ fontSize: '3rem' }}>🛒</span>
          <p style={{ color: colors.text, fontSize: '1rem', fontWeight: 700, margin: 0 }}>{t('cart.empty')}</p>
          <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'cart' })}>
            {t('showroom.back')}
          </Button>
        </Stack>
      </Screen>
    );
  }

  const labelColor = { color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const backArrow = dir === 'rtl' ? '→' : '←';

  function validate(): boolean {
    const orderPhone = phone.trim();
    const orderName = name.trim();
    if (!zoneId) { setError(t('delivery.selectZone')); return false; }
    if (!orderName || !orderPhone) { setError(t('delivery.orderError')); return false; }
    setError(null);
    return true;
  }

  function buildItems(): DeliveryOrderItem[] {
    return lines.map((line) => ({
      categoryId: line.categoryId ?? null,
      catalogRef: line.catalogRef,
      name: `${line.brand} ${line.model}`.trim(),
      nameAr: `${line.brand} ${line.model}`.trim(),
      unitPrice: line.displayUnitPrice ?? 0,
      quantity: line.quantity,
    }));
  }

  async function runSubmission() {
    setPhase('submitting');
    setError(null);
    try {
      const res = await createDeliveryOrder(
        { name: name.trim(), phone: phone.trim(), zoneId, address: address.trim(), notes: notes.trim() },
        buildItems(),
      );
      setPendingOrder(res);
      dispatch({ type: 'REPLACE', screen: 'order-confirmation', params: returnTo ? { returnTo } : undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/zone|ZONE|not active|P0002/i.test(message)) {
        setError(t('delivery.zoneError'));
      } else if (/UNAUTHENTICATED/i.test(message)) {
        setError(t('delivery.authError'));
      } else if (/ITEM_NOT_ORDERABLE|ITEM_NOT_FOUND/i.test(message)) {
        setError(t('delivery.listingUnavailable'));
      } else if (/ITEMS|ITEMS_REQUIRED/i.test(message)) {
        setError(t('delivery.itemsError'));
      } else if (/CUSTOMER/i.test(message)) {
        setError(t('delivery.orderError'));
      } else {
        setError(t('delivery.orderError'));
      }
      setPhase(null);
    }
  }

  function handleSubmit() {
    if (!validate()) return;
    if (phase === 'guest-gate') return;
    if (authState.user) {
      void runSubmission();
    } else {
      setPhase('guest-gate');
    }
  }

  function handleContinueAsGuest() {
    if (phase !== 'guest-gate') return;
    setPhase('submitting');
    setError(null);
    service
      .signInAsGuest()
      .then(() => runSubmission())
      .catch((err) => {
        setPhase(null);
        setError(err instanceof Error ? err.message : t('delivery.authError'));
      });
  }

  return (
    <Screen ariaLabel={t('checkout.title')} maxWidth="720px" bottomPad="7rem">
      <Stack gap="lg">
        <button
          type="button"
          onClick={() => dispatch({ type: 'BACK' })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', color: colors.textSecondary, fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 700 }}
        >
          {backArrow} {t('checkout.backToCart')}
        </button>

        <div style={{ color: colors.text, fontSize: '1.05rem', fontWeight: 800 }}>{t('checkout.title')}</div>

        <Stack gap="md">
          {lines.map((line) => (
            <Flex key={line.key} justify="space-between" align="center">
              <span style={{ color: colors.text, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {`${line.brand} ${line.model}`.trim()}
              </span>
              <span style={{ color: colors.textSecondary, fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
                × {line.quantity}
              </span>
            </Flex>
          ))}
        </Stack>

        <Divider />

        {phase === 'guest-gate' ? (
          <div>
            <div style={{ textAlign: 'center', padding: '0.5rem 0 0.25rem' }}>
              <span role="img" aria-hidden="true" style={{ fontSize: '2rem', display: 'block' }}>🔐</span>
              <p style={{ color: colors.text, fontWeight: 800, margin: '0.5rem 0 0.25rem' }}>{t('delivery.guestPromptTitle')}</p>
              <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: '0 auto 0.25rem', maxWidth: '320px', lineHeight: 1.5 }}>
                {t('delivery.guestPromptText')}
              </p>
            </div>
            <Button variant="primary" fullWidth loading={inFlight} onClick={handleContinueAsGuest} style={{ marginTop: '0.75rem' }}>
              {t('delivery.continueAsGuest')}
            </Button>
            <Button variant="outline" fullWidth onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })} style={{ marginTop: '0.6rem' }}>
              {t('delivery.signIn')}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => { setPhase(null); setError(null); }} style={{ marginTop: '0.6rem' }}>
              {t('delivery.cancel')}
            </Button>
          </div>
        ) : (
          <>
            <label style={labelColor}>{t('delivery.zone')}</label>
            {zones.length === 0 ? (
              <div style={{ color: colors.textMuted, fontSize: '0.78rem', background: colors.glass, padding: '0.7rem 0.8rem', borderRadius: '12px' }}>
                {t('delivery.noZones')}
              </div>
            ) : (
              <>
                <Select
                  options={options}
                  placeholder={t('delivery.selectZone')}
                  value={zoneId}
                  error={error === t('delivery.selectZone')}
                  onChange={(e) => { setZoneId(e.target.value); setEstimate(null); }}
                />
                <div style={{ minHeight: '1.2rem' }}>
                  {zoneId && estimate?.available && (
                    <span style={{ color: colors.successText, fontSize: '0.7rem', fontWeight: 700 }}>
                      🛵 {t('delivery.estimate').replace('{min}', String(estimate.minutesMin)).replace('{max}', String(estimate.minutesMax))} · {t('delivery.fee')}: {estimate.fee.toLocaleString()} د.ج
                    </span>
                  )}
                </div>
              </>
            )}

            <label style={labelColor}>{t('delivery.fullName')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('delivery.fullName')} />

            <label style={labelColor}>{t('delivery.phone')}</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('delivery.phone')} inputMode="tel" />

            <label style={labelColor}>{t('delivery.address')}</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('delivery.address')} />

            <label style={labelColor}>{t('delivery.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('delivery.notes')}
              rows={2}
              style={{
                width: '100%', padding: '0.65rem 0.75rem', fontSize: '0.86rem', fontFamily: 'inherit',
                color: colors.text, background: colors.glass, border: `1px solid ${colors.glassBorder}`,
                borderRadius: '12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical',
              }}
            />

            <Divider />

            <Flex justify="space-between" style={{ padding: '0.25rem 0' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('delivery.subtotal')}</span>
              <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                {subtotal.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'en-US')} د.ج
              </span>
            </Flex>
            <Flex justify="space-between" style={{ padding: '0.25rem 0' }}>
              <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('delivery.fee')}</span>
              <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                {estimate?.available ? `${estimate.fee.toLocaleString()} د.ج` : '—'}
              </span>
            </Flex>
            <Flex justify="space-between" style={{ padding: '0.35rem 0 0' }}>
              <span style={{ color: colors.text, fontWeight: 800, fontSize: '0.88rem' }}>{t('delivery.total')}</span>
              <span style={{ color: colors.accent, fontWeight: 800, fontSize: '0.98rem', fontVariantNumeric: 'tabular-nums' }}>
                {estimate?.available ? `${(subtotal + estimate.fee).toLocaleString()} د.ج` : `${subtotal.toLocaleString()} د.ج`}
              </span>
            </Flex>

            {error && (
              <div style={{
                marginTop: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: colors.danger,
                background: colors.dangerBg, padding: '0.6rem 0.75rem', borderRadius: '12px',
              }}>
                {error}
              </div>
            )}

            <Button
              variant="success"
              size="lg"
              fullWidth
              loading={inFlight}
              disabled={inFlight}
              onClick={handleSubmit}
              style={{ marginTop: '1rem' }}
            >
              {t('checkout.placeOrder')}
            </Button>
          </>
        )}
      </Stack>
    </Screen>
  );
});

export default CheckoutScreen;
