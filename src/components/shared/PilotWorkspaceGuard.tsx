import { memo, type ReactNode } from 'react';
import { usePilotMembership } from '../../hooks/usePilotMembership';
import { AccessDeniedScreen } from '../../screens/auth/AccessDeniedScreen';

interface PilotWorkspaceGuardProps {
  readonly workspace: 'operator' | 'courier';
  readonly children: ReactNode;
}

/**
 * UI-level workspace visibility guard (P1).
 *
 * Allows viewing when the caller holds ANY membership of that kind (any
 * status — pending/suspended members see informational states, never implied
 * authority) or a global admin/super_admin role. Renders nothing while
 * membership resolution is loading, so no wrong-role frame is possible.
 * Anything else sees the existing AccessDeniedScreen.
 *
 * This changes navigation visibility ONLY. Backend authorization (RPC guards,
 * RLS) is untouched and remains the final security boundary: a customer who
 * manually navigates here gains zero merchant/courier authority.
 */
export const PilotWorkspaceGuard = memo(function PilotWorkspaceGuard({
  workspace,
  children,
}: PilotWorkspaceGuardProps) {
  const access = usePilotMembership();
  if (access.status === 'loading') {
    return null;
  }
  const allowed =
    workspace === 'operator' ? access.canViewOperator : access.canViewCourier;
  if (!allowed) {
    return <AccessDeniedScreen />;
  }
  return <>{children}</>;
});
