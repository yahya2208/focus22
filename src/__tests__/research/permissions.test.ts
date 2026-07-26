import { describe, it, expect } from 'vitest';
import { createPermissionGuard } from '../../core/research/permissions';

const guard = createPermissionGuard();

describe('PermissionGuard', () => {
  describe('super_admin', () => {
    it('has wildcard access to all resources', () => {
      expect(guard.can('super_admin', 'sessions', 'read')).toBe(true);
      expect(guard.can('super_admin', 'users', 'write')).toBe(true);
      expect(guard.can('super_admin', 'anything', 'delete')).toBe(true);
      expect(guard.can('super_admin', 'unknown_resource', 'export')).toBe(true);
    });

    it('has all actions on wildcard', () => {
      const perms = guard.getPermissions('super_admin');
      expect(perms).toHaveLength(1);
      expect(perms[0]!.resource).toBe('*');
      expect(perms[0]!.actions).toEqual(['read', 'write', 'export', 'delete']);
    });

    it('returns wildcard for accessible resources', () => {
      expect(guard.getAccessibleResources('super_admin')).toEqual(['*']);
    });
  });

  describe('research_admin', () => {
    it('can read/write/export sessions', () => {
      expect(guard.can('research_admin', 'sessions', 'read')).toBe(true);
      expect(guard.can('research_admin', 'sessions', 'write')).toBe(true);
      expect(guard.can('research_admin', 'sessions', 'export')).toBe(true);
    });

    it('cannot delete sessions', () => {
      expect(guard.can('research_admin', 'sessions', 'delete')).toBe(false);
    });

    it('can read users but not write', () => {
      expect(guard.can('research_admin', 'users', 'read')).toBe(true);
      expect(guard.can('research_admin', 'users', 'write')).toBe(false);
    });

    it('can manage cohorts', () => {
      expect(guard.can('research_admin', 'cohorts', 'read')).toBe(true);
      expect(guard.can('research_admin', 'cohorts', 'write')).toBe(true);
      expect(guard.can('research_admin', 'cohorts', 'export')).toBe(true);
    });

    it('returns correct accessible resources', () => {
      const resources = guard.getAccessibleResources('research_admin');
      expect(resources).toContain('sessions');
      expect(resources).toContain('users');
      expect(resources).toContain('cohorts');
      expect(resources).toContain('campaigns');
      expect(resources).toContain('overview');
      expect(resources).toContain('scientific');
    });
  });

  describe('analyst', () => {
    it('can read and export sessions', () => {
      expect(guard.can('analyst', 'sessions', 'read')).toBe(true);
      expect(guard.can('analyst', 'sessions', 'export')).toBe(true);
    });

    it('cannot write sessions', () => {
      expect(guard.can('analyst', 'sessions', 'write')).toBe(false);
    });

    it('can write cohorts', () => {
      expect(guard.can('analyst', 'cohorts', 'write')).toBe(true);
    });

    it('cannot access campaigns', () => {
      expect(guard.can('analyst', 'campaigns', 'read')).toBe(false);
      expect(guard.can('analyst', 'campaigns', 'write')).toBe(false);
    });
  });

  describe('viewer', () => {
    it('can only read overview, sessions, users', () => {
      expect(guard.can('viewer', 'overview', 'read')).toBe(true);
      expect(guard.can('viewer', 'sessions', 'read')).toBe(true);
      expect(guard.can('viewer', 'users', 'read')).toBe(true);
    });

    it('cannot write or export anything', () => {
      expect(guard.can('viewer', 'overview', 'write')).toBe(false);
      expect(guard.can('viewer', 'sessions', 'export')).toBe(false);
      expect(guard.can('viewer', 'users', 'delete')).toBe(false);
    });

    it('cannot access campaigns or surveys', () => {
      expect(guard.can('viewer', 'campaigns', 'read')).toBe(false);
      expect(guard.can('viewer', 'surveys', 'read')).toBe(false);
    });
  });

  describe('isAllowed', () => {
    it('delegates to can', () => {
      expect(guard.isAllowed('super_admin', 'sessions', 'delete')).toBe(true);
      expect(guard.isAllowed('viewer', 'sessions', 'delete')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for unknown role', () => {
      expect(guard.can('unknown_role' as never, 'sessions', 'read')).toBe(false);
      expect(guard.getPermissions('unknown_role' as never)).toEqual([]);
      expect(guard.getAccessibleResources('unknown_role' as never)).toEqual([]);
    });
  });
});
