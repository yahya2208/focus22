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

import {
  parseCampaignParams, parseCampaignFromQueryString, serializeCampaignParams,
  hasCampaign, createCampaignStore,
} from '../../core/qr/campaign';

describe('Campaign Params Parser', () => {
  it('should parse campaign params from URL', () => {
    const params = parseCampaignParams('https://focus.app?campaign=school2026&source=poster');
    expect(params.campaign).toBe('school2026');
    expect(params.source).toBe('poster');
    expect(params.school).toBeNull();
  });

  it('should parse all campaign keys', () => {
    const url = 'https://focus.app?campaign=test&location=riyadh&school=kau&company=acme&event=conference&version=2.0&language=ar&source=linkedin&referrer=friend';
    const params = parseCampaignParams(url);
    expect(params.campaign).toBe('test');
    expect(params.location).toBe('riyadh');
    expect(params.school).toBe('kau');
    expect(params.company).toBe('acme');
    expect(params.event).toBe('conference');
    expect(params.version).toBe('2.0');
    expect(params.language).toBe('ar');
    expect(params.source).toBe('linkedin');
    expect(params.referrer).toBe('friend');
  });

  it('should return null for missing params', () => {
    const params = parseCampaignParams('https://focus.app');
    expect(params.campaign).toBeNull();
    expect(params.location).toBeNull();
    expect(params.school).toBeNull();
  });

  it('should parse from query string', () => {
    const params = parseCampaignFromQueryString('campaign=test&source=poster');
    expect(params.campaign).toBe('test');
    expect(params.source).toBe('poster');
  });

  it('should parse from query string with leading ?', () => {
    const params = parseCampaignFromQueryString('?campaign=test');
    expect(params.campaign).toBe('test');
  });

  it('should handle invalid URL', () => {
    const params = parseCampaignParams('not-a-url');
    expect(params.campaign).toBeNull();
  });
});

describe('Campaign Serialization', () => {
  it('should serialize params to query string', () => {
    const qs = serializeCampaignParams({
      campaign: 'test', location: null, school: null,
      company: null, event: null, version: null,
      language: null, source: null, referrer: null,
    });
    expect(qs).toBe('campaign=test');
  });

  it('should serialize multiple params', () => {
    const qs = serializeCampaignParams({
      campaign: 'test', location: 'riyadh', school: null,
      company: null, event: null, version: null,
      language: 'ar', source: null, referrer: null,
    });
    expect(qs).toContain('campaign=test');
    expect(qs).toContain('location=riyadh');
    expect(qs).toContain('language=ar');
  });
});

describe('hasCampaign', () => {
  it('should return true when campaign exists', () => {
    expect(hasCampaign({
      campaign: 'test', location: null, school: null,
      company: null, event: null, version: null,
      language: null, source: null, referrer: null,
    })).toBe(true);
  });

  it('should return false when campaign is null', () => {
    expect(hasCampaign({
      campaign: null, location: null, school: null,
      company: null, event: null, version: null,
      language: null, source: null, referrer: null,
    })).toBe(false);
  });

  it('should return false when campaign is empty', () => {
    expect(hasCampaign({
      campaign: '', location: null, school: null,
      company: null, event: null, version: null,
      language: null, source: null, referrer: null,
    })).toBe(false);
  });
});

describe('Campaign Store (Supabase-backed)', () => {
  beforeEach(() => {
    chain.select.mockImplementation(() => chain);
    chain.insert.mockImplementation(() => chain);
    chain.update.mockImplementation(() => chain);
    chain.eq.mockImplementation(() => chain);
    chain.not.mockImplementation(() => chain);
    chain.order.mockImplementation(() => chain);
    chain.single.mockReset();
    chain.maybeSingle.mockReset();
  });

  it('should create a campaign', async () => {
    chain.single.mockResolvedValue({
      data: {
        id: 'c1', name: 'School 2026', source: 'school', location: null,
        school: null, company: null, event: null, language: null,
        version: null, is_active: true, created_at: new Date().toISOString(),
      },
      error: null,
    });

    const store = createCampaignStore();
    const campaign = await store.create('School 2026', 'https://focus.app');
    expect(campaign.name).toBe('School 2026');
    expect(campaign.baseUrl).toBe('https://focus.app');
    expect(campaign.active).toBe(true);
    expect(campaign.scanCount).toBe(0);
    expect(campaign.conversionCount).toBe(0);
  });

  it('should retrieve campaign by ID', async () => {
    chain.single.mockResolvedValue({
      data: {
        id: 'c1', name: 'Test', is_active: true,
        location: null, school: null, company: null,
        event: null, language: null, version: null, source: null,
        created_at: new Date().toISOString(),
      },
      error: null,
    });

    const store = createCampaignStore();
    const retrieved = await store.get('c1');
    expect(retrieved?.id).toBe('c1');
  });

  it('should return null for non-existent campaign', async () => {
    chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const store = createCampaignStore();
    expect(await store.get('nonexistent')).toBeNull();
  });

  it('should list all campaigns', async () => {
    chain.order.mockResolvedValue({
      data: [
        { id: 'c1', name: 'A', is_active: true, created_at: new Date().toISOString(),
          location: null, school: null, company: null, event: null, language: null, version: null, source: null },
        { id: 'c2', name: 'B', is_active: true, created_at: new Date().toISOString(),
          location: null, school: null, company: null, event: null, language: null, version: null, source: null },
      ],
      error: null,
    });

    const store = createCampaignStore();
    const all = await store.getAll();
    expect(all).toHaveLength(2);
  });

  it('should compute stats', async () => {
    chain.eq.mockResolvedValue({
      data: [{ scan_count: 3, registration_count: 1 }],
      error: null,
    });

    const store = createCampaignStore();
    const stats = await store.getStats('c1');
    expect(stats?.scanCount).toBe(3);
    expect(stats?.conversionCount).toBe(1);
    expect(stats?.conversionRate).toBeCloseTo(1 / 3);
  });

  it('should return null stats for non-existent campaign', async () => {
    chain.eq.mockResolvedValue({ data: [], error: null });

    const store = createCampaignStore();
    expect(await store.getStats('nonexistent')).toBeNull();
  });
});
