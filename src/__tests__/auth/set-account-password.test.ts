import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../../core/auth/index';

interface AuthApiShim {
  auth: {
    onAuthStateChange: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
}

function makeClient(sessionUserId: string | null): AuthApiShim {
  return {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => {} } },
      })),
      getSession: vi.fn(async () => ({
        data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
        error: null,
      })),
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  };
}

describe('setAccountPassword identity guard (Gate 1B defense-in-depth)', () => {
  it('E: identity mismatch at submit -> throws, updateUser NOT called', async () => {
    const client = makeClient('u-stale-session');
    const service = createAuthService(client as never);
    await expect(service.setAccountPassword('secret123', 'u-invitee')).rejects.toThrow(
      'INVITE_IDENTITY_MISMATCH',
    );
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it('E2: no bound identity -> throws, updateUser NOT called', async () => {
    const client = makeClient(null);
    const service = createAuthService(client as never);
    await expect(service.setAccountPassword('secret123', 'u-invitee')).rejects.toThrow(
      'INVITE_IDENTITY_MISMATCH',
    );
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it('F: matching identity -> updateUser called with password', async () => {
    const client = makeClient('u-invitee');
    const service = createAuthService(client as never);
    await expect(service.setAccountPassword('secret123', 'u-invitee')).resolves.toBeUndefined();
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'secret123' });
  });
});