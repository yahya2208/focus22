/**
 * Delivery order form (00050). Greenfield marketplace checkout surfaced as a
 * modal from a product's detail page. The client NEVER computes delivery fees:
 * the estimate (fee + ETA) always comes from the `delivery_estimate` RPC and
 * order creation from `delivery_create_order` (authenticated-only).
 *
 * Auth: opening the form never creates an account (P3). Placing an order when
 * unauthenticated shows an explicit "Continue as guest or sign in" gate; only
 * an explicit "Continue as guest" triggers `signInAsGuest()` before retrying.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { Modal } from '../../design-system/components/Modal';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Flex } from '../../design-system/components/Flex';
import { Divider } from '../../design-system/layout';
import {
  ensureDeliveryLoaded,
  getDeliveryZones,
  estimateDelivery,
  createDeliveryOrder,
  type DeliveryZone,
  type DeliveryEstimate,
  type DeliveryOrderResult,
} from '../../services/delivery-service';

/**
 * Neutral orderable item contract (B1). OrderForm only needs identity +
 * unit price + stock; phones map their InventoryRecord and cars map their
 * ListingRecord onto this shape, so the SAME checkout (quantity / zone /
 * estimate / guest gate / success) is reused — no duplicated order surface.
 */
export interface OrderableProduct {
  readonly id: string;
  readonly brand: string;
  readonly model: string;
  readonly unitPrice: number | null;
  readonly stock: number;
}

/** Phone InventoryRecord → orderable product (behavior-identical mapping). */
export function toOrderable(device: {
  id: string;
  brand: string;
  model: string;
  sellPrice?: number | null;
  quantity: number;
}): OrderableProduct {
  return {
    id: device.id,
    brand: device.brand,
    model: device.model,
    unitPrice: device.sellPrice != null ? device.sellPrice : null,
    stock: device.quantity,
  };
}

/** Car/property ListingRecord → orderable product (quantity is 1 by contract). */
export function toListingOrderable(listing: {
  id: string;
  brand: string;
  model: string;
  price: { amount: number | null };
}): OrderableProduct {
  return {
    id: listing.id,
    brand: listing.brand,
    model: listing.model,
    unitPrice: listing.price.amount,
    stock: 1,
  };
}

