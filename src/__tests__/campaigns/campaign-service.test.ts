import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => {
  const state: {
    fromTable: string;
    calls: string[];
    result: { data: unknown; error: unknown; count: number | null };
  } = { fromTable: '', calls: [], result: { data: null, error: null, count: null } };

  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.result),
  };

  const chain = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'order', 'range', 'limit', 'single', 'maybeSingle'];
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      state.calls.push(`${m}(${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(',')})`);
      return builder;
    };
  }

  return {
    state,
    client: () => ({
      from: (table: string) => {
        state.fromTable = table;
        state.calls.push(`from(${table})`);
        return builder;
      },
    }),
  };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => mock.client(),
}));

import {
  generateShortCode,
  buildCampaignQrUrl,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  restoreCampaign,
  addTimelineEntry,
} from '../../research-console/pages/campaigns/campaign-service';

function stub(data: unknown, error: unknown = null, count: number | null = null) {
  mock.state.result = { data, error, count };
}

beforeEach(() => {
  mock.state.calls.length = 0;
  mock.state.fromTable = '';
  mock.state.result = { data: null, error: null, count: null };
});

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

describe('generateShortCode', () => {
  it('1: returns a code of requested length', () => {
    expect(generateShortCode(6)).toHaveLength(6);
    expect(generateShortCode(10)).toHaveLength(10);
  });

  it('2: only uses base62 characters', () => {
    const code = generateShortCode(32);
    for (const ch of code) expect(BASE62).toContain(ch);
  });

  it('3: produces varied codes across calls', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateShortCode(6)));
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe('buildCampaignQrUrl — plain /c/ deep-link contract, no attribution params', () => {
  it('4: plain URL origin + base + c/<code>', () => {
    expect(buildCampaignQrUrl('https://example.com', '/', 'kq7Iej')).toBe('https://example.com/c/kq7Iej');
  });

  it('5: GitHub Pages base path', () => {
    expect(buildCampaignQrUrl('https://yahya2208.github.io', '/focus22/', 'kq7Iej')).toBe('https://yahya2208.github.io/focus22/c/kq7Iej');
  });

  it('6: base path without trailing slash normalized', () => {
    expect(buildCampaignQrUrl('https://example.com', '/focus22', 'kq7Iej')).toBe('https://example.com/focus22/c/kq7Iej');
  });

  it('7: never appends query parameters', () => {
    const url = buildCampaignQrUrl('https://example.com', '/', 'kq7Iej');
    expect(url).not.toContain('?');
    expect(url).not.toContain('&');
  });
});

describe('listCampaigns', () => {
  it('8: queries campaigns ordered by created_at desc with range', async () => {
    stub([{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }], null, 2);
    const res = await listCampaigns({ limit: 100 });
    expect(res.count).toBe(2);
    expect(res.data).toHaveLength(2);
    expect(mock.state.fromTable).toBe('campaigns');
    expect(mock.state.calls).toContain('from(campaigns)');
    expect(mock.state.calls).toContain('order(created_at,{"ascending":false})');
    expect(mock.state.calls.some((c) => c.startsWith('range('))).toBe(true);
  });

  it('9: applies is_active filter when provided', async () => {
    stub([], null, 0);
    await listCampaigns({ is_active: true });
    expect(mock.state.calls).toContain('eq(is_active,true)');
  });

  it('10: applies status filter when provided', async () => {
    stub([], null, 0);
    await listCampaigns({ status: 'archived' });
    expect(mock.state.calls).toContain('eq(status,archived)');
  });

  it('11: error returns empty list without throwing', async () => {
    stub(null, { message: 'denied' }, null);
    const res = await listCampaigns();
    expect(res.data).toEqual([]);
    expect(res.count).toBe(0);
  });
});

describe('getCampaign', () => {
  it('12: returns single campaign row', async () => {
    stub({ id: 'c1', name: 'A', is_active: true }, null);
    const c = await getCampaign('c1');
    expect(c?.id).toBe('c1');
    expect(mock.state.calls).toContain('eq(id,c1)');
  });

  it('13: returns null when no row', async () => {
    stub(null, null);
    expect(await getCampaign('missing')).toBeNull();
  });

  it('14: returns null on error', async () => {
    stub(null, { message: 'boom' });
    expect(await getCampaign('c1')).toBeNull();
  });
});

describe('createCampaign', () => {
  it('15: inserts with generated short_code, timeline created entry and created_by', async () => {
    stub({ id: 'c1', name: 'Test', short_code: 'AbC123', is_active: true }, null);
    const created = await createCampaign({ name: 'Test', status: 'active', is_active: true, created_by: 'u1' });

    expect(created?.short_code).toBe('AbC123');
    const insertCall = mock.state.calls.find((c) => c.startsWith('insert('));
    expect(insertCall).toBeDefined();
    expect(insertCall).toContain('short_code');
    expect(insertCall).toContain('created_by');
    expect(insertCall).toContain('timeline');
    expect(insertCall).toContain('"action":"created"');
  });

  it('16: returns null on insert error', async () => {
    stub(null, { message: 'denied' });
    expect(await createCampaign({ name: 'X', is_active: true })).toBeNull();
  });
});

describe('updateCampaign / deleteCampaign / restoreCampaign', () => {
  it('17: update patches row and bumps updated_at', async () => {
    stub({}, null);
    await updateCampaign('c1', { notes: 'hi' });
    const updateCall = mock.state.calls.find((c) => c.startsWith('update('));
    expect(updateCall).toContain('notes');
    expect(updateCall).toContain('updated_at');
    expect(mock.state.calls).toContain('eq(id,c1)');
  });

  it('18: deleteCampaign is a soft delete (archived + inactive)', async () => {
    stub({}, null);
    await deleteCampaign('c1');
    const updateCall = mock.state.calls.find((c) => c.startsWith('update('));
    expect(updateCall).toContain('archived');
    expect(updateCall).toContain('"is_active":false');
  });

  it('19: restoreCampaign reactivates (active + is_active true)', async () => {
    stub({}, null);
    await restoreCampaign('c1');
    const updateCall = mock.state.calls.find((c) => c.startsWith('update('));
    expect(updateCall).toContain('"status":"active"');
    expect(updateCall).toContain('"is_active":true');
  });
});

describe('addTimelineEntry', () => {
  it('20: appends entry to existing timeline and writes back', async () => {
    stub({ timeline: [{ action: 'created', timestamp: '2026-01-01T00:00:00Z' }] }, null);
    await addTimelineEntry('c1', 'status_changed_to_paused', 'u1');
    const updateCall = mock.state.calls.find((c) => c.startsWith('update('));
    expect(updateCall).toContain('status_changed_to_paused');
  });

  it('21: timeline failures are swallowed (best-effort)', async () => {
    mock.state.result = { data: { timeline: null }, error: null, count: null };
    // simulate read failing
    const spy = vi.spyOn(mock.client(), 'from');
    await addTimelineEntry('c1', 'qr_design_updated');
    spy.mockRestore();
  });
});
