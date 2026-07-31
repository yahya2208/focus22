import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const PROJECT_URL = 'https://probe.supabase.co';
const ANON_KEY = 'test-anon-key';

// NOTE: empirically verified against @supabase/supabase-js 2.110.8.
// .maybeSingle() does NOT send "Accept: application/vnd.pgrst.object+json"
// (unlike .single()); it only flips isMaybeSingle and lets the server return a
// 200 JSON array (0, 1, or N rows), then collapses client-side:
//   0 rows  -> data=null, error=null
//   1 row   -> data=row[0]
//   N>1 rows -> client synthesizes PGRST116 error (data=null)
function mockRestArray(status: number, body: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function makeClient(): SupabaseClient {
  return createClient(PROJECT_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('maybeSingle() behavior on @supabase/supabase-js 2.110.8', () => {
  it('0 rows (server 200 []) -> { data: null, error: null }', async () => {
    mockRestArray(200, []);

    const { data, error } = await makeClient()
      .rpc('lookup_campaign_by_short_code', { p_code: 'missing' })
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('1 row (server 200 [row]) -> resolves with the row', async () => {
    mockRestArray(200, [
      {
        id: '7f2c9a1e-0000-4000-8000-000000000000',
        short_code: 'AbC123',
        name: 'Test Campaign',
        is_active: true,
      },
    ]);

    const { data, error } = await makeClient()
      .rpc('lookup_campaign_by_short_code', { p_code: 'AbC123' })
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toMatchObject({ short_code: 'AbC123', is_active: true });
  });

  it('multiple rows (server 200 [r1, r2]) -> PGRST116 ERROR, NOT swallowed', async () => {
    mockRestArray(200, [
      { id: 'a', short_code: 'dup123', name: 'A', is_active: true },
      { id: 'b', short_code: 'dup123', name: 'B', is_active: true },
    ]);

    const { data, error } = await makeClient()
      .rpc('lookup_campaign_by_short_code', { p_code: 'dup123' })
      .maybeSingle();

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('PGRST116');
  });

  it('captures actual request headers: maybeSingle allows arrays, single requests object+json', async () => {
    const requests: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
    const fetchMock = vi.fn().mockImplementation(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((v, k) => {
          headers[k] = v;
        });
        requests.push({
          url: String(url),
          method: init?.method ?? 'GET',
          headers,
          body: typeof init?.body === 'string' ? init.body : '',
        });
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.rpc('lookup_campaign_by_short_code', { p_code: 'x' }).maybeSingle();
    await client.rpc('lookup_campaign_by_short_code', { p_code: 'x' }).single();

    const maybe = requests[0]!;
    const single = requests[1]!;

    console.log(
      '=== maybeSingle request headers ===\n' + JSON.stringify(maybe, null, 2) +
      '\n\n=== single request headers ===\n' + JSON.stringify(single, null, 2),
    );

    const maybeAccept = maybe.headers['accept'] ?? '';
    const singleAccept = single.headers['accept'] ?? '';

    expect(maybe.method).toBe('POST');
    expect(maybeAccept).not.toContain('vnd.pgrst.object+json');
    expect(singleAccept).toContain('vnd.pgrst.object+json');
  });
});
