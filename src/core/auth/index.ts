import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated';

export type AppRole = 'guest' | 'user' | 'researcher' | 'admin' | 'super_admin';

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly role: AppRole;
  readonly isAnonymous: boolean;
  readonly createdAt: string;
}

export interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  readonly error: string | null;
}

export type AuthStateChangeHandler = (state: AuthState) => void;

export interface AuthService {
  getState(): AuthState;
  onStateChange(handler: AuthStateChangeHandler): () => void;
  signInAsGuest(): Promise<AuthUser>;
  signInWithEmail(email: string, password: string): Promise<AuthUser>;
  signUpWithEmail(email: string, password: string, displayName?: string): Promise<AuthUser>;
  signInWithMagicLink(email: string): Promise<void>;
  convertGuestToUser(email: string, password: string, displayName?: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getCurrentUser(): AuthUser | null;
}

function mapUserBasic(supaUser: User | null): AuthUser | null {
  if (!supaUser) return null;
  return {
    id: supaUser.id,
    email: supaUser.email ?? null,
    displayName: supaUser.user_metadata?.display_name ?? null,
    role: (supaUser.user_metadata?.role as AppRole) ?? 'guest',
    isAnonymous: supaUser.app_metadata?.provider === 'anonymous' || !supaUser.email,
    createdAt: supaUser.created_at,
  };
}

async function fetchRoleFromProfile(supa: SupabaseClient, userId: string): Promise<AppRole> {
  try {
    const { data, error } = await supa
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) {
      return 'guest';
    }
    if (!data) {
      return 'guest';
    }
    return (data.role as AppRole) ?? 'guest';
  } catch {
    return 'guest';
  }
}

export function createAuthService(client?: SupabaseClient): AuthService {
  const supa = client ?? getSupabaseClient();
  let state: AuthState = { status: 'loading', user: null, error: null };
  const listeners = new Set<AuthStateChangeHandler>();

  function setState(patch: Partial<AuthState>) {
    state = { ...state, ...patch };
    for (const handler of listeners) {
      try { handler(state); } catch { /* ignore */ }
    }
  }

  supa.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const base = mapUserBasic(session.user);
      if (!base) {
        setState({ status: 'unauthenticated', user: null, error: null });
        return;
      }
      // Fetch role from public.users (source of truth)
      const role = await fetchRoleFromProfile(supa, base.id);
      const user: AuthUser = { ...base, role };
      setState({
        status: user.isAnonymous ? 'anonymous' : 'authenticated',
        user,
        error: null,
      });
    } else {
      setState({ status: 'unauthenticated', user: null, error: null });
    }
  });

  async function enrichWithProfileRole(base: AuthUser): Promise<AuthUser> {
    const role = await fetchRoleFromProfile(supa, base.id);
    return { ...base, role };
  }

  return {
    getState(): AuthState {
      return state;
    },

    onStateChange(handler: AuthStateChangeHandler): () => void {
      listeners.add(handler);
      return () => { listeners.delete(handler); };
    },

    async signInAsGuest(): Promise<AuthUser> {
      const { data, error } = await supa.auth.signInAnonymously();
      if (error) throw new Error(error.message);
      const base = mapUserBasic(data.user);
      if (!base) throw new Error('Failed to create guest user');
      const user = await enrichWithProfileRole(base);
      setState({ status: 'anonymous', user, error: null });
      return user;
    },

    async signInWithEmail(email: string, password: string): Promise<AuthUser> {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      const base = mapUserBasic(data.user);
      if (!base) throw new Error('Failed to sign in');
      const user = await enrichWithProfileRole(base);
      setState({ status: 'authenticated', user, error: null });
      return user;
    },

    async signUpWithEmail(email: string, password: string, displayName?: string): Promise<AuthUser> {
      const { data, error } = await supa.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName, role: 'user' },
        },
      });
      if (error) throw new Error(error.message);
      const base = mapUserBasic(data.user);
      if (!base) throw new Error('Failed to sign up');
      const user = await enrichWithProfileRole(base);
      setState({ status: 'authenticated', user, error: null });
      return user;
    },

    async signInWithMagicLink(email: string): Promise<void> {
      const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message);
    },

    async convertGuestToUser(email: string, password: string, displayName?: string): Promise<AuthUser> {
      const { data, error } = await supa.auth.updateUser({
        email,
        password,
        data: { display_name: displayName, role: 'user' },
      });
      if (error) throw new Error(error.message);
      const base = mapUserBasic(data.user);
      if (!base) throw new Error('Failed to convert guest account');
      const user = await enrichWithProfileRole(base);
      setState({ status: 'authenticated', user, error: null });
      return user;
    },

    async signOut(): Promise<void> {
      const { error } = await supa.auth.signOut();
      if (error) throw new Error(error.message);
      setState({ status: 'unauthenticated', user: null, error: null });
    },

    getCurrentUser(): AuthUser | null {
      return state.user;
    },
  };
}
