import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
  readonly projectId: string;
}

let clientInstance: SupabaseClient | null = null;
let configInstance: SupabaseConfig | null = null;

export function getSupabaseConfig(): SupabaseConfig {
  if (configInstance) return configInstance;
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? '';
  configInstance = { url, anonKey, projectId };
  return configInstance;
}

export function initSupabase(config?: SupabaseConfig): SupabaseClient {
  if (clientInstance) return clientInstance;
  const c = config ?? getSupabaseConfig();
  if (!c.url || !c.anonKey) {
    throw new Error('Supabase URL and anon key are required');
  }
  clientInstance = createClient(c.url, c.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return clientInstance;
}

export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    return initSupabase();
  }
  return clientInstance;
}

export function resetSupabaseClient(): void {
  clientInstance = null;
  configInstance = null;
}

export function createSupabaseClientForTest(url = 'https://test.supabase.co', key = 'test-key'): SupabaseClient {
  resetSupabaseClient();
  return initSupabase({ url, anonKey: key, projectId: 'test' });
}

/* ————————————————— Auth-callback failure capture (Gate: silent-failure fix) ———— */

/** Failure of the redirect-token validation that previously failed silently. */
export interface AuthCallbackFailure {
  readonly kind: 'callback-failed';
  /** Epoch ms when the failure was established (observability only). */
  readonly at: number;
}

interface CallbackSnapshot {
  readonly hash: string;
  readonly search: string;
}

function readCallbackParams(source: string): boolean {
  const flat = source.replace(/^#/, '').replace(/^\?/, '');
  return /(^|&)access_token=/.test(flat)
    || /(^|&)code=/.test(flat)
    || /(^|&)error/.test(flat);
}

/**
 * Module-load snapshot of a possible Supabase auth-callback URL. Runs at
 * import time — strictly before any React effect or router sync can rewrite
 * the fragment — so a later `#/home` normalization cannot destroy the
 * evidence or the retry material.
 */
function snapshotCallbackUrl(): CallbackSnapshot | null {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const hash = window.location.hash ?? '';
    const search = window.location.search ?? '';
    if (readCallbackParams(search) || readCallbackParams(hash)) {
      return { hash, search };
    }
    return null;
  } catch {
    return null;
  }
}

let callbackSnapshot: CallbackSnapshot | null = snapshotCallbackUrl();
let callbackFailure: AuthCallbackFailure | null = null;
let callbackChecked = false;

/**
 * Resolves whether this page load carried a Supabase auth callback that
 * failed to produce a session. Returns null for every non-callback load
 * (normal guest browsing, normal login) and for successful callbacks —
 * happy-path behavior is byte-identical. A non-null result means: the URL
 * held token/code/error params at load AND no session exists after Auth
 * initialization settled. Never throws, never writes, never contacts the
 * invitation backend (pure Auth state read).
 */
export async function getAuthCallbackFailure(): Promise<AuthCallbackFailure | null> {
  if (callbackChecked) return callbackFailure;
  callbackChecked = true;
  if (!callbackSnapshot) return null;
  try {
    // getSession() awaits internal initialize(), so ordering vs the async
    // token exchange is safe by construction.
    const { data } = await getSupabaseClient().auth.getSession();
    if (!data?.session) {
      callbackFailure = { kind: 'callback-failed', at: Date.now() };
    }
  } catch {
    callbackFailure = { kind: 'callback-failed', at: Date.now() };
  }
  return callbackFailure;
}

/**
 * Restores the stashed callback fragment when routing already normalized it
 * away (e.g. `#/home`), so a retry re-attempts validation with the original
 * token material. Returns true when a callback snapshot exists. Pure URL
 * operation — no network, no DB, no invitation side effects.
 */
export function restoreAuthCallbackHash(): boolean {
  if (!callbackSnapshot) return false;
  try {
    if (typeof window === 'undefined' || !window.location || !window.history) return true;
    const cur = `${window.location.search ?? ''}&${(window.location.hash ?? '').replace(/^#/, '')}`;
    if (!readCallbackParams(cur)) {
      const base = window.location.pathname ?? '/';
      window.history.replaceState(
        window.history.state,
        '',
        `${base}${callbackSnapshot.search}${callbackSnapshot.hash}`,
      );
    }
    return true;
  } catch {
    return true;
  }
}

/** Test/introspection hook — resets callback capture state (see resetSupabaseClient). */
export function resetAuthCallbackState(): void {
  callbackSnapshot = snapshotCallbackUrl();
  callbackFailure = null;
  callbackChecked = false;
}