export interface DeliveryCustomerDraft {
  zoneId: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

export interface OrderFormProps {
  open: boolean;
  item: OrderableProduct | null;
  initialQuantity?: number;
  draft?: DeliveryCustomerDraft;
  onClose: () => void;
  onDraftChange?: (draft: DeliveryCustomerDraft) => void;
  onRequestSignIn: () => void;
}

const EMPTY_DRAFT: DeliveryCustomerDraft = {
  zoneId: '',
  name: '',
  phone: '',
  address: '',
  notes: '',
};

type Phase = 'form' | 'guest-gate' | 'submitting' | 'success';

export const OrderForm = memo(function OrderForm({
  open,
  item,
  initialQuantity = 1,
  draft = EMPTY_DRAFT,
  onClose,
  onDraftChange,
  onRequestSignIn,
}: OrderFormProps) {
  const { t, locale, dir } = useTranslation();
  const colors = useThemeColors();
  const { state: authState, service } = useAuth();

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [zoneId, setZoneId] = useState(draft.zoneId);
  const [name, setName] = useState(draft.name);
  const [phone, setPhone] = useState(draft.phone);
  const [address, setAddress] = useState(draft.address);
  const [notes, setNotes] = useState(draft.notes);
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryOrderResult | null>(null);

  const inFlight = phase === 'submitting';

  useEffect(() => {
    if (!open) return;
    ensureDeliveryLoaded().catch(() => {});
    setZones(getDeliveryZones());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setEstimate(null);
    if (!item) return;
    if (!zoneId) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    const subtotal = item.unitPrice != null ? item.unitPrice * quantity : 0;
    estimateDelivery(zoneId, subtotal).then((value) => {
      if (!cancelled) setEstimate(value);
    });
    return () => { cancelled = true; };
  }, [open, item, zoneId, quantity]);

  const options = useMemo<Array<{ value: string; label: string }>>(
    () => zones.map((z) => ({ value: z.id, label: locale === 'ar' && z.name_ar ? z.name_ar : z.name })),
    [zones, locale],
  );

  const stock = item?.stock ?? 0;
  const outOfStock = !item || stock <= 0;
  const unitPrice = item?.unitPrice ?? 0;
  const subtotal = unitPrice * quantity;

  function updateZone(next: string) {
    setZoneId(next);
    setEstimate(null);
  }

  function pushDraft() {
    onDraftChange?.({ zoneId, name, phone, address, notes });
  }

  function handleQty(next: number) {
    if (outOfStock) return;
    setQuantity(Math.min(Math.max(1, Math.floor(next)), stock));
  }

  function handleSubmit() {
    if (outOfStock) return;
    if (phase === 'guest-gate') return;
    if (!validate()) return;
    if (authState.user) {
      void runSubmission();
    } else {
      // Explicit consent gate — no account created by opening/submitting form.
      setPhase('guest-gate');
    }
  }

  function validate(): boolean {
    const orderPhone = phone.trim();
    const orderName = name.trim();
    if (!zoneId) {
      setError(t('delivery.selectZone'));
      return false;
    }
    if (!orderName || !orderPhone) {
      setError(t('delivery.orderError'));
      return false;
    }
    setError(null);
    return true;
  }

  async function runSubmission() {
    if (!item) return;
    setPhase('submitting');
    setError(null);
    pushDraft();
    try {
      const res = await createDeliveryOrder(
        { name: name.trim(), phone: phone.trim(), zoneId, address: address.trim(), notes: notes.trim() },
        [{
          catalogRef: item.id,
          name: `${item.brand} ${item.model}`.trim(),
          nameAr: `${item.brand} ${item.model}`.trim(),
          unitPrice,
          quantity,
        }],
      );
      setResult(res);
      setPhase('success');
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
      setPhase('form');
    }
  }

  function handleContinueAsGuest() {
    if (phase !== 'guest-gate') return;
    setPhase('submitting');
    setError(null);
    service.signInAsGuest()
      .then(() => runSubmission())
      .catch((err) => {
        setPhase('form');
        setError(err instanceof Error ? err.message : t('delivery.authError'));
      });
  }

  function handleClose() {
    if (inFlight) return;
    if (phase === 'form') pushDraft();
    setPhase('form');
    setError(null);
    setResult(null);
    onClose();
  }

  if (!open) return null;

  const labelColor = { color: colors.textMuted, fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.3rem', display: 'block' } as const;
  const productName = item ? `${item.brand} ${item.model}`.trim() : '';
  const dirStyle = { direction: dir } as const;

  return (
    <Modal open={open} onClose={handleClose} title={t('delivery.formTitle')} style={dirStyle}>
      {phase === 'success' && result ? (
        <div>
          <div style={{ textAlign: 'center', padding: '0.5rem 0 0.25rem' }}>
            <span role="img" aria-hidden="true" style={{ fontSize: '2.4rem', display: 'block' }}>✅</span>
            <p style={{ color: colors.successText, fontWeight: 800, margin: '0.5rem 0 0.25rem' }}>{t('delivery.orderPlaced')}</p>
            <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: 0 }}>{t('delivery.success')}</p>
          </div>
          <Divider />
          <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>
            <Flex justify="space-between" style={{ marginBottom: '0.4rem' }}>
              <span>{t('delivery.orderNumber')}</span>
              <span style={{ fontWeight: 800, color: colors.text }}>{result.orderNumber}</span>
            </Flex>
            <Flex justify="space-between" style={{ marginBottom: '0.4rem' }}>
              <span>{t('delivery.subtotal')}</span>
              <span>{result.subtotal.toLocaleString()} د.ج</span>
            </Flex>
            <Flex justify="space-between" style={{ marginBottom: '0.4rem' }}>
              <span>{t('delivery.fee')}</span>
              <span>{result.deliveryFee.toLocaleString()} د.ج</span>
            </Flex>
            <Flex justify="space-between" style={{ marginBottom: '0.4rem' }}>
              <span style={{ fontWeight: 800 }}>{t('delivery.total')}</span>
              <span style={{ fontWeight: 800, color: colors.text }}>{result.total.toLocaleString()} د.ج</span>
            </Flex>
            <Flex justify="space-between">
              <span>{t('delivery.eta')}</span>
              <span>{result.etaMinutesMin}–{result.etaMinutesMax} min</span>
            </Flex>
          </div>
          <Button variant="primary" fullWidth onClick={handleClose} style={{ marginTop: '1rem' }}>
            {t('delivery.cancel')}
          </Button>
        </div>
      ) : phase === 'guest-gate' ? (
        <div>
          <div style={{ textAlign: 'center', padding: '0.5rem 0 0.25rem' }}>
            <span role="img" aria-hidden="true" style={{ fontSize: '2rem', display: 'block' }}>🔐</span>
            <p style={{ color: colors.text, fontWeight: 800, margin: '0.5rem 0 0.25rem' }}>{t('delivery.guestPromptTitle')}</p>
            <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: '0 auto 0.25rem', maxWidth: '320px', lineHeight: 1.5 }}>
              {t('delivery.guestPromptText')}
            </p>
          </div>
          <StackGap />
          <Button
            variant="primary"
            fullWidth
            loading={inFlight}
            onClick={handleContinueAsGuest}
          >
            {t('delivery.continueAsGuest')}
          </Button>
          <Button variant="outline" fullWidth onClick={onRequestSignIn} style={{ marginTop: '0.6rem' }}>
            {t('delivery.signIn')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => { setPhase('form'); setError(null); }} style={{ marginTop: '0.6rem' }}>
            {t('delivery.cancel')}
          </Button>
        </div>
      ) : (
        <div>
          {/* Product summary */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
            background: colors.glass, border: `1px solid ${colors.glassBorder}`, borderRadius: '14px', padding: '0.7rem 0.8rem',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: colors.text, fontWeight: 800, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {productName}
              </div>
              <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginTop: '0.1rem' }}>
                {t('delivery.unitPrice')}: <span style={{ color: colors.accent, fontWeight: 700 }}>{unitPrice.toLocaleString()} د.ج</span>
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <Flex align="center" gap="sm">
                <Button variant="outline" size="sm" disabled={outOfStock || quantity <= 1} onClick={() => handleQty(quantity - 1)}>−</Button>
                <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{quantity}</span>
                <Button variant="outline" size="sm" disabled={outOfStock || quantity >= stock} onClick={() => handleQty(quantity + 1)}>+</Button>
              </Flex>
              <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: '0.62rem', marginTop: '0.2rem' }}>
                {outOfStock ? t('delivery.noStock') : `${t('delivery.quantity')}: ${stock}`}
              </div>
            </div>
          </div>

          <StackGap />

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
                onChange={(e) => updateZone(e.target.value)}
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

          <StackGap />

          <label style={labelColor}>{t('delivery.fullName')}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('delivery.fullName')} />

          <StackGap />

          <label style={labelColor}>{t('delivery.phone')}</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('delivery.phone')} inputMode="tel" />

          <StackGap />

          <label style={labelColor}>{t('delivery.address')}</label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('delivery.address')} />

          <StackGap />

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

          <StackGap />

          <Divider />

          <Flex justify="space-between" style={{ padding: '0.25rem 0' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('delivery.quantity')}</span>
            <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.8rem' }}>× {quantity}</span>
          </Flex>
          <Flex justify="space-between" style={{ padding: '0.25rem 0' }}>
            <span style={{ color: colors.textMuted, fontSize: '0.8rem' }}>{t('delivery.subtotal')}</span>
            <span style={{ color: colors.text, fontWeight: 700, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>{subtotal.toLocaleString()} د.ج</span>
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
            disabled={outOfStock || inFlight}
            onClick={handleSubmit}
            style={{ marginTop: '1rem' }}
          >
            {t('delivery.orderButton')}
          </Button>
        </div>
      )}
    </Modal>
  );
});

function StackGap() {
  return <div style={{ height: '0.7rem' }} />;
}

export default OrderForm;
