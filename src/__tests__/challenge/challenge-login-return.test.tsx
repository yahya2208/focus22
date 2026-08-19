/**
 * Challenge Login Return Tests (CLR-01 through CLR-02).
 *
 * Validates that:
 *   CLR-01: Login from LoginScreen during Challenge → navigates to results
 *   CLR-02: Login from LoginScreen outside Challenge → navigates to home (unchanged)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import {
  setActiveChallengeId,
  resetChallengeContextForTests,
} from '../../challenge/challenge-context';
import { AppProvider, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { LoginScreen } from '../../screens/auth/LoginScreen';

const mockSignInWithEmail = vi.fn();
const mockSignInAsGuest = vi.fn();

let mockAuthValue: {
  state: { status: string; user: { id: string; displayName: string } | null; error: string | null };
  service: {
    signInWithEmail: typeof mockSignInWithEmail;
    signInAsGuest: typeof mockSignInAsGuest;
    signUpWithEmail: ReturnType<typeof vi.fn>;
    signInWithMagicLink: ReturnType<typeof vi.fn>;
    convertGuestToUser: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  researchRole: string;
};

vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => mockAuthValue,
}));

function NavProbe() {
  const { currentScreen } = useAppState();
  return <div data-testid="screen">{currentScreen}</div>;
}

function renderLoginScreen() {
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
  resetChallengeContextForTests();
  mockAuthValue = {
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
});

afterEach(() => {
  resetChallengeContextForTests();
});

describe('CLR-01: Login from LoginScreen during Challenge', () => {
  it('navigates to results after successful email login', async () => {
    setActiveChallengeId('ch-1');
    mockSignInWithEmail.mockResolvedValue({ id: 'user-1', displayName: 'Test' });

    renderLoginScreen();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('results');
    });

    expect(mockSignInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('navigates to results after guest sign-in', async () => {
    setActiveChallengeId('ch-2');
    mockSignInAsGuest.mockResolvedValue({ id: 'anon-1', displayName: null });

    renderLoginScreen();

    await act(async () => {
      const guestButton = screen.getByText(/continue as guest/i);
      fireEvent.click(guestButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('results');
    });
  });
});

describe('CLR-02: Login from LoginScreen outside Challenge', () => {
  it('navigates to home after successful email login', async () => {
    mockSignInWithEmail.mockResolvedValue({ id: 'user-2', displayName: 'Test2' });

    renderLoginScreen();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign in$/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('home');
    });
  });

  it('navigates to home after guest sign-in', async () => {
    mockSignInAsGuest.mockResolvedValue({ id: 'anon-2', displayName: null });

    renderLoginScreen();

    await act(async () => {
      const guestButton = screen.getByText(/continue as guest/i);
      fireEvent.click(guestButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('home');
    });
  });
});
