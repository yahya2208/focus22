/**
 * Phase 2 login experience: hero promise, single primary CTA, no magic-link
 * UI, friendly errors, independent guest loading, invite route preserved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { LoginScreen } from '../../screens/auth/LoginScreen';

const mockSignInWithEmail = vi.fn();
const mockSignInAsGuest = vi.fn();

const mockAuthValue = {
  state: { status: 'unauthenticated', user: null, error: null },
  service: {
    signInWithEmail: mockSignInWithEmail,
    signInAsGuest: mockSignInAsGuest,
    signUpWithEmail: vi.fn(),
    signInWithMagicLink: vi.fn(),
    convertGuestToUser: vi.fn(),
    signOut: vi.fn(),
  },
  researchRole: 'none',
};

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => mockAuthValue,
}));

function NavProbe() {
  const { currentScreen } = useAppState();
  return <div data-testid="screen">{currentScreen}</div>;
}

function renderLogin() {
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          <LoginScreen />
          <NavProbe />
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 2 login experience', () => {
  it('renders the hero promise and a single primary sign-in CTA', () => {
    renderLogin();
    expect(screen.getByText('One account for everything in FOCUS.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue as Guest' })).toBeTruthy();
  });

  it('has no magic-link UI and no alert path', () => {
    renderLogin();
    expect(screen.queryByText('Magic Link')).toBeNull();
    expect(screen.queryByText('Email is required for Magic Link')).toBeNull();
  });

  it('maps invalid credentials to the friendly key, never raw messages', async () => {
    mockSignInWithEmail.mockRejectedValueOnce(new Error('Invalid login credentials (PostgREST 401)'));
    renderLogin();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByText('Incorrect email or password. Please try again.')).toBeTruthy();
    expect(screen.queryByText(/PostgREST/)).toBeNull();
  });

  it('guest path works independently and invite routes to invite-setup', async () => {
    mockSignInAsGuest.mockResolvedValueOnce({ id: 'anon-1', displayName: null });
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }));
    await waitFor(() => expect(mockSignInAsGuest).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('Got an invitation? Finish account setup'));
    expect(await screen.findByTestId('screen')).toBeTruthy();
    expect(screen.getByTestId('screen').textContent).toBe('invite-setup');
  });
});
