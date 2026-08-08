import type { AppRole } from '../auth';

export type ResearchRole = 'super_admin' | 'research_admin' | 'analyst' | 'viewer' | 'none';

export type GuardAction = 'read' | 'write' | 'export' | 'delete';

export interface RolePermission {
  readonly resource: string;
  readonly actions: readonly GuardAction[];
}

/**
 * ADR-001 A7 / design §2: the ONLY explicit App -> Research capability map.
 * Any future role change must go through this map (source of truth for the UI).
 */
export const ROLE_CAPABILITY_MAP: Record<AppRole, ResearchRole> = {
  guest: 'none',
  user: 'viewer',
  researcher: 'analyst',
  admin: 'research_admin',
  super_admin: 'super_admin',
};

/** Explicit replacement for the implicit `mapToResearchRole` switch. */
export function mapToResearchRole(role: AppRole): ResearchRole {
  return ROLE_CAPABILITY_MAP[role];
}

const ROLE_PERMISSIONS: Record<ResearchRole, readonly RolePermission[]> = {
  super_admin: [
    { resource: '*', actions: ['read', 'write', 'export', 'delete'] },
  ],
  research_admin: [
    { resource: 'sessions', actions: ['read', 'write', 'export'] },
    { resource: 'users', actions: ['read', 'export'] },
    { resource: 'cohorts', actions: ['read', 'write', 'export'] },
    { resource: 'campaigns', actions: ['read', 'write'] },
    { resource: 'exports', actions: ['read', 'export'] },
    { resource: 'overview', actions: ['read'] },
    { resource: 'scientific', actions: ['read', 'export'] },
    { resource: 'sticker', actions: ['read', 'write', 'export'] },
  ],
  analyst: [
    { resource: 'sessions', actions: ['read', 'export'] },
    { resource: 'users', actions: ['read'] },
    { resource: 'cohorts', actions: ['read', 'write'] },
    { resource: 'overview', actions: ['read'] },
    { resource: 'scientific', actions: ['read', 'export'] },
    { resource: 'sticker', actions: ['read', 'write', 'export'] },
  ],
  viewer: [
    { resource: 'overview', actions: ['read'] },
    { resource: 'sessions', actions: ['read'] },
    { resource: 'users', actions: ['read'] },
  ],
  none: [],
};

export interface PermissionGuard {
  can(role: ResearchRole, resource: string, action: GuardAction): boolean;
  getPermissions(role: ResearchRole): readonly RolePermission[];
  getAccessibleResources(role: ResearchRole): readonly string[];
  isAllowed(role: ResearchRole, resource: string, action: GuardAction): boolean;
}

export function createPermissionGuard(): PermissionGuard {
  return {
    can(role: ResearchRole, resource: string, action: GuardAction): boolean {
      const perms = ROLE_PERMISSIONS[role];
      if (!perms) return false;
      for (const p of perms) {
        if ((p.resource === '*' || p.resource === resource) && p.actions.includes(action)) {
          return true;
        }
      }
      return false;
    },

    getPermissions(role: ResearchRole): readonly RolePermission[] {
      return ROLE_PERMISSIONS[role] ?? [];
    },

    getAccessibleResources(role: ResearchRole): readonly string[] {
      const perms = ROLE_PERMISSIONS[role];
      if (!perms) return [];
      const resources = new Set<string>();
      for (const p of perms) {
        if (p.resource === '*') return ['*'];
        resources.add(p.resource);
      }
      return [...resources];
    },

    isAllowed(role: ResearchRole, resource: string, action: GuardAction): boolean {
      return this.can(role, resource, action);
    },
  };
}

/** Singleton guard — single enforcement point across the app (ADR-001 A7). */
export const permissionGuard: PermissionGuard = createPermissionGuard();
