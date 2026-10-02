import { memo } from 'react';
import { useAuth } from '../../../core/auth/AuthProvider';
import { permissionGuard } from '../../../core/research/permissions';
import { ResearchConsole } from '../../../research-console/ResearchConsole';
import { AccessDeniedScreen } from '../../auth/AccessDeniedScreen';

/**
 * Independent Research workspace.
 *
 * Embeds the existing ResearchConsole unchanged — all dashboards, tabs, and
 * write paths (inventory, ads, campaigns) keep their exact behavior. The
 * route-level permission gate (`scientific/read`) is preserved here as an
 * explicit check so embedding inside Pilot Ops never widens access: a caller
 * without the research capability sees the same denial screen as the route.
 * No Auth/RBAC core change; the existing guard function and screen are reused.
 */
export const AdminResearch = memo(function AdminResearch() {
  const { researchRole } = useAuth();
  if (!permissionGuard.can(researchRole, 'scientific', 'read')) {
    return <AccessDeniedScreen />;
  }
  return <ResearchConsole />;
});
