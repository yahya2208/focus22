import { memo, type ReactNode } from 'react';
import { useAuth } from '../../core/auth/AuthProvider';
import { permissionGuard } from '../../core/research/permissions';
import { LoginScreen } from '../../screens/auth/LoginScreen';
import { AccessDeniedScreen } from '../../screens/auth/AccessDeniedScreen';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  requiredResource?: string;
  requiredAction?: 'read' | 'write' | 'export' | 'delete';
}

/**
 * Single guard system (ADR-001 A7): every protected route goes through
 * permissionGuard.can(). The legacy hierarchical `requiredRole` (App role)
 * and the duplicated RESEARCH_ROLE_MAP were removed in 2.1.4. Routes declare
 * a resource+action; the ROLE_PERMISSIONS matrix is the one decision point.
 */
export const ProtectedRoute = memo(function ProtectedRoute({
  children,
  requireAuth = true,
  requiredResource,
  requiredAction = 'read',
}: ProtectedRouteProps) {
  const { state, researchRole } = useAuth();

  if (state.status === 'loading') {
    return null;
  }

  if (requireAuth && state.status !== 'authenticated' && state.status !== 'anonymous') {
    return <LoginScreen />;
  }

  if (requiredResource && !permissionGuard.can(researchRole, requiredResource, requiredAction)) {
    return <AccessDeniedScreen />;
  }

  return <>{children}</>;
});
