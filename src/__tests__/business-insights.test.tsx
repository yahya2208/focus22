import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../core/supabase/data-service', () => ({
  getDataService: () => ({
    getFunnelEvents: () => Promise.resolve([]),
    getCalibrationEvents: () => Promise.resolve([]),
    getGameEvents: () => Promise.resolve([]),
    getCampaigns: () => Promise.resolve({ data: [], count: 0 }),
  }),
}));

import { BusinessInsights } from '../research-console/pages/insights/BusinessInsights';

describe('BusinessInsights — Empty Dataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially then shows empty state', async () => {
    render(<BusinessInsights />);
    expect(screen.getByText(/generating business insights/i)).toBeDefined();
    await vi.waitFor(() => {
      expect(screen.getByText(/Not enough data to generate insights/i)).toBeDefined();
    }, { timeout: 10000 });
  });
});
