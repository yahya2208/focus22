import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getDataService,
  resetDataService,
  type SessionData,
} from '../../core/supabase/data-service';

const sessionRow: SessionData = {
  id: 's1',
  user_id: 'u1',
  device_id: 'd1',
  calibration_id: 'c1',
  plugin_id: 'reaction-light',
  status: 'completed',
  measurements: { corrected_rts: [260, 240] },
  scientific_results: { focus_score: 88 },
  metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:01:00.000Z',
  finished_at: '2026-01-01T00:01:00.000Z',
  version: '2.0.0',
};

function clientWith(result: { data?: unknown; count?: number; error?: unknown }) {
  const q: Record<string, unknown> & { then: (resolve: (v: unknown) => void) => void } = {
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  for (const m of ['select', 'eq', 'order', 'range', 'upsert']) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    q[m] = vi.fn(() => q) as any;
  }
  const from = vi.fn(() => q);
  return { client: { from } as unknown as SupabaseClient, from, q };
}

function service(client: SupabaseClient) {
  resetDataService();
  return getDataService(client);
}

afterEach(() => {
  resetDataService();
  vi.restoreAllMocks();
});

describe('saveSession', () => {
  it('upserts the session row and throws no error on success', async () => {
    const { client, from, q } = clientWith({ error: null });
    const ds = service(client);

    await ds.saveSession(sessionRow);

    expect(from).toHaveBeenCalledWith('sessions');
    expect(q.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 's1',
      user_id: 'u1',
      status: 'completed',
      version: '2.0.0',
    }));
  });

  it('throws when the upsert fails', async () => {
    const { client } = clientWith({ error: new Error('db down') });
    const ds = service(client);

    await expect(ds.saveSession(sessionRow)).rejects.toThrow('db down');
  });
});

describe('getSessions', () => {
  it('returns the rows and total count', async () => {
    const { client, from, q } = clientWith({ data: [sessionRow], count: 1, error: null });
    const ds = service(client);

    const result = await ds.getSessions();

    expect(from).toHaveBeenCalledWith('sessions');
    expect(q.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(result.data).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(result.data[0]!.id).toBe('s1');
  });

  it('applies the user_id and status filters', async () => {
    const { client, q } = clientWith({ data: [], count: 0, error: null });
    const ds = service(client);

    await ds.getSessions({ user_id: 'u1', status: 'completed' });

    expect(q.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(q.eq).toHaveBeenCalledWith('status', 'completed');
  });

  it('returns empty data when the query errors', async () => {
    const { client } = clientWith({ data: null, error: new Error('boom') });
    const ds = service(client);

    const result = await ds.getSessions();

    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
  });
});
