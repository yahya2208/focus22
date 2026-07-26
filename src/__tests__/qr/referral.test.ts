import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, chain } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(): any {
    const c: Record<string, unknown> = {};
    c.select = vi.fn(() => c);
    c.insert = vi.fn(() => c);
    c.update = vi.fn(() => c);
    c.eq = vi.fn(() => c);
    c.neq = vi.fn(() => c);
    c.gt = vi.fn(() => c);
    c.gte = vi.fn(() => c);
    c.lt = vi.fn(() => c);
    c.lte = vi.fn(() => c);
    c.in = vi.fn(() => c);
    c.not = vi.fn(() => c);
    c.order = vi.fn(() => c);
    c.limit = vi.fn(() => c);
    c.single = vi.fn();
    c.maybeSingle = vi.fn();
    return c;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = makeChain() as any;
  const mockFrom = vi.fn(() => chain);
  return { mockFrom, chain };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

import { createReferralEngine } from '../../core/qr/referral';

describe('Referral Engine (Supabase-backed)', () => {
  beforeEach(() => {
    chain.select.mockClear().mockImplementation(() => chain);
    chain.insert.mockClear().mockImplementation(() => chain);
    chain.update.mockClear().mockImplementation(() => chain);
    chain.eq.mockClear().mockImplementation(() => chain);
    chain.in.mockClear().mockImplementation(() => chain);
    chain.not.mockClear().mockImplementation(() => chain);
    chain.order.mockClear().mockImplementation(() => chain);
    chain.single.mockClear();
    chain.maybeSingle.mockClear();
  });

  it('should create a referral profile', async () => {
    chain.single
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
      .mockResolvedValueOnce({ data: null, error: null });
    chain.eq
      .mockImplementationOnce(() => chain)
      .mockImplementationOnce(() => chain)
      .mockResolvedValue({ error: null });

    const engine = createReferralEngine();
    const profile = await engine.createProfile('user-1');
    expect(profile.userId).toBe('user-1');
    expect(profile.referralCode).toHaveLength(8);
    expect(profile.totalScans).toBe(0);
    expect(profile.totalConversions).toBe(0);
  });

  it('should retrieve profile by user ID', async () => {
    chain.single.mockResolvedValue({
      data: { id: 'user-1', referral_code: 'ABC12345', created_at: new Date().toISOString() },
      error: null,
    });

    const engine = createReferralEngine();
    const profile = await engine.getProfile('user-1');
    expect(profile?.userId).toBe('user-1');
    expect(profile?.referralCode).toBe('ABC12345');
  });

  it('should retrieve profile by referral code', async () => {
    chain.single.mockResolvedValue({
      data: { id: 'user-1', referral_code: 'ABC12345', created_at: new Date().toISOString() },
      error: null,
    });

    const engine = createReferralEngine();
    const retrieved = await engine.getProfileByCode('ABC12345');
    expect(retrieved?.userId).toBe('user-1');
  });

  it('should return null for non-existent code', async () => {
    chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const engine = createReferralEngine();
    expect(await engine.getProfileByCode('NONEXIST')).toBeNull();
  });

  it('should return null for non-existent user', async () => {
    chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const engine = createReferralEngine();
    expect(await engine.getProfile('nobody')).toBeNull();
  });

  it('should record scans via analytics_events', async () => {
    chain.insert.mockResolvedValue({ error: null });

    const engine = createReferralEngine();
    await engine.recordScan('user-1', 'campaign-a');
    await engine.recordScan('user-1');
    expect(chain.insert).toHaveBeenCalledTimes(2);
  });

  it('should record conversions via analytics_events', async () => {
    chain.insert.mockResolvedValue({ error: null });

    const engine = createReferralEngine();
    await engine.recordConversion('user-1');
    expect(chain.insert).toHaveBeenCalledTimes(1);
  });

  it('should compute stats', async () => {
    chain.single.mockResolvedValue({
      data: { id: 'user-1', referral_code: 'ABC12345', created_at: new Date().toISOString() },
      error: null,
    });
    chain.in.mockResolvedValue({
      data: [
        { event_type: 'referral_scan', created_at: new Date().toISOString(), event_data: { campaign_id: 'a' } },
        { event_type: 'referral_scan', created_at: new Date().toISOString(), event_data: { campaign_id: 'b' } },
        { event_type: 'referral_scan', created_at: new Date().toISOString(), event_data: { campaign_id: null } },
        { event_type: 'referral_conversion', created_at: new Date().toISOString(), event_data: {} },
      ],
      error: null,
    });

    const engine = createReferralEngine();
    const stats = await engine.getStats('user-1');
    expect(stats?.totalScans).toBe(3);
    expect(stats?.totalConversions).toBe(1);
    expect(stats?.conversionRate).toBeCloseTo(1 / 3);
  });

  it('should return null stats for non-existent user', async () => {
    chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const engine = createReferralEngine();
    expect(await engine.getStats('nobody')).toBeNull();
  });

  it('should generate referral URL', async () => {
    chain.single.mockResolvedValue({
      data: { id: 'user-1', referral_code: 'ABC12345', created_at: new Date().toISOString() },
      error: null,
    });

    const engine = createReferralEngine();
    const url = await engine.generateReferralUrl('user-1', 'https://focus.app');
    expect(url).toContain('ref=ABC12345');
    expect(url).toContain('focus.app');
  });

  it('should throw for non-existent user URL generation', async () => {
    chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const engine = createReferralEngine();
    await expect(engine.generateReferralUrl('nobody', 'https://focus.app')).rejects.toThrow();
  });

  it('should list all profiles', async () => {
    chain.not.mockResolvedValue({
      data: [
        { id: 'user-1', referral_code: 'AAA11111', created_at: new Date().toISOString() },
        { id: 'user-2', referral_code: 'BBB22222', created_at: new Date().toISOString() },
      ],
      error: null,
    });

    const engine = createReferralEngine();
    const profiles = await engine.getAllProfiles();
    expect(profiles).toHaveLength(2);
  });
});
