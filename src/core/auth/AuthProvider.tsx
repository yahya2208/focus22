import { useState, useEffect, createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createAuthService, type AuthService, type AuthState, type AuthUser } from './index';
import { getGlobalTelemetry } from '../telemetry';

export type ResearchRole = 'super_admin' | 'research_admin' | 'analyst' | 'viewer' | 'none';

interface AuthContextValue {
  state: AuthState;
  service: AuthService;
  researchRole: ResearchRole;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STUB_SERVICE: AuthService = {
  getState: () => ({ status: 'unauthenticated', user: null, error: null }),
  onStateChange: () => () => {},
  signInAsGuest: async () => { throw new Error('Supabase not configured'); },
  signInWithEmail: async () => { throw new Error('Supabase not configured'); },
  signUpWithEmail: async () => { throw new Error('Supabase not configured'); },
  signInWithMagicLink: async () => { throw new Error('Supabase not configured'); },
  convertGuestToUser: async () => { throw new Error('Supabase not configured'); },
  signOut: async () => { throw new Error('Supabase not configured'); },
  getCurrentUser: () => null,
};

function mapToResearchRole(role: AuthUser['role']): ResearchRole {
  switch (role) {
    case 'super_admin': return 'super_admin';
    case 'admin': return 'research_admin';
    case 'researcher': return 'analyst';
    case 'user': return 'viewer';
    case 'guest': return 'none';
    default: return 'none';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(STUB_SERVICE.getState);
  const serviceRef = useRef<AuthService | null>(null);
  const guestCreatedRef = useRef(false);

  if (!serviceRef.current) {
    try {
      serviceRef.current = createAuthService();
    } catch {
      serviceRef.current = STUB_SERVICE;
    }
  }
  const service = serviceRef.current;

  useEffect(() => {
    const currentState = service.getState();
    setState(currentState);

    if (!guestCreatedRef.current && currentState.status === 'unauthenticated') {
      guestCreatedRef.current = true;
      service.signInAsGuest().catch(() => {});
    }

    return service.onStateChange((newState) => {
      setState(newState);
      const uid = newState.user?.id ?? null;
      getGlobalTelemetry().setUserId(uid);
    });
  }, [service]);

  const researchRole = useMemo(
    () => state.user ? mapToResearchRole(state.user.role) : 'none',
    [state.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state, service, researchRole }),
    [state, service, researchRole],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
