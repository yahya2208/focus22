import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { resetDataService } from '../../core/supabase/data-service';
import { resetSupabaseClient } from '../../core/supabase/client';
import { resetRepairDataService } from '../../core/supabase/repair-data-service';

import { OverviewDashboard } from '../../research-console/pages/overview/OverviewDashboard';
import { AcquisitionDashboard } from '../../research-console/pages/acquisition/AcquisitionDashboard';
import { ScientificDashboard } from '../../research-console/pages/scientific/ScientificDashboard';
import { UsersDashboard } from '../../research-console/pages/users/UsersDashboard';
import { SessionsDashboard } from '../../research-console/pages/sessions/SessionsDashboard';
import { DevicesDashboard } from '../../research-console/pages/devices/DevicesDashboard';
import { SurveysDashboard } from '../../research-console/pages/surveys/SurveysDashboard';
import { CampaignsDashboard } from '../../research-console/pages/campaigns/CampaignsDashboard';
import { JourneyExplorer } from '../../research-console/pages/journey/JourneyExplorer';
import { AnalyticsHealth } from '../../research-console/pages/health/AnalyticsHealth';
import { ConversionIntelligence } from '../../research-console/pages/conversion/ConversionIntelligence';
import { FunnelComparator } from '../../research-console/pages/comparator/FunnelComparator';
import { JourneyIntelligence } from '../../research-console/pages/intelligence/JourneyIntelligence';
import { BusinessInsights } from '../../research-console/pages/insights/BusinessInsights';
import { PhoneExchangeEngine } from '../../research-console/pages/exchange/PhoneExchangeEngine';
import { CatalogInventoryScreen } from '../../screens/inventory/CatalogInventoryScreen';
import { CatalogHealth } from '../../research-console/pages/catalog/CatalogHealth';
import { VariantCoverageScreen } from '../../screens/research/VariantCoverageScreen';
import { InventoryHealthScreen } from '../../screens/research/InventoryHealthScreen';
import { PriceMemoryCard } from '../../components/research/PriceMemoryCard';
import { LiveDashboard } from '../../research-console/pages/live/LiveDashboard';
import { LiveDiagnosticsDashboard } from '../../research-console/pages/live/LiveDiagnosticsDashboard';
import { SystemDashboard } from '../../research-console/pages/system/SystemDashboard';

const dashboards = [
  ['overview', OverviewDashboard],
  ['acquisition', AcquisitionDashboard],
  ['scientific', ScientificDashboard],
  ['users', UsersDashboard],
  ['sessions', SessionsDashboard],
  ['devices', DevicesDashboard],
  ['surveys', SurveysDashboard],
  ['campaigns', CampaignsDashboard],
  ['journey', JourneyExplorer],
  ['health', AnalyticsHealth],
  ['conversion', ConversionIntelligence],
  ['comparator', FunnelComparator],
  ['intelligence', JourneyIntelligence],
  ['insights', BusinessInsights],
  ['exchange', PhoneExchangeEngine],
  ['inventory', CatalogInventoryScreen],
  ['catalog-health', CatalogHealth],
  ['variant-coverage', VariantCoverageScreen],
  ['inventory-health', InventoryHealthScreen],
  ['price-memory', PriceMemoryCard],
  ['live', LiveDashboard],
  ['live-diagnostics', LiveDiagnosticsDashboard],
  ['system', SystemDashboard],
] as const;

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  resetDataService();
  resetSupabaseClient();
  resetRepairDataService();
  vi.restoreAllMocks();
});

describe('research console dashboards render without React key warnings', () => {
  it.each(dashboards)('%s renders with no "Each child in a list" key warning', (_id, Component) => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    render(<Component />);

    spy.mockRestore();

    const keyWarnings = errors.filter((e) => /each child in a list|unique "key"/i.test(e));
    expect(keyWarnings).toEqual([]);
  });
});
