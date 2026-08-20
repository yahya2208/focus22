/**
 * Challenge Entry Auth Gate Tests (CE-01 through CE-05).
 *
 * Validates that:
 *   CE-01: Authenticated user → challenge-page immediately
 *   CE-02: Anonymous user → challenge-page immediately
 *   CE-03: Unauthenticated → guest sign-in → challenge-page
 *   CE-04: Guest auth failure → error screen with retry/login
 *   CE-05: Non-challenge entry → no auth gate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { resetChallengeContextForTests } from '../../challenge/challenge-context';
import { AppProvider, useAppState } from '../../store/navigation';
import { ThemeProvider } from '../../design-system/use-theme';
import { TranslationProvider } from '../../hooks/useTranslation';
import { AuthProvider } from '../../core/auth/AuthProvider';

const mockSignInAsGuest = vi.fn();
const mockService = {
  signInAsGuest: mockSignInAsGuest,
  onStateChange: vi.fn(() => () => {}),
};

type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unauthenticated';
type AuthUser = { id: string; displayName: string | null } | null;

let authStatusSetter: (s: AuthStatus) => void;
let authUserSetter: (u: AuthUser) => void;

vi.mock('../../core/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/auth/AuthProvider')>();
  const { useState, useEffect } = await import('react');
  return {
    ...actual,
    useAuth: () => {
      const [status, setStatus] = useState<AuthStatus>('loading');
      const [user, setUser] = useState<AuthUser>(null);

      useEffect(() => {
        authStatusSetter = setStatus;
        authUserSetter = setUser;
      }, []);

      return {
        state: { status, user, error: null },
        service: mockService,
        researchRole: 'none',
      };
    },
  };
});

vi.mock('../../services/campaign-lookup', () => ({
  extractCampaignShortCodeFromLocation: () => null,
  lookupCampaign: vi.fn(),
}));

vi.mock('../../services/qr-measurement', () => ({
  recordScan: vi.fn(),
}));

vi.mock('../../core/calibration/silent', () => ({
  runSilentCalibration: vi.fn().mockResolvedValue(null),
}));

import { InitialRoute } from '../../App';

function NavProbe() {
  const { currentScreen } = useAppState();
  return <div data-testid="screen">{currentScreen}</div>;
}

function renderGate() {
  return render(
    <AppProvider>
      <ThemeProvider>
        <TranslationProvider>
          <AuthProvider>
            <InitialRoute />
            <NavProbe />
          </AuthProvider>
        </TranslationProvider>
      </ThemeProvider>
    </AppProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetChallengeContextForTests();
  authStatusSetter = undefined!;
  authUserSetter = undefined!;
  window.location.hash = '';
});

afterEach(() => {
  resetChallengeContextForTests();
  window.location.hash = '';
});

describe('CE-01: Challenge entry while already authenticated', () => {
  it('navigates to challenge-page immediately', async () => {
    window.location.hash = '#/game?challenge_id=ch-test-01';

    renderGate();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });
    expect(mockSignInAsGuest).not.toHaveBeenCalled();
  });
});

describe('CE-02: Challenge entry while anonymous', () => {
  it('navigates to challenge-page immediately', async () => {
    window.location.hash = '#/game?challenge_id=ch-test-02';

    renderGate();

    await act(async () => {
      authStatusSetter('anonymous');
      authUserSetter({ id: 'anon-1', displayName: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });
    expect(mockSignInAsGuest).not.toHaveBeenCalled();
  });
});

describe('CE-03: Challenge entry while unauthenticated', () => {
  it('calls signInAsGuest and navigates to challenge-page on success', async () => {
    mockSignInAsGuest.mockResolvedValue({ id: 'anon-auto', displayName: null });
    window.location.hash = '#/game?challenge_id=ch-test-03';

    renderGate();

    await act(async () => {
      authStatusSetter('unauthenticated');
    });

    await waitFor(() => {
      expect(mockSignInAsGuest).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('screen').textContent).toBe('challenge-page');
    });
  });
});

describe('CE-04: Guest auth failure', () => {
  it('renders ChallengeAuthError with retry and sign-in options', async () => {
    mockSignInAsGuest.mockRejectedValue(new Error('Network timeout'));
    window.location.hash = '#/game?challenge_id=ch-test-04';

    renderGate();

    await act(async () => {
      authStatusSetter('unauthenticated');
    });

    await waitFor(() => {
      expect(mockSignInAsGuest).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeTruthy();
    });
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy();
    expect(screen.getByText('Back to Home')).toBeTruthy();
  });
});

describe('CE-05: Non-challenge entry', () => {
  it('does not trigger auth gate when no challenge_id', async () => {
    renderGate();

    await act(async () => {
      authStatusSetter('authenticated');
      authUserSetter({ id: 'user-1', displayName: 'Test' });
    });

    expect(mockSignInAsGuest).not.toHaveBeenCalled();
  });
});
