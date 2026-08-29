import { memo, useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../../store/navigation';
import type { ScreenName } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Screen, Stack, Divider } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { useCart } from '../../core/cart/CartContext';
import { takePendingOrder } from '../../core/order/confirmation-state';
import type { DeliveryOrderResult } from '../../services/delivery-service';

/** Confirmation — a distinct screen after the order is placed. */
export const OrderConfirmationScreen = memo(function OrderConfirmationScreen() {
  const dispatch = useAppDispatch();
  const { routeParams } = useAppState();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { clear } = useCart();

  const [result, setResult] = useState<DeliveryOrderResult | null>(() => takePendingOrder());

  useEffect(() => {
    clear();
    if (!result) setResult(takePendingOrder());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returnTo = (routeParams.returnTo as string | undefined) ?? 'home';

  const titleColor = colors.successText;

  return (
    <Screen ariaLabel={t('orderConfirmation.title')} maxWidth="640px">
      <Stack gap="lg">
        <div style={{ textAlign: 'center', padding: '1rem 0 0.25rem' }}>
          <span role="img" aria-hidden="true" style={{ fontSize: '2.6rem', display: 'block' }}>✅</span>
          <p style={{ color: titleColor, fontWeight: 800, fontSize: '1.1rem', margin: '0.6rem 0 0.25rem' }}>
            {t('delivery.orderPlaced')}
          </p>
          <p style={{ color: colors.textMuted, fontSize: '0.84rem', margin: 0, lineHeight: 1.5 }}>
            {t('delivery.success')}
          </p>
        </div>

        {result ? (
          <>
            <Divider />
            <div style={{ fontSize: '0.84rem', color: colors.textSecondary }}>
              <Flex justify="space-between" style={{ marginBottom: '0.5rem' }}>
                <span>{t('delivery.orderNumber')}</span>
                <span style={{ fontWeight: 800, color: colors.text }}>{result.orderNumber}</span>
              </Flex>
              <Flex justify="space-between" style={{ marginBottom: '0.5rem' }}>
                <span>{t('delivery.subtotal')}</span>
                <span style={{ fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{result.subtotal.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'en-US')} د.ج</span>
              </Flex>
              <Flex justify="space-between" style={{ marginBottom: '0.5rem' }}>
                <span>{t('delivery.fee')}</span>
                <span style={{ fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{result.deliveryFee.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'en-US')} د.ج</span>
              </Flex>
              <Flex justify="space-between" style={{ marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 800 }}>{t('delivery.total')}</span>
                <span style={{ fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums' }}>{result.total.toLocaleString(locale === 'ar' ? 'ar-DZ' : 'en-US')} د.ج</span>
              </Flex>
              <Flex justify="space-between">
                <span>{t('delivery.eta')}</span>
                <span style={{ fontWeight: 700, color: colors.text }}>{result.etaMinutesMin}–{result.etaMinutesMax} min</span>
              </Flex>
            </div>
          </>
        ) : (
          <div role="status" style={{ textAlign: 'center', color: colors.textSecondary, fontSize: '0.84rem', padding: '1.5rem 0' }}>
            {t('orderConfirmation.pending')}
          </div>
        )}

        <Button variant="primary" fullWidth onClick={() => dispatch({ type: 'REPLACE', screen: returnTo as ScreenName })}>
          {t('orderConfirmation.continue')}
        </Button>
        <Button variant="ghost" fullWidth onClick={() => dispatch({ type: 'REPLACE', screen: 'home' })}>
          {t('category.backToHome')}
        </Button>
      </Stack>
    </Screen>
  );
});

export default OrderConfirmationScreen;
