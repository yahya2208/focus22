export type ResearchRole = 'super_admin' | 'research_admin' | 'analyst' | 'viewer';

export interface RolePermission {
  readonly resource: string;
  readonly actions: readonly ('read' | 'write' | 'export' | 'delete')[];
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
    { resource: 'surveys', actions: ['read', 'write', 'export'] },
    { resource: 'exports', actions: ['read', 'export'] },
    { resource: 'overview', actions: ['read'] },
    { resource: 'scientific', actions: ['read', 'export'] },
  ],
  analyst: [
    { resource: 'sessions', actions: ['read', 'export'] },
    { resource: 'users', actions: ['read'] },
    { resource: 'cohorts', actions: ['read', 'write'] },
    { resource: 'surveys', actions: ['read', 'export'] },
    { resource: 'overview', actions: ['read'] },
    { resource: 'scientific', actions: ['read', 'export'] },
  ],
  viewer: [
    { resource: 'overview', actions: ['read'] },
    { resource: 'sessions', actions: ['read'] },
    { resource: 'users', actions: ['read'] },
  ],
};

export interface PermissionGuard {
  can(role: ResearchRole, resource: string, action: 'read' | 'write' | 'export' | 'delete'): boolean;
  getPermissions(role: ResearchRole): readonly RolePermission[];
  getAccessibleResources(role: ResearchRole): readonly string[];
  isAllowed(role: ResearchRole, resource: string, action: 'read' | 'write' | 'export' | 'delete'): boolean;
}

export function createPermissionGuard(): PermissionGuard {
  return {
    can(role: ResearchRole, resource: string, action: 'read' | 'write' | 'export' | 'delete'): boolean {
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

    isAllowed(role: ResearchRole, resource: string, action: 'read' | 'write' | 'export' | 'delete'): boolean {
      return this.can(role, resource, action);
    },
  };
}
