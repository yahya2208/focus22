import { memo } from 'react';
import { useAppDispatch } from '../../store/navigation';
import { useAuth } from '../../core/auth/AuthProvider';
import { permissionGuard } from '../../core/research/permissions';
import { Screen, Stack, Grid } from '../../design-system/layout';
import { Card } from '../../design-system/components/Card';
import { Button } from '../../design-system/components/Button';
import { AdContactBanner } from '../../components/ad-contact/AdContactBanner';

const REPAIR_MENU_ITEMS = [
  { key: 'request', emoji: '🔧', screen: 'repair-request' as const, requiresAuth: false },
  { key: 'track', emoji: '📍', screen: 'repair-tracking' as const, requiresAuth: false },
  { key: 'admin', emoji: '📊', screen: 'repair-admin' as const, requiresAuth: true },
  { key: 'courier', emoji: '🚚', screen: 'repair-courier' as const, requiresAuth: true },
  { key: 'history', emoji: '📋', screen: 'repair-customer-history' as const, requiresAuth: true },
  { key: 'diagnostics', emoji: '🩺', screen: 'repair-diagnostics' as const, requiresAuth: true },
] as const;

const MENU_LABELS: Record<string, string> = {
  request: 'طلب تصليح',
  track: 'تتبع طلب',
  admin: 'لوحة الإدارة',
  courier: 'مهام المندوب',
  history: 'سجل العملاء',
  diagnostics: 'تشخيص النظام',
};

export const RepairHomeScreen = memo(function RepairHomeScreen() {
  const dispatch = useAppDispatch();
  const { researchRole } = useAuth();

  const canManage = permissionGuard.can(researchRole, 'campaigns', 'read');

  return (
    <Screen ariaLabel="Repair services" bottomPad="6rem">
      <Stack gap="lg">
        <Card variant="glass" padding="lg" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔧</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            Repair OS
          </h1>
          <p style={{ fontSize: '0.85rem', margin: '0.35rem 0 0', opacity: 0.7 }}>
            نظام إدارة الصيانة والتوصيل
          </p>
        </Card>

        <AdContactBanner placement="repair" />

        <Grid columns={2} gap="md">
          {REPAIR_MENU_ITEMS.filter(item => !item.requiresAuth || canManage).map((item) => (
            <Card
              key={item.key}
              variant="glass"
              padding="lg"
              hoverable
              onClick={() => dispatch({ type: 'NAVIGATE', screen: item.screen })}
              style={{ textAlign: 'center', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{item.emoji}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{MENU_LABELS[item.key]}</div>
            </Card>
          ))}
        </Grid>

        <Button variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })} fullWidth>
          ← العودة للرئيسية
        </Button>
      </Stack>
    </Screen>
  );
});
