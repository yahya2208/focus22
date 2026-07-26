import { useState, useEffect, createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { createAuthService, type AuthService, type AuthState, type AuthUser } from './index';

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
  const [service, setService] = useState<AuthService>(STUB_SERVICE);
  const [state, setState] = useState<AuthState>(STUB_SERVICE.getState);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    try {
      const s = createAuthService();
      setService(s);
      
      const currentState = s.getState();
      setState(currentState);
      
      // Auto-create anonymous user if no existing session
      if (currentState.status === 'unauthenticated') {
        s.signInAsGuest().catch(() => {});
      }
      
      return s.onStateChange((newState) => {
        setState(newState);
      });
    } catch {
      // Stay with stub — no crash
    }
  }, []);

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

export function useRequireAuth(requiredRole?: AuthUser['role']): AuthContextValue {
  const ctx = useAuth();
  if (requiredRole && ctx.state.user?.role !== requiredRole) {
    throw new Error(`Authentication required: ${requiredRole}`);
  }
  return ctx;
}
