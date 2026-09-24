import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuth } from '../../core/auth/AuthProvider';
import { Screen, Stack } from '../../design-system/layout';
import { Button } from '../../design-system/components/Button';
import { Flex } from '../../design-system/components/Flex';
import { Card } from '../../design-system/components/Card';
import {
  fetchMyFamily,
  fetchMyAccount,
  fetchMyFamilyContact,
  saveMyFamilyContact,
  fetchMyFamilyPreferences,
  saveMyFamilyPreferences,
  type PilotAccount,
  type PilotFamily,
  type PilotFamilyContact,
  type PilotFamilyPreferences,
} from '../../services/pilot-account-service';
import { fetchMyOrders, type CustomerOrderSummary } from '../../services/order-tracking-service';
import { FamilyOrderTimeline } from './family/FamilyOrderTimeline';
import { FamilyBalanceCard } from './family/FamilyBalanceCard';
import { useFamilyOrderPolling } from './family/useFamilyOrderPolling';
import { DeliveryProfileCard, type ContactInput } from './family/DeliveryProfileCard';
import { FamilyPreferencesCard, type PreferencesInput } from './family/FamilyPreferencesCard';

// ============================================================================
// PilotFamilyHomeScreen — the family hub. Greeting + hero order CTA +
// current order + quick actions + balance + delivery profile. All data comes
// from existing read RPCs; no money math, no lifecycle writes here.
// ============================================================================

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'out_for_delivery']);

