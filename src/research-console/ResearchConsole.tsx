import { useState, useMemo } from 'react';
import { useAppDispatch } from '../store/navigation';
import { useAuth } from '../core/auth/AuthProvider';
import { permissionGuard } from '../core/research/permissions';
import { useTranslation } from '../hooks/useTranslation';
import { ResearchLayout } from './layout/ResearchLayout';
import type { DashboardId } from './layout/ResearchLayout';
import { OverviewDashboard } from './pages/overview/OverviewDashboard';
import { ScientificDashboard } from './pages/scientific/ScientificDashboard';
import { UsersDashboard } from './pages/users/UsersDashboard';
import { SessionsDashboard } from './pages/sessions/SessionsDashboard';
import { DevicesDashboard } from './pages/devices/DevicesDashboard';
import { SystemDashboard } from './pages/system/SystemDashboard';
import { CatalogInventoryScreen } from '../screens/inventory/CatalogInventoryScreen';
import { CatalogHealth } from './pages/catalog/CatalogHealth';
import { VariantCoverageScreen } from '../screens/research/VariantCoverageScreen';
import { InventoryHealthScreen } from '../screens/research/InventoryHealthScreen';
import { PriceMemoryCard } from '../components/research/PriceMemoryCard';
import { AdsManager } from './pages/ads/AdsManager';

const DASHBOARD_RESOURCE_MAP: Record<DashboardId, string> = {
  overview: 'overview',
  scientific: 'scientific',
  users: 'users',
  sessions: 'sessions',
  devices: 'devices',
  system: 'overview',
  inventory: 'overview',
  'catalog-health': 'overview',
  'variant-coverage': 'overview',
  'inventory-health': 'overview',
  'price-memory': 'overview',
  'ads': 'overview',
};

const DASHBOARD_IDS: readonly DashboardId[] = [
  'overview',
  'scientific',
  'users',
  'sessions',
  'devices',
  'inventory',
  'catalog-health',
  'variant-coverage',
  'inventory-health',
  'price-memory',
  'system',
  'ads',
];

const dashboardComponents: Record<DashboardId, React.FC> = {
  overview: OverviewDashboard,
  scientific: ScientificDashboard,
  users: UsersDashboard,
  sessions: SessionsDashboard,
  devices: DevicesDashboard,
  inventory: CatalogInventoryScreen,
  'catalog-health': CatalogHealth,
  'variant-coverage': VariantCoverageScreen,
  'inventory-health': InventoryHealthScreen,
  'price-memory': PriceMemoryCard,
  system: SystemDashboard,
  ads: AdsManager,
};

export function ResearchConsole() {
  const dispatch = useAppDispatch();
  const { researchRole } = useAuth();
  const { t } = useTranslation();
  const [active, setActive] = useState<DashboardId>('overview');

  const accessibleDashboards = useMemo(() => {
    if (researchRole === 'none') return [];
    return DASHBOARD_IDS.filter((id) => {
      const resource = DASHBOARD_RESOURCE_MAP[id];
      return permissionGuard.can(researchRole, resource, 'read');
    });
  }, [researchRole]);

  const effectiveActive = useMemo(() => {
    if (accessibleDashboards.includes(active)) return active;
    return accessibleDashboards[0] ?? 'overview';
  }, [active, accessibleDashboards]);

  const Component = dashboardComponents[effectiveActive];

  return (
    <ResearchLayout
      activeDashboard={effectiveActive}
      onNavigate={setActive}
      availableDashboards={accessibleDashboards}
      onBack={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
    >
      {Component ? (
        <Component />
      ) : (
        <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>
          {t('research.noAccess')}
        </p>
      )}
    </ResearchLayout>
  );
}
