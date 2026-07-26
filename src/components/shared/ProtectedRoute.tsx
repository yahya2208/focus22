import type { ReactNode } from 'react';
import { useAuth, type ResearchRole } from '../../core/auth/AuthProvider';
import { createPermissionGuard } from '../../core/research/permissions';
import { LoginScreen } from '../../screens/auth/LoginScreen';
import { AccessDeniedScreen } from '../../screens/auth/AccessDeniedScreen';

const guard = createPermissionGuard();

const RESEARCH_ROLE_MAP: Record<ResearchRole, 'super_admin' | 'research_admin' | 'analyst' | 'viewer' | null> = {
  super_admin: 'super_admin',
  research_admin: 'research_admin',
  analyst: 'analyst',
  viewer: 'viewer',
  none: null,
};

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  requiredRole?: 'guest' | 'user' | 'researcher' | 'admin' | 'super_admin';
  requiredResource?: string;
  requiredAction?: 'read' | 'write' | 'export' | 'delete';
}

export function ProtectedRoute({
  children,
  requireAuth = true,
  requiredRole,
  requiredResource,
  requiredAction = 'read',
}: ProtectedRouteProps) {
  const { state, researchRole } = useAuth();

  if (requireAuth && state.status !== 'authenticated' && state.status !== 'anonymous') {
    return <LoginScreen />;
  }

  if (requiredRole && state.user?.role !== requiredRole) {
    const roleHierarchy: Record<string, number> = {
      guest: 0, user: 1, researcher: 2, admin: 3, super_admin: 4,
    };
    const userLevel = roleHierarchy[state.user?.role ?? 'guest'] ?? 0;
    const requiredLevel = roleHierarchy[requiredRole] ?? 0;
    if (userLevel < requiredLevel) {
      return <AccessDeniedScreen />;
    }
  }

  if (requiredResource) {
    const mappedRole = RESEARCH_ROLE_MAP[researchRole];
    if (!mappedRole || !guard.can(mappedRole, requiredResource, requiredAction)) {
      return <AccessDeniedScreen />;
    }
  }

  return <>{children}</>;
}
