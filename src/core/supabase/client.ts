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