export const PilotFamilyHomeScreen = memo(function PilotFamilyHomeScreen() {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const colors = useThemeColors();
  const { state: authState } = useAuth();

  const [family, setFamily] = useState<PilotFamily | null>(null);
  const [account, setAccount] = useState<PilotAccount | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [contact, setContact] = useState<PilotFamilyContact | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [prefs, setPrefs] = useState<PilotFamilyPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [loading, setLoading] = useState(true);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authState.status !== 'authenticated' && authState.status !== 'anonymous') return;
    let alive = true;
    void (async () => {
      try {
        const [fam, acc, list, cont, pref] = await Promise.all([
          fetchMyFamily().catch(() => null),
          fetchMyAccount().catch(() => null),
          fetchMyOrders().catch(() => [] as CustomerOrderSummary[]),
          fetchMyFamilyContact().catch(() => null),
          fetchMyFamilyPreferences().catch(() => null),
        ]);
        if (!alive) return;
        setFamily(fam);
        setAccount(acc);
        setOrders(list);
        setContact(cont);
        setPrefs(pref);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authState.status]);

  const saveContact = useCallback(async (input: ContactInput) => {
    setSavingContact(true);
    try {
      const updated = await saveMyFamilyContact(input);
      setContact(updated);
    } finally {
      setSavingContact(false);
    }
  }, []);

  const savePrefs = useCallback(async (input: PreferencesInput) => {
    setSavingPrefs(true);
    try {
      const updated = await saveMyFamilyPreferences({
        preferredDeliveryTime: input.preferredDeliveryTime,
        vegNotes: input.vegNotes,
      });
      setPrefs(updated);
    } finally {
      setSavingPrefs(false);
    }
  }, []);

  const familyName = family == null
    ? ''
    : locale === 'ar' && family.family_name_ar
      ? family.family_name_ar
      : family.family_name;

  const activeOrder = orders.find((o) => ACTIVE_STATUSES.has(o.status)) ?? null;
  const recentOrders = orders.slice(0, 2);
  // The just-delivered order stays visible as the final state (timeline all
  // done) even though it is no longer "active" — polling already stopped.
  const displayOrder = activeOrder ?? orders[0] ?? null;

  // Live tracking: re-read orders every 5s while one is active. Stops at
  // delivered/cancelled and on unmount. Read-only; checkout untouched.
  useFamilyOrderPolling(
    activeOrder?.order_id ?? null,
    activeOrder?.status ?? null,
    setOrders,
  );

  if (authState.status !== 'authenticated' && authState.status !== 'anonymous') {
    return (
      <Screen>
        <Flex justify="center" align="center" style={{ minHeight: '60vh' }}>
          <Button variant="primary" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'login' })}>
            {t('pilot.signIn')}
          </Button>
        </Flex>
      </Screen>
    );
  }

  return (
    <Screen maxWidth="560px" bottomPad="6rem">
      <Stack gap="lg">
        {/* Greeting */}
        <div style={{ textAlign: 'center', paddingTop: '0.75rem' }}>
          <p style={{ margin: 0, color: colors.text, fontSize: '1.5rem', fontWeight: 800 }}>
            {t('pilot.familyWelcome')}
          </p>
          {familyName ? (
            <p style={{ margin: '0.3rem 0 0', color: colors.accent, fontSize: '1.05rem', fontWeight: 800 }}>
              {familyName}
            </p>
          ) : null}
          <p style={{ margin: '0.45rem 0 0', color: colors.textSecondary, fontSize: '0.88rem' }}>
            {t('pilot.familyTagline')}
          </p>
        </div>

        {/* Hero order card */}
        <Card
          variant="interactive"
          padding="xl"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-storefront', params: { category: 'produce' } })}
          aria-label={t('pilot.orderYourVeg')}
          style={{
            overflow: 'hidden',
            border: `1px solid ${colors.success}`,
            textAlign: 'center',
            paddingTop: '1.75rem',
            paddingBottom: '1.75rem',
          }}
        >
          <div aria-hidden="true" style={{ fontSize: '3.2rem', lineHeight: 1 }}>🥬</div>
          <p style={{ margin: '0.7rem 0 0', color: colors.text, fontSize: '1.25rem', fontWeight: 800 }}>
            {t('pilot.orderYourVeg')}
          </p>
          <p style={{ margin: '0.4rem 0 1rem', color: colors.textSecondary, fontSize: '0.85rem' }}>
            {t('pilot.orderYourVegSubtitle')}
          </p>
          <Button variant="primary" size="lg" style={{ minWidth: '200px', minHeight: '52px' }}>
            {t('pilot.startOrder')}
          </Button>
        </Card>

        {/* Current order (or just-delivered final state) */}
        {!loading && displayOrder != null && (
          <div
            style={{
              border: `1px solid ${colors.accent}`,
              borderRadius: 22,
              padding: '1.1rem 1.2rem',
              background: colors.bgCard,
            }}
          >
            <Flex justify="space-between" align="center" style={{ marginBottom: '0.85rem' }}>
              <span style={{ color: colors.text, fontWeight: 800 }}>{t('pilot.currentOrder')}</span>
              <span style={{ color: colors.accent, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                #{displayOrder.order_number}
              </span>
            </Flex>
            <FamilyOrderTimeline status={displayOrder.status} />
          </div>
        )}

        {/* Quick actions — only real destinations (repeat-last-order needs a
            family order-items read that does not exist; see report). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <Card
            variant="interactive"
            padding="lg"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-storefront', params: { category: 'produce' } })}
            style={{ textAlign: 'center' }}
          >
            <div aria-hidden="true" style={{ fontSize: '1.6rem' }}>🥬</div>
            <div style={{ color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginTop: '0.35rem' }}>
              {t('pilot.startOrder')}
            </div>
          </Card>
          <Card
            variant="interactive"
            padding="lg"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-family-purchases' })}
            style={{ textAlign: 'center' }}
          >
            <div aria-hidden="true" style={{ fontSize: '1.6rem' }}>💾</div>
            <div style={{ color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginTop: '0.35rem' }}>
              {t('pilot.familyBasketTitle')}
            </div>
          </Card>
          <Card
            variant="interactive"
            padding="lg"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'pilot-my-orders' })}
            style={{ textAlign: 'center' }}
          >
            <div aria-hidden="true" style={{ fontSize: '1.6rem' }}>📦</div>
            <div style={{ color: colors.text, fontSize: '0.78rem', fontWeight: 700, marginTop: '0.35rem' }}>
              {t('pilot.myOrdersTitle')}
            </div>
          </Card>
        </div>

        {/* Balance */}
        {account?.linked === true && (
          <FamilyBalanceCard
            account={account}
            recentOps={recentOrders.map((o) => ({
              id: o.order_id,
              label: `${t('pilot.vegOrder')} #${o.order_number}`,
              total: o.total,
            }))}
          />
        )}

        {/* Delivery profile */}
        <div ref={profileRef}>
          <DeliveryProfileCard contact={contact} saving={savingContact} onSave={saveContact} />
        </div>

        {/* Vegetable preferences (optional; never blocks ordering) */}
        <FamilyPreferencesCard prefs={prefs} saving={savingPrefs} onSave={savePrefs} />
      </Stack>
    </Screen>
  );
});
