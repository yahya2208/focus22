import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T4.2 Phase 2 — Admin Telemetry Analytics API.
 * Verifies the client routes through the secure RPC `get_telemetry_analytics`,
 * maps typed filters to the RPC params, and distinguishes transport failure
 * (null) from a permission denial ({error:'UNAUTHORIZED'}).
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

import { getTelemetryAnalytics, isTelemetryEmpty, isTelemetryUnauthorized } from '../../business-intelligence/telemetry-api';

const AGG = {
  error: null,
  applied: { date_from: null, date_to: null, domain: null, event: null, game: null, entity_id: null },
  totals: { total_events: 3, unique_sessions: 2, unique_visitors: 2, unique_users: 1 },
  events_by_event: [],
  events_by_domain: [],
  daily: [],
  top_entities: [],
  category: null,
  product: null,
  listing: null,
  cart: null,
  request: null,
  game: null,
  ad: null,
  system: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTelemetryAnalytics — routes through the secure RPC', () => {
  it('calls get_telemetry_analytics with mapped typed filters', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: AGG, error: null });
    const filters = {
      dateFrom: '2026-08-01T00:00:00Z',
      dateTo: '2026-08-31T00:00:00Z',
      domain: 'cart',
      event: 'cart_add',
      game: 'ttt',
      entityId: 'phone-42',
    };
    const out = await getTelemetryAnalytics(filters);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('get_telemetry_analytics', {
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
      p_domain: filters.domain,
      p_event: filters.event,
      p_game: filters.game,
      p_entity_id: filters.entityId,
    });
    expect(out).toEqual(AGG);
  });

  it('maps absent filters to null (no filter)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: AGG, error: null });
    await getTelemetryAnalytics();
    expect(mocks.rpc).toHaveBeenCalledWith('get_telemetry_analytics', {
      p_date_from: null,
      p_date_to: null,
      p_domain: null,
      p_event: null,
      p_game: null,
      p_entity_id: null,
    });
  });

  it('surfaces a permission denial as {error:UNAUTHORIZED}, not null', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: 'UNAUTHORIZED' }, error: null });
    const out = await getTelemetryAnalytics();
    expect(out).not.toBeNull();
    expect(out?.error).toBe('UNAUTHORIZED');
    expect(isTelemetryUnauthorized(out)).toBe(true);
  });

  it('returns null on a transport/RPC failure (distinct from permission denial)', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const out = await getTelemetryAnalytics();
    expect(out).toBeNull();
    expect(isTelemetryUnauthorized(out)).toBe(false);
  });
});

describe('telemetry helpers', () => {
  it('isTelemetryEmpty is true only when authorized and zero events', () => {
    expect(isTelemetryEmpty(AGG)).toBe(false);
    expect(isTelemetryEmpty({ ...AGG, totals: { total_events: 0, unique_sessions: 0, unique_visitors: 0, unique_users: 0 } })).toBe(true);
  });

  it('isTelemetryUnauthorized is true only on an explicit UNAUTHORIZED error', () => {
    expect(isTelemetryUnauthorized({ error: 'UNAUTHORIZED', } as never)).toBe(true);
    expect(isTelemetryUnauthorized({ error: null } as never)).toBe(false);
    expect(isTelemetryUnauthorized(null)).toBe(false);
  });
});
