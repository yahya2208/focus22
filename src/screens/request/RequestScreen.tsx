import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Input } from '../../design-system/components/Input';
import { Select } from '../../design-system/components/Select';
import { Flex } from '../../design-system/components/Flex';
import { useCart } from '../../core/cart/CartContext';
import { track } from '../../core/telemetry';
import { useWhatsApp } from '../../providers/WhatsAppProvider';
import { buildCartRequestMessage } from '../../services/whatsapp-service';
import { produceUnitLabel } from '../../domains/listings';
import {
  ensureDeliveryLoaded,
  getDeliveryZones,
  type DeliveryZone,
} from '../../services/delivery-service';

/**
 * Request Cart terminal — collects the customer's contact + delivery area.
 * FOCUS never sells/pays in-app: submitting builds ONE organized WhatsApp
 * request card (Request Cart model) and hands off to the business number.
 * No sign-in, no DB order, no checkout/payment language.
 */
export const RequestScreen = memo(function RequestScreen() {
  const dispatch = useAppDispatch();
  const { t, locale, dir } = useTranslation();
  const colors = useThemeColors();
  const { lines, isEmpty, clear } = useCart();
  const whatsapp = useWhatsApp();

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [zoneFree, setZoneFree] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureDeliveryLoaded().catch(() => {});
    setZones(getDeliveryZones());
  }, []);

  const options = useMemo<Array<{ value: string; label: string }>>(
    () => zones.map((z) => ({ value: z.id, label: locale === 'ar' && z.name_ar ? z.name_ar : z.name })),
    [zones, locale],
  );

  // T3.2 telemetry — `request_start` fires once per entry to the request
  // terminal with a non-empty cart (the user actively began a request by
  // tapping "send request"). Deduped so rerenders never re-fire.
  const requestStartedRef = useRef(false);
  useEffect(() => {
    if (isEmpty) {
      requestStartedRef.current = false;
      return;
    }
    if (requestStartedRef.current) return;
    requestStartedRef.current = true;
    void track({ event: 'request_start' });
  }, [isEmpty]);

  if (isEmpty) {
    return (
      <Screen ariaLabel={t('request.title')} maxWidth="700px">
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

  const zoneName = zones.find((z) => z.id === zoneId);
  const zoneLabel = zones.length > 0
    ? (zoneName ? (locale === 'ar' && zoneName.name_ar ? zoneName.name_ar : zoneName.name) : '')
    : zoneFree.trim();

  function validate(): boolean {
    if (!phone.trim()) {
      setError(t('request.phoneRequired'));
      return false;
    }
    setError(null);
    return true;
  }

  function handleSubmit() {
    if (!validate()) {
      // T3.2 telemetry — validation failure: request never left the terminal.
      // `error_code` is the only allowed field; no phone/message/content is sent.
      void track({ event: 'request_failed', properties: { error_code: 'validation' } });
      return;
    }
    // Local validation passed — the submit was initiated by the user.
    void track({ event: 'request_submit' });
    const requestLines = lines.map((line) => ({
      name: `${line.brand} ${line.model}`.trim() || line.model,
      quantity: line.quantity,
      unit: line.unit !== undefined ? produceUnitLabel(line.unit) : undefined,
      priceText: line.displayUnitPrice != null ? `${line.displayUnitPrice.toLocaleString('en-US')} د.ج` : undefined,
    }));
    const message = buildCartRequestMessage(requestLines, {
      phone: phone.trim(),
      zone: zoneLabel,
      address: address.trim(),
      notes: notes.trim(),
    });
    clear();
    // Fire-and-forget WhatsApp handoff. `send` synchronously initiates the
    // same-tab wa.me navigation (returns void, never throws by contract). The
    // handoff is actually initiated here — that is the success point for this
    // design, not merely passing local validation.
    whatsapp.send(message, { action: 'inquiry' });
    void track({ event: 'request_success' });
    void track({ event: 'whatsapp_open', properties: { method: 'wa.me' } });
  }

  return (
    <Screen ariaLabel={t('request.title')} maxWidth="720px" bottomPad="7rem">
      <Stack gap="lg">
        <button
          type="button"
          onClick={() => dispatch({ type: 'BACK' })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', color: colors.textSecondary, fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 700 }}
        >
          {backArrow} {t('request.backToCart')}
        </button>

        <div style={{ color: colors.text, fontSize: '1.05rem', fontWeight: 800 }}>{t('request.title')}</div>

        <Stack gap="md">
          {lines.map((line) => (
            <Flex key={line.key} justify="space-between" align="center">
              <span style={{ color: colors.text, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {`${line.brand} ${line.model}`.trim()}
              </span>
              <span style={{ color: colors.textSecondary, fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
                × {line.quantity}{line.unit !== undefined ? ` ${produceUnitLabel(line.unit)}` : ''}
              </span>
            </Flex>
          ))}
        </Stack>

        <Divider />

        <label style={labelColor}>{t('request.phone')}</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('request.phone')} inputMode="tel" />

        <label style={labelColor}>{t('request.zone')}</label>
        {zones.length === 0 ? (
          <Input value={zoneFree} onChange={(e) => setZoneFree(e.target.value)} placeholder={t('request.zoneFreeText')} />
        ) : (
          <Select
            options={options}
            placeholder={t('request.selectZone')}
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
          />
        )}

        <label style={labelColor}>{t('request.address')}</label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('request.address')} />

        <label style={labelColor}>{t('request.notes')}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('request.notes')}
          rows={2}
          style={{
            width: '100%', padding: '0.65rem 0.75rem', fontSize: '0.86rem', fontFamily: 'inherit',
            color: colors.text, background: colors.glass, border: `1px solid ${colors.glassBorder}`,
            borderRadius: '12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical',
          }}
        />

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
          onClick={handleSubmit}
          style={{ marginTop: '1rem' }}
        >
          {t('request.submitWhatsApp')}
        </Button>
      </Stack>
    </Screen>
  );
});

export default RequestScreen;
