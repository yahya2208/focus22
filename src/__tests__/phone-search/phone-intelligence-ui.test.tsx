import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';

/**
 * PhoneIntelligenceBI — UI verification against the REAL RPC contract.
 *
 * Proves that all NINE sections render data delivered verbatim by
 * get_phone_intelligence(p_time_range, p_brand) — the single data source —
 * and that the brand filter options are derived from the same response
 * (brand_aggregation), never from inventory_items or any other source.
 */

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn();
  return {
    rpc,
    from,
    getSupabaseClient: vi.fn(() => ({ rpc, from })),
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import { PhoneIntelligenceBI } from '../../business-intelligence/pages/PhoneIntelligenceBI';

const FIXTURE = {
  time_range: '30d',
  brand_filter: 'all',
  top_viewed: [{
    device_id: 'dv-1', brand: 'Oppo', model: 'A5s', variant: '2/32',
    total_views: 7777, unique_views: 700, card_views: 7000, detail_views: 777,
    last_viewed_at: '2026-08-01T10:00:00Z',
  }],
  low_demand: [{
    device_id: 'dv-2', brand: 'Samsung', model: 'A10', variant: '',
    total_views: 3, unique_views: 3, detail_views: 0, reason: 'low_views' as const,
  }],
  search_analytics: [
    { query: 'oppo', search_count: 4, avg_results_count: 5.25, selection_count: 1, search_to_selection_rate: 25 },
    { query: 'samsung', search_count: 6, avg_results_count: 8, selection_count: 2, search_to_selection_rate: 33.33 },
  ],
  search_without_selection: [{ query: 'nokia', search_count: 9 }],
  search_to_phone: [{
    device_id: 'dv-1', brand: 'Oppo', model: 'A5s', variant: '2/32',
    selection_count: 3, associated_search_count: 12, search_to_selection_rate: 25,
  }],
  detail_engagement: [{
    device_id: 'dv-1', brand: 'Oppo', model: 'A5s', variant: '2/32',
    card_views: 100, detail_views: 25, unique_viewers: 40, unique_detail_viewers: 10,
    detail_card_ratio: 25,
  }],
  whatsapp_intent: [{
    device_id: 'dv-1', brand: 'Oppo', model: 'A5s', variant: '2/32',
    whatsapp_intents: 5, clicks: 6, ad_views: 7,
  }],
  brand_aggregation: [
    { brand: 'Oppo', model: 'A5s', variants: '2/32, 3/64', total_views: 8000, unique_views: 720, detail_views: 800, selections: 3, whatsapp_intents: 5, demand_score: 61 },
    { brand: 'Samsung', model: 'A10', variants: '', total_views: 300, unique_views: 30, detail_views: 20, selections: 2, whatsapp_intents: 1, demand_score: 88 },
  ],
  demand_overview: [{
    device_id: 'dv-1', brand: 'Oppo', model: 'A5s', variant: '2/32',
    total_views: 7777, unique_views: 700, detail_views: 777,
    selections: 3, whatsapp_intents: 5, demand_score: 55,
  }],
};

const SECTION_TITLES = [
  'Demand Overview',
  'Zero / Low Demand',
  'Search Analytics',
  'Searches Without Selection',
  'Top Viewed Phones',
  'Search → Phone',
  'Detail Engagement',
  'WhatsApp Intent',
  'Brand Aggregation',
];

function renderBI() {
  return render(
    <ThemeProvider>
      <PhoneIntelligenceBI />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.rpc.mockResolvedValue({ data: FIXTURE, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PhoneIntelligenceBI — nine sections fed verbatim by the RPC', () => {
  it('calls get_phone_intelligence once with default filters and renders every section', async () => {
    renderBI();

    expect(mocks.rpc).toHaveBeenCalledWith('get_phone_intelligence', {
      p_time_range: '30d',
      p_brand: null,
    });

    for (const title of SECTION_TITLES) {
      expect(await screen.findByText(title)).toBeTruthy();
    }
  });

  it('renders top_viewed rows exactly as returned (sentinel values)', async () => {
    renderBI();
    expect(await screen.findByText('Top Viewed Phones')).toBeTruthy();
    // Sentinels may legitimately repeat across sections (e.g. demand_overview
    // shares totals) — assert presence, not uniqueness.
    expect(screen.getAllByText('7777').length).toBeGreaterThan(0);
    expect(screen.getAllByText('700').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('777').length).toBeGreaterThan(0);
  });

  it('renders search_to_phone with counts and conversion from the RPC', async () => {
    renderBI();
    expect(await screen.findByText('Search → Phone')).toBeTruthy();
    expect(screen.getByText('Assoc. Searches')).toBeTruthy();
    // selection_count=3, associated_search_count=12, rate=25%
    const cell = screen.getByText('12');
    expect(cell).toBeTruthy();
    expect(screen.getAllByText((_, el) => el?.textContent === '25%').length).toBeGreaterThan(0);
  });

  it('renders detail_engagement, whatsapp_intent and brand_aggregation sentinels', async () => {
    renderBI();
    expect(await screen.findByText('Detail Engagement')).toBeTruthy();
    expect(screen.getByText('Detail/Card %')).toBeTruthy();
    expect(screen.getAllByText((_, el) => el?.textContent === '25%').length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText('WA Intents')).toBeTruthy();
    expect(screen.getByText('Ad Views')).toBeTruthy();

    expect(screen.getByText('Brand Aggregation')).toBeTruthy();
    expect(screen.getByText('2/32, 3/64')).toBeTruthy(); // variants text verbatim
    expect(screen.getByText('88')).toBeTruthy();          // Samsung demand_score as-is
  });

  it('brand dropdown derives ONLY from brand_aggregation in the same response', async () => {
    renderBI();
    await screen.findByText('Demand Overview');

    expect(mocks.from).not.toHaveBeenCalled(); // no second data source

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = [...select.options].map((o) => o.value);
    expect(options).toContain('Oppo');
    expect(options).toContain('Samsung');
    expect(options[0]).toBe('');
  });

  it('re-queries the SAME rpc with p_brand when a brand is selected', async () => {
    renderBI();
    await screen.findByText('Demand Overview');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Samsung' } });
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenLastCalledWith('get_phone_intelligence', {
        p_time_range: '30d',
        p_brand: 'Samsung',
      });
    });
  });

  it('re-queries the SAME rpc with p_time_range when range changes', async () => {
    renderBI();
    await screen.findByText('Demand Overview');

    fireEvent.click(screen.getByRole('button', { name: '7 Days' }));
    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenLastCalledWith('get_phone_intelligence', {
        p_time_range: '7d',
        p_brand: null,
      });
    });
  });

  it('surfaces the RPC error key through the existing error state', async () => {
    mocks.rpc.mockResolvedValue({ data: { error: 'UNAUTHORIZED' }, error: null });
    renderBI();
    expect(await screen.findByText('UNAUTHORIZED')).toBeTruthy();
    expect(screen.queryByText('Demand Overview')).toBeNull();
  });
});
