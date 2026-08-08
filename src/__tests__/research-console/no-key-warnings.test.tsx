import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { resetDataService } from '../../core/supabase/data-service';
import { resetSupabaseClient } from '../../core/supabase/client';
import { resetRepairDataService } from '../../core/supabase/repair-data-service';

import { OverviewDashboard } from '../../research-console/pages/overview/OverviewDashboard';
import { ScientificDashboard } from '../../research-console/pages/scientific/ScientificDashboard';
import { UsersDashboard } from '../../research-console/pages/users/UsersDashboard';
import { SessionsDashboard } from '../../research-console/pages/sessions/SessionsDashboard';
import { DevicesDashboard } from '../../research-console/pages/devices/DevicesDashboard';
import { SurveysDashboard } from '../../research-console/pages/surveys/SurveysDashboard';
import { SystemDashboard } from '../../research-console/pages/system/SystemDashboard';
import { CatalogInventoryScreen } from '../../screens/inventory/CatalogInventoryScreen';
import { CatalogHealth } from '../../research-console/pages/catalog/CatalogHealth';
import { VariantCoverageScreen } from '../../screens/research/VariantCoverageScreen';
import { InventoryHealthScreen } from '../../screens/research/InventoryHealthScreen';
import { PriceMemoryCard } from '../../components/research/PriceMemoryCard';
import { AdsManager } from '../../research-console/pages/ads/AdsManager';

const dashboards = [
  ['overview', OverviewDashboard],
  ['scientific', ScientificDashboard],
  ['users', UsersDashboard],
  ['sessions', SessionsDashboard],
  ['devices', DevicesDashboard],
  ['surveys', SurveysDashboard],
  ['system', SystemDashboard],
  ['inventory', CatalogInventoryScreen],
  ['catalog-health', CatalogHealth],
  ['variant-coverage', VariantCoverageScreen],
  ['inventory-health', InventoryHealthScreen],
  ['price-memory', PriceMemoryCard],
  ['ads', AdsManager],
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
