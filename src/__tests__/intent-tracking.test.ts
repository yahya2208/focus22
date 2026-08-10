import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordIntent, setIntentSenderEnabled, getVisitorHash } from '../services/intent-tracking';

const mocks = vi.hoisted(() => {
  const mockRpc = vi.fn();
  const getSupabaseClient = vi.fn(() => ({ rpc: mockRpc }));
  return { mockRpc, getSupabaseClient };
});

vi.mock('../core/supabase/client', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

/**
 * M2 contract (§11, §17–§20): recordIntent is fire-and-forget — it never
 * throws, is never awaited, always returns void, and dispatches to the guarded
 * counter RPC `record_campaign_intent` with the exact six-parameter contract.
 * visitor_hash is non-PII, in-memory, 32-hex, stable per page load.
 */

describe('M2 — recordIntent fire-and-forget contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setIntentSenderEnabled(true);
    mocks.getSupabaseClient.mockImplementation(() => ({ rpc: mocks.mockRpc }));
    mocks.mockRpc.mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => {
    setIntentSenderEnabled(true);
  });

  it('returns void synchronously and dispatches the RPC with the full payload', () => {
    const result = recordIntent({
      kind: 'whatsapp_intent',
      ctaType: 'buy',
      placement: 'phone-details',
      deviceId: 'rec_1',
    });
    expect(result).toBeUndefined();
    expect(mocks.mockRpc).toHaveBeenCalledTimes(1);
    const args = mocks.mockRpc.mock.calls[0]!;
    expect(args[0]).toBe('record_campaign_intent');
    expect(args[1]).toMatchObject({
      p_kind: 'whatsapp_intent',
      p_cta_type: 'buy',
      p_campaign_id: null,
      p_ad_placement: 'phone-details',
      p_device_id: 'rec_1',
    });
  });

  it('records an ad click with kind click / cta_type ad_click', () => {
    recordIntent({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: 'rec_2' });
    const args = mocks.mockRpc.mock.calls[0]!;
    expect(args[1]).toMatchObject({ p_kind: 'click', p_cta_type: 'ad_click', p_ad_placement: 'home' });
  });

  it('records a view with cta_type null', () => {
    recordIntent({ kind: 'view', placement: 'home' });
    const args = mocks.mockRpc.mock.calls[0]!;
    expect(args[1]).toMatchObject({ p_kind: 'view', p_cta_type: null });
  });

  it('PHASE C — records whatsapp_handoff_started with cta_type inquiry and the ad target', () => {
    recordIntent({ kind: 'whatsapp_handoff_started', ctaType: 'inquiry', placement: 'home', deviceId: 'rec_3' });
    const args = mocks.mockRpc.mock.calls[0]!;
    expect(args[0]).toBe('record_campaign_intent');
    expect(args[1]).toMatchObject({
      p_kind: 'whatsapp_handoff_started',
      p_cta_type: 'inquiry',
      p_campaign_id: null,
      p_ad_placement: 'home',
      p_device_id: 'rec_3',
    });
  });

  it('BATCH 1 — dispatches showroom view and ad_click with the correct payload', () => {
    recordIntent({ kind: 'view', placement: 'showroom' });
    expect(mocks.mockRpc).toHaveBeenLastCalledWith(
      'record_campaign_intent',
      expect.objectContaining({ p_kind: 'view', p_cta_type: null, p_ad_placement: 'showroom' }),
    );

    recordIntent({ kind: 'click', ctaType: 'ad_click', placement: 'showroom', deviceId: 'rec_9' });
    expect(mocks.mockRpc).toHaveBeenLastCalledWith(
      'record_campaign_intent',
      expect.objectContaining({ p_kind: 'click', p_cta_type: 'ad_click', p_ad_placement: 'showroom', p_device_id: 'rec_9' }),
    );
  });

  it('never throws and stays void when the RPC rejects (fire-and-forget)', () => {
    mocks.mockRpc.mockRejectedValue(new Error('boom'));
    expect(() =>
      recordIntent({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: 'rec_1' }),
    ).not.toThrow();
    expect(() =>
      recordIntent({ kind: 'whatsapp_intent', ctaType: 'inquiry', placement: 'phone-details' }),
    ).not.toThrow();
  });

  it('never throws when the supabase client is unavailable (unconfigured env)', () => {
    mocks.getSupabaseClient.mockImplementation(() => {
      throw new Error('Supabase URL and anon key are required');
    });
    expect(() =>
      recordIntent({ kind: 'click', ctaType: 'ad_click', placement: 'home', deviceId: 'rec_1' }),
    ).not.toThrow();
  });

  it('does NOT dispatch when the sender is disabled (test seam)', () => {
    setIntentSenderEnabled(false);
    recordIntent({ kind: 'view', placement: 'home' });
    expect(mocks.mockRpc).not.toHaveBeenCalled();
  });
});

describe('M2 — visitor_hash (non-PII, in-memory, per-page-load)', () => {
  it('is 32 lowercase hex characters', () => {
    expect(getVisitorHash()).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is stable across calls within the same page load', () => {
    expect(getVisitorHash()).toBe(getVisitorHash());
  });
});
