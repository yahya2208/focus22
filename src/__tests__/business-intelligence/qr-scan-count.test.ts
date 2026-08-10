import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    rpc,
    getSupabaseClient: vi.fn(() => ({ rpc })),
    createResearchAPI: vi.fn(() => ({ getDeviceIntelligence: vi.fn().mockResolvedValue([]) })),
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

vi.mock('../../core/research/api-supabase', () => ({
  createResearchAPI: mocks.createResearchAPI,
}));

import { createBusinessAPI } from '../../business-intelligence/api';

/**
 * FIX-03 — Commerce Intelligence QR scan count MUST come from the campaign QR
 * funnel (get_campaign_qr_metrics), never from a guessed/fake counter.
 * Error ≠ Zero: an RPC failure yields { available:false } (rendered as "—"),
 * while a real absence of scans yields { available:true, scans:0 }.
 */
describe('BusinessAPI.getQrScanCount — QR scans from the campaign QR funnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sums ONLY scan events across all campaigns on success', async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: [
        { campaign_id: 'c1', event_type: 'scan', total: 5 },
        { campaign_id: 'c2', event_type: 'scan', total: 3 },
        { campaign_id: 'c1', event_type: 'game_start', total: 4 },
        { campaign_id: 'c1', event_type: 'registration', total: 1 },
      ],
    });
    const result = await createBusinessAPI().getQrScanCount();
    expect(result).toEqual({ available: true, scans: 8 });
    expect(mocks.rpc).toHaveBeenCalledWith('get_campaign_qr_metrics', {});
  });

  it('treats missing totals as 0 and ignores null totals', async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: [
        { campaign_id: 'c1', event_type: 'scan' },
        { campaign_id: 'c2', event_type: 'scan', total: null },
      ],
    });
    const result = await createBusinessAPI().getQrScanCount();
    expect(result).toEqual({ available: true, scans: 0 });
  });

  it('returns available:true scans:0 for a genuine zero read', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: [] });
    const result = await createBusinessAPI().getQrScanCount();
    expect(result).toEqual({ available: true, scans: 0 });
  });

  it('returns available:false on RPC error — never rendered as a zero', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '42501' }, data: null });
    const result = await createBusinessAPI().getQrScanCount();
    expect(result).toEqual({ available: false, scans: 0 });
  });
});
