import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/use-theme';

/**
 * T4.2 Phase 3-5 — Telemetry Analytics dashboard UI.
 * Renders from the mocked secure RPC output and asserts:
 *  - overview totals render (counts only, no raw ids)
 *  - funnel sections render, including a Not-wired indicator for unwired events
 *  - unauthorized -> access denied; transport failure -> RPC failure; empty state
 */

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    rpc,
    getSupabaseClient: vi.fn(() => ({ rpc })),
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

import { TelemetryAnalyticsBI } from '../../business-intelligence/pages/TelemetryAnalyticsBI';

const FIXTURE = {
  error: null,
  applied: { date_from: null, date_to: null, domain: null, event: null, game: null, entity_id: null },
  totals: { total_events: 100, unique_sessions: 50, unique_visitors: 40, unique_users: 10 },
  events_by_event: [
    { event: 'app_open', count: 30 },
    { event: 'cart_add', count: 10 },
  ],
  events_by_domain: [
    { domain: 'cart', count: 10 },
  ],
  daily: [
    { date: '2026-08-01', count: 40 },
    { date: '2026-08-02', count: 60 },
  ],
  top_entities: [{ entity_type: 'phone', entity_id: 'phone-42', count: 5 }],
  category: { category_view: 5 },
  product: { product_impression: 7, product_view: 3 },
  listing: { listing_view_detail: 4 },
  cart: { cart_add: 10 },
  request: { request_submit: 2 },
  game: { game_complete: 8, game_pause: 0 },
  ad: { ad_impression: 0, ad_click: 0 },
  system: { rpc_error: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TelemetryAnalyticsBI', () => {
  it('renders overview totals and funnel sections from the RPC output', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: FIXTURE, error: null });
    render(<ThemeProvider><TelemetryAnalyticsBI /></ThemeProvider>);

    expect(await screen.findByText('Total events')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('100')).toBeTruthy());
    expect(screen.getByText('Product detail')).toBeTruthy();
    expect(screen.getByText('Ads')).toBeTruthy();
    expect(screen.getByText('Games')).toBeTruthy();
    // business entity id allowed in output (raw user/session ids are not)
    expect(screen.getByText(/phone-42/)).toBeTruthy();
  });

  it('marks unwired events with a Not wired indicator instead of a plain zero', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: FIXTURE, error: null });
    render(<ThemeProvider><TelemetryAnalyticsBI /></ThemeProvider>);
    await screen.findByText('Ads');
    // ad_impression & ad_click are unwired -> Not wired badges
    await waitFor(() => expect(screen.getAllByText('Not wired').length).toBeGreaterThan(0));
  });

  it('shows access denied on an unauthorized RPC response', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'UNAUTHORIZED' }, error: null });
    render(<ThemeProvider><TelemetryAnalyticsBI /></ThemeProvider>);
    expect(await screen.findByText('Access denied')).toBeTruthy();
  });

  it('shows an RPC failure state on transport error', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    render(<ThemeProvider><TelemetryAnalyticsBI /></ThemeProvider>);
    expect(await screen.findByText(/RPC failure/)).toBeTruthy();
  });

  it('shows an empty state when authorized with zero events', async () => {
    const empty = {
      ...FIXTURE,
      totals: { total_events: 0, unique_sessions: 0, unique_visitors: 0, unique_users: 0 },
      events_by_event: [],
      events_by_domain: [],
      daily: [],
      top_entities: [],
      category: null, product: null, listing: null, cart: null,
      request: null, game: null, ad: null, system: null,
    };
    mocks.rpc.mockResolvedValueOnce({ data: empty, error: null });
    render(<ThemeProvider><TelemetryAnalyticsBI /></ThemeProvider>);
    expect(await screen.findByText('No telemetry data')).toBeTruthy();
  });
});
