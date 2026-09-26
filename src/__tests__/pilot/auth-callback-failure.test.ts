/**
 * Auth-callback silent-failure fix (Gate: redirect-token validation).
 *
 * 1. Callback + no session → surfaced failure (never silent guest).
 * 2. Retry restores the stashed fragment; pure Auth operation (no RPC/DB).
 * 3. Happy path (session / no-callback load) → null, behavior unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fakeAuth = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  getSessionCalls: 0,
  rpcCalls: [] as string[],
  fromTables: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => {
        fakeAuth.getSessionCalls += 1;
        return { data: { session: fakeAuth.session }, error: null };
      },
      onAuthStateChange: () => {},
    },
    rpc: async (fn: string) => {
      fakeAuth.rpcCalls.push(fn);
      return { data: null, error: null };
    },
    from: (table: string) => {
      fakeAuth.fromTables.push(table);
      return { select: () => ({ data: [], error: null }) };
    },
  }),
}));

vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'test');

async function freshClientModule() {
  vi.resetModules();
  return import('../../core/supabase/client');
}

function setHash(hash: string) {
  window.history.replaceState(null, '', `/${hash}`);
}

beforeEach(() => {
  fakeAuth.session = null;
  fakeAuth.getSessionCalls = 0;
  fakeAuth.rpcCalls = [];
  fakeAuth.fromTables = [];
  setHash('');
});

afterEach(() => {
  setHash('');
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'test');
});

describe('auth-callback failure capture', () => {
  it('1: callback fragment + no session → surfaced failure (waits for init)', async () => {
    setHash('#access_token=t123&type=invite');
    const mod = await freshClientModule();
    const failure = await mod.getAuthCallbackFailure();
    expect(failure).not.toBeNull();
    expect(failure?.kind).toBe('callback-failed');
    expect(typeof failure?.at).toBe('number');
    // Init was actually awaited (not an instant false-negative)…
    expect(fakeAuth.getSessionCalls).toBeGreaterThanOrEqual(1);
    // …and nothing else was touched: no RPC, no table reads, no writes.
    expect(fakeAuth.rpcCalls).toEqual([]);
    expect(fakeAuth.fromTables).toEqual([]);
  });

  it('2: retry restores a router-normalized fragment with zero backend contact', async () => {
    setHash('#access_token=t123&type=invite');
    const mod = await freshClientModule();
    expect(await mod.getAuthCallbackFailure()).not.toBeNull();
    // Simulate the router having normalized the URL to #/home.
    setHash('#/home');
    const rpcBefore = fakeAuth.rpcCalls.length;
    const restored = mod.restoreAuthCallbackHash();
    expect(restored).toBe(true);
    expect(window.location.hash).toContain('access_token=t123');
    expect(fakeAuth.rpcCalls.length).toBe(rpcBefore);
    expect(fakeAuth.fromTables).toEqual([]);
  });

  it('3a: session present → null (happy path untouched)', async () => {
    setHash('#access_token=t123&type=invite');
    fakeAuth.session = { user: { id: 'u1' } };
    const mod = await freshClientModule();
    expect(await mod.getAuthCallbackFailure()).toBeNull();
  });

  it('3b: plain load without callback params → null (guest/login untouched)', async () => {
    setHash('#/home');
    const mod = await freshClientModule();
    expect(await mod.getAuthCallbackFailure()).toBeNull();
    expect(mod.restoreAuthCallbackHash()).toBe(false);
  });
});
