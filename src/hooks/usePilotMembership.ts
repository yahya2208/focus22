import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../core/auth/AuthProvider';
import {
  fetchMyCourierMemberships,
  fetchMyOperatorMemberships,
  resolvePilotEntryState,
  type PilotEntryState,
  type PilotMembership,
} from '../services/pilot-membership-service';

export interface PilotWorkspaceAccess {
  /** 'loading' until auth + membership resolution settle — render no role UI. */
  readonly status: 'loading' | 'ready';
  readonly operators: readonly PilotMembership[];
  readonly couriers: readonly PilotMembership[];
  readonly operatorEntry: PilotEntryState;
  readonly courierEntry: PilotEntryState;
  readonly isAdmin: boolean;
  /** View-eligibility for Merchant Workspace (any membership, any status, or admin). */
  readonly canViewOperator: boolean;
  /** View-eligibility for Courier Workspace (any membership, any status, or admin). */
  readonly canViewCourier: boolean;
}

/**
 * Membership-aware workspace access (P1, read-only).
 *
 * Race safety: starts 'loading' and stays there until the current auth user
 * AND their membership fetch both settle, so no frame ever renders the wrong
 * role UI. Any user change (login/logout/switch, refresh with new session)
 * resets to loading and refetches. Signed-out and anonymous sessions resolve
 * to empty memberships without any fetch. Errors resolve to empty (fail
 * closed for visibility; the server still authorizes everything).
 */
export function usePilotMembership(): PilotWorkspaceAccess {
  const { state } = useAuth();
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [operators, setOperators] = useState<readonly PilotMembership[]>([]);
  const [couriers, setCouriers] = useState<readonly PilotMembership[]>([]);

  const userId = state.user?.id ?? null;
  const authStatus = state.status;
  const globalRole = state.user?.role ?? 'guest';

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setOperators([]);
    setCouriers([]);
    if (authStatus !== 'authenticated' || !userId) {
      setStatus('ready');
      return;
    }
    void (async () => {
      try {
        const [ops, cos] = await Promise.all([
          fetchMyOperatorMemberships(userId),
          fetchMyCourierMemberships(userId),
        ]);
        if (cancelled) return;
        setOperators(ops);
        setCouriers(cos);
      } catch {
        if (cancelled) return;
        setOperators([]);
        setCouriers([]);
      } finally {
        if (!cancelled) setStatus('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, userId]);

  return useMemo<PilotWorkspaceAccess>(() => {
    const isAdmin = globalRole === 'admin' || globalRole === 'super_admin';
    const operatorEntry = resolvePilotEntryState(operators);
    const courierEntry = resolvePilotEntryState(couriers);
    return {
      status,
      operators,
      couriers,
      operatorEntry,
      courierEntry,
      isAdmin,
      canViewOperator: isAdmin || operatorEntry !== 'none',
      canViewCourier: isAdmin || courierEntry !== 'none',
    };
  }, [status, operators, couriers, globalRole]);
}
