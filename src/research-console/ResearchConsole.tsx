import { useState, useMemo } from 'react';
import { useAppDispatch } from '../store/navigation';
import { useAuth } from '../core/auth/AuthProvider';
import { permissionGuard } from '../core/research/permissions';
import { useTranslation } from '../hooks/useTranslation';
import { ResearchLayout } from './layout/ResearchLayout';
import type { DashboardId } from './layout/ResearchLayout';
import { OverviewDashboard } from './pages/overview/OverviewDashboard';
import { AcquisitionDashboard } from './pages/acquisition/AcquisitionDashboard';
import { ScientificDashboard } from './pages/scientific/ScientificDashboard';
import { UsersDashboard } from './pages/users/UsersDashboard';
import { SessionsDashboard } from './pages/sessions/SessionsDashboard';
import { DevicesDashboard } from './pages/devices/DevicesDashboard';
import { SurveysDashboard } from './pages/surveys/SurveysDashboard';
import { CampaignsDashboard } from './pages/campaigns/CampaignsDashboard';
import { LiveDashboard } from './pages/live/LiveDashboard';
import { SystemDashboard } from './pages/system/SystemDashboard';
import { JourneyExplorer } from './pages/journey/JourneyExplorer';
import { AnalyticsHealth } from './pages/health/AnalyticsHealth';
import { ConversionIntelligence } from './pages/conversion/ConversionIntelligence';
import { FunnelComparator } from './pages/comparator/FunnelComparator';
import { JourneyIntelligence } from './pages/intelligence/JourneyIntelligence';
import { BusinessInsights } from './pages/insights/BusinessInsights';
import { PhoneExchangeEngine } from './pages/exchange/PhoneExchangeEngine';
import { CatalogInventoryScreen } from '../screens/inventory/CatalogInventoryScreen';
import { CatalogHealth } from './pages/catalog/CatalogHealth';
import { VariantCoverageScreen } from '../screens/research/VariantCoverageScreen';
import { InventoryHealthScreen } from '../screens/research/InventoryHealthScreen';
import { PriceMemoryCard } from '../components/research/PriceMemoryCard';
import { LiveDiagnosticsDashboard } from './pages/live/LiveDiagnosticsDashboard';

const DASHBOARD_RESOURCE_MAP: Record<DashboardId, string> = {
  overview: 'overview',
  acquisition: 'overview',
  scientific: 'scientific',
  users: 'users',
  sessions: 'sessions',
  devices: 'devices',
  surveys: 'surveys',
  campaigns: 'campaigns',
  live: 'overview',
  system: 'overview',
  journey: 'overview',
  health: 'overview',
  conversion: 'overview',
  comparator: 'overview',
  intelligence: 'overview',
  insights: 'overview',
  exchange: 'overview',
  inventory: 'overview',
  'catalog-health': 'overview',
  'variant-coverage': 'overview',
  'inventory-health': 'overview',
  'price-memory': 'overview',
  'diagnostics': 'overview',
};

const DASHBOARD_IDS: readonly DashboardId[] = [
  'overview',
  'acquisition',
  'scientific',
  'users',
  'sessions',
  'devices',
  'surveys',
  'campaigns',
  'journey',
  'health',
  'conversion',
  'comparator',
  'intelligence',
  'insights',
  'exchange',
  'inventory',
  'catalog-health',
  'variant-coverage',
  'inventory-health',
  'price-memory',
  'live',
  'system',
  'diagnostics',
];

const dashboardComponents: Record<DashboardId, React.FC> = {
  overview: OverviewDashboard,
  acquisition: AcquisitionDashboard,
  scientific: ScientificDashboard,
  users: UsersDashboard,
  sessions: SessionsDashboard,
  devices: DevicesDashboard,
  surveys: SurveysDashboard,
  campaigns: CampaignsDashboard,
  journey: JourneyExplorer,
  health: AnalyticsHealth,
  conversion: ConversionIntelligence,
  comparator: FunnelComparator,
  intelligence: JourneyIntelligence,
  insights: BusinessInsights,
  exchange: PhoneExchangeEngine,
  inventory: CatalogInventoryScreen,
  'catalog-health': CatalogHealth,
  'variant-coverage': VariantCoverageScreen,
  'inventory-health': InventoryHealthScreen,
  'price-memory': PriceMemoryCard,
  live: LiveDashboard,
  system: SystemDashboard,
  diagnostics: LiveDiagnosticsDashboard,
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
