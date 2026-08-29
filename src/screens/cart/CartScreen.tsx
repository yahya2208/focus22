import { memo, useMemo } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useCart } from '../../core/cart/CartContext';
import { produceUnitLabel } from '../../domains/listings';

/** Marketplace cart — multi-item. Display values are UX-only; the server is authoritative. */
export const CartScreen = memo(function CartScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, dir, locale } = useTranslation();
  const colors = useThemeColors();
  const { lines, itemCount, subtotal, isEmpty, setQuantity, removeLine, clear } = useCart();

  const backArrow = dir === 'rtl' ? '→' : '←';
  // Optional deep link: return to a given screen/params after checkout.
  const returnScreen = (routeParams.returnTo as 'showroom' | 'category' | 'home') ?? 'home';

  const domainLabel = useMemo(() => {
    const fn = (d: string) => {
      if (d === 'property') return t('categoryProducts.domain.property');
      if (d === 'car') return t('categoryProducts.domain.car');
      if (d === 'produce') return t('categoryProducts.domain.produce');
      return t('categoryProducts.domain.phone');
    };
    return fn;
  }, [t]);

  if (isEmpty) {
    return (
      <Screen ariaLabel={t('cart.title')} maxWidth="700px">
        <Stack gap="lg" align="center" style={{ paddingTop: '3rem' }}>
          <button
            type="button"
            onClick={() => dispatch({ type: 'BACK' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', color: colors.textSecondary, fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 700 }}
          >
            {backArrow} {t('showroom.back')}
          </button>
          <span role="img" aria-hidden="true" style={{ fontSize: '3rem' }}>🛒</span>
          <p style={{ color: colors.text, fontSize: '1rem', fontWeight: 700, margin: 0 }}>{t('cart.title')}</p>
          <p style={{ color: colors.textMuted, fontSize: '0.84rem', margin: 0, textAlign: 'center' }}>
            {t('cart.empty')}
          </p>
          <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}>
            {t('cart.continueShopping')}
          </Button>
        </Stack>
      </Screen>
    );
  }

  const dirStyle = { direction: dir } as const;

  return (
    <Screen ariaLabel={t('cart.title')} maxWidth="760px" bottomPad="7rem">
      <Stack gap="lg">
        <Flex justify="space-between" align="center">
          <button
            type="button"
            onClick={() => dispatch({ type: 'BACK' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 700 }}
          >
            {backArrow} {t('showroom.back')}
          </button>
          <span style={{ color: colors.text, fontSize: '1.05rem', fontWeight: 800 }}>{t('cart.title')}</span>
          <button
            type="button"
            onClick={clear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, fontSize: '0.72rem', fontFamily: 'inherit', fontWeight: 700 }}
          >
            {t('cart.clear')}
          </button>
        </Flex>

        <Stack gap="md">
          {lines.map((line) => {
            const name = `${line.brand} ${line.model}`.trim() || line.model;
            return (
              <Card key={line.key} variant="glass" padding="md" style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                {line.image ? (
                  <img
                    src={line.image}
                    alt={name}
                    loading="lazy"
                    decoding="async"
                    width={72}
                    height={72}
                    style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '12px', flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ fontSize: '1.6rem', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {line.category === 'car' ? '🚗' : line.category === 'property' ? '🏠' : line.category === 'produce' ? '🥦' : '📱'}
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }} dir={dirStyle.direction}>
                  <div style={{ color: colors.text, fontWeight: 700, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ color: colors.textMuted, fontSize: '0.68rem', marginTop: '0.1rem' }}>{domainLabel(line.domain)}</div>
                  {line.displayUnitPrice != null && (
                    <div style={{ color: colors.accent, fontWeight: 700, fontSize: '0.82rem', marginTop: '0.2rem', fontVariantNumeric: 'tabular-nums' }}>
                      {line.displayUnitPrice.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'en-US')} د.ج
                      {line.unit != null
                        ? ` / ${produceUnitLabel(line.unit)}`
                        : line.pricePeriod === 'monthly'
                          ? ' / شهر'
                          : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="decrease"
                    disabled={line.quantity <= 1}
                    onClick={() => setQuantity(line.catalogRef, line.quantity - 1)}
                    style={{ width: '30px', height: '30px', borderRadius: '9px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, cursor: 'pointer', fontWeight: 800, fontFamily: 'inherit' }}
                  >−</button>
                  <span style={{ minWidth: '1.4rem', textAlign: 'center', fontWeight: 800, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{line.quantity}</span>
                  <button
                    type="button"
                    aria-label="increase"
                    disabled={line.quantity >= line.stock}
                    onClick={() => setQuantity(line.catalogRef, line.quantity + 1)}
                    style={{ width: '30px', height: '30px', borderRadius: '9px', border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.text, cursor: 'pointer', fontWeight: 800, fontFamily: 'inherit' }}
                  >+</button>
                </div>
                <button
                  type="button"
                  aria-label={t('cart.remove')}
                  onClick={() => removeLine(line.catalogRef)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, fontSize: '0.9rem', flexShrink: 0, fontFamily: 'inherit' }}
                >✕</button>
              </Card>
            );
          })}
        </Stack>

        <Divider />

        <Flex justify="space-between">
          <span style={{ color: colors.textMuted, fontSize: '0.82rem', fontWeight: 700 }}>
            {t('cart.items')}: {itemCount}
          </span>
          <span style={{ color: colors.text, fontSize: '0.82rem', fontWeight: 700 }}>{t('delivery.subtotal')}</span>
          <span style={{ color: colors.accent, fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>
            {subtotal.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'en-US')} د.ج
          </span>
        </Flex>

        <Button
          variant="success"
          size="lg"
          fullWidth
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'checkout', params: routeParams.returnTo ? { returnTo: routeParams.returnTo } : undefined })}
        >
          🛵 {t('cart.checkout')}
        </Button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: returnScreen })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 700 }}
        >
          {t('cart.continueShopping')}
        </button>
      </Stack>
    </Screen>
  );
});

export default CartScreen;
