import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthService, type AuthService } from '../../core/auth';

function createMockClient() {
  let authState: { user: unknown; session: unknown } = { user: null, session: null };
  const authListeners: Array<(event: string, session: { user: unknown } | null) => void> = [];

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authState.user }, error: null }),
      signInAnonymously: vi.fn().mockImplementation(async () => {
        const user = { id: 'guest-1', app_metadata: { provider: 'anonymous' }, user_metadata: { role: 'guest' }, email: null, created_at: new Date().toISOString() };
        authState = { user, session: { user } };
        for (const l of authListeners) l('SIGNED_IN', { user } as never);
        return { data: { user, session: { user } }, error: null };
      }),
      signInWithPassword: vi.fn().mockImplementation(async ({ email }: { email: string }) => {
        const user = { id: 'user-1', email, app_metadata: { provider: 'email' }, user_metadata: { role: 'user', display_name: null }, created_at: new Date().toISOString() };
        authState = { user, session: { user } };
        for (const l of authListeners) l('SIGNED_IN', { user } as never);
        return { data: { user, session: { user } }, error: null };
      }),
      signUp: vi.fn().mockImplementation(async ({ email }: { email: string }) => {
        const user = { id: 'user-2', email, app_metadata: { provider: 'email' }, user_metadata: { role: 'user', display_name: null }, created_at: new Date().toISOString() };
        authState = { user, session: { user } };
        for (const l of authListeners) l('SIGNED_IN', { user } as never);
        return { data: { user, session: { user } }, error: null };
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockImplementation(async ({ email }: { email?: string }) => {
        const user = { id: 'guest-1', email, app_metadata: { provider: 'email' }, user_metadata: { role: 'user' }, created_at: new Date().toISOString() };
        authState = { user, session: { user } };
        for (const l of authListeners) l('TOKEN_REFRESHED', { user } as never);
        return { data: { user, session: { user } }, error: null };
      }),
      signOut: vi.fn().mockImplementation(async () => {
        authState = { user: null, session: null };
        for (const l of authListeners) l('SIGNED_OUT', null);
        return { error: null };
      }),
      onAuthStateChange: vi.fn().mockImplementation((handler: (event: string, session: { user: unknown } | null) => void) => {
        authListeners.push(handler);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  };
}

describe('AuthService', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let auth: AuthService;

  beforeEach(() => {
    mockClient = createMockClient();
    auth = createAuthService(mockClient as never);
  });

  it('should create with loading status initially', () => {
    expect(auth.getState().status).toBe('loading');
  });

  it('should sign in as guest', async () => {
    const user = await auth.signInAsGuest();
    expect(user.isAnonymous).toBe(true);
    expect(user.email).toBeNull();
    expect(auth.getState().status).toBe('anonymous');
  });

  it('should sign in with email', async () => {
    const user = await auth.signInWithEmail('test@example.com', 'pass');
    expect(user.email).toBe('test@example.com');
    expect(auth.getState().status).toBe('authenticated');
  });

  it('should sign up with email', async () => {
    const user = await auth.signUpWithEmail('new@example.com', 'pass', 'Test');
    expect(user.email).toBe('new@example.com');
    expect(auth.getState().status).toBe('authenticated');
  });

  it('should handle guest to user conversion', async () => {
    await auth.signInAsGuest();
    const guestId = auth.getState().user?.id;
    const converted = await auth.convertGuestToUser('test@example.com', 'password123');
    expect(converted.email).toBe('test@example.com');
    expect(auth.getState().user?.id).toBe(guestId);
  });

  it('should sign out', async () => {
    await auth.signInAsGuest();
    await auth.signOut();
    expect(auth.getState().status).toBe('unauthenticated');
    expect(auth.getState().user).toBeNull();
  });

  it('should subscribe to state changes', () => {
    const handler = vi.fn();
    const unsub = auth.onStateChange(handler);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('should notify state change listeners on sign in', async () => {
    const handler = vi.fn();
    auth.onStateChange(handler);
    await auth.signInAsGuest();
    expect(handler).toHaveBeenCalled();
  });

  it('should support magic link', async () => {
    await auth.signInWithMagicLink('magic@example.com');
    expect(mockClient.auth.signInWithOtp).toHaveBeenCalled();
  });

  it('should track state changes from auth listener', async () => {
    await auth.signInAsGuest();
    expect(auth.getState().status).toBe('anonymous');
    await auth.signOut();
    expect(auth.getState().status).toBe('unauthenticated');
  });
});
